// Blockscout's index of Robinhood Chain, for tokens whose transfer history is too long to read in one report: the
// biggest balances and the creator's own transfers come back in a call or two. Off without BLOCKSCOUT_API_KEY.
// The free plan allows 5 calls a second and 100k credits a day (20 per call): calls are spaced and answers kept a while.

const KEY = process.env.BLOCKSCOUT_API_KEY;
const BASE = "https://api.blockscout.com/4663/api/v2";
const MIN_GAP_MS = 250;
// How long answers are kept. Only busy tokens come here, and their top wallets change slowly: the list of who they are
// is kept an hour, while each report still reads their balances from the chain, so the shares are always current.
const HOLDERS_MS = 60 * 60_000;
const INFO_MS = 60 * 60_000;
const CREATOR_MS = 60 * 60_000;
const MAX_CREATOR_PAGES = 4; // 200 transfers; a creator who moved more is not summed (the sum would be wrong)
// the free plan's 100k daily credits are about 5000 calls: stop short of them, so the index fails quietly instead
const DAILY_CALLS = Number(process.env.BLOCKSCOUT_DAILY_CALLS ?? 4_500);
const budget = { day: "", used: 0 };

/** Off without a key, and for the rest of the day (UTC) once the budget is spent. */
export const indexerEnabled = () => Boolean(KEY) && !(budget.day === new Date().toISOString().slice(0, 10) && budget.used >= DAILY_CALLS);

let last = 0;
async function call<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const day = new Date().toISOString().slice(0, 10);
  if (budget.day !== day) Object.assign(budget, { day, used: 0 });
  if (budget.used >= DAILY_CALLS) throw new Error("daily Blockscout budget used");
  budget.used++;
  const wait = last + MIN_GAP_MS - Date.now();
  last = Math.max(Date.now(), last + MIN_GAP_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const q = new URLSearchParams({ ...params, apikey: KEY ?? "" });
  const r = await fetch(`${BASE}${path}?${q}`, { signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`blockscout http ${r.status}`);
  return (await r.json()) as T;
}

function memo<T>(cache: Map<string, { at: number; value: Promise<T> }>, ttl: number, key: string, read: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = read();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  if (cache.size > 2_000) cache.delete(cache.keys().next().value!);
  return value;
}

export interface IndexedHolders {
  count: number;
  top: { address: string; value: bigint; contract: boolean }[];
}

const infoCache = new Map<string, { at: number; value: Promise<{ count: number }> }>();
const holdersCache = new Map<string, { at: number; value: Promise<IndexedHolders> }>();

/** How many wallets hold the token: one call, enough to tell a busy token before reading its history. */
export function indexedInfo(token: string): Promise<{ count: number }> {
  return memo(infoCache, INFO_MS, token, async () => {
    const info = await call<{ holders_count?: string; holders?: string }>(`/tokens/${token}`);
    return { count: Number(info.holders_count ?? info.holders ?? 0) || 0 };
  });
}

/** The token's holder count and its 50 biggest balances. */
export function indexedHolders(token: string): Promise<IndexedHolders> {
  return memo(holdersCache, HOLDERS_MS, token, async () => {
    type Item = { address: { hash: string; is_contract?: boolean }; value: string };
    const [info, page] = await Promise.all([indexedInfo(token), call<{ items?: Item[] }>(`/tokens/${token}/holders`)]);
    if (!Array.isArray(page.items)) throw new Error("blockscout: no holders list");
    return {
      count: info.count || page.items.length,
      top: page.items.map((i) => ({ address: i.address.hash.toLowerCase(), value: BigInt(i.value), contract: Boolean(i.address.is_contract) })),
    };
  });
}

const creatorCache = new Map<string, { at: number; value: Promise<{ from: string; to: string; v: bigint }[] | null> }>();

/** Every transfer of `token` in or out of the creator's wallet; null when there are too many to read. */
export function indexedCreatorTransfers(creator: string, token: string): Promise<{ from: string; to: string; v: bigint }[] | null> {
  return memo(creatorCache, CREATOR_MS, `${creator}:${token}`, async () => {
    type Item = { from: { hash: string }; to: { hash: string }; total?: { value?: string } };
    const out: { from: string; to: string; v: bigint }[] = [];
    let next: Record<string, string> | null = { token };
    for (let page = 0; next && page < MAX_CREATOR_PAGES; page++) {
      const j: { items?: Item[]; next_page_params?: Record<string, unknown> | null } = await call(`/addresses/${creator}/token-transfers`, next);
      if (!Array.isArray(j.items)) throw new Error("blockscout: no transfers list");
      for (const t of j.items) {
        if (t.total?.value == null) continue;
        out.push({ from: t.from.hash.toLowerCase(), to: t.to.hash.toLowerCase(), v: BigInt(t.total.value) });
      }
      next = j.next_page_params ? { token, ...Object.fromEntries(Object.entries(j.next_page_params).map(([k, v]) => [k, String(v)])) } : null;
    }
    return next ? null : out;
  });
}
