// HTTP API: GET /v1/token/:address returns a TokenReport. Also serves the built site.
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractAddress, isPending, type TokenReport } from "@vialz/shared";
import { analyzeToken, NotFound, quickCached, quickToken, withCreator } from "./analyze.js";
import { inUrgent, requestDeadline } from "./rpc.js";
import { busiestLaunch } from "./latest.js";
import { CID_RE, ImagesBusy, ipfsImage } from "./images.js";
import { clientIp, refreshCloudflareRanges } from "./clientip.js";

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; report: Promise<TokenReport>; value?: TokenReport }>();

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

/** True when a request for this address is answered from memory (a fresh report, or a read already running). */
const cached = (address: string) => {
  const hit = cache.get(address);
  return hit != null && Date.now() - hit.at < TTL_MS;
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
  knownImages.delete(cid);
  knownImages.add(cid);
  if (knownImages.size > 20_000) knownImages.delete(knownImages.values().next().value!);
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
  const p = gated(() => requestDeadline.run(Date.now() + REPORT_BUDGET_MS, () => analyzeToken(address as `0x${string}`)));
  const entry: { at: number; report: Promise<TokenReport>; value?: TokenReport } = { at: Date.now(), report: p };
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
const PLACEHOLDER = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Soon</title><style>html,body{height:100%;margin:0;background:#0b0c0f;color:#8b8f99;font:500 15px/1.5 system-ui,sans-serif}body{display:grid;place-items:center}</style></head><body><p>Soon.</p></body></html>`;

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
  if (url.pathname === "/robots.txt") return reply.type("text/plain").header("cache-control", "no-store").send("User-agent: *\nDisallow: /\n");
  if (url.pathname.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(url.pathname)) return reply.code(404).header("cache-control", "no-store").send("Not found.");
  return reply.code(200).type("text/html; charset=utf-8").header("cache-control", "no-store").send(PLACEHOLDER);
});

app.addHook("onSend", async (req, reply) => {
  reply.header("x-content-type-options", "nosniff");
  reply.header("referrer-policy", "no-referrer");
  reply.header("strict-transport-security", "max-age=31536000");
  reply.header("x-frame-options", "DENY");
  if (req.url.startsWith("/v1/img/")) reply.header("content-security-policy", "default-src 'none'; sandbox");
  else if (!req.url.startsWith("/v1/")) {
    reply.header("content-security-policy", SITE_CSP);
    // hashed build files never change; the page itself is always revalidated
    // no-transform: Cloudflare may not rewrite our pages, so it injects no analytics beacon (our CSP would block it anyway,
    // and the privacy page promises no third-party analytics)
    if (!reply.getHeader("cache-control"))
      reply.header("cache-control", req.url.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache, no-transform");
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

// the site, built by apps/web
const here = dirname(fileURLToPath(import.meta.url));
const site = [join(here, "../../web/dist"), join(here, "../web/dist")].find((p) => existsSync(p));
if (site) {
  await app.register(fastifyStatic, { root: site, wildcard: false, cacheControl: false });
  app.setNotFoundHandler((req, reply) => {
    const isPage = (req.method === "GET" || req.method === "HEAD") && !req.url.startsWith("/v1") && !req.url.startsWith("/assets/");
    if (!isPage) return reply.code(404).send({ error: "not_found", message: "Unknown endpoint." });
    return reply.sendFile("index.html");
  });
}

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 8787) });
