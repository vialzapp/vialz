// Token images live on IPFS. Public gateways rate-limit or block cross-origin loads, so the API fetches them once,
// tries gateways in turn and serves them from memory.

const GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"];
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_CACHE_BYTES = 80 * 1024 * 1024;
export const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,100})$/;

interface Img {
  type: string;
  body: Buffer;
}

const cache = new Map<string, Img>();
const missing = new Map<string, number>(); // cid -> when no gateway had it; retried after MISS_TTL_MS
const MISS_TTL_MS = 10 * 60_000;
let cacheBytes = 0;

export async function ipfsImage(cid: string): Promise<Img | null> {
  const hit = cache.get(cid);
  if (hit) return hit;
  const missedAt = missing.get(cid);
  if (missedAt && Date.now() - missedAt < MISS_TTL_MS) return null;
  let found: Img | null = null;
  for (const g of GATEWAYS) {
    try {
      const r = await fetch(g + cid, { signal: AbortSignal.timeout(8_000) });
      const type = r.headers.get("content-type") ?? "";
      if (!r.ok || !type.startsWith("image/") || type.includes("svg")) continue; // svg can carry script
      const body = Buffer.from(await r.arrayBuffer());
      if (body.length > MAX_BYTES) continue;
      found = { type, body };
      break;
    } catch {
      // next gateway
    }
  }
  if (!found) {
    missing.set(cid, Date.now());
    if (missing.size > 5_000) missing.delete(missing.keys().next().value!);
    return null;
  }
  cache.set(cid, found);
  cacheBytes += found.body.length;
  while (cacheBytes > MAX_CACHE_BYTES) {
    const [k, v] = cache.entries().next().value!;
    cache.delete(k);
    cacheBytes -= v.body.length;
  }
  return found;
}
