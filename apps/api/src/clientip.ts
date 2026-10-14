// The client's IP, for rate limits. Railway's edge sets X-Real-IP to whoever connected to it. Behind the Cloudflare
// proxy that is a Cloudflare server, and the visitor is in CF-Connecting-IP. That header is only believed when the
// connection really came from Cloudflare: anyone can send it straight to the railway.app address.
import { BlockList, isIPv6 } from "node:net";

// published at https://www.cloudflare.com/ips (checked 10.10.2026); refreshed from there on start
const CLOUDFLARE = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
  "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];

let cloudflare = build(CLOUDFLARE);

function build(ranges: string[]): BlockList {
  const list = new BlockList();
  for (const r of ranges) {
    const [net, len] = r.split("/");
    if (net && len) list.addSubnet(net, Number(len), isIPv6(net) ? "ipv6" : "ipv4");
  }
  return list;
}

export async function refreshCloudflareRanges(): Promise<void> {
  try {
    const texts = await Promise.all(
      ["https://www.cloudflare.com/ips-v4", "https://www.cloudflare.com/ips-v6"].map((u) =>
        fetch(u, { signal: AbortSignal.timeout(8_000) }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`http ${r.status}`)))),
      ),
    );
    const ranges = texts.flatMap((t) => t.split(/\s+/)).filter((r) => /^[0-9a-f:.]+\/\d+$/i.test(r));
    if (ranges.length > 10) cloudflare = build(ranges);
  } catch {
    // keep the built-in list
  }
}

const isCloudflare = (ip: string) => {
  const v4mapped = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  return cloudflare.check(v4mapped, isIPv6(v4mapped) ? "ipv6" : "ipv4");
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** One home or phone gets a whole IPv6 /64, so per-client limits count the /64, not each of its addresses. */
export function rateKey(ip: string): string {
  if (!isIPv6(ip) || ip.startsWith("::ffff:")) return ip;
  const [head = "", tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => parseInt(g || "0", 16).toString(16)).join(":")}::/64`;
}

/** `edgeHeader` is the header the host's edge sets to the connecting address (x-real-ip on Railway). The answer is a
 *  rate-limit key: an IPv4 address, or an IPv6 /64. */
export function clientIp(req: { ip: string; headers: Record<string, string | string[] | undefined> }, edgeHeader?: string): string {
  const peer = (edgeHeader && one(req.headers[edgeHeader])) || req.ip;
  const visitor = one(req.headers["cf-connecting-ip"]);
  return rateKey(visitor && isCloudflare(peer) ? visitor : peer);
}
