// Builds a TokenReport for any ERC-20 on Robinhood Chain straight from the chain.
// Pons launches get the full launch section (curve, dev buy, bundle, snipers, dev history); other tokens get holders,
// distribution clusters and pool market data.
import type { Address, Cluster, Flag, Holder, HolderLabel, PriorLaunch, TokenQuick, TokenReport } from "@vialz/shared";
import { CHAIN_ID } from "@vialz/shared";
import {
  DeadlineError, batch, blockTimestamp, detached, getLogs, getLogsBackward, getLogsKept, inBackground, knownBlockTime, noteBlockTime, noteHead, rpc, rpcStats,
  topicAddress, addressFromTopic, type Log,
} from "./rpc.js";
import {
  CURVE_BUY, CURVE_SELL, DEAD, FACTORY, FACTORY_START, FOMO_ROUTER, HOOK, LOCKER, POOL_GRADUATED, POOL_MANAGER, ROUTER, TOKEN_LAUNCHED,
  TRANSFER, ZERO, callData, decodeLaunchAndBuy, decodeLaunched, decodeString, decodeTokenInfo, decodeUint, words,
} from "./pons.js";
import { dexPairs, quoteUsd, type DexPair } from "./market.js";
import { cachedFunder, fundingEnabled, queueFunders } from "./funding.js";
import { indexedCreatorTransfers, indexedHolders, indexedInfo, indexerEnabled } from "./blockscout.js";

// A busy token has too many transfers to read inside a report. It is told apart before the read (its holder count in
// Blockscout's index) or by the read timing out, and then remembered, so it never pays for the doomed read again.
const HEAVY_HOLDERS = Number(process.env.HEAVY_HOLDERS ?? 4_000);
const HEAVY_MS = 6 * 3_600_000;
const heavyUntil = new Map<string, number>();

export class NotFound extends Error {}

// Snipers are the buys of the first seconds after launch, by anyone but the creator and the declared bundle. Robinhood
// Chain makes a block about every 0.1 s, so the window is set in seconds and turned into blocks from the chain's own pace.
const SNIPE_SECONDS = 3;
const SNIPE_SCAN_BLOCKS = 150; // what is read for the launch window when the full trade history is not; covers 3 s at any pace seen
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

// ---- the facts every read starts from, read in two round trips and shared --------------------------------------------
// The quick card and the full report both need these; asked for at the same moment they share one read. What never
// changes (the launch log, the launch transaction, the launch block's time) is kept for good.

interface Facts {
  h: number;
  name: string;
  symbol: string;
  decimals: number;
  supplyRaw: bigint;
  supply: number;
  record: ReturnType<typeof decodeLaunched>;
  info: ReturnType<typeof decodeTokenInfo>;
  launchLog: Log | undefined;
  curve: string | null;
  launchWords: bigint[];
  quoteAddr: string | null;
  quoteDecimals: number;
  quoteSymbol: string;
  reserveRaw: string | null;
  launchInput: string | null;
  tsHead: number;
  tsLaunch: number | null;
}

const launchLogs = new Map<string, Log | null>(); // token -> its TOKEN_LAUNCHED log (null: not a Pons launch)
const launchInputs = new Map<string, string | null>(); // launch tx hash -> its calldata
const quoteMetas = new Map<string, [string, number]>(); // quote token -> [symbol, decimals]
const factsMemo = new Map<string, { at: number; value: Promise<Facts> }>();
const FACTS_TTL_MS = 4_000;

const bound = <K, V>(m: Map<K, V>, max: number) => {
  if (m.size > max) m.delete(m.keys().next().value!);
};

function factsOf(token: Address): Promise<Facts> {
  const hit = factsMemo.get(token);
  if (hit && Date.now() - hit.at < FACTS_TTL_MS) return hit.value;
  const value = detached(() => readFacts(token));
  const entry = { at: Date.now(), value };
  factsMemo.set(token, entry);
  value.catch(() => {
    if (factsMemo.get(token) === entry) factsMemo.delete(token);
  });
  bound(factsMemo, 2_000);
  return value;
}

async function readFacts(token: Address): Promise<Facts> {
  // round trip 1: the head and the token's own calls
  const first = await batch([
    ["eth_blockNumber", []],
    call(token, callData.name()),
    call(token, callData.symbol()),
    call(token, callData.decimals()),
    call(token, callData.totalSupply()),
    call(FACTORY, callData.getLaunchedToken(token)),
    call(token, callData.getTokenInfo()),
  ]);
  const h = Number(first[0]);
  noteHead(h);
  const supplyRaw = decodeUint(first[4]);
  const decimalsRaw = decodeUint(first[3]);
  if (supplyRaw == null || decimalsRaw == null) throw new NotFound("This address isn't a token on Robinhood Chain. Check that you copied the contract address.");
  const decimals = Number(decimalsRaw);
  const record = decodeLaunched(first[5]);
  const info = decodeTokenInfo(first[6]);

  // the launch log: found once by walking back from the head, then kept
  let launchLog: Log | undefined;
  if (record) {
    const known = launchLogs.get(token);
    if (known !== undefined) launchLog = known ?? undefined;
    else {
      const found = await getLogsBackward(
        { address: FACTORY, topics: [TOKEN_LAUNCHED, topicAddress(token)] },
        h,
        (spans) => spans.some((x) => x.length > 0),
        Infinity,
        FACTORY_START,
      );
      launchLog = found[0];
      // only a found log is kept: a just-launched token's log can lag the factory call by a moment
      if (launchLog) {
        launchLogs.set(token, launchLog);
        bound(launchLogs, 50_000);
      }
    }
  }
  const curve = launchLog ? addressFromTopic(launchLog.topics[2]!) : (record?.curve ?? null);
  const launchWords = launchLog ? words(launchLog.data) : [];
  const quoteAddr = launchWords[0] ? ("0x" + launchWords[0].toString(16).padStart(40, "0")).toLowerCase() : null;

  // round trip 2: everything else small, in one batch; what is already known is not asked again
  const asks: [string, [string, unknown[]]][] = [["headBlock", ["eth_getBlockByNumber", ["0x" + h.toString(16), false]]]];
  const launchBlock = launchLog?.blockNumber;
  if (launchBlock != null && knownBlockTime(launchBlock) == null) asks.push(["launchBlock", ["eth_getBlockByNumber", ["0x" + launchBlock.toString(16), false]]]);
  if (launchLog && !launchInputs.has(launchLog.transactionHash)) asks.push(["launchTx", ["eth_getTransactionByHash", [launchLog.transactionHash]]]);
  if (quoteAddr && !quoteMetas.has(quoteAddr)) asks.push(["quoteSymbol", call(quoteAddr, callData.symbol())], ["quoteDecimals", call(quoteAddr, callData.decimals())]);
  // what the curve actually holds: the reserve that graduation is measured against
  if (curve)
    asks.push([
      "reserve",
      quoteAddr ? ["eth_call", [{ to: quoteAddr, data: "0x70a08231" + topicAddress(curve).slice(2) }, "latest"]] : ["eth_getBalance", [curve, "latest"]],
    ]);
  const got = await batch(asks.map(([, c]) => c));
  const res = (name: string) => got[asks.findIndex(([n]) => n === name)] ?? null;

  const headBlock = res("headBlock") as { timestamp?: string } | null;
  const tsHead = headBlock?.timestamp ? Number(headBlock.timestamp) : Math.floor(Date.now() / 1000);
  noteBlockTime(h, tsHead);
  const lb = res("launchBlock") as { timestamp?: string } | null;
  if (launchBlock != null && lb?.timestamp) noteBlockTime(launchBlock, Number(lb.timestamp));
  const tx = res("launchTx") as { input?: string } | null;
  if (launchLog && tx) {
    launchInputs.set(launchLog.transactionHash, tx.input ?? null);
    bound(launchInputs, 50_000);
  }
  if (quoteAddr && !quoteMetas.has(quoteAddr) && res("quoteDecimals") != null)
    quoteMetas.set(quoteAddr, [decodeString(res("quoteSymbol")) || "?", Number(decodeUint(res("quoteDecimals")) ?? 18n)]);
  const quote = quoteAddr ? quoteMetas.get(quoteAddr) : undefined;

  return {
    h,
    name: cleanText(decodeString(first[1]), 48) || "Unknown",
    symbol: cleanText(decodeString(first[2]), 16) || "?",
    decimals,
    supplyRaw,
    supply: Number(supplyRaw) / 10 ** decimals,
    record,
    info,
    launchLog,
    curve,
    launchWords,
    quoteAddr,
    quoteDecimals: quote?.[1] ?? 18,
    quoteSymbol: quote?.[0] ?? "ETH",
    reserveRaw: (res("reserve") as string | null) ?? null,
    launchInput: launchLog ? (launchInputs.get(launchLog.transactionHash) ?? null) : null,
    tsHead,
    tsLaunch: launchBlock != null ? (knownBlockTime(launchBlock) ?? null) : null,
  };
}

const reserveOf = (f: Facts) => (f.reserveRaw && f.reserveRaw.length > 2 ? Number(BigInt(f.reserveRaw.slice(0, 66))) / 10 ** f.quoteDecimals : 0);
const thresholdOf = (f: Facts) => (f.launchWords[2] != null ? Number(f.launchWords[2]) / 10 ** f.quoteDecimals : 0);

/** The first look at a token, in about two round trips: name, links, age, curve progress and what the pool or curve
 *  holds. The full report follows; this is what the page shows while it is read. */
const notTokens = new Map<string, number>(); // address -> when it turned out not to be a token

/** True when a quick look at this address is answered from memory. */
export const quickCached = (token: string) => {
  const hit = factsMemo.get(token);
  const miss = notTokens.get(token);
  return (hit != null && Date.now() - hit.at < FACTS_TTL_MS) || (miss != null && Date.now() - miss < 60_000);
};

export async function quickToken(token: Address): Promise<TokenQuick> {
  const miss = notTokens.get(token);
  if (miss != null && Date.now() - miss < 60_000) throw new NotFound("This address isn't a token on Robinhood Chain. Check that you copied the contract address.");
  const facts = factsOf(token).catch((e) => {
    if (e instanceof NotFound) {
      notTokens.set(token, Date.now());
      bound(notTokens, 20_000);
    }
    throw e;
  });
  return quickFrom(token, await facts);
}

async function quickFrom(token: Address, f: Facts): Promise<TokenQuick> {
  const [pairs, quotePrice] = await Promise.all([dexPairs(token).catch(() => [] as DexPair[]), f.launchLog ? quoteUsd(f.quoteAddr).catch(() => null) : null]);
  const pair = pairs[0];
  const graduated = f.record?.phase === "pool" || f.record?.phase === "swept";
  const reserve = reserveOf(f);
  const threshold = thresholdOf(f);
  const fromPool = pair && (graduated || !f.launchLog);
  return {
    address: token,
    name: f.name,
    symbol: f.symbol,
    links: { x: safeUrl(f.info?.x), telegram: safeUrl(f.info?.telegram), website: safeUrl(f.info?.website), image: ipfsCid(f.info?.image) },
    createdAt: f.tsLaunch,
    launch: f.launchLog
      ? { progressPct: graduated ? 100 : threshold > 0 ? Math.min(100, (reserve / threshold) * 100) : 0, graduated, quoteSymbol: f.quoteSymbol }
      : null,
    market: fromPool
      ? { source: "dexscreener", mcapUsd: pair.marketCap ?? pair.fdv ?? null, liquidityUsd: pair.liquidity?.usd ?? null }
      : f.launchLog
        ? { source: "curve", mcapUsd: null, liquidityUsd: quotePrice != null ? reserve * quotePrice : null }
        : null,
  };
}

export async function analyzeToken(token: Address): Promise<TokenReport> {
  // DexScreener needs nothing from the chain: ask it while the chain is read
  const pairsP = dexPairs(token);
  const started = Date.now();
  // one log line per read with the time each phase took, to see where a slow read spends it
  const phases: [string, number][] = [];
  const lap = (name: string) => phases.push([name, Date.now() - started]);
  const tag = <T,>(name: string, p: Promise<T>): Promise<T> => p.finally(() => lap(name));
  const limitedBefore = rpcStats.limited;

  const f = await factsOf(token);
  lap("facts");
  const { h, supplyRaw, decimals, supply, record, info, launchLog, curve, launchWords, quoteAddr, quoteDecimals, quoteSymbol, tsHead } = f;
  const unit = 10 ** decimals;
  const deadline = started + HISTORY_BUDGET_MS;
  let creator: string | null = launchLog ? addressFromTopic(launchLog.topics[3]!) : null;

  // Everything that needs only the launch starts now and runs while the transfer history is read: the curve trades,
  // graduation, prices. Secondary reads fail soft: the report goes out without that part.
  const graduated = record?.phase === "pool" || record?.phase === "swept";
  const heavyP: Promise<boolean> =
    (heavyUntil.get(token) ?? 0) > Date.now()
      ? Promise.resolve(true)
      : indexerEnabled() && (graduated || !launchLog)
        ? tag("holder count", indexedInfo(token)).then((i) => i.count >= HEAVY_HOLDERS).catch(() => false)
        : Promise.resolve(false);
  const gradP: Promise<Log[]> = launchLog
    ? tag("graduation", getLogsKept(`grad:${token}`, { address: FACTORY, topics: [POOL_GRADUATED, topicAddress(token)] }, launchLog.blockNumber, h).catch(() => [] as Log[]))
    : Promise.resolve([]);
  const early = Promise.all([
    // a graduated token has no curve trades after its graduation block: the read stops there
    curve && launchLog
      ? tag(
          "curve trades",
          // a busy token needs only the launch blocks, for the snipers
          heavyP
            .then((heavy) =>
              heavy
                ? readCurveTrades(curve, launchLog.blockNumber, launchLog.blockNumber + SNIPE_SCAN_BLOCKS, started + 2 * HISTORY_BUDGET_MS, false)
                : gradP.then((g) => readCurveTrades(curve, launchLog.blockNumber, Math.min(h, g[0]?.blockNumber ?? h), started + 2 * HISTORY_BUDGET_MS)),
            )
            .catch(() => null),
        )
      : Promise.resolve(null),
    gradP,
    tag("dexscreener", pairsP),
    launchLog ? tag("eth price", quoteUsd(quoteAddr)) : Promise.resolve(null),
  ]);
  void early.catch(() => {}); // awaited below; this only keeps an early failure from going unhandled meanwhile
  // A creator's whole record can take seconds to read. It gets a short wait after the rest of the report is ready; if it
  // is not in by then the report goes out marked pending and a later read picks it up from the cache.
  // It starts once the heavy reads below are done (or right away when it is cached), so it does not spend the node's
  // limit while the report itself is being read.
  let startDev: () => void = () => {};
  const devGate = new Promise<void>((r) => (startDev = r));
  const devP: Promise<CreatorLaunches | null> | null =
    launchLog && creator
      ? (creatorCached(creator, token) ? Promise.resolve() : devGate)
          .then(() => inBackground(() => creatorLaunches(creator!, h, { token, curve: curve!, block: launchLog!.blockNumber, phase: record?.phase ?? "unknown" })))
          .catch(() => null)
      : null;

  let partial = false;
  const heavy = await heavyP;
  const transfers = await (heavy
    ? Promise.reject(new DeadlineError("busy token: read through the index"))
    : launchLog
    ? getLogsKept(`transfers:${token}`, { address: token, topics: [TRANSFER] }, launchLog.blockNumber, h, deadline)
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
    heavyUntil.set(token, Date.now() + HEAVY_MS);
    if (heavyUntil.size > 5_000) heavyUntil.delete(heavyUntil.keys().next().value!);
    return [] as Log[];
  });
  lap(`transfers (${transfers.length})`);
  const createdBlock = launchLog?.blockNumber ?? transfers[0]?.blockNumber ?? null;
  const firstMint = transfers.find((l) => addressFromTopic(l.topics[1]!) === ZERO);
  const launchBlock = launchLog?.blockNumber ?? createdBlock;

  void early.then(startDev, startDev);
  const [[tradesRead, gradLogs, pairs, quotePrice], mintTx, tsCreated] = await Promise.all([
    early,
    !creator && firstMint ? rpc<{ from: string } | null>("eth_getTransactionByHash", [firstMint.transactionHash]) : null,
    f.tsLaunch != null ? f.tsLaunch : createdBlock != null ? tag("created at", blockTimestamp(createdBlock).catch(() => null)) : null,
  ]);
  // a partial history has no reliable trade picture either
  const trades = partial ? null : tradesRead;
  // A token too big to read here: its biggest balances and the creator's transfers come from Blockscout's index, the
  // snipers from the launch blocks alone, and the balances that matter from the token itself.
  const idx = partial && indexerEnabled() ? await tag("indexer", indexedHolders(token)).catch(() => null) : null;
  const launchTrades =
    idx && curve && launchLog
      ? (tradesRead ?? (await readCurveTrades(curve, launchLog.blockNumber, launchLog.blockNumber + SNIPE_SCAN_BLOCKS, deadline + 15_000, false).catch(() => null)))
      : null;
  const PENDING = Symbol("pending");
  const devRead = devP ? await Promise.race([devP, new Promise<typeof PENDING>((r) => setTimeout(() => r(PENDING), CREATOR_WAIT_MS))]) : null;
  const devRaw = devRead === PENDING ? null : devRead;
  const devStatus: TokenReport["devStatus"] = !devP ? "off" : devRead === PENDING ? "pending" : "done";
  lap("trades, creator, market");
  if (!creator && mintTx) creator = mintTx.from.toLowerCase();

  const tsOf = (b: number) =>
    tsCreated == null || createdBlock == null || h === createdBlock ? tsHead : tsCreated + ((b - createdBlock) * (tsHead - tsCreated)) / (h - createdBlock);
  // the sniper window in blocks, from the chain's average pace since launch (about 30 blocks at 0.1 s a block)
  const snipeBlocks =
    tsCreated != null && createdBlock != null && tsHead > tsCreated + 10
      ? Math.min(SNIPE_SCAN_BLOCKS, Math.max(2, Math.round((SNIPE_SECONDS * (h - createdBlock)) / (tsHead - tsCreated))))
      : 30;

  const launchCall = decodeLaunchAndBuy(f.launchInput ?? undefined);
  const bundle = launchCall?.exempt.filter((a) => a !== creator) ?? [];
  const tradesQ = trades?.map((t) => ({ ...t, quote: t.quote / 10 ** quoteDecimals, tokens: t.tokens / unit })) ?? [];
  // the trades the sniper reading uses: all of them, or only the launch blocks of a token read through the index
  const snipeSource = trades ?? launchTrades;
  const snipeQ = snipeSource?.map((t) => ({ ...t, quote: t.quote / 10 ** quoteDecimals, tokens: t.tokens / unit })) ?? [];

  // ---- holders -------------------------------------------------------------------------------------------------
  const balances = new Map<string, bigint>();
  for (const l of transfers) {
    const from = addressFromTopic(l.topics[1]!);
    const to = addressFromTopic(l.topics[2]!);
    if (l.data.length < 66) continue; // no amount in data: not an ERC-20 transfer
    const v = BigInt(l.data.slice(0, 66));
    if (from !== ZERO) balances.set(from, (balances.get(from) ?? 0n) - v);
    balances.set(to, (balances.get(to) ?? 0n) + v);
  }
  for (const t of idx?.top ?? []) balances.set(t.address, t.value);
  const pct = (raw: bigint) => (supplyRaw > 0n ? Number((raw * 1_000_000n) / supplyRaw) / 10_000 : 0);
  const balancePct = (a: string) => pct(balances.get(a) ?? 0n);

  const snipeWallets = new Set(
    snipeQ
      .filter((t) => t.side === "buy" && launchBlock != null && t.block <= launchBlock + snipeBlocks && t.wallet !== creator && !bundle.includes(t.wallet))
      .map((t) => t.wallet),
  );
  // the index lists only the biggest balances: the snipers', the bundle's and the creator's are read from the token
  let exact = !idx;
  if (idx) {
    const want = [...new Set([...snipeWallets, ...bundle, ...(creator ? [creator] : [])])].filter((a) => !balances.has(a)).slice(0, 80);
    const res = want.length
      ? await batch(want.map((a) => ["eth_call", [{ to: token, data: "0x70a08231" + topicAddress(a).slice(2) }, "latest"]] as [string, unknown[]])).catch(() => null)
      : [];
    if (res) {
      want.forEach((a, i) => {
        const v = res[i];
        if (typeof v === "string" && v.startsWith("0x") && v.length > 2) balances.set(a, BigInt(v));
      });
      exact = want.every((a) => balances.has(a));
    }
  }
  const pairAddresses = new Set(pairs.map((p) => p.pairAddress.toLowerCase()));
  const systemLabel = (a: string): HolderLabel | null => {
    if (a === curve) return "curve";
    if (a === POOL_MANAGER || a === HOOK || pairAddresses.has(a)) return "pool";
    if (a === DEAD || a === ZERO) return "burn";
    if (a === FACTORY || a === LOCKER || a === ROUTER || a === FOMO_ROUTER) return "launchpad";
    return null;
  };
  // The biggest holders that are contracts (another launchpad's factory, a pool we do not know, a vault) are not
  // wallets: one getCode batch over the top holders tells them apart. An EIP-7702 delegation (code 0xef0100…) is a
  // wallet with a delegate, so it stays a wallet.
  const ranked = [...balances.entries()].filter(([a, v]) => v > 0n && a !== ZERO && systemLabel(a) == null).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  const probe = ranked.slice(0, 15).map(([a]) => a);
  const codes = probe.length ? await batch(probe.map((a) => ["eth_getCode", [a, "latest"]] as [string, unknown[]])).catch(() => [] as unknown[]) : [];
  const contracts = new Set(probe.filter((_, i) => typeof codes[i] === "string" && codes[i] !== "0x" && !(codes[i] as string).startsWith("0xef0100")));
  for (const t of idx?.top ?? []) if (t.contract) contracts.add(t.address);
  const holderLabel = (a: string): HolderLabel | null => systemLabel(a) ?? (contracts.has(a) ? "contract" : null);

  const labelsOf = (a: string): HolderLabel[] => {
    const out: HolderLabel[] = [];
    const s = holderLabel(a);
    if (s) out.push(s);
    if (a === creator) out.push("creator");
    if (bundle.includes(a)) out.push("bundle");
    if (snipeWallets.has(a)) out.push("sniper");
    return out;
  };

  const held = [...balances.entries()].filter(([a, v]) => v > 0n && a !== ZERO).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  const top: Holder[] = held.slice(0, 20).map(([a, v]) => ({ address: a as Address, pct: pct(v), labels: labelsOf(a) }));
  const wallets = held.filter(([a]) => holderLabel(a) == null);
  const top10Pct = wallets.slice(0, 10).reduce((s, [, v]) => s + pct(v), 0);

  // ---- clusters: one wallet handing the token out to several holders --------------------------------------------
  const clusters: Cluster[] = partial ? [] : await distributionClusters(transfers, balances, holderLabel, pct);
  lap("clusters");
  let fundingStatus: TokenReport["fundingStatus"] = "off";
  if (fundingEnabled() && !partial) {
    const r = await fundingClusters(wallets.slice(0, 25).map(([a]) => a), balances, pct);
    fundingStatus = r.status;
    clusters.push(...r.clusters);
  }
  clusters.sort((a, b) => b.pct - a.pct);

  // ---- market ---------------------------------------------------------------------------------------------------
  const reserve = reserveOf(f);
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
  } else if (tradesQ.length > 0 && graduatedBlock == null) {
    const last = tradesQ[tradesQ.length - 1]!;
    const price = last.tokens > 0 ? last.quote / last.tokens : null;
    const usd = (q: number | null) => (q != null && quotePrice != null ? q * quotePrice : null);
    const vol = (secs: number) => usd(tradesQ.filter((t) => tsOf(t.block) >= now - secs).reduce((s, t) => s + t.quote, 0));
    market = {
      source: "curve",
      priceUsd: usd(price),
      mcapUsd: usd(price != null ? price * supply : null),
      liquidityUsd: usd(reserve),
      volumeUsd: { m5: vol(300), h1: vol(3600), h24: vol(86400) },
      buys: tradesQ.filter((t) => t.side === "buy").length,
      sells: tradesQ.filter((t) => t.side === "sell").length,
      buyers: new Set(tradesQ.filter((t) => t.side === "buy").map((t) => t.wallet)).size,
      sellers: new Set(tradesQ.filter((t) => t.side === "sell").map((t) => t.wallet)).size,
      lastTradeAt: Math.round(tsOf(last.block)),
    };
  }

  // ---- launch section -------------------------------------------------------------------------------------------
  const threshold = thresholdOf(f);
  const launch: TokenReport["launch"] =
    launchLog && curve
      ? {
          curve: curve as Address,
          quote: { address: quoteAddr as Address | null, symbol: quoteSymbol, decimals: quoteDecimals, usd: quotePrice },
          phase: record?.phase ?? "unknown",
          progressPct:
            graduatedBlock != null || record?.phase === "swept" || record?.phase === "pool" ? 100 : threshold > 0 ? Math.min(100, (reserve / threshold) * 100) : 0,
          threshold,
          graduatedBlock,
          creatorTaxBps: record?.creatorTaxBps ?? null,
          feeRecipient: (record?.feeRecipient as Address) ?? null,
          devBuy: launchCall ? Number(launchCall.devBuyWei) / 10 ** quoteDecimals : null,
          bundle: bundle as Address[],
        }
      : null;

  // Unknown must never read as clear: without the trades there is no sniper reading, without the launch call or the
  // holders there is no bundle reading.
  const snipers =
    launch && snipeSource != null && (!partial || (idx && exact)) && supply > 0
      ? {
          wallets: snipeWallets.size,
          boughtPct: (snipeQ.filter((t) => t.side === "buy" && snipeWallets.has(t.wallet)).reduce((s, t) => s + t.tokens, 0) / supply) * 100,
          holdPct: [...snipeWallets].reduce((s, a) => s + balancePct(a), 0),
        }
      : null;
  const bundleInfo =
    launch && launchCall != null && (!partial || (idx && exact)) ? { wallets: bundle.length, holdPct: bundle.reduce((s, a) => s + balancePct(a), 0) } : null;

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

  // ---- the creator's position: what their own wallet bought, sold, passed on and still holds --------------------
  // Read from the transfers, so it covers the dev buy, later buys, sells into the curve or a pool, and tokens moved
  // to other wallets (a common way to make the creator look clean).
  let creatorPosition: TokenReport["creatorPosition"] = null;
  // the creator's own transfers: from the history read here, or from the index for a token too big to read
  const creatorTx =
    creator && !partial
      ? transfers.flatMap((l) => {
          if (l.data.length < 66) return [];
          const from = addressFromTopic(l.topics[1]!);
          const to = addressFromTopic(l.topics[2]!);
          return from === creator || to === creator ? [{ from, to, v: BigInt(l.data.slice(0, 66)) }] : [];
        })
      : creator && idx && exact
        ? // a short wait: the read goes on in the background and the next report finds it in memory
          await tag(
            "creator transfers",
            Promise.race([indexedCreatorTransfers(creator, token).catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), 2_500))]),
          )
        : null;
  if (creator && creatorTx && creatorTx.length > 0) {
    let bought = 0n, received = 0n, sold = 0n, sent = 0n, burned = 0n, locked = 0n, poolSell = false;
    // where a transfer went decides what it was: a sale (curve, pool, router), a burn, a lock, or a hand-off
    const market = (a: string) => {
      const l = systemLabel(a);
      return l === "curve" || l === "pool" || a === ROUTER || a === FOMO_ROUTER || a === FACTORY;
    };
    for (const { from, to, v } of creatorTx) {
      if (from === to) continue;
      if (to === creator) {
        if (market(from)) bought += v;
        else received += v;
      } else if (from === creator) {
        if (to === DEAD || to === ZERO) burned += v;
        else if (to === LOCKER) locked += v;
        else if (market(to)) {
          sold += v;
          if (systemLabel(to) === "pool") poolSell = true;
        } else sent += v;
      }
    }
    if (bought + received > 0n) {
      const mine = (side: Trade["side"]) => tradesQ.filter((t) => t.side === side && t.wallet === creator).reduce((s, t) => s + t.quote, 0);
      creatorPosition = {
        boughtPct: pct(bought),
        receivedPct: pct(received),
        soldPct: pct(sold),
        sentPct: pct(sent),
        burnedPct: pct(burned),
        lockedPct: pct(locked),
        holdPct: balancePct(creator),
        spent: trades ? mine("buy") : null,
        got: trades ? mine("sell") : null,
        poolSells: poolSell,
      };
    }
  }

  const report: TokenReport = {
    address: token,
    chainId: CHAIN_ID,
    name: f.name,
    symbol: f.symbol,
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
    holders: { count: idx ? idx.count : held.length, top10Pct, top, creatorPct: creator && (!partial || (idx && exact)) ? balancePct(creator) : 0, partial },
    snipers,
    bundle: bundleInfo,
    clusters,
    fundingStatus,
    devStatus,
    volume,
    creatorPosition,
    dev,
    flags: [],
    head: h,
    generatedAt: Math.floor(Date.now() / 1000),
    tookMs: 0,
  };
  report.flags = flagsFor(report, creatorSold, tsHead);
  report.tookMs = Date.now() - started;
  const limited = rpcStats.limited - limitedBefore;
  console.log(`read ${token} ${phases.map(([n, t]) => `${n} ${t}ms`).join(" | ")}${limited ? ` | node limited ${limited}x` : ""}`);
  return report;
}

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function readCurveTrades(curve: string, from: number, to: number, deadline: number, kept = true): Promise<Trade[]> {
  const filter = { address: curve, topics: [[CURVE_BUY, CURVE_SELL]] };
  // a short window (the launch blocks) is read as is: storing it would replace the kept history of the curve
  const logs = kept ? await getLogsKept(`trades:${curve}`, filter, from, to, deadline) : await getLogs(filter, from, to, deadline);
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
// A funder with this many transactions is a service (an exchange's or a bridge's hot wallet), not one person's wallet
const SERVICE_NONCE = 500;
const personal = new Map<string, boolean>(); // funder -> a plain wallet with few transactions

async function fundingClusters(holders: string[], balances: Map<string, bigint>, pct: (raw: bigint) => number): Promise<{ status: "pending" | "done"; clusters: Cluster[] }> {
  const known = holders.map((a) => [a, cachedFunder(a)] as const);
  const missing = known.filter(([, f]) => f === undefined).map(([a]) => a);
  if (missing.length > 0) {
    queueFunders(missing);
    return { status: "pending", clusters: [] };
  }
  const groups = new Map<string, string[]>();
  for (const [a, f] of known) if (f) groups.set(f, [...(groups.get(f) ?? []), a]);
  const candidates = [...groups].filter(([, m]) => m.length >= 3);
  // thousands of people get their first ETH from an exchange or a bridge: only a plain wallet with few transactions is a
  // sign of one hand behind the group
  const unknown = candidates.map(([s]) => s).filter((s) => !personal.has(s));
  if (unknown.length > 0) {
    const res = await batch(unknown.flatMap((a) => [["eth_getCode", [a, "latest"]], ["eth_getTransactionCount", [a, "latest"]]] as [string, unknown[]][])).catch(() => null);
    if (!res) return { status: "done", clusters: [] };
    unknown.forEach((a, i) => {
      const code = res[2 * i], nonce = res[2 * i + 1];
      const plain = typeof code === "string" && (code === "0x" || code.startsWith("0xef0100"));
      personal.set(a, plain && typeof nonce === "string" && Number(BigInt(nonce)) < SERVICE_NONCE);
    });
    if (personal.size > 20_000) personal.delete(personal.keys().next().value!);
  }
  const clusters: Cluster[] = [];
  for (const [source, members] of candidates) {
    if (!personal.get(source)) continue;
    const raw = members.reduce((s, a) => s + (balances.get(a) ?? 0n), 0n);
    if (pct(raw) < 0.5) continue; // same floor as distribution groups: three dust holders funded by an exchange are not a signal
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

// `done` is the settled value, readable without waiting: undefined while the search runs, null if it failed
const creatorCache = new Map<string, { at: number; value: Promise<CreatorLaunches>; done?: CreatorLaunches | null }>();
const CREATOR_TTL_MS = 5 * 60_000;
type CreatorLaunches = CreatorLaunch[];

const CREATOR_WAIT_MS = 200; // enough for a cached record or the one-transaction shortcut; a real search takes seconds

interface SelfLaunch {
  token: string;
  curve: string;
  block: number;
  phase: CreatorLaunch["phase"];
}

const creatorCached = (creator: string, token?: string) => {
  const hit = creatorCache.get(creator);
  if (hit?.done != null && token && !hit.done.some((l) => l.token === token)) return false;
  return hit != null && Date.now() - hit.at < CREATOR_TTL_MS;
};

/** Every Pons launch by a creator, newest first, with phases and, for the latest few, whether the creator sold. Cached per creator. */
function creatorLaunches(creator: string, h: number, self: SelfLaunch): Promise<CreatorLaunches> {
  const hit = creatorCache.get(creator);
  // a record read before this token launched is out of date, however fresh: it would call a second launch the first
  const stale = hit?.done != null && !hit.done.some((l) => l.token === self.token);
  if (hit && !stale && Date.now() - hit.at < CREATOR_TTL_MS) return hit.value;
  const value = loadCreatorLaunches(creator, h, self);
  const entry: { at: number; value: Promise<CreatorLaunches>; done?: CreatorLaunches | null } = { at: Date.now(), value };
  creatorCache.set(creator, entry);
  value.then(
    (v) => {
      entry.done = v;
    },
    () => {
      entry.done = null;
      // forget a failed search shortly after, so the next read tries again
      setTimeout(() => {
        if (creatorCache.get(creator) === entry) creatorCache.delete(creator);
      }, 30_000);
    },
  );
  if (creatorCache.size > 5_000) creatorCache.delete(creatorCache.keys().next().value!);
  return value;
}

async function loadCreatorLaunches(creator: string, h: number, self: SelfLaunch): Promise<CreatorLaunches> {
  // A wallet that has sent one transaction has sent only this launch: one cheap call saves the whole search.
  const sent = await rpc<string>("eth_getTransactionCount", [creator, "latest"]).then(Number, () => Infinity);
  if (sent <= 1) return [{ ...self, symbol: "?", creatorSold: null }];
  return walkCreatorLaunches(creator, h);
}

async function walkCreatorLaunches(creator: string, h: number): Promise<CreatorLaunches> {
  const logs = await getLogs({ address: FACTORY, topics: [TOKEN_LAUNCHED, null, null, topicAddress(creator)] }, FACTORY_START, h);
  const launches = logs
    .map((l) => ({ token: addressFromTopic(l.topics[1]!), curve: addressFromTopic(l.topics[2]!), block: l.blockNumber }))
    .sort((a, b) => b.block - a.block);
  const sample = launches.slice(0, DEV_SAMPLE);
  // a creator who dumps does it in the first day; reading one day per launch keeps the scan small
  const checks = sample.slice(0, PRIOR_SOLD_CHECKS + 1);
  const [res, sold] = await Promise.all([
    batch(sample.flatMap((l) => [call(FACTORY, callData.getLaunchedToken(l.token)), call(l.token, callData.symbol())])),
    Promise.all(
      checks.map(async (l) => (await getLogs({ address: l.curve, topics: [CURVE_SELL, topicAddress(creator)] }, l.block, Math.min(h, l.block + 900_000))).length > 0),
    ),
  ]);
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
const FLAG_ORDER = { danger: 0, warn: 1, info: 2, good: 3 } as const;
const trimQuote = (v: number) => (v >= 1 ? v.toFixed(2) : v.toPrecision(2));

function devFlags(dev: TokenReport["dev"]): Flag[] {
  const f: Flag[] = [];
  if (!dev) return f;
  if (dev.checked >= 3 && dev.sold / dev.checked >= 0.5) f.push({ level: "danger", text: `Creator sold in ${dev.sold} of their last ${dev.checked} launches` });
  if (dev.launches >= 50) f.push({ level: "danger", text: `Creator has launched ${dev.launches} tokens: a launch farm` });
  else if (dev.launches >= 10) f.push({ level: "warn", text: `Creator has launched ${dev.launches} tokens` });
  else if (dev.launches === 1) f.push({ level: "info", text: "First launch from this wallet" });
  return f;
}

/** A report that went out while the creator's record was still being read, completed from the cache once that read
 *  is done: no second read of the token. Null while it is still running. */
export function withCreator(r: TokenReport): TokenReport | null {
  if (r.devStatus !== "pending" || !r.creator) return null;
  const entry = creatorCache.get(r.creator);
  const found = entry?.done;
  if (entry && found === undefined) return null; // still searching
  if (!found) return { ...r, devStatus: "off" }; // the search failed: say so instead of waiting
  const tsHead = r.generatedAt;
  const tsOf = (b: number) =>
    r.createdAt == null || r.createdBlock == null || r.head === r.createdBlock
      ? tsHead
      : r.createdAt + ((b - r.createdBlock) * (tsHead - r.createdAt)) / (r.head - r.createdBlock);
  const dev = devSummary(found, r.address, tsOf, tsHead);
  const flags = [...r.flags, ...devFlags(dev)].sort((a, b) => FLAG_ORDER[a.level] - FLAG_ORDER[b.level]);
  return { ...r, dev, devStatus: "done", flags };
}

function flagsFor(r: TokenReport, creatorSold: number, now: number): Flag[] {
  const f: Flag[] = [];
  const quote = r.launch?.quote.symbol ?? "ETH";
  const biggest = r.clusters[0];
  const linkedCount = biggest ? (biggest.kind === "distribution" ? biggest.wallets + 1 : biggest.wallets) : 0;
  if (biggest && biggest.pct >= 10) f.push({ level: "danger", text: `${linkedCount} linked wallets hold ${fmt(biggest.pct)}% of supply` });
  else if (biggest && biggest.pct >= 3) f.push({ level: "warn", text: `${linkedCount} linked wallets hold ${fmt(biggest.pct)}% of supply` });

  if (r.snipers) {
    const s = r.snipers;
    const level = s.wallets === 0 ? "good" : s.holdPct >= 10 ? "danger" : s.holdPct >= 3 ? "warn" : "info";
    f.push({
      level,
      text: s.wallets === 0 ? "No snipers in the first 3 seconds" : `${s.wallets} snipers took ${fmt(s.boughtPct)}% at launch, ${s.holdPct >= 0.05 ? `still hold ${fmt(s.holdPct)}%` : "all sold"}`,
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
    if (r.launch.devBuy === 0) f.push({ level: "good", text: "No dev buy at launch" });
    else if (r.launch.devBuy != null) f.push({ level: "info", text: `Dev bought ${trimQuote(r.launch.devBuy)} ${quote} at launch` });
    if (r.launch.creatorTaxBps) f.push({ level: r.launch.creatorTaxBps >= 500 ? "warn" : "info", text: `Creator tax ${(r.launch.creatorTaxBps / 100).toFixed(1)}%` });
    if (r.launch.graduatedBlock != null) f.push({ level: "good", text: "Graduated to Uniswap" });
  }
  const cp = r.creatorPosition;
  const took = cp ? cp.boughtPct + cp.receivedPct : 0;
  if (cp && took > 0 && cp.soldPct > 0) {
    const share = Math.min(100, (cp.soldPct / took) * 100);
    const forWhat = cp.got && cp.got > 0 ? ` for ${trimQuote(cp.got)} ${quote}` : "";
    f.push({ level: share >= 50 ? "warn" : "info", text: `Creator sold ${Math.round(share)}% of their tokens${forWhat}` });
  } else if (!cp && creatorSold > 0) f.push({ level: "warn", text: `Creator sold ${creatorSold.toFixed(3)} ${quote} worth` });
  if (cp && took > 0 && cp.burnedPct >= 0.1) {
    // burning most of their own bag is a good sign; a small burn next to a big sell is not
    const share = Math.min(100, (cp.burnedPct / took) * 100);
    f.push({ level: share >= 50 ? "good" : "info", text: `Creator burned ${Math.round(share)}% of their tokens (${fmt(cp.burnedPct)}% of supply)` });
  }
  if (cp && took > 0 && cp.sentPct >= 0.1) {
    const share = Math.min(100, (cp.sentPct / took) * 100);
    f.push({
      level: share >= 50 || cp.sentPct >= 3 ? "warn" : "info",
      text: `Creator moved ${Math.round(share)}% of their tokens (${fmt(cp.sentPct)}% of supply) to other wallets`,
    });
  }
  if (r.holders.partial)
    f.push({
      level: "info",
      text: r.holders.count > 0 && r.holders.top.length > 0
        ? "Busy token: holders from Blockscout's index, linked wallets and volume not read"
        : "Too many transfers to read holders in one pass",
    });
  if (r.holders.creatorPct >= 5) f.push({ level: "warn", text: `Creator holds ${fmt(r.holders.creatorPct)}%` });
  if (r.holders.top10Pct >= 50) f.push({ level: "danger", text: `Top 10 wallets hold ${fmt(r.holders.top10Pct)}%` });
  else if (r.holders.top10Pct >= 30) f.push({ level: "warn", text: `Top 10 wallets hold ${fmt(r.holders.top10Pct)}%` });

  f.push(...devFlags(r.dev));
  if (r.volume && r.volume.trades >= 30 && r.volume.top5SharePct >= 60)
    f.push({ level: "warn", text: `5 wallets made ${fmt(r.volume.top5SharePct)}% of volume` });
  if (r.volume && r.volume.trades >= 30 && r.volume.roundTripWallets >= 5)
    f.push({ level: "warn", text: `${r.volume.roundTripWallets} wallets bought and sold it again and again` });
  if (!r.links.x && !r.links.website && !r.links.telegram) f.push({ level: "info", text: "No socials set" });

  return f.sort((a, b) => FLAG_ORDER[a.level] - FLAG_ORDER[b.level]);
}
