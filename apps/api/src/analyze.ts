// Builds a TokenReport for any ERC-20 on Robinhood Chain straight from the chain.
// Pons launches get the full launch section (curve, dev buy, bundle, snipers, dev history); other tokens get holders,
// distribution clusters and pool market data.
import type { Address, Cluster, Flag, Holder, HolderLabel, PriorLaunch, TokenReport } from "@vialz/shared";
import { CHAIN_ID } from "@vialz/shared";
import { DeadlineError, batch, blockTimestamp, getLogs, getLogsBackward, head, rpc, topicAddress, addressFromTopic, type Log } from "./rpc.js";
import {
  CURVE_BUY, CURVE_SELL, DEAD, FACTORY, FOMO_ROUTER, HOOK, LOCKER, POOL_GRADUATED, POOL_MANAGER, ROUTER, TOKEN_LAUNCHED,
  TRANSFER, ZERO, callData, decodeLaunchAndBuy, decodeLaunched, decodeString, decodeTokenInfo, decodeUint, words,
} from "./pons.js";
import { dexPairs, quoteUsd, type DexPair } from "./market.js";
import { cachedFunder, fundingEnabled, queueFunders } from "./funding.js";

export class NotFound extends Error {}

const SNIPE_BLOCKS = 2; // launch block and the two after it
const PRIOR_SOLD_CHECKS = 8;
const DEV_SAMPLE = 60; // most recent launches whose phase is read
const HISTORY_BUDGET_MS = 15_000; // past this a token's transfer history is too large to read per request

interface Trade {
  side: "buy" | "sell";
  wallet: string;
  quote: number;
  tokens: number;
  block: number;
}

const call = (to: string, data: string): [string, unknown[]] => ["eth_call", [{ to, data }, "latest"]];

export async function analyzeToken(token: Address): Promise<TokenReport> {
  const started = Date.now();
  const [h, basics] = await Promise.all([
    head(),
    batch([
      call(token, callData.name()),
      call(token, callData.symbol()),
      call(token, callData.decimals()),
      call(token, callData.totalSupply()),
      call(FACTORY, callData.getLaunchedToken(token)),
      call(token, callData.getTokenInfo()),
    ]),
  ]);
  const [nameR, symbolR, decimalsR, supplyR, launchedR, infoR] = basics;
  const supplyRaw = decodeUint(supplyR);
  const decimalsRaw = decodeUint(decimalsR);
  if (supplyRaw == null || decimalsRaw == null) throw new NotFound("not an ERC-20 token on Robinhood Chain");
  const decimals = Number(decimalsRaw);
  const unit = 10 ** decimals;
  const supply = Number(supplyRaw) / unit;
  const record = decodeLaunched(launchedR);
  const info = decodeTokenInfo(infoR);

  // ---- the launch (Pons) and the token's whole transfer history -------------------------------------------------
  // The node keeps no historical state, so the creation block is found by walking the logs back from the head.
  let launchLog: Log | undefined;
  if (record) {
    const found = await getLogsBackward({ address: FACTORY, topics: [TOKEN_LAUNCHED, topicAddress(token)] }, h, (spans) => spans.some((x) => x.length > 0));
    launchLog = found[0];
  }
  const deadline = started + HISTORY_BUDGET_MS;
  let partial = false;
  const transfers = await (launchLog
    ? getLogs({ address: token, topics: [TRANSFER] }, launchLog.blockNumber, h, deadline)
    : getLogsBackward(
        { address: token, topics: [TRANSFER] },
        h,
        (spans) => {
          // stop at an empty span once a mint has been seen: the token did not exist before it
          const last = spans[spans.length - 1]!;
          const minted = spans.some((x) => x.some((l) => addressFromTopic(l.topics[1]!) === ZERO));
          return minted && last.length === 0;
        },
        deadline,
      )
  ).catch((e) => {
    if (!(e instanceof DeadlineError)) throw e;
    partial = true;
    return [] as Log[];
  });
  const createdBlock = launchLog?.blockNumber ?? transfers[0]?.blockNumber ?? null;

  const curve = launchLog ? addressFromTopic(launchLog.topics[2]!) : (record?.curve ?? null);
  const launchWords = launchLog ? words(launchLog.data) : [];
  const quoteAddr = launchWords[0] ? ("0x" + launchWords[0].toString(16).padStart(40, "0")).toLowerCase() : null;

  let creator: string | null = launchLog ? addressFromTopic(launchLog.topics[3]!) : null;
  const firstMint = transfers.find((l) => addressFromTopic(l.topics[1]!) === ZERO);
  const launchBlock = launchLog?.blockNumber ?? createdBlock;

  const [launchTx, mintTx, trades, gradLogs, devRaw, quoteMeta, tsCreated, tsHead, pairs, quotePrice, reserveRaw] = await Promise.all([
    launchLog ? rpc<{ input: string } | null>("eth_getTransactionByHash", [launchLog.transactionHash]) : null,
    !creator && firstMint ? rpc<{ from: string } | null>("eth_getTransactionByHash", [firstMint.transactionHash]) : null,
    curve && launchBlock != null && !partial ? readCurveTrades(curve, launchBlock, h, started + 2 * HISTORY_BUDGET_MS).catch(() => null) : Promise.resolve(null),
    launchLog ? getLogs({ address: FACTORY, topics: [POOL_GRADUATED, topicAddress(token)] }, launchLog.blockNumber, h) : [],
    launchLog && creator ? creatorLaunches(creator, h) : null,
    quoteAddr ? batch([call(quoteAddr, callData.symbol()), call(quoteAddr, callData.decimals())]) : null,
    createdBlock != null ? blockTimestamp(createdBlock) : null,
    blockTimestamp(h),
    dexPairs(token),
    launchLog ? quoteUsd(quoteAddr) : Promise.resolve(null),
    // what the curve actually holds: the reserve that graduation is measured against
    curve ? (quoteAddr ? rpc<string>("eth_call", [{ to: quoteAddr, data: "0x70a08231" + topicAddress(curve).slice(2) }, "latest"]) : rpc<string>("eth_getBalance", [curve, "latest"])) : null,
  ]);
  if (!creator && mintTx) creator = mintTx.from.toLowerCase();

  const tsOf = (b: number) =>
    tsCreated == null || createdBlock == null || h === createdBlock ? tsHead : tsCreated + ((b - createdBlock) * (tsHead - tsCreated)) / (h - createdBlock);

  const quoteDecimals = quoteMeta ? Number(decodeUint(quoteMeta[1]) ?? 18n) : 18;
  const quoteSymbol = quoteMeta ? decodeString(quoteMeta[0]) || "?" : "ETH";
  const launchCall = decodeLaunchAndBuy(launchTx?.input);
  const bundle = launchCall?.exempt.filter((a) => a !== creator) ?? [];
  const tradesQ = trades?.map((t) => ({ ...t, quote: t.quote / 10 ** quoteDecimals, tokens: t.tokens / 1e18 })) ?? [];

  // ---- holders -------------------------------------------------------------------------------------------------
  const balances = new Map<string, bigint>();
  for (const l of transfers) {
    const from = addressFromTopic(l.topics[1]!);
    const to = addressFromTopic(l.topics[2]!);
    const v = BigInt(l.data.slice(0, 66));
    if (from !== ZERO) balances.set(from, (balances.get(from) ?? 0n) - v);
    balances.set(to, (balances.get(to) ?? 0n) + v);
  }
  const pct = (raw: bigint) => (supplyRaw > 0n ? Number((raw * 1_000_000n) / supplyRaw) / 10_000 : 0);
  const balancePct = (a: string) => pct(balances.get(a) ?? 0n);

  const snipeWallets = new Set(
    tradesQ.filter((t) => t.side === "buy" && launchBlock != null && t.block <= launchBlock + SNIPE_BLOCKS && t.wallet !== creator).map((t) => t.wallet),
  );
  const pairAddresses = new Set(pairs.map((p) => p.pairAddress.toLowerCase()));
  const systemLabel = (a: string): HolderLabel | null => {
    if (a === curve) return "curve";
    if (a === POOL_MANAGER || a === HOOK || pairAddresses.has(a)) return "pool";
    if (a === DEAD || a === ZERO) return "burn";
    if (a === FACTORY || a === LOCKER || a === ROUTER || a === FOMO_ROUTER) return "launchpad";
    return null;
  };
  const labelsOf = (a: string): HolderLabel[] => {
    const out: HolderLabel[] = [];
    const s = systemLabel(a);
    if (s) out.push(s);
    if (a === creator) out.push("creator");
    if (bundle.includes(a)) out.push("bundle");
    if (snipeWallets.has(a)) out.push("sniper");
    return out;
  };

  const held = [...balances.entries()].filter(([a, v]) => v > 0n && a !== ZERO).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  const top: Holder[] = held.slice(0, 20).map(([a, v]) => ({ address: a as Address, pct: pct(v), labels: labelsOf(a) }));
  const wallets = held.filter(([a]) => systemLabel(a) == null);
  const top10Pct = wallets.slice(0, 10).reduce((s, [, v]) => s + pct(v), 0);

  // ---- clusters: one wallet handing the token out to several holders --------------------------------------------
  const clusters: Cluster[] = partial ? [] : await distributionClusters(transfers, balances, systemLabel, pct);
  let fundingStatus: TokenReport["fundingStatus"] = "off";
  if (fundingEnabled() && !partial) {
    const r = fundingClusters(wallets.slice(0, 25).map(([a]) => a), balances, pct);
    fundingStatus = r.status;
    clusters.push(...r.clusters);
  }
  clusters.sort((a, b) => b.pct - a.pct);

  // ---- market ---------------------------------------------------------------------------------------------------
  const reserve = reserveRaw ? Number(BigInt(reserveRaw.slice(0, 66))) / 10 ** quoteDecimals : 0;
  const graduatedBlock = gradLogs[0]?.blockNumber ?? null;
  const pair: DexPair | undefined = pairs[0];
  let market: TokenReport["market"] = null;
  const now = tsHead;
  if (pair && (graduatedBlock != null || !launchLog)) {
    market = {
      source: "dexscreener",
      priceUsd: num(pair.priceUsd),
      mcapUsd: pair.marketCap ?? pair.fdv ?? null,
      liquidityUsd: pair.liquidity?.usd ?? null,
      volumeUsd: { m5: pair.volume?.m5 ?? null, h1: pair.volume?.h1 ?? null, h24: pair.volume?.h24 ?? null },
      buys: pair.txns?.h24?.buys ?? null,
      sells: pair.txns?.h24?.sells ?? null,
      buyers: null,
      sellers: null,
      lastTradeAt: null,
    };
  } else if (tradesQ.length > 0) {
    const last = tradesQ[tradesQ.length - 1]!;
    const price = last.tokens > 0 ? last.quote / last.tokens : null;
    const usd = (q: number | null) => (q != null && quotePrice != null ? q * quotePrice : null);
    const vol = (secs: number) => usd(tradesQ.filter((t) => tsOf(t.block) >= now - secs).reduce((s, t) => s + t.quote, 0));
    market = {
      source: "curve",
      priceUsd: usd(price),
      mcapUsd: usd(price != null ? price * supply : null),
      liquidityUsd: graduatedBlock == null ? usd(reserve) : null,
      volumeUsd: { m5: vol(300), h1: vol(3600), h24: vol(86400) },
      buys: tradesQ.filter((t) => t.side === "buy").length,
      sells: tradesQ.filter((t) => t.side === "sell").length,
      buyers: new Set(tradesQ.filter((t) => t.side === "buy").map((t) => t.wallet)).size,
      sellers: new Set(tradesQ.filter((t) => t.side === "sell").map((t) => t.wallet)).size,
      lastTradeAt: Math.round(tsOf(last.block)),
    };
  }

  // ---- launch section -------------------------------------------------------------------------------------------
  const threshold = launchWords[2] != null ? Number(launchWords[2]) / 10 ** quoteDecimals : 0;
  const launch: TokenReport["launch"] =
    launchLog && curve
      ? {
          curve: curve as Address,
          quote: { address: quoteAddr as Address | null, symbol: quoteSymbol, decimals: quoteDecimals, usd: quotePrice },
          phase: record?.phase ?? "unknown",
          progressPct: graduatedBlock != null ? 100 : threshold > 0 ? Math.min(100, (reserve / threshold) * 100) : 0,
          threshold,
          graduatedBlock,
          creatorTaxBps: record?.creatorTaxBps ?? null,
          feeRecipient: (record?.feeRecipient as Address) ?? null,
          devBuy: launchCall ? Number(launchCall.devBuyWei) / 10 ** quoteDecimals : null,
          bundle: bundle as Address[],
        }
      : null;

  const snipers = launch
    ? {
        wallets: snipeWallets.size,
        boughtPct: (tradesQ.filter((t) => t.side === "buy" && snipeWallets.has(t.wallet)).reduce((s, t) => s + t.tokens, 0) / supply) * 100,
        holdPct: [...snipeWallets].reduce((s, a) => s + balancePct(a), 0),
      }
    : null;
  const bundleInfo = launch ? { wallets: bundle.length, holdPct: bundle.reduce((s, a) => s + balancePct(a), 0) } : null;

  // ---- volume quality -------------------------------------------------------------------------------------------
  let volume: TokenReport["volume"] = null;
  if (tradesQ.length > 0) {
    const byWallet = new Map<string, { vol: number; buys: number; sells: number }>();
    for (const t of tradesQ) {
      const w = byWallet.get(t.wallet) ?? { vol: 0, buys: 0, sells: 0 };
      w.vol += t.quote;
      if (t.side === "buy") w.buys++;
      else w.sells++;
      byWallet.set(t.wallet, w);
    }
    const total = tradesQ.reduce((s, t) => s + t.quote, 0);
    const top5 = [...byWallet.values()].sort((a, b) => b.vol - a.vol).slice(0, 5).reduce((s, w) => s + w.vol, 0);
    volume = {
      trades: tradesQ.length,
      top5SharePct: total > 0 ? (top5 / total) * 100 : 0,
      roundTripWallets: [...byWallet.values()].filter((w) => w.buys >= 2 && w.sells >= 2).length,
    };
  }

  // ---- the creator's other launches -----------------------------------------------------------------------------
  const dev = devRaw ? devSummary(devRaw, token, tsOf, tsHead) : null;
  const creatorSold = tradesQ.filter((t) => t.side === "sell" && t.wallet === creator).reduce((s, t) => s + t.quote, 0);

  const report: TokenReport = {
    address: token,
    chainId: CHAIN_ID,
    name: cleanText(decodeString(nameR), 48) || "Unknown",
    symbol: cleanText(decodeString(symbolR), 16) || "?",
    decimals,
    totalSupply: supply,
    launchpad: launchLog ? "pons" : null,
    createdBlock,
    createdAt: tsCreated,
    creator: creator as Address | null,
    description: cleanText(info?.description, 280) || null,
    links: { x: safeUrl(info?.x), telegram: safeUrl(info?.telegram), website: safeUrl(info?.website), image: ipfsCid(info?.image) },
    launch,
    market,
    holders: { count: held.length, top10Pct, top, creatorPct: creator ? balancePct(creator) : 0, partial },
    snipers,
    bundle: bundleInfo,
    clusters,
    fundingStatus,
    volume,
    dev,
    flags: [],
    head: h,
    generatedAt: Math.floor(Date.now() / 1000),
    tookMs: 0,
  };
  report.flags = flagsFor(report, creatorSold, tsHead);
  report.tookMs = Date.now() - started;
  return report;
}

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function readCurveTrades(curve: string, from: number, to: number, deadline: number): Promise<Trade[]> {
  const logs = await getLogs({ address: curve, topics: [[CURVE_BUY, CURVE_SELL]] }, from, to, deadline);
  return logs.map((l) => {
    const w = words(l.data);
    return l.topics[0] === CURVE_BUY
      ? { side: "buy" as const, wallet: addressFromTopic(l.topics[2]!), quote: Number(w[0] ?? 0n), tokens: Number(w[1] ?? 0n), block: l.blockNumber }
      : { side: "sell" as const, wallet: addressFromTopic(l.topics[1]!), quote: Number(w[1] ?? 0n), tokens: Number(w[0] ?? 0n), block: l.blockNumber };
  });
}

/** Senders that passed the token straight to three or more wallets that still hold it. Contracts (routers, pools) are skipped. */
async function distributionClusters(
  transfers: Log[],
  balances: Map<string, bigint>,
  systemLabel: (a: string) => HolderLabel | null,
  pct: (raw: bigint) => number,
): Promise<Cluster[]> {
  const out = new Map<string, Set<string>>();
  for (const l of transfers) {
    const from = addressFromTopic(l.topics[1]!);
    const to = addressFromTopic(l.topics[2]!);
    if (from === ZERO || from === to || systemLabel(from) || systemLabel(to)) continue;
    if ((balances.get(to) ?? 0n) <= 0n) continue;
    const set = out.get(from) ?? new Set<string>();
    set.add(to);
    out.set(from, set);
  }
  const candidates = [...out.entries()].filter(([, s]) => s.size >= 3);
  if (candidates.length === 0) return [];
  const codes = await batch(candidates.map(([a]) => ["eth_getCode", [a, "latest"]] as [string, unknown[]]));
  const clusters: Cluster[] = [];
  candidates.forEach(([source, members], i) => {
    if (typeof codes[i] === "string" && codes[i] !== "0x") return; // a contract: router, aggregator or pool
    const raw = [...members, source].reduce((s, a) => s + (balances.get(a) ?? 0n), 0n);
    const p = pct(raw);
    if (p >= 0.5) clusters.push({ kind: "distribution", source: source as Address, wallets: members.size, pct: p, members: [...members] as Address[] });
  });
  return clusters;
}

/** Top holders grouped by the wallet that sent them their first ETH. The API is rate-limited, so unknown wallets are
 *  queued in the background and the report says "pending" until they are all known. */
function fundingClusters(holders: string[], balances: Map<string, bigint>, pct: (raw: bigint) => number): { status: "pending" | "done"; clusters: Cluster[] } {
  const known = holders.map((a) => [a, cachedFunder(a)] as const);
  const missing = known.filter(([, f]) => f === undefined).map(([a]) => a);
  if (missing.length > 0) {
    queueFunders(missing);
    return { status: "pending", clusters: [] };
  }
  const groups = new Map<string, string[]>();
  for (const [a, f] of known) if (f) groups.set(f, [...(groups.get(f) ?? []), a]);
  const clusters: Cluster[] = [];
  for (const [source, members] of groups) {
    if (members.length < 3) continue;
    const raw = members.reduce((s, a) => s + (balances.get(a) ?? 0n), 0n);
    clusters.push({ kind: "funding", source: source as Address, wallets: members.length, pct: pct(raw), members: members as Address[] });
  }
  return { status: "done", clusters };
}

interface CreatorLaunch {
  token: string;
  curve: string;
  block: number;
  phase: PriorLaunch["phase"];
  symbol: string;
  creatorSold: boolean | null;
}

const creatorCache = new Map<string, { at: number; value: Promise<CreatorLaunches> }>();
const CREATOR_TTL_MS = 5 * 60_000;
type CreatorLaunches = CreatorLaunch[];

/** Every Pons launch by a creator, newest first, with phases and, for the latest few, whether the creator sold. Cached per creator. */
function creatorLaunches(creator: string, h: number): Promise<CreatorLaunches> {
  const hit = creatorCache.get(creator);
  if (hit && Date.now() - hit.at < CREATOR_TTL_MS) return hit.value;
  const value = loadCreatorLaunches(creator, h);
  creatorCache.set(creator, { at: Date.now(), value });
  value.catch(() => creatorCache.delete(creator));
  if (creatorCache.size > 5_000) creatorCache.delete(creatorCache.keys().next().value!);
  return value;
}

async function loadCreatorLaunches(creator: string, h: number): Promise<CreatorLaunches> {
  const logs = await getLogs({ address: FACTORY, topics: [TOKEN_LAUNCHED, null, null, topicAddress(creator)] }, 0, h);
  const launches = logs
    .map((l) => ({ token: addressFromTopic(l.topics[1]!), curve: addressFromTopic(l.topics[2]!), block: l.blockNumber }))
    .sort((a, b) => b.block - a.block);
  const sample = launches.slice(0, DEV_SAMPLE);
  const res = await batch(sample.flatMap((l) => [call(FACTORY, callData.getLaunchedToken(l.token)), call(l.token, callData.symbol())]));
  // a creator who dumps does it in the first day; reading one day per launch keeps the scan small
  const checks = sample.slice(0, PRIOR_SOLD_CHECKS + 1);
  const sold = await Promise.all(
    checks.map(async (l) => (await getLogs({ address: l.curve, topics: [CURVE_SELL, topicAddress(creator)] }, l.block, Math.min(h, l.block + 900_000))).length > 0),
  );
  return launches.map((l, i) => ({
    ...l,
    phase: i < sample.length ? (decodeLaunched(res[2 * i])?.phase ?? "unknown") : "unknown",
    symbol: i < sample.length ? cleanText(decodeString(res[2 * i + 1]), 16) || "?" : "?",
    creatorSold: i < checks.length ? sold[i]! : null,
  }));
}

function devSummary(all: CreatorLaunches, token: string, tsOf: (b: number) => number, tsHead: number): NonNullable<TokenReport["dev"]> {
  const prior = all.filter((l) => l.token !== token);
  const checked = prior.filter((l) => l.creatorSold != null).slice(0, PRIOR_SOLD_CHECKS);
  return {
    launches: all.length,
    graduated: all.filter((l) => l.phase === "pool").length,
    sold: checked.filter((l) => l.creatorSold).length,
    checked: checked.length,
    recent: prior.slice(0, 10).map((l) => ({
      token: l.token as Address,
      symbol: l.symbol,
      block: l.block,
      ts: Math.round(Math.min(tsOf(l.block), tsHead)),
      phase: l.phase,
      creatorSold: l.creatorSold,
    })),
  };
}

// ---- strings from the chain are written by whoever launched the token: bound them and keep only what is safe -------

// control characters, bidi overrides and zero-width characters can make one name look like another
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const cleanText = (v: string | null | undefined, max: number) => (v ? v.replace(INVISIBLE, "").trim().slice(0, max) : "");

/** A link is kept only when it parses as http(s); X handles become profile links. */
function safeUrl(v: string | null | undefined): string | null {
  if (!v) return null;
  let raw = cleanText(v, 300);
  if (/^@[A-Za-z0-9_]{1,15}$/.test(raw)) raw = `https://x.com/${raw.slice(1)}`;
  else if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const u = new URL(raw);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Images are only ever served through the API's IPFS proxy, so only a content id is kept. */
function ipfsCid(v: string | null | undefined): string | null {
  const cid = cleanText(v, 300).replace(/^ipfs:\/\//, "").replace(/^https?:\/\/[^/]+\/ipfs\//, "").split(/[/?#]/)[0] ?? "";
  return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,100})$/.test(cid) ? cid : null;
}

const fmt = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));

/** Facts, not verdicts: each line says what the chain shows. */
function flagsFor(r: TokenReport, creatorSold: number, now: number): Flag[] {
  const f: Flag[] = [];
  const quote = r.launch?.quote.symbol ?? "ETH";
  const biggest = r.clusters[0];
  if (biggest && biggest.pct >= 10)
    f.push({ level: "danger", text: `${biggest.wallets + 1} linked wallets hold ${fmt(biggest.pct)}% of supply` });
  else if (biggest && biggest.pct >= 3)
    f.push({ level: "warn", text: `${biggest.wallets + 1} linked wallets hold ${fmt(biggest.pct)}% of supply` });

  if (r.snipers) {
    const s = r.snipers;
    const level = s.wallets === 0 ? "good" : s.holdPct >= 10 ? "danger" : s.holdPct >= 3 ? "warn" : "info";
    f.push({
      level,
      text: s.wallets === 0 ? "No snipers in the first blocks" : `${s.wallets} snipers took ${fmt(s.boughtPct)}% at launch, ${s.holdPct >= 0.05 ? `still hold ${fmt(s.holdPct)}%` : "all sold"}`,
    });
  }
  if (r.bundle) {
    const b = r.bundle;
    const level = b.wallets === 0 ? "good" : b.holdPct >= 5 ? "danger" : b.holdPct >= 1 ? "warn" : "info";
    f.push({
      level,
      text: b.wallets === 0 ? "No declared bundle" : `Bundle of ${b.wallets} wallets at launch, ${b.holdPct >= 0.05 ? `holds ${fmt(b.holdPct)}%` : "all sold"}`,
    });
  }
  if (r.launch) {
    if (!r.launch.devBuy) f.push({ level: "good", text: "No dev buy at launch" });
    else f.push({ level: "info", text: `Dev bought ${r.launch.devBuy.toFixed(3)} ${quote} at launch` });
    if (r.launch.creatorTaxBps) f.push({ level: r.launch.creatorTaxBps >= 500 ? "warn" : "info", text: `Creator tax ${(r.launch.creatorTaxBps / 100).toFixed(1)}%` });
    if (r.launch.graduatedBlock != null) f.push({ level: "good", text: "Graduated to Uniswap" });
  }
  if (creatorSold > 0) f.push({ level: "warn", text: `Creator sold ${creatorSold.toFixed(3)} ${quote} worth` });
  if (r.holders.partial) f.push({ level: "info", text: "Too many transfers to read holders in one pass" });
  if (r.holders.creatorPct >= 5) f.push({ level: "warn", text: `Creator holds ${fmt(r.holders.creatorPct)}%` });
  if (r.holders.top10Pct >= 50) f.push({ level: "danger", text: `Top 10 wallets hold ${fmt(r.holders.top10Pct)}%` });
  else if (r.holders.top10Pct >= 30) f.push({ level: "warn", text: `Top 10 wallets hold ${fmt(r.holders.top10Pct)}%` });

  if (r.dev) {
    if (r.dev.checked >= 3 && r.dev.sold / r.dev.checked >= 0.5)
      f.push({ level: "danger", text: `Creator sold in ${r.dev.sold} of their last ${r.dev.checked} launches` });
    if (r.dev.launches >= 50) f.push({ level: "danger", text: `Creator has launched ${r.dev.launches} tokens: a launch farm` });
    else if (r.dev.launches >= 10) f.push({ level: "warn", text: `Creator has launched ${r.dev.launches} tokens` });
    else if (r.dev.launches === 1) f.push({ level: "info", text: "First launch from this wallet" });
  }
  if (r.volume && r.volume.trades >= 30 && r.volume.top5SharePct >= 60)
    f.push({ level: "warn", text: `5 wallets made ${fmt(r.volume.top5SharePct)}% of volume` });
  if (r.volume && r.volume.roundTripWallets >= 5)
    f.push({ level: "warn", text: `${r.volume.roundTripWallets} wallets keep buying and selling` });
  if (r.createdAt != null && now - r.createdAt < 3600) f.push({ level: "info", text: `Launched ${Math.max(1, Math.floor((now - r.createdAt) / 60))}m ago` });
  if (!r.links.x && !r.links.website && !r.links.telegram) f.push({ level: "info", text: "No socials set" });

  const order = { danger: 0, warn: 1, info: 2, good: 3 } as const;
  return f.sort((a, b) => order[a.level] - order[b.level]);
}
