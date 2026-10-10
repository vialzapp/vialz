// HTTP API: GET /v1/token/:address returns a TokenReport. Also serves the built site.
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractAddress, type TokenReport } from "@vialz/shared";
import { analyzeToken, NotFound } from "./analyze.js";
import { busiestLaunch } from "./latest.js";
import { CID_RE, ipfsImage } from "./images.js";

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; report: Promise<TokenReport> }>();

function report(address: string): Promise<TokenReport> {
  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.report;
  const p = analyzeToken(address as `0x${string}`);
  cache.set(address, { at: Date.now(), report: p });
  p.then(
    (r) => {
      // a report still waiting on funding lookups is kept short so the next request picks them up
      if (r.fundingStatus === "pending") cache.set(address, { at: Date.now() - TTL_MS + 3_000, report: p });
    },
    () => cache.delete(address),
  );
  if (cache.size > 2_000) cache.delete(cache.keys().next().value!);
  return p;
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
await app.register(cors, { origin: true, methods: ["GET"] });

app.get("/v1/health", async () => ({ ok: true }));

app.get<{ Params: { cid: string } }>("/v1/img/:cid", async (req, reply) => {
  if (!CID_RE.test(req.params.cid)) return reply.code(400).send({ error: "bad_cid", message: "Not an IPFS content id." });
  const img = await ipfsImage(req.params.cid);
  if (!img) return reply.code(404).send({ error: "not_found", message: "Image not found on IPFS." });
  reply.header("content-type", img.type).header("cache-control", "public, max-age=604800, immutable").header("x-content-type-options", "nosniff");
  return reply.send(img.body);
});

app.get("/v1/latest", async (_req, reply) => {
  const token = await busiestLaunch();
  if (!token) return reply.code(503).send({ error: "no_launch", message: "No Pons launch found in the last hour." });
  reply.header("cache-control", "public, max-age=60");
  return { token };
});

app.get<{ Params: { address: string } }>("/v1/token/:address", async (req, reply) => {
  const address = extractAddress(req.params.address);
  if (!address) return reply.code(400).send({ error: "bad_address", message: "Paste a contract address (0x… 40 hex characters)." });
  try {
    const r = await report(address);
    reply.header("cache-control", "public, max-age=10");
    return r;
  } catch (e) {
    if (e instanceof NotFound) return reply.code(404).send({ error: "not_found", message: e.message });
    req.log.error(e);
    return reply.code(502).send({ error: "chain_unavailable", message: "Could not read the chain right now. Try again in a few seconds." });
  }
});

// the site, built by apps/web
const here = dirname(fileURLToPath(import.meta.url));
const site = [join(here, "../../web/dist"), join(here, "../web/dist")].find((p) => existsSync(p));
if (site) {
  await app.register(fastifyStatic, { root: site, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/v1/")) return reply.code(404).send({ error: "not_found", message: "Unknown endpoint." });
    return reply.sendFile("index.html");
  });
}

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 8787) });
