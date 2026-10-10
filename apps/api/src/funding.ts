// Who sent a wallet its first ETH. Plain ETH transfers leave no logs, so this needs an address-indexed source:
// the Etherscan API v2 (chain 4663). Without ETHERSCAN_API_KEY funding clusters are skipped.

const KEY = process.env.ETHERSCAN_API_KEY;
const BASE = "https://api.etherscan.io/v2/api?chainid=4663";
const MIN_GAP_MS = 350; // free tier: 3 calls per second

const funders = new Map<string, string | null>(); // wallet -> first funder
const MAX_FUNDERS = 20_000;
const MAX_QUEUED = 200;
// Etherscan's free tier has a daily cap; stop short of it so funding fails quietly instead of the key being blocked
const DAILY_BUDGET = Number(process.env.ETHERSCAN_DAILY_BUDGET ?? 80_000);
const budget = { day: "", used: 0 };
let last = 0;

/** Off without a key, and for the rest of the day once the budget is spent: reports then skip funding instead of waiting on it. */
export const fundingEnabled = () => Boolean(KEY) && !(budget.day === new Date().toISOString().slice(0, 10) && budget.used >= DAILY_BUDGET);

function spend(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  if (budget.day !== day) Object.assign(budget, { day, used: 0 });
  if (budget.used >= DAILY_BUDGET) return false;
  budget.used++;
  return true;
}


async function call(params: Record<string, string>): Promise<{ status: string; result: unknown }> {
  if (!spend()) throw new Error("daily Etherscan budget used");
  const wait = last + MIN_GAP_MS - Date.now();
  last = Math.max(Date.now(), last + MIN_GAP_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const q = new URLSearchParams({ ...params, apikey: KEY ?? "" });
  const r = await fetch(`${BASE}&${q}`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`etherscan http ${r.status}`);
  return (await r.json()) as { status: string; result: unknown };
}

interface Tx {
  from: string;
  value: string;
  timeStamp: string;
  isError?: string;
}

async function firstIncoming(wallet: string, action: "txlist" | "txlistinternal"): Promise<Tx | null> {
  const j = await call({ module: "account", action, address: wallet, sort: "asc", page: "1", offset: "20" });
  // an error ("Max rate limit reached", "Invalid API Key") comes back as a string: throw, so the wallet stays unknown
  // and is asked again later, instead of being remembered as "never funded"
  if (!Array.isArray(j.result)) throw new Error(`etherscan: ${String(j.result).slice(0, 60)}`);
  return (j.result as Tx[]).find((t) => t.isError !== "1" && t.from.toLowerCase() !== wallet && BigInt(t.value || "0") > 0n) ?? null;
}

async function lookup(wallet: string): Promise<string | null> {
  const [normal, internal] = [await firstIncoming(wallet, "txlist"), await firstIncoming(wallet, "txlistinternal")];
  const first = [normal, internal].filter((t): t is Tx => t != null).sort((a, b) => Number(a.timeStamp) - Number(b.timeStamp))[0];
  return first ? first.from.toLowerCase() : null;
}

/** undefined: not looked up yet; null: no incoming ETH found. */
export const cachedFunder = (wallet: string): string | null | undefined => funders.get(wallet);

const queued = new Set<string>();
let draining = false;

export function queueFunders(wallets: string[]) {
  if (!KEY) return;
  for (const w of wallets) if (!funders.has(w) && queued.size < MAX_QUEUED) queued.add(w);
  if (!draining) void drain();
}

async function drain() {
  draining = true;
  try {
    for (const w of queued) {
      queued.delete(w);
      try {
        funders.set(w, await lookup(w));
        if (funders.size > MAX_FUNDERS) funders.delete(funders.keys().next().value!);
      } catch {
        // left unknown: the next report queues it again
      }
    }
  } finally {
    draining = false;
    if (queued.size > 0) void drain();
  }
}
