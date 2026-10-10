// Types and helpers shared by the API, the site and the extension.

export const CHAIN_ID = 4663;

export type Address = `0x${string}`;

export type HolderLabel = "creator" | "curve" | "pool" | "burn" | "launchpad" | "bundle" | "sniper";

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
    top10Pct: number; // wallets only: curve, pool, burn and launchpad contracts excluded
    top: Holder[];
    creatorPct: number;
    partial: boolean; // transfer history too large to read completely
  };

  snipers: { wallets: number; boughtPct: number; holdPct: number } | null;
  bundle: { wallets: number; holdPct: number } | null;
  clusters: Cluster[];
  fundingStatus: "off" | "pending" | "done"; // funding clusters need an Etherscan key; "pending" while wallets are looked up

  volume: null | {
    trades: number;
    top5SharePct: number; // share of volume made by the five busiest wallets
    roundTripWallets: number; // wallets that bought and sold at least twice each
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

export interface ApiError {
  error: string;
  message: string;
}

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;

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
  reading: string; // short value shown under the pad
}

const worst = (...levels: PadLevel[]): PadLevel => {
  const rank: PadLevel[] = ["danger", "warn", "info", "good", "none"];
  return rank.find((r) => levels.includes(r)) ?? "none";
};

export function padsFor(r: TokenReport): Pad[] {
  const pct = (v: number) => `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}%`;

  const s = r.snipers;
  const snipers: Pad = !s
    ? { key: "snipers", label: "Snipers", level: "none", reading: "n/a" }
    : {
        key: "snipers",
        label: "Snipers",
        level: s.wallets === 0 ? "good" : s.holdPct >= 10 ? "danger" : s.holdPct >= 3 ? "warn" : "info",
        reading: s.wallets === 0 ? "none" : s.holdPct < 0.05 ? "all sold" : `${pct(s.holdPct)} held`,
      };

  const b = r.bundle;
  const bundle: Pad = !b
    ? { key: "bundle", label: "Bundle", level: "none", reading: "n/a" }
    : {
        key: "bundle",
        label: "Bundle",
        level: b.wallets === 0 ? "good" : b.holdPct >= 5 ? "danger" : b.holdPct >= 1 ? "warn" : "info",
        reading: b.wallets === 0 ? "none" : `${b.wallets} wallets`,
      };

  const t = r.holders.top10Pct;
  const holders: Pad = r.holders.partial || r.holders.count === 0
    ? { key: "holders", label: "Top 10", level: "none", reading: "n/a" }
    : { key: "holders", label: "Top 10", level: t >= 50 ? "danger" : t >= 30 ? "warn" : t >= 15 ? "info" : "good", reading: pct(t) };

  const c = r.clusters[0];
  const linked: Pad = r.holders.partial
    ? { key: "linked", label: "Linked", level: "none", reading: "n/a" }
    : { key: "linked", label: "Linked", level: !c ? "good" : c.pct >= 10 ? "danger" : c.pct >= 3 ? "warn" : "info", reading: c ? pct(c.pct) : "none found" };

  const d = r.dev;
  const creator: Pad = !d
    ? { key: "creator", label: "Creator", level: r.holders.creatorPct >= 5 ? "warn" : "none", reading: r.creator ? pct(r.holders.creatorPct) : "unknown" }
    : {
        key: "creator",
        label: "Creator",
        level: worst(
          d.launches >= 50 ? "danger" : d.launches >= 10 ? "warn" : "good",
          d.checked >= 3 && d.sold / d.checked >= 0.5 ? "danger" : "good",
          r.holders.creatorPct >= 5 ? "warn" : "good",
        ),
        reading: d.launches === 1 ? "first launch" : `${d.launches} launches`,
      };

  const v = r.volume;
  const volume: Pad = !v
    ? { key: "volume", label: "Volume", level: "none", reading: "n/a" }
    : {
        key: "volume",
        label: "Volume",
        level: v.trades < 30 ? "info" : v.top5SharePct >= 60 || v.roundTripWallets >= 5 ? "warn" : "good",
        reading: v.trades < 30 ? `${v.trades} trades` : `top 5: ${pct(v.top5SharePct)}`,
      };

  return [snipers, bundle, holders, linked, creator, volume];
}
