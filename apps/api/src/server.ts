// HTTP API: GET /v1/token/:address returns a TokenReport. Also serves the built site.
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractAddress, isPending, type TokenReport } from "@vialz/shared";
import { analyzeToken, NotFound, quickCached, quickToken, withCreator } from "./analyze.js";
import { inUrgent, requestDeadline } from "./rpc.js";
import { busiestLaunch } from "./latest.js";
import { CID_RE, ImagesBusy, ipfsImage } from "./images.js";
import { clientIp, refreshCloudflareRanges } from "./clientip.js";
import { tokenCard } from "./og.js";

const TTL_MS = 15_000;
// A report older than TTL but younger than this is still answered at once, while a fresh read runs behind it: a token
// everyone is checking (a link going round on X) answers instantly, a few seconds to minutes old.
const STALE_MS = 5 * 60_000;
type Entry = { at: number; report: Promise<TokenReport>; value?: TokenReport; refreshing?: boolean };
const cache = new Map<string, Entry>();

// Fresh reads of the chain are the expensive part. A few run at once, a short queue waits, the rest are told to retry:
// one busy client can slow the service down but cannot pile up unbounded work or memory.
const MAX_RUNNING = Number(process.env.MAX_RUNNING ?? 3);
const REPORT_BUDGET_MS = 30_000; // no report, and no RPC call made for it, outlives this
const MAX_WAITING = Number(process.env.MAX_WAITING ?? 24);
let running = 0;
const waiting: (() => void)[] = [];

export class Busy extends Error {}

async function gated<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_RUNNING) {
    if (waiting.length >= MAX_WAITING) throw new Busy("too many reads in progress");
    await new Promise<void>((r) => waiting.push(r));
  }
  running++;
  try {
    return await work();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** True when a request for this address is answered from memory (a fresh or recent report, or a read already running). */
const cached = (address: string) => {
  const hit = cache.get(address);
  return hit != null && (Date.now() - hit.at < TTL_MS || (hit.value != null && !isPending(hit.value) && Date.now() - hit.at < STALE_MS));
};

// Reads that go to the chain are limited per client; answers from memory (repeat checks, the polls that wait for the
// creator's record) only count against the much looser route limit.
const READS_PER_MINUTE = Number(process.env.TOKEN_PER_MINUTE ?? 15);
const QUICK_PER_MINUTE = 30;
// per client and kind: the times of reads that went to the chain, with the address, so one page re-reading its own
// token (polls) counts once a minute
const reads = new Map<string, { t: number; a: string }[]>();
function allowRead(ip: string, address: string, kind: "report" | "quick" = "report"): number {
  const now = Date.now();
  const key = `${kind}:${ip}`;
  const recent = (reads.get(key) ?? []).filter((r) => now - r.t < 60_000);
  if (recent.some((r) => r.a === address)) return 0;
  if (recent.length >= (kind === "quick" ? QUICK_PER_MINUTE : READS_PER_MINUTE)) {
    reads.set(key, recent);
    return Math.ceil((recent[0]!.t + 60_000 - now) / 1000); // seconds until a slot frees
  }
  recent.push({ t: now, a: address });
  reads.set(key, recent);
  if (reads.size > 40_000) reads.delete(reads.keys().next().value!);
  return 0;
}

// The image proxy serves only images of tokens someone has read: it is not a general IPFS gateway on our domain.
const knownImages = new Set<string>();
function noteImage(cid: string | null | undefined) {
  if (!cid) return;
  const fresh = !knownImages.has(cid);
  knownImages.delete(cid);
  knownImages.add(cid);
  if (knownImages.size > 20_000) knownImages.delete(knownImages.values().next().value!);
  // fetched now, in the background: by the time a link card is drawn (or the page asks), the picture is in memory
  if (fresh && CID_RE.test(cid)) void ipfsImage(cid).catch(() => null);
}

function report(address: string): Promise<TokenReport> {
  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < TTL_MS) {
    // a report waiting only on the creator's record is completed in place once that record is in; polling for it
    // never reads the token again
    const done = hit.value && withCreator(hit.value);
    if (done) {
      hit.value = done;
      hit.report = Promise.resolve(done);
    }
    return hit.report;
  }
  // a recent settled report is answered now; one fresh read runs behind it and replaces it when done
  if (hit?.value && !isPending(hit.value) && Date.now() - hit.at < STALE_MS) {
    if (!hit.refreshing) {
      hit.refreshing = true;
      gated(() => requestDeadline.run(Date.now() + REPORT_BUDGET_MS, () => analyzeToken(address as `0x${string}`))).then(
        (r) => {
          if (cache.get(address) !== hit) return;
          hit.value = r;
          hit.report = Promise.resolve(r);
          hit.at = Date.now();
          hit.refreshing = false;
          noteImage(r.links.image);
        },
        () => {
          hit.refreshing = false;
          hit.at = Date.now() - TTL_MS; // keep the old report, try again on the next request
        },
      );
    }
    return Promise.resolve(hit.value);
  }
  const p = gated(() => requestDeadline.run(Date.now() + REPORT_BUDGET_MS, () => analyzeToken(address as `0x${string}`)));
  const entry: Entry = { at: Date.now(), report: p };
  cache.set(address, entry);
  // the entry may have been replaced by a newer read while this one ran; only ever update our own
  const mine = () => cache.get(address) === entry;
  p.then(
    (r) => {
      if (!mine()) return;
      entry.value = r;
      noteImage(r.links.image);
      // fresh for TTL from when the read finished; a report still waiting on funding is kept short so polls pick it
      // up (the creator's record needs no new read: see above)
      entry.at = r.fundingStatus === "pending" ? Date.now() - TTL_MS + 2_000 : Date.now();
    },
    (e) => {
      if (!mine()) return;
      // "not a token" is remembered for a minute, so junk addresses cost one read, not one per request
      if (e instanceof NotFound) entry.at = Date.now() + 45_000;
      else cache.delete(address);
    },
  );
  if (cache.size > 2_000) cache.delete(cache.keys().next().value!);
  return p;
}

// Behind Railway's proxy the client address is the last hop it appends to X-Forwarded-For. Trusting a fixed number of hops
// (not `true`) keeps a client from choosing its own IP, and with it its own rate-limit bucket.
const TRUST_HOPS = Number(process.env.TRUST_PROXY_HOPS ?? 0);
const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  trustProxy: (_address: string, hop: number) => hop < TRUST_HOPS,
  // slow or idle clients are cut off; the API takes no request bodies
  connectionTimeout: 65_000,
  requestTimeout: 60_000,
  keepAliveTimeout: 72_000,
  bodyLimit: 1_024,
});

// Security headers. The site loads only its own scripts, styles, fonts and proxied images; nobody may frame it.
const SITE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join("; ");
// ---- before launch: the site is closed --------------------------------------------------------------------------------
// With PREVIEW_KEY set, strangers get a blank "Soon." page and a 404 from the API, so the domain cannot be tied to the
// project by scanning it. Opening any page once with ?preview=<key> sets a cookie that opens the real site for 30 days.
// The extension (chrome-extension:// origin) keeps working, and so do the health check and the image proxy (which only
// serves images of tokens already read). Unset PREVIEW_KEY on launch day and everything is public again.
const PREVIEW_KEY = process.env.PREVIEW_KEY ?? "";
const PREVIEW_COOKIE = "vz_preview";
const digest = (v: string) => createHash("sha256").update(v).digest();
const isKey = (v: string | null | undefined) => Boolean(PREVIEW_KEY && v && timingSafeEqual(digest(v), digest(PREVIEW_KEY)));
const cookieOf = (header: string | undefined, name: string) =>
  header
    ?.split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === name)?.[1];
// the placeholder: the same night sky as the site and one word, with no name, mark or link that ties it to the project.
// The site's display face is inlined, because the site's own files stay closed to strangers.
const STARS_IMAGE = "radial-gradient(circle at 165px 77px, oklch(0.97 0.01 250 / 0.23) 0 0.7px, transparent 1.3px), radial-gradient(circle at 48px 187px, oklch(0.97 0.01 250 / 0.47) 0 0.7px, transparent 1.3px), radial-gradient(circle at 109px 19px, oklch(0.97 0.01 250 / 0.6) 0 1.1px, transparent 1.7px), radial-gradient(circle at 123px 46px, oklch(0.97 0.01 250 / 0.24) 0 0.7px, transparent 1.3px), radial-gradient(circle at 289px 63px, oklch(0.97 0.01 250 / 0.4) 0 0.7px, transparent 1.3px), radial-gradient(circle at 298px 31px, oklch(0.97 0.01 250 / 0.33) 0 0.7px, transparent 1.3px), radial-gradient(circle at 113px 23px, oklch(0.97 0.01 250 / 0.26) 0 0.7px, transparent 1.3px), radial-gradient(circle at 214px 73px, oklch(0.97 0.01 250 / 0.38) 0 0.7px, transparent 1.3px), radial-gradient(circle at 573px 185px, oklch(0.97 0.01 250 / 0.65) 0 1.1px, transparent 1.7px), radial-gradient(circle at 192px 381px, oklch(0.97 0.01 250 / 0.7) 0 1.1px, transparent 1.7px), radial-gradient(circle at 577px 61px, oklch(0.97 0.01 250 / 0.36) 0 0.7px, transparent 1.3px), radial-gradient(circle at 544px 437px, oklch(0.97 0.01 250 / 0.35) 0 0.7px, transparent 1.3px), radial-gradient(circle at 464px 370px, oklch(0.97 0.01 250 / 0.44) 0 0.7px, transparent 1.3px), radial-gradient(circle at 715px 249px, oklch(0.97 0.01 250 / 0.56) 0 1.1px, transparent 1.7px), radial-gradient(circle at 506px 351px, oklch(0.97 0.01 250 / 0.3) 0 0.7px, transparent 1.3px), radial-gradient(circle at 74px 120px, oklch(0.97 0.01 250 / 0.27) 0 0.7px, transparent 1.3px)";
const STARS_SIZE = "263px 263px, 263px 263px, 331px 331px, 331px 331px, 409px 409px, 409px 409px, 487px 487px, 487px 487px, 577px 577px, 577px 577px, 661px 661px, 661px 661px, 743px 743px, 743px 743px, 853px 853px, 853px 853px";
function placeholderPage(): string {
  const assets = [join(dirname(fileURLToPath(import.meta.url)), "../../web/dist/assets"), join(dirname(fileURLToPath(import.meta.url)), "../web/dist/assets")].find((d) => existsSync(d));
  const fontFile = assets && readdirSync(assets).find((f) => /^archivo-latin-standard-normal-.*\.woff2$/.test(f));
  const font = fontFile ? `@font-face{font-family:A;src:url(data:font/woff2;base64,${readFileSync(join(assets!, fontFile)).toString("base64")}) format("woff2");font-weight:100 900;font-stretch:62% 125%}` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>soon</title><style>${font}
html,body{height:100%;margin:0;background:#0b0c10;overflow:hidden}
body{display:grid;place-items:center;font-family:A,"Arial Narrow",system-ui,sans-serif}
body::before{content:"";position:fixed;inset:0;background-image:${STARS_IMAGE};background-size:${STARS_SIZE};animation:sky 2.4s ease-out both}
h1{position:relative;margin:0;color:#f3f4f6;font-size:clamp(84px,19vw,280px);font-weight:700;font-stretch:78%;letter-spacing:-.03em;line-height:.9;animation:rise 1.6s cubic-bezier(.16,1,.3,1) .2s both}
@keyframes rise{from{opacity:0}}
@keyframes sky{from{opacity:0}}
@media (prefers-reduced-motion:reduce){h1,body::before{animation:none}}
</style></head><body><h1>soon</h1></body></html>`;
}
const PLACEHOLDER = PREVIEW_KEY ? placeholderPage() : "";
// The privacy policy stays public while the site is closed: the Chrome Web Store needs a reachable link to it. A plain
// page with the same text as apps/web/src/pages/Privacy.tsx (keep the two in step), and none of the site around it.
const PRIVACY_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Vialz privacy policy</title><style>
body{margin:0;background:#0b0c10;color:#c9ccd3;font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:680px;margin:0 auto;padding:56px 20px 80px}
h1{color:#f3f4f6;font-size:34px;line-height:1.1;margin:0 0 6px}h2{color:#f3f4f6;font-size:19px;margin:34px 0 8px}
.date{color:#8b8f99;font-size:14px;margin:0 0 8px}b{color:#f3f4f6}a{color:#f3f4f6}ul{padding-left:20px}li{margin:6px 0}
</style></head><body><main>
<h1>Vialz privacy policy</h1><p class="date">Last updated 12 October 2026</p>
<h2>What Vialz does</h2><p>Vialz reads public data from Robinhood Chain and shows it as a report about a token. It never connects to a wallet, never asks for a private key or signature, and has no accounts.</p>
<h2>What leaves your device</h2><p>When you check a token, its contract address is sent to the Vialz server, which reads the chain and returns the report. Nothing else about you is sent: no wallet address, no browsing history, no identifiers.</p>
<p>The server keeps ordinary request logs (time, requested token, IP address) for up to 14 days to keep the service running and to stop abuse. They are not sold or shared.</p>
<h2>The Chrome extension</h2><p>The extension asks for two permissions:</p><ul>
<li><b>Active tab</b>, only at the moment you click the Vialz icon and only for that tab: its address bar is read to find a contract address, which never leaves your device unless you check that token. Page content, other tabs and your browsing history are never read.</li>
<li><b>Storage</b>, to keep your last checked tokens and whether you hid the pin tip on your device. They never leave it.</li></ul>
<h2>Third parties</h2><p>Market data for tokens trading on Uniswap comes from DexScreener and the ETH price from Coinbase. Those requests are made by the Vialz server, not by your browser. Token images are fetched from public IPFS gateways by the Vialz server too, so your browser only talks to Vialz.</p>
<h2>Contact</h2><p>Questions about this policy: reach the Vialz team on X, <a href="https://x.com/vialzapp">@vialzapp</a>, or write to <a href="mailto:hello@vialz.xyz">hello@vialz.xyz</a>.</p>
</main></body></html>`;
const PLACEHOLDER_CSP = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

app.addHook("onRequest", async (req, reply) => {
  if (!PREVIEW_KEY) return;
  reply.header("x-robots-tag", "noindex, nofollow");
  const url = new URL(req.url, "http://local");
  if (url.pathname === "/v1/health") return;
  if (isKey(url.searchParams.get("preview"))) {
    url.searchParams.delete("preview");
    reply.header("set-cookie", `${PREVIEW_COOKIE}=${encodeURIComponent(PREVIEW_KEY)}; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax`);
    return reply.code(302).header("cache-control", "no-store").redirect(url.pathname + url.search);
  }
  const cookie = cookieOf(req.headers.cookie, PREVIEW_COOKIE);
  if (isKey(cookie ? decodeURIComponent(cookie) : null)) return;
  if (url.pathname.startsWith("/v1/")) {
    if ((req.headers.origin ?? "").startsWith("chrome-extension://") || url.pathname.startsWith("/v1/img/")) return;
    return reply.code(404).header("cache-control", "no-store").send({ error: "not_found", message: "Not found." });
  }
  if (url.pathname === "/privacy")
    return reply.code(200).type("text/html; charset=utf-8").header("cache-control", "no-store, no-transform").header("content-security-policy", PLACEHOLDER_CSP).send(PRIVACY_PAGE);
  if (url.pathname === "/robots.txt") return reply.type("text/plain").header("cache-control", "no-store").send("User-agent: *\nDisallow: /\n");
  if (url.pathname.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(url.pathname)) return reply.code(404).header("cache-control", "no-store").send("Not found.");
  return reply.code(200).type("text/html; charset=utf-8").header("cache-control", "no-store").header("content-security-policy", PLACEHOLDER_CSP).send(PLACEHOLDER);
});

app.addHook("onSend", async (req, reply) => {
  reply.header("x-content-type-options", "nosniff");
  reply.header("referrer-policy", "no-referrer");
  reply.header("strict-transport-security", "max-age=31536000");
  reply.header("x-frame-options", "DENY");
  if (req.url.startsWith("/v1/img/")) reply.header("content-security-policy", "default-src 'none'; sandbox");
  else if (!req.url.startsWith("/v1/")) {
    if (!reply.getHeader("content-security-policy")) reply.header("content-security-policy", SITE_CSP);
    // hashed build files never change; the page itself is always revalidated
    // no-transform: Cloudflare may not rewrite our pages, so it injects no analytics beacon (our CSP would block it anyway,
    // and the privacy page promises no third-party analytics)
    // a missing build file is never kept: during a deploy the new page can ask the old server for a file it does not have yet
    if (!reply.getHeader("cache-control"))
      reply.header(
        "cache-control",
        reply.statusCode >= 400 ? "no-store" : req.url.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache, no-transform",
      );
  }
});
await app.register(cors, { origin: true, methods: ["GET"] });
// Railway's edge puts the connecting address in X-Real-IP and passes X-Forwarded-For through as the client sent it.
// CLIENT_IP_HEADER names the edge's header; clientIp() also unwraps Cloudflare's proxy (see clientip.ts).
const CLIENT_IP_HEADER = process.env.CLIENT_IP_HEADER?.toLowerCase();
void refreshCloudflareRanges();
await app.register(rateLimit, {
  global: false,
  keyGenerator: (req) => clientIp(req, CLIENT_IP_HEADER),
  errorResponseBuilder: (_req, ctx) => ({
    statusCode: 429,
    error: "rate_limited",
    message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)} seconds.`,
  }),
});
const perMinute = (max: number) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });

app.get("/v1/health", async () => ({ ok: true }));

app.get<{ Params: { cid: string } }>("/v1/img/:cid", perMinute(120), async (req, reply) => {
  if (!CID_RE.test(req.params.cid)) return reply.code(400).send({ error: "bad_cid", message: "Not an IPFS content id." });
  if (!knownImages.has(req.params.cid)) return reply.code(404).send({ error: "not_found", message: "Not the image of a token read here." });
  let img;
  try {
    img = await ipfsImage(req.params.cid);
  } catch (e) {
    if (e instanceof ImagesBusy) return reply.code(503).header("retry-after", "5").send({ error: "busy", message: "Try again in a few seconds." });
    throw e;
  }
  if (!img) return reply.code(404).send({ error: "not_found", message: "Image not found on IPFS." });
  reply.header("content-type", img.type).header("cache-control", "public, max-age=604800, immutable").header("x-content-type-options", "nosniff");
  return reply.send(img.body);
});

app.get("/v1/latest", perMinute(30), async (_req, reply) => {
  const token = await requestDeadline.run(Date.now() + REPORT_BUDGET_MS, busiestLaunch);
  if (!token) return reply.code(503).send({ error: "no_launch", message: "No Pons launch found in the last hour." });
  reply.header("cache-control", "public, max-age=60");
  return { token };
});

app.get<{ Params: { address: string } }>("/v1/token/:address", perMinute(120), async (req, reply) => {
  const address = extractAddress(req.params.address);
  if (!address) return reply.code(400).send({ error: "bad_address", message: "Paste a contract address (0x… 40 hex characters)." });
  if (!cached(address)) {
    const wait = allowRead(clientIp(req, CLIENT_IP_HEADER), address);
    if (wait > 0)
      return reply
        .code(429)
        .header("retry-after", String(wait))
        .send({ error: "rate_limited", message: `Too many checks. Try again in ${wait} seconds.` });
  }
  try {
    const r = await report(address);
    reply.header("cache-control", isPending(r) ? "no-store" : "public, max-age=10");
    return r;
  } catch (e) {
    if (e instanceof NotFound) return reply.code(404).send({ error: "not_found", message: e.message });
    if (e instanceof Busy) return reply.code(503).header("retry-after", "10").send({ error: "busy", message: "Lots of checks right now. Try again in a few seconds." });
    req.log.error(e);
    return reply.code(502).send({ error: "chain_unavailable", message: "Could not read the chain right now. Try again in a few seconds." });
  }
});

// The first look at a token, in about two round trips: what the page shows while the full report is read. Cheap and
// shared with the full read, so it only counts against the route limit.
app.get<{ Params: { address: string } }>("/v1/token/:address/quick", perMinute(120), async (req, reply) => {
  const address = extractAddress(req.params.address);
  if (!address) return reply.code(400).send({ error: "bad_address", message: "Paste a contract address (0x… 40 hex characters)." });
  if (!quickCached(address)) {
    const wait = allowRead(clientIp(req, CLIENT_IP_HEADER), address, "quick");
    if (wait > 0) return reply.code(429).header("retry-after", String(wait)).send({ error: "rate_limited", message: `Too many checks. Try again in ${wait} seconds.` });
  }
  try {
    const q = await requestDeadline.run(Date.now() + 10_000, () => inUrgent(() => quickToken(address)));
    noteImage(q.links.image);
    reply.header("cache-control", "public, max-age=5");
    return q;
  } catch (e) {
    if (e instanceof NotFound) return reply.code(404).send({ error: "not_found", message: e.message });
    req.log.warn(e);
    return reply.code(502).send({ error: "chain_unavailable", message: "Could not read the chain right now." });
  }
});

// The link card of a token page. Drawn once and kept: ten minutes for a settled report, half a minute while parts
// of it are still being read.
const cards = new Map<string, { at: number; ttl: number; png: Promise<Buffer> }>();
async function cardImage(r: TokenReport) {
  const cid = r.links.image;
  if (!cid || !CID_RE.test(cid)) return null;
  // the card waits a moment for the token's picture, never long: a crawler gives up on slow images
  const slow = new Promise<null>((ok) => setTimeout(() => ok(null), 4_000));
  return Promise.race([ipfsImage(cid).catch(() => null), slow]);
}
app.get<{ Params: { file: string } }>("/og/:file", perMinute(60), async (req, reply) => {
  const m = /^(0x[0-9a-fA-F]{40})\.png$/.exec(req.params.file);
  const address = m ? extractAddress(m[1]!) : null;
  if (!address) return reply.code(404).send({ error: "not_found", message: "Not a token card." });
  let hit = cards.get(address);
  if (!hit || Date.now() - hit.at > hit.ttl) {
    if (!cached(address)) {
      const wait = allowRead(clientIp(req, CLIENT_IP_HEADER), address);
      if (wait > 0) return reply.code(429).header("retry-after", String(wait)).send({ error: "rate_limited", message: `Try again in ${wait} seconds.` });
    }
    let r: TokenReport;
    try {
      r = await report(address);
    } catch (e) {
      if (e instanceof NotFound) return reply.code(404).send({ error: "not_found", message: e.message });
      if (e instanceof Busy) return reply.code(503).header("retry-after", "10").send({ error: "busy", message: "Try again in a few seconds." });
      req.log.warn(e);
      return reply.code(502).send({ error: "chain_unavailable", message: "Could not read the chain right now." });
    }
    // a crawler keeps the first card it sees for days: give the creator's record a few seconds to come in
    for (let waited = 0; isPending(r) && waited < 8_000; waited += 1_000) {
      await new Promise((ok) => setTimeout(ok, 1_000));
      r = await report(address).catch(() => r);
    }
    const img = await cardImage(r);
    const settled = !isPending(r) && (img != null || !r.links.image);
    const done = r;
    hit = { at: Date.now(), ttl: settled ? 600_000 : 30_000, png: tokenCard(done, img) };
    cards.set(address, hit);
    hit.png.catch(() => cards.delete(address));
    if (cards.size > 300) cards.delete(cards.keys().next().value!);
  }
  const png = await hit.png;
  reply.header("content-type", "image/png").header("cache-control", "public, max-age=600");
  return reply.send(png);
});

// Link previews: a token page's HTML names that token and its card, so a link to it shows the token, not the site.
// Crawlers get the token's name even on a first look; people get it only when it is already known, so the page never
// waits on the chain.
const CRAWLER = /bot|crawler|spider|facebookexternalhit|embedly|preview|whatsapp|telegram|discord|slack|linkedin/i;
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let indexHtml: string | null = null;
async function tokenPage(address: `0x${string}`, crawler: boolean, base: string): Promise<string> {
  const known = cache.get(address)?.value;
  let symbol = known?.symbol ?? null;
  let name = known?.name ?? null;
  if (!symbol && (crawler || quickCached(address))) {
    const q = await Promise.race([
      requestDeadline.run(Date.now() + 4_000, () => inUrgent(() => quickToken(address))).catch(() => null),
      new Promise<null>((ok) => setTimeout(() => ok(null), 4_000)),
    ]);
    symbol = q?.symbol ?? null;
    name = q?.name ?? null;
  }
  const title = symbol ? `$${symbol} on Vialz` : "Token check | Vialz";
  const desc = symbol
    ? `${name ?? symbol}, read from Robinhood Chain: snipers, bundle, top 10, linked wallets, the creator and the volume.`
    : "Snipers, bundle, top 10, linked wallets, the creator and the volume, read from Robinhood Chain.";
  const url = `${base}/t/${address}`;
  const img = `${base}/og/${address}.png`;
  const set = (html: string, attr: "property" | "name", key: string, value: string) =>
    html.replace(new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`), `$1${esc(value)}$2`);
  let html = indexHtml!;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = set(html, "property", "og:title", title);
  html = set(html, "property", "og:description", desc);
  html = set(html, "property", "og:url", url);
  html = set(html, "property", "og:image", img);
  html = set(html, "property", "og:image:width", "1200");
  html = set(html, "property", "og:image:height", "630");
  html = set(html, "property", "og:image:alt", symbol ? `Vialz readings for $${symbol}` : "Vialz readings for a token");
  html = set(html, "name", "twitter:title", title);
  html = set(html, "name", "twitter:description", desc);
  html = set(html, "name", "twitter:image", img);
  return html;
}

// the site, built by apps/web
const here = dirname(fileURLToPath(import.meta.url));
const site = [join(here, "../../web/dist"), join(here, "../web/dist")].find((p) => existsSync(p));
if (site) {
  await app.register(fastifyStatic, { root: site, wildcard: false, cacheControl: false });
  app.setNotFoundHandler((req, reply) => {
    const isPage = (req.method === "GET" || req.method === "HEAD") && !req.url.startsWith("/v1") && !req.url.startsWith("/assets/");
    if (!isPage) return reply.code(404).send({ error: "not_found", message: "Unknown endpoint." });
    const t = /^\/t\/(0x[0-9a-fA-F]{40})\/?(?:[?#].*)?$/.exec(req.url);
    const address = t ? extractAddress(t[1]!) : null;
    if (address) {
      indexHtml ??= readFileSync(join(site, "index.html"), "utf8");
      const base = process.env.PUBLIC_URL ?? "https://vialz.xyz";
      return tokenPage(address, CRAWLER.test(req.headers["user-agent"] ?? ""), base).then((html) => reply.type("text/html; charset=utf-8").send(html));
    }
    // the site's own pages; anything else still gets the app (it draws "Nothing here."), but with a 404 for crawlers
    const known = /^\/(how|report|faq|docs|privacy|extension)?\/?(?:[?#].*)?$/.test(req.url);
    return reply.code(known ? 200 : 404).sendFile("index.html");
  });
}

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 8787) });
