// Robinhood Chain JSON-RPC: retries, batching and wide log queries split into allowed spans.
// Requests go through node:https rather than fetch: the official node sits behind Cloudflare, which answers fetch's
// browser-style headers with a challenge page, while a plain client (like curl) gets JSON.
import https from "node:https";
import { AsyncLocalStorage } from "node:async_hooks";

const RPC_URL = process.env.RH_RPC ?? "https://rpc.mainnet.chain.robinhood.com";
// The official node allows 10M blocks per address-filtered eth_getLogs (checked 10.10.2026).
const MAX_SPAN = Number(process.env.RH_LOGS_SPAN ?? 9_000_000);
const CONCURRENCY = Number(process.env.RH_RPC_CONCURRENCY ?? 4);

export interface Log {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

export class RpcError extends Error {}
/** A log read ran past its time budget (a token with millions of transfers). */
export class DeadlineError extends Error {}

/** The current request's deadline. Every RPC call made while serving a request inherits it, so no call can outlive
 *  the request that started it and hold a connection slot for minutes. */
export const requestDeadline = new AsyncLocalStorage<number>();
const deadlineOf = (explicit: number) => Math.min(explicit, requestDeadline.getStore() ?? Infinity);

let nextId = 1;
export const rpcStats = { requests: 0, retries: 0 };
let active = 0;
const queue: (() => void)[] = [];
const MAX_QUEUE = Number(process.env.RH_RPC_MAX_QUEUE ?? 200);

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= CONCURRENCY) {
    if (queue.length >= MAX_QUEUE) throw new RpcError("rpc queue full");
    await new Promise<void>((r) => queue.push(r));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

const agent = new https.Agent({ keepAlive: true, maxSockets: CONCURRENCY });

function postOnce(body: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      RPC_URL,
      {
        method: "POST",
        agent,
        timeout: 45_000,
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), "user-agent": "vialz-api/0.1" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode === 429 || (res.statusCode ?? 500) >= 500) return reject(new RpcError(`http ${res.statusCode}`));
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new RpcError(`http ${res.statusCode}: not json (${text.slice(0, 40)})`));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new RpcError("timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

async function post(body: unknown, explicitDeadline = Infinity): Promise<unknown> {
  const deadline = deadlineOf(explicitDeadline);
  rpcStats.requests++;
  const text = JSON.stringify(body);
  let last: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (Date.now() > deadline) throw new DeadlineError("request ran out of time");
    try {
      return await postOnce(text);
    } catch (e) {
      last = e;
      const limited = e instanceof RpcError && e.message === "http 429";
      if (!limited && attempt >= 3) break;
      rpcStats.retries++;
      await new Promise((r) => setTimeout(r, (limited ? 1_000 : 300) * 2 ** Math.min(attempt, 3) * (0.75 + Math.random() / 2)));
    }
  }
  throw new RpcError(`rpc unreachable: ${String(last)}`);
}

export function rpc<T>(method: string, params: unknown[], explicitDeadline = Infinity): Promise<T> {
  const deadline = deadlineOf(explicitDeadline);
  return slot(async () => {
    if (Date.now() > deadline) throw new DeadlineError("request ran out of time");
    const j = (await post({ jsonrpc: "2.0", id: nextId++, method, params }, deadline)) as { result?: T; error?: { message: string } };
    if (j.error) throw new RpcError(`${method}: ${j.error.message}`);
    return j.result as T;
  });
}

const BATCH_MAX = 40; // larger batches get rate-limited (429) by the official node

/** Many calls in as few round trips as allowed; a failed call comes back as null instead of failing the batch. */
export async function batch(calls: [string, unknown[]][]): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < calls.length; i += BATCH_MAX) out.push(...(await batchOnce(calls.slice(i, i + BATCH_MAX))));
  return out;
}

function batchOnce(calls: [string, unknown[]][]): Promise<unknown[]> {
  if (calls.length === 0) return Promise.resolve([]);
  return slot(async () => {
    if (Date.now() > deadlineOf(Infinity)) throw new DeadlineError("request ran out of time");
    const base = nextId;
    nextId += calls.length;
    const j = (await post(calls.map(([method, params], i) => ({ jsonrpc: "2.0", id: base + i, method, params })))) as unknown;
    if (!Array.isArray(j)) throw new RpcError(`batch: ${JSON.stringify(j).slice(0, 80)}`);
    // a reverted call means "this contract has no such function" and comes back as null; any other error (rate limit,
    // node trouble) fails the batch, so it is never mistaken for "not a token"
    const byId = new Map<number, unknown>();
    for (const r of j as { id: number; result?: unknown; error?: { message?: string } }[]) {
      if (r.error && !/revert|execution|invalid opcode/i.test(r.error.message ?? "")) throw new RpcError(`batch call: ${r.error.message}`);
      byId.set(r.id, r.result ?? null);
    }
    return calls.map((_, i) => byId.get(base + i) ?? null);
  });
}

export const head = async () => Number(await rpc<string>("eth_blockNumber", []));

export async function blockTimestamp(n: number): Promise<number> {
  const b = await rpc<{ timestamp: string } | null>("eth_getBlockByNumber", ["0x" + n.toString(16), false]);
  if (!b) throw new RpcError(`block ${n} not found`);
  return Number(b.timestamp);
}

export interface LogFilter {
  address?: string;
  topics?: (string | string[] | null)[];
}

/** eth_getLogs over any range: split into allowed spans, and halved again when a span returns too many logs. */
export async function getLogs(filter: LogFilter, from: number, to: number, deadline = Infinity): Promise<Log[]> {
  const spans: [number, number][] = [];
  for (let a = from; a <= to; a += MAX_SPAN) spans.push([a, Math.min(a + MAX_SPAN - 1, to)]);
  const parts = await Promise.all(spans.map(([a, b]) => logsSpan(filter, a, b, deadline)));
  return parts.flat();
}

async function logsSpan(filter: LogFilter, from: number, to: number, deadline: number): Promise<Log[]> {
  if (Date.now() > deadline) throw new DeadlineError("log read ran out of time");
  try {
    const raw = await rpc<RawLog[]>("eth_getLogs", [{ ...filter, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }], deadline);
    return raw.map((l) => ({
      address: l.address.toLowerCase(),
      topics: l.topics,
      data: l.data,
      blockNumber: Number(l.blockNumber),
      transactionHash: l.transactionHash,
      logIndex: Number(l.logIndex),
    }));
  } catch (e) {
    // only "too many results / range too wide" is solved by splitting; an outage or a full queue is not
    const tooBig = e instanceof RpcError && /more than|too many|limit|range|size|exceed|timeout/i.test(e.message) && !/queue full|unreachable/.test(e.message);
    if (e instanceof DeadlineError || !tooBig || to - from < 2_000) throw e;
    const mid = from + Math.floor((to - from) / 2);
    const [a, b] = await Promise.all([logsSpan(filter, from, mid, deadline), logsSpan(filter, mid + 1, to, deadline)]);
    return a.concat(b);
  }
}

/** Walks back from `to` one span at a time; stops once `done` says the logs seen so far are enough, or at `floor`.
 *  Oldest first. */
export async function getLogsBackward(
  filter: LogFilter,
  to: number,
  done: (newestFirstSpans: Log[][]) => boolean,
  deadline = Infinity,
  floor = 0,
): Promise<Log[]> {
  const spans: Log[][] = [];
  for (let b = to; b >= floor; b -= MAX_SPAN) {
    spans.push(await logsSpan(filter, Math.max(floor, b - MAX_SPAN + 1), b, deadline));
    if (done(spans)) break;
  }
  return spans.reverse().flat();
}

export const topicAddress = (a: string) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
export const addressFromTopic = (t: string) => ("0x" + t.slice(-40)).toLowerCase();
