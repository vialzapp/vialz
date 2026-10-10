// Prices from outside the chain: ETH/USD from Coinbase, pool data for graduated and non-Pons tokens from DexScreener.

interface Cached<T> {
  at: number;
  value: T;
}

const cache = new Map<string, Cached<unknown>>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Cached<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function ethUsd(): Promise<number | null> {
  return cached("eth-usd", 60_000, async () => {
    try {
      const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { signal: AbortSignal.timeout(8_000) });
      const j = (await r.json()) as { data?: { amount?: string } };
      const v = Number(j.data?.amount);
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      return null;
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
      if (!r.ok) return [];
      const pairs = (await r.json()) as DexPair[];
      return pairs
        .filter((p) => p.baseToken.address.toLowerCase() === token.toLowerCase())
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    } catch {
      return [];
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
