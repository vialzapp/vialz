// Token images live on IPFS. Public gateways rate-limit or block cross-origin loads, so the API fetches them once,
// asks the gateways in parallel and serves the first good answer from memory.
// Bounded everywhere: bytes per image (checked while streaming), fetches in flight, cache size, misses remembered.
// Launchpads take full-size uploads (a 3.5 MB PNG for a 40 px avatar is common): big ones are shrunk once, here.
import { Resvg } from "@resvg/resvg-js";

const GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"];
const MAX_BYTES = 12 * 1024 * 1024; // what is downloaded
const KEEP_BYTES = 400 * 1024; // bigger than this is shrunk before it is kept
const SIZE_PX = 400;
const MAX_CACHE_BYTES = 80 * 1024 * 1024;
const TIMEOUT_MS = 30_000; // the one gateway that has a big file can take 20 s to send it; this runs in the background
const MAX_FETCHING = 8;
const MISS_TTL_MS = 10 * 60_000;
export const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,100})$/;

interface Img {
  type: string;
  body: Buffer;
}

const cache = new Map<string, Img>();
const missing = new Map<string, number>(); // cid -> when no gateway had it
const inFlight = new Map<string, Promise<Img | null>>();
let cacheBytes = 0;

export class ImagesBusy extends Error {}

/** Reads a response body, giving up as soon as it passes the size limit. */
async function readCapped(r: Response, ctrl: AbortController): Promise<Buffer | null> {
  const declared = Number(r.headers.get("content-length"));
  if (declared > MAX_BYTES || !r.body) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > MAX_BYTES) {
      ctrl.abort();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function fromGateway(gateway: string, cid: string, ctrl: AbortController): Promise<Img> {
  const r = await fetch(gateway + cid, { signal: ctrl.signal });
  const type = (r.headers.get("content-type") ?? "").toLowerCase();
  if (!r.ok || !type.startsWith("image/") || type.includes("svg")) throw new Error("not an image"); // svg can carry script
  const body = await readCapped(r, ctrl);
  if (!body) throw new Error("too large");
  return { type, body };
}

/** A big image redrawn as a 400 px PNG, cropped to a square like every avatar slot that shows it; null if it cannot be
 *  decoded (then the original is kept only when it is small enough). */
function shrink(img: Img): Img | null {
  try {
    const href = `data:${img.type};base64,${img.body.toString("base64")}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE_PX}" height="${SIZE_PX}"><image width="${SIZE_PX}" height="${SIZE_PX}" preserveAspectRatio="xMidYMid slice" xlink:href="${href}"/></svg>`;
    const png = new Resvg(svg, { fitTo: { mode: "width", value: SIZE_PX } }).render().asPng();
    return png.length > 0 && png.length < img.body.length ? { type: "image/png", body: png } : null;
  } catch {
    return null;
  }
}

async function fetchImage(cid: string): Promise<Img | null> {
  const ctrls = GATEWAYS.map(() => new AbortController());
  const timer = setTimeout(() => ctrls.forEach((c) => c.abort()), TIMEOUT_MS);
  try {
    const img = await Promise.any(GATEWAYS.map((g, i) => fromGateway(g, cid, ctrls[i]!)));
    ctrls.forEach((c) => c.abort()); // stop the slower gateways
    if (img.body.length <= KEEP_BYTES) return img;
    return shrink(img) ?? (img.body.length <= 3 * 1024 * 1024 ? img : null);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function ipfsImage(cid: string): Promise<Img | null> {
  const hit = cache.get(cid);
  if (hit) return hit;
  const missedAt = missing.get(cid);
  if (missedAt && Date.now() - missedAt < MISS_TTL_MS) return null;
  const pending = inFlight.get(cid);
  if (pending) return pending;
  if (inFlight.size >= MAX_FETCHING) throw new ImagesBusy("too many image fetches");

  const p = fetchImage(cid).then((found) => {
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
  });
  inFlight.set(cid, p);
  void p.finally(() => inFlight.delete(cid));
  return p;
}
