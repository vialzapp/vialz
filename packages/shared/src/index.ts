// Types and helpers shared by the API, the site and the extension.

export const CHAIN_ID = 4663;

export type Address = `0x${string}`;

export type HolderLabel = "creator" | "curve" | "pool" | "burn" | "launchpad" | "contract" | "bundle" | "sniper";

export interface Holder {
  address: Address;
  pct: number; // share of total supply, 0..100
  labels: HolderLabel[];
}

export interface Cluster {
  kind: "distribution" | "funding";
  source: Address; // the wallet that sent the tokens or the ETH
  wallets: number;
  pct: number; // share of supply the cluster holds now, source included
  members: Address[];
}

export interface Flag {
  level: "good" | "info" | "warn" | "danger";
  text: string;
}

export interface PriorLaunch {
  token: Address;
  symbol: string;
  block: number;
  ts: number;
  phase: "curve" | "swept" | "pool" | "rescued" | "unknown";
  creatorSold: boolean | null; // null when not checked
}

export interface TokenReport {
  address: Address;
  chainId: number;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number; // whole tokens
  launchpad: "pons" | null;
  createdBlock: number | null;
  createdAt: number | null; // unix seconds
  creator: Address | null;
  description: string | null;
  links: { x: string | null; telegram: string | null; website: string | null; image: string | null };

  launch: null | {
    curve: Address;
    quote: { address: Address | null; symbol: string; decimals: number; usd: number | null };
    phase: PriorLaunch["phase"];
    progressPct: number;
    threshold: number; // quote units
    graduatedBlock: number | null;
    creatorTaxBps: number | null;
    feeRecipient: Address | null;
    devBuy: number | null; // quote units
    bundle: Address[]; // wallets declared exempt from the opening tax
  };

  market: null | {
    source: "curve" | "dexscreener";
    priceUsd: number | null;
    mcapUsd: number | null;
    liquidityUsd: number | null;
    volumeUsd: { m5: number | null; h1: number | null; h24: number | null };
    buys: number | null;
    sells: number | null;
    buyers: number | null;
    sellers: number | null;
    lastTradeAt: number | null;
  };

  holders: {
    count: number;
    top10Pct: number; // wallets only: curve, pools, burn, launchpad and other contracts excluded
    top: Holder[];
    creatorPct: number;
    partial: boolean; // transfer history too large to read completely
  };

  snipers: { wallets: number; boughtPct: number; holdPct: number } | null;
  bundle: { wallets: number; holdPct: number } | null;
  clusters: Cluster[];
  fundingStatus: "off" | "pending" | "done"; // funding clusters need an Etherscan key; "pending" while wallets are looked up
  devStatus: "off" | "pending" | "done"; // the creator's record; "pending" while it is still being read

  volume: null | {
    trades: number;
    top5SharePct: number; // share of volume made by the five busiest wallets
    roundTripWallets: number; // wallets that bought and sold at least twice each
  };

  /** What the creator's own wallet did with the token, all as a share of total supply. */
  creatorPosition: null | {
    boughtPct: number; // bought from the curve or a pool, the dev buy included
    receivedPct: number; // came in from other wallets
    soldPct: number; // went back into the curve or a pool
    sentPct: number; // went out to other wallets (not burned, not locked)
    burnedPct: number; // sent to the dead or zero address
    lockedPct: number; // sent to the Pons locker
    holdPct: number; // in the wallet now
    spent: number | null; // quote paid on the curve (ETH)
    got: number | null; // quote received for curve sells
    poolSells: boolean; // some sells went into a pool, whose proceeds are not in `got`
    rebuys?: { count: number; pct: number; spent: number } | null; // curve buys after the launch block; null when trades were not read
  };

  dev: null | {
    launches: number; // all pons launches by this creator, this one included
    graduated: number;
    sold: number; // earlier launches where the creator sold on the curve (checked ones only)
    checked: number;
    recent: PriorLaunch[];
  };

  flags: Flag[];
  head: number;
  generatedAt: number;
  tookMs: number;
}

/** Parts of the report are still being read: read it again shortly. */
export const isPending = (r: TokenReport) => r.fundingStatus === "pending" || r.devStatus === "pending";

/** The first look at a token, read in about two round trips while the full report is still being read. */
export interface TokenQuick {
  address: Address;
  name: string;
  symbol: string;
  links: TokenReport["links"];
  createdAt: number | null;
  launch: null | { progressPct: number; graduated: boolean; quoteSymbol: string };
  market: null | { source: "curve" | "dexscreener"; mcapUsd: number | null; liquidityUsd: number | null };
}

export interface ApiError {
  error: string;
  message: string;
}

// exactly 40 hex digits: a tx hash or a longer hex run must not yield its first 40 as an address
const ADDRESS_RE = /(?<![a-zA-Z0-9])0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/;

/** Pulls a contract address out of anything a user might paste: a bare address, an X post, a gmgn, fomo, pons, dexscreener or explorer link. */
export function extractAddress(input: string): Address | null {
  const m = input.trim().match(ADDRESS_RE);
  return m ? (m[0].toLowerCase() as Address) : null;
}

export function shortAddress(a: string, head = 6, tail = 4): string {
  return a.length > head + tail + 1 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;
}

/** $1.2K, $34.5M. Tiny prices use subscript zeros: 0.0₅812 = 0.00000812. */
export function formatUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "n/a";
  if (v === 0) return "$0";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  if (abs >= 1) return `$${v.toFixed(2)}`;
  return `$${formatSmall(v)}`;
}

export function formatSmall(v: number): string {
  if (v >= 0.01) return v.toFixed(4);
  const s = v.toFixed(20);
  const zeros = s.slice(2).match(/^0*/)?.[0].length ?? 0;
  const digits = s.slice(2 + zeros, 2 + zeros + 4).replace(/0+$/, "");
  const sub = String(zeros).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]).join("");
  return `0.0${sub}${digits}`;
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "n/a";
  return `${v.toFixed(v > 0 && v < 0.1 ? 2 : digits)}%`;
}

export function formatAge(seconds: number | null | undefined): string {
  if (seconds == null) return "n/a";
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export const EXPLORER = "https://robin.etherscan.io";
export const explorerAddress = (a: string) => `${EXPLORER}/address/${a}`;
export const explorerToken = (a: string) => `${EXPLORER}/token/${a}`;

// ---- the test strip: six checks, each a pad coloured by its reading ----------------------------------------------

export type PadLevel = Flag["level"] | "none";

export interface Pad {
  key: "snipers" | "bundle" | "holders" | "linked" | "creator" | "volume";
  label: string;
  level: PadLevel;
  reading: string; // the reading in words, for lists and screen readers
  short: string; // the same reading in a few characters, shown under the vial
}

const worst = (...levels: PadLevel[]): PadLevel => {
  const rank: PadLevel[] = ["danger", "warn", "info", "good", "none"];
  return rank.find((r) => levels.includes(r)) ?? "none";
};

/** 1st, 2nd, 23rd, 112th */
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

export function padsFor(r: TokenReport): Pad[] {
  const pct = (v: number) => `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}%`;
  const na = (key: Pad["key"], label: string): Pad => ({ key, label, level: "none", reading: "n/a", short: "n/a" });

  const s = r.snipers;
  const snipers: Pad = !s
    ? na("snipers", "Snipers")
    : {
        key: "snipers",
        label: "Snipers",
        level: s.wallets === 0 ? "good" : s.holdPct >= 10 ? "danger" : s.holdPct >= 3 ? "warn" : "info",
        reading: s.wallets === 0 ? "none" : s.holdPct < 0.05 ? `${s.wallets} wallets, all sold` : `${s.wallets} wallets hold ${pct(s.holdPct)}`,
        short: s.wallets === 0 ? "0" : s.holdPct < 0.05 ? "sold" : pct(s.holdPct),
      };

  const b = r.bundle;
  const bundle: Pad = !b
    ? na("bundle", "Bundle")
    : {
        key: "bundle",
        label: "Bundle",
        level: b.wallets === 0 ? "good" : b.holdPct >= 5 ? "danger" : b.holdPct >= 1 ? "warn" : "info",
        reading: b.wallets === 0 ? "none" : `${b.wallets} wallets hold ${pct(b.holdPct)}`,
        short: b.wallets === 0 ? "0" : b.holdPct < 0.05 ? "sold" : pct(b.holdPct),
      };

  const t = r.holders.top10Pct;
  // a busy token read through the index has its biggest balances, so a top 10, but not the history linked wallets need
  const holders: Pad = (r.holders.partial && r.holders.top.length === 0) || r.holders.count === 0
    ? na("holders", "Top 10")
    : { key: "holders", label: "Top 10", level: t >= 50 ? "danger" : t >= 30 ? "warn" : t >= 15 ? "info" : "good", reading: `hold ${pct(t)}`, short: pct(t) };

  const c = r.clusters[0];
  const linked: Pad = r.holders.partial
    ? na("linked", "Linked")
    : {
        key: "linked",
        label: "Linked",
        level: !c ? "good" : c.pct >= 10 ? "danger" : c.pct >= 3 ? "warn" : "info",
        reading: c ? `${c.wallets + 1} wallets hold ${pct(c.pct)}` : "none found",
        short: c ? pct(c.pct) : "none",
      };

  const d = r.dev;
  const creator: Pad = r.devStatus === "pending"
    ? { key: "creator", label: "Creator", level: "none", reading: "still reading", short: "…" }
    : !d
    ? {
        key: "creator",
        label: "Creator",
        level: r.holders.creatorPct >= 5 ? "warn" : "none",
        reading: r.creator ? `holds ${pct(r.holders.creatorPct)}` : "unknown",
        short: r.creator ? pct(r.holders.creatorPct) : "n/a",
      }
    : {
        key: "creator",
        label: "Creator",
        level: worst(
          // a fresh wallet has no record to judge: serial launchers use a new one each time, so it is a note, not clear
          d.launches >= 50 ? "danger" : d.launches >= 10 ? "warn" : d.launches === 1 ? "info" : "good",
          d.checked >= 3 && d.sold / d.checked >= 0.5 ? "danger" : "good",
          r.holders.creatorPct >= 5 ? "warn" : "good",
        ),
        reading: d.launches === 1 ? "first launch" : `launch number ${d.launches}`,
        short: d.launches === 1 ? "1st" : ordinal(d.launches),
      };

  const v = r.volume;
  const volume: Pad = !v
    ? na("volume", "Top 5 vol")
    : v.trades < 30
      ? { key: "volume", label: "Top 5 vol", level: "info", reading: `${v.trades} trades so far`, short: `${v.trades} tx` }
      : {
          key: "volume",
          label: "Top 5 vol",
          level: v.top5SharePct >= 60 || v.roundTripWallets >= 5 ? "warn" : "good",
          reading: `five wallets made ${pct(v.top5SharePct)} of volume`,
          short: pct(v.top5SharePct),
        };

  return [snipers, bundle, holders, linked, creator, volume];
}

/** How many findings read high, watch, note and clear. Counts, not a score. */
export function tallyFlags(flags: Flag[]): Record<Flag["level"], number> {
  const t = { danger: 0, warn: 0, info: 0, good: 0 };
  for (const f of flags) t[f.level]++;
  return t;
}

/** A few lines of fact to paste into a post or a chat, with the link to the full report. */
export function summaryText(r: TokenReport, url: string): string {
  const pads = padsFor(r);
  const pad = (k: Pad["key"]) => pads.find((p) => p.key === k)!;
  const lines = [
    `$${r.symbol} on Robinhood Chain`,
    [r.market?.mcapUsd != null && `MC ${formatUsd(r.market.mcapUsd)}`, `${r.holders.count.toLocaleString("en-US")} holders`, `top 10 ${pad("holders").reading}`]
      .filter(Boolean)
      .join(" · "),
    `Snipers: ${pad("snipers").reading} · Bundle: ${pad("bundle").reading}`,
    `Linked: ${pad("linked").reading} · Creator: ${pad("creator").reading}`,
    `Top 5 wallets' volume: ${pad("volume").reading}`,
    `Read on chain by Vialz: ${url}`,
  ];
  return lines.join("\n");
}

/** A post for X: the six short readings, short enough to leave room for the link and a comment. */
export function shareText(r: TokenReport): string {
  const line = padsFor(r)
    .map((p) => `${p.label} ${p.short}`)
    .join(" · ");
  return `$${r.symbol} read on chain by Vialz\n${line}`;
}
