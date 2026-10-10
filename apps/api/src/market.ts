// Prices from outside the chain: ETH/USD from Coinbase, pool data for graduated and non-Pons tokens from DexScreener.

interface Cached<T> {
  until: number;
  value: Promise<T>;
}

const cache = new Map<string, Cached<unknown>>();
const MAX_ENTRIES = 5_000;
const FAIL_TTL_MS = 5_000;

/** One request per key in flight, a bounded cache, and failures kept only briefly so an outage does not stick. */
function cached<T>(key: string, ttlMs: number, load: () => Promise<{ value: T; ok: boolean }>): Promise<T> {
  const hit = cache.get(key) as Cached<T> | undefined;
  if (hit && Date.now() < hit.until) return hit.value;
  const entry: Cached<T> = { until: Date.now() + ttlMs, value: Promise.resolve(undefined as T) };
  entry.value = load().then(({ value, ok }) => {
    if (!ok) entry.until = Date.now() + FAIL_TTL_MS;
    return value;
  });
  cache.delete(key);
  cache.set(key, entry);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  return entry.value;
}

export function ethUsd(): Promise<number | null> {
  return cached("eth-usd", 60_000, async () => {
    try {
      const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { signal: AbortSignal.timeout(8_000) });
      const j = (await r.json()) as { data?: { amount?: string } };
      const v = Number(j.data?.amount);
      return Number.isFinite(v) && v > 0 ? { value: v, ok: true } : { value: null, ok: false };
    } catch {
      return { value: null, ok: false };
    }
  });
}

export interface DexPair {
  pairAddress: string;
  dexId: string;
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { m5?: number; h1?: number; h24?: number };
  txns?: { m5?: { buys: number; sells: number }; h1?: { buys: number; sells: number }; h24?: { buys: number; sells: number } };
  baseToken: { address: string; symbol: string };
  quoteToken: { address: string; symbol: string };
}

/** Pairs where the token is the base, deepest first. */
export function dexPairs(token: string): Promise<DexPair[]> {
  return cached(`dex:${token}`, 30_000, async () => {
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${token}`, { signal: AbortSignal.timeout(8_000) });
      if (!r.ok) return { value: [] as DexPair[], ok: false };
      const pairs: unknown = await r.json();
      if (!Array.isArray(pairs)) return { value: [] as DexPair[], ok: false };
      const value = (pairs as DexPair[])
        .filter((p) => typeof p?.baseToken?.address === "string" && typeof p.pairAddress === "string" && p.baseToken.address.toLowerCase() === token.toLowerCase())
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
      return { value, ok: true };
    } catch {
      return { value: [] as DexPair[], ok: false };
    }
  });
}

/** USD price of a curve's quote token (ETH, USDG, a stock token or another coin). */
export async function quoteUsd(quote: string | null): Promise<number | null> {
  if (!quote) return ethUsd();
  const pairs = await dexPairs(quote);
  const p = Number(pairs[0]?.priceUsd);
  return Number.isFinite(p) && p > 0 ? p : null;
}
