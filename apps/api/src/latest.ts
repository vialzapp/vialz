// The busiest Pons launch of the last hour: the live example on the site's first screen.
import { getLogs, head, addressFromTopic } from "./rpc.js";
import { CURVE_BUY, FACTORY, TOKEN_LAUNCHED } from "./pons.js";

const WINDOW_BLOCKS = 36_000; // about an hour at ~0.1 s blocks
const TTL_MS = 3 * 60_000;

let cached: { at: number; value: Promise<string | null> } | null = null;

export function busiestLaunch(): Promise<string | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = find().catch(() => null);
  cached = { at: Date.now(), value };
  return value;
}

async function find(): Promise<string | null> {
  const h = await head();
  const from = h - WINDOW_BLOCKS;
  const [launches, buys] = await Promise.all([
    getLogs({ address: FACTORY, topics: [TOKEN_LAUNCHED] }, from, h),
    getLogs({ topics: [CURVE_BUY] }, from, h),
  ]);
  const tokenByCurve = new Map(launches.map((l) => [addressFromTopic(l.topics[2]!), addressFromTopic(l.topics[1]!)]));
  const buyers = new Map<string, Set<string>>();
  for (const b of buys) {
    if (!tokenByCurve.has(b.address)) continue;
    const set = buyers.get(b.address) ?? new Set<string>();
    set.add(addressFromTopic(b.topics[2]!));
    buyers.set(b.address, set);
  }
  const best = [...buyers.entries()].sort((a, b) => b[1].size - a[1].size)[0];
  return best ? tokenByCurve.get(best[0])! : null;
}
