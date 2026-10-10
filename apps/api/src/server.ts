// HTTP API: GET /v1/token/:address returns a TokenReport. Also serves the built site.
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractAddress, type TokenReport } from "@vialz/shared";
import { analyzeToken, NotFound } from "./analyze.js";
import { requestDeadline } from "./rpc.js";
import { busiestLaunch } from "./latest.js";
import { CID_RE, ImagesBusy, ipfsImage } from "./images.js";

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; report: Promise<TokenReport> }>();

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

function report(address: string): Promise<TokenReport> {
  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.report;
  const p = gated(() => requestDeadline.run(Date.now() + REPORT_BUDGET_MS, () => analyzeToken(address as `0x${string}`)));
  cache.set(address, { at: Date.now(), report: p });
  p.then(
    (r) => {
      // a report still waiting on funding lookups is kept short so the next request picks them up
      if (r.fundingStatus === "pending") cache.set(address, { at: Date.now() - TTL_MS + 3_000, report: p });
    },
    (e) => {
      // "not a token" is remembered for a minute, so junk addresses cost one read, not one per request
      if (e instanceof NotFound) cache.set(address, { at: Date.now() + 45_000, report: p });
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
app.addHook("onSend", async (req, reply) => {
  reply.header("x-content-type-options", "nosniff");
  reply.header("referrer-policy", "no-referrer");
  reply.header("strict-transport-security", "max-age=31536000");
  reply.header("x-frame-options", "DENY");
  if (req.url.startsWith("/v1/img/")) reply.header("content-security-policy", "default-src 'none'; sandbox");
  else if (!req.url.startsWith("/v1/")) {
    reply.header("content-security-policy", SITE_CSP);
    // hashed build files never change; the page itself is always revalidated
    reply.header("cache-control", req.url.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
  }
});
await app.register(cors, { origin: true, methods: ["GET"] });
// Railway's edge puts the client address in X-Real-IP (docs: networking specs) and passes X-Forwarded-For through as
// the client sent it, so a forwarded chain cannot be trusted there. CLIENT_IP_HEADER names the header the edge sets.
const CLIENT_IP_HEADER = process.env.CLIENT_IP_HEADER?.toLowerCase();
const clientIp = (req: { ip: string; headers: Record<string, string | string[] | undefined> }) => {
  const v = CLIENT_IP_HEADER ? req.headers[CLIENT_IP_HEADER] : undefined;
  return (Array.isArray(v) ? v[0] : v)?.trim() || req.ip;
};
await app.register(rateLimit, {
  global: false,
  keyGenerator: clientIp,
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

app.get<{ Params: { address: string } }>("/v1/token/:address", perMinute(Number(process.env.TOKEN_PER_MINUTE ?? 15)), async (req, reply) => {
  const address = extractAddress(req.params.address);
  if (!address) return reply.code(400).send({ error: "bad_address", message: "Paste a contract address (0x… 40 hex characters)." });
  try {
    const r = await report(address);
    reply.header("cache-control", "public, max-age=10");
    return r;
  } catch (e) {
    if (e instanceof NotFound) return reply.code(404).send({ error: "not_found", message: e.message });
    if (e instanceof Busy) return reply.code(503).header("retry-after", "10").send({ error: "busy", message: "Lots of checks right now. Try again in a few seconds." });
    req.log.error(e);
    return reply.code(502).send({ error: "chain_unavailable", message: "Could not read the chain right now. Try again in a few seconds." });
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
