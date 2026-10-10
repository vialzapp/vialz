// Who sent a wallet its first ETH. Plain ETH transfers leave no logs, so this needs an address-indexed source:
// the Etherscan API v2 (chain 4663). Without ETHERSCAN_API_KEY funding clusters are skipped.

const KEY = process.env.ETHERSCAN_API_KEY;
const BASE = "https://api.etherscan.io/v2/api?chainid=4663";
const MIN_GAP_MS = 350; // free tier: 3 calls per second

const funders = new Map<string, string | null>(); // wallet -> first funder, kept for the life of the process
let last = 0;

export const fundingEnabled = () => Boolean(KEY);

async function call(params: Record<string, string>): Promise<{ status: string; result: unknown }> {
  const wait = last + MIN_GAP_MS - Date.now();
  last = Math.max(Date.now(), last + MIN_GAP_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const q = new URLSearchParams({ ...params, apikey: KEY ?? "" });
  const r = await fetch(`${BASE}&${q}`, { signal: AbortSignal.timeout(10_000) });
  return (await r.json()) as { status: string; result: unknown };
}

interface Tx {
  from: string;
  value: string;
  timeStamp: string;
}

async function firstIncoming(wallet: string, action: "txlist" | "txlistinternal"): Promise<Tx | null> {
  const j = await call({ module: "account", action, address: wallet, sort: "asc", page: "1", offset: "20" });
  if (!Array.isArray(j.result)) return null;
  return (j.result as Tx[]).find((t) => t.from.toLowerCase() !== wallet && BigInt(t.value) > 0n) ?? null;
}

async function lookup(wallet: string): Promise<string | null> {
  const [normal, internal] = [await firstIncoming(wallet, "txlist"), await firstIncoming(wallet, "txlistinternal")];
  const first = [normal, internal].filter((t): t is Tx => t != null).sort((a, b) => Number(a.timeStamp) - Number(b.timeStamp))[0];
  return first ? first.from.toLowerCase() : null;
}

/** undefined: not looked up yet; null: no incoming ETH found. */
export const cachedFunder = (wallet: string): string | null | undefined => funders.get(wallet);

const queued = new Set<string>();
let draining = false;

export function queueFunders(wallets: string[]) {
  if (!KEY) return;
  for (const w of wallets) if (!funders.has(w)) queued.add(w);
  if (!draining) void drain();
}

async function drain() {
  draining = true;
  try {
    for (const w of queued) {
      queued.delete(w);
      try {
        funders.set(w, await lookup(w));
      } catch {
        // left unknown: the next report queues it again
      }
    }
  } finally {
    draining = false;
    if (queued.size > 0) void drain();
  }
}
