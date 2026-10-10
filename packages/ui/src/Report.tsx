import { useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRightIcon, CheckIcon, CopyIcon, GlobeIcon, TelegramLogoIcon, XLogoIcon } from "@phosphor-icons/react";
import {
  explorerAddress,
  formatAge,
  formatPct,
  formatSmall,
  formatUsd,
  padsFor,
  shortAddress,
  summaryText,
  tallyFlags,
  type Flag,
  type HolderLabel,
  type TokenReport,
} from "@vialz/shared";
import { Strip } from "./Strip";

interface Props {
  report: TokenReport;
  /** where the API lives; token images are proxied through it */
  apiBase?: string;
  /** head, vials and findings only, with a link to the full report */
  compact?: { href: string };
  /** open another token's report inside the same surface (creator's earlier launches) */
  onOpenToken?: (address: string) => void;
  /** the public page of this report: copied with the summary, and linked when `openFull` is set */
  shareUrl?: string;
  openFull?: boolean;
}

const nowSec = () => Math.floor(Date.now() / 1000);

type Tab = "overview" | "market" | "holders" | "creator" | "all";
const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["market", "Market"],
  ["holders", "Holders"],
  ["creator", "Creator"],
  ["all", "Full report"],
];
const TAB_KEY = "vialz.tab";

/** Opens on the overview, or on the full report for someone who chose it before (kept on this device only). */
function useTab(): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return localStorage.getItem(TAB_KEY) === "all" ? "all" : "overview";
    } catch {
      return "overview";
    }
  });
  const choose = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // remembering the tab is a convenience
    }
  };
  return [tab, choose];
}

export function Report({ report: r, onOpenToken, apiBase = "", compact, shareUrl, openFull, headingLevel = 2 }: Props & { headingLevel?: 1 | 2 }) {
  const Title = headingLevel === 1 ? "h1" : "h2";
  const age = r.createdAt != null ? nowSec() - r.createdAt : null;
  const onCurve = r.launch != null && r.launch.graduatedBlock == null && r.launch.phase === "curve";
  const [tab, setTab] = useTab();
  const tabsRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const choose = (t: Tab) => {
    setTab(t);
    // switching from far down a long tab: bring the new tab's start into view under the sticky bar
    const el = tabsRef.current;
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(el).top) || 0);
      if (window.scrollY > top) window.scrollTo({ top });
    }
  };

  const overview = (
    <>
      <Tally flags={r.flags} />
      <Strip pads={padsFor(r)} />
      <Findings flags={r.flags} />
      {!compact && shareUrl && <Actions report={r} url={shareUrl} openFull={openFull} />}
    </>
  );
  const market = (
    <>
      <MarketSection r={r} />
      <LaunchSection r={r} />
    </>
  );
  const holders = (
    <>
      <HoldersSection r={r} />
      <LinkedSection r={r} />
    </>
  );
  const creator = <CreatorSection r={r} onOpenToken={onOpenToken} />;

  return (
    <article className={compact ? "vz-report vz-compact" : "vz-report"} aria-label={`Vialz report on ${r.name}`}>
      <div className="vz-top">
        <header className="vz-head">
          <TokenImage src={r.links.image} symbol={r.symbol} address={r.address} apiBase={apiBase} />
          <div className="vz-title">
            <Title className="vz-name">{r.name}</Title>
            <div className="vz-meta">
              <span className="vz-ticker">${r.symbol}</span>
              <CopyAddress address={r.address} />
            </div>
          </div>
          <Links links={r.links} />
        </header>

        <dl className="vz-stats">
          <Stat label="MCap" value={formatUsd(r.market?.mcapUsd)} />
          <Stat label={r.market?.source === "dexscreener" ? "Liquidity" : "In curve"} value={formatUsd(r.market?.liquidityUsd)} />
          <Stat label="Holders" value={r.holders.partial ? "n/a" : r.holders.count.toLocaleString("en-US")} />
          <Stat label="Age" value={age != null ? formatAge(age) : "n/a"} />
        </dl>

        {r.launch && (
          <div
            className="vz-progress"
            role="progressbar"
            aria-label="Curve progress to graduation"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(r.launch.progressPct)}
          >
            <div className="vz-progress-bar">
              <span style={{ width: `${Math.max(1, Math.min(100, r.launch.progressPct))}%` }} />
            </div>
            <span>{onCurve ? <><b>{r.launch.progressPct.toFixed(0)}%</b> to graduation on Pons</> : venue(r)}</span>
          </div>
        )}
      </div>

      {compact ? (
        <>
          <div className="vz-panel">{overview}</div>
          <footer className="vz-footer vz-compact-foot">
            <a href={compact.href}>Open the full report</a>
            <span>
              Block <span className="num">{r.head.toLocaleString("en-US")}</span>
            </span>
          </footer>
        </>
      ) : (
        <>
          <div
            className="vz-tabs"
            role="tablist"
            aria-label="Report sections"
            ref={tabsRef}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const i = TABS.findIndex(([t]) => t === tab);
              const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]![0];
              choose(next);
              document.getElementById(`${id}-${next}`)?.focus();
            }}
          >
            {TABS.map(([t, label]) => (
              <button
                key={t}
                id={`${id}-${t}`}
                type="button"
                role="tab"
                aria-selected={tab === t}
                aria-controls={`${id}-panel`}
                tabIndex={tab === t ? 0 : -1}
                className="vz-tab"
                onClick={() => choose(t)}
              >
                {label}
              </button>
            ))}
          </div>

          <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} className={`vz-panel vz-panel-${tab}`}>
            {tab === "overview" && (
              <>
                <div className="vz-col vz-col-a">{overview}</div>
                <div className="vz-col vz-col-b vz-wide-only">{market}</div>
              </>
            )}
            {tab === "market" && market}
            {tab === "holders" && holders}
            {tab === "creator" && creator}
            {tab === "all" && (
              <>
                <div className="vz-col vz-col-a">{overview}</div>
                <div className="vz-col vz-col-b">
                  {market}
                  {holders}
                  {creator}
                </div>
              </>
            )}
          </div>

          <footer className="vz-footer">
            <span>
              Read from block <span className="num">{r.head.toLocaleString("en-US")}</span> in {(r.tookMs / 1000).toFixed(1)}s.
            </span>
            <span>Facts from the chain, not advice.</span>
          </footer>
        </>
      )}
    </article>
  );
}

function MarketSection({ r }: { r: TokenReport }) {
  if (!r.market) return <Section title="Market"><p className="vz-empty">No trades or pool found for this token yet.</p></Section>;
  return (
    <Section title="Market" note={r.market.source === "curve" ? "On-chain curve trades" : "Pool data from DexScreener"}>
      <dl className="vz-values">
        <Value label="Price" value={r.market.priceUsd != null ? `$${formatSmall(r.market.priceUsd)}` : "n/a"} />
        <Value label="Market cap" value={formatUsd(r.market.mcapUsd)} />
        <Value label={r.market.source === "curve" ? "In the curve" : "Liquidity"} value={formatUsd(r.market.liquidityUsd)} />
        <Value label="Volume 1h" value={formatUsd(r.market.volumeUsd.h1)} />
        <Value label="Volume 24h" value={formatUsd(r.market.volumeUsd.h24)} />
        {r.market.buyers != null ? (
          <Value label="Buyers / sellers" value={`${r.market.buyers} / ${r.market.sellers}`} />
        ) : (
          <Value label="Buys / sells 24h" value={`${r.market.buys ?? "n/a"} / ${r.market.sells ?? "n/a"}`} />
        )}
      </dl>
    </Section>
  );
}

function LaunchSection({ r }: { r: TokenReport }) {
  if (!r.launch) return null;
  const quote = r.launch.quote.symbol;
  return (
    <Section title="Launch" note={venue(r)}>
      <dl className="vz-values">
        <Value label="Paired with" value={quote} />
        <Value label="Dev buy" value={r.launch.devBuy == null ? "n/a" : r.launch.devBuy === 0 ? "none" : `${trim(r.launch.devBuy)} ${quote}`} />
        <Value label="Creator tax" value={r.launch.creatorTaxBps != null ? `${(r.launch.creatorTaxBps / 100).toFixed(1)}%` : "n/a"} />
        <Value label="Snipers bought" value={r.snipers ? (r.snipers.wallets ? `${formatPct(r.snipers.boughtPct)}, ${r.snipers.wallets} wallets` : "none") : "n/a"} />
        <Value label="Bundle holds" value={!r.bundle ? "n/a" : r.bundle.wallets ? `${formatPct(r.bundle.holdPct)}, ${r.bundle.wallets} wallets` : "none"} />
        <Value
          label="Fees go to"
          value={r.launch.feeRecipient ? (r.launch.feeRecipient === r.creator ? "the creator" : shortAddress(r.launch.feeRecipient)) : "n/a"}
        />
      </dl>
    </Section>
  );
}

function HoldersSection({ r }: { r: TokenReport }) {
  return (
    <Section title="Holders" note={`${r.holders.count.toLocaleString("en-US")} ${r.holders.count === 1 ? "holder" : "holders"}`}>
      {r.holders.partial ? (
        <p className="vz-empty vz-dist-note">Too many transfers to split the supply in one read. The list below is the biggest balances seen.</p>
      ) : (
        <Distribution report={r} />
      )}
      <ol className="vz-holders">
        {r.holders.top.filter((h) => h.pct >= 0.01 || h.labels.length > 0).slice(0, 10).map((h, i, top) => (
          <li key={h.address}>
            <span className="num vz-rank">{i + 1}</span>
            <a className="num" href={explorerAddress(h.address)} target="_blank" rel="noreferrer">
              {shortAddress(h.address)}
            </a>
            <span className="vz-labels">
              {h.labels.map((l) => (
                <span key={l} className={`vz-label label-${l}`}>
                  {LABEL[l]}
                </span>
              ))}
            </span>
            <span className="vz-share">
              <span className="vz-share-bar" aria-hidden>
                <span style={{ width: `${(h.pct / Math.max(top[0]?.pct ?? 1, 0.01)) * 100}%` }} />
              </span>
              <span className="num">{formatPct(h.pct)}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="vz-foot-note">
        Top 10 wallets hold <b className="num">{formatPct(r.holders.top10Pct)}</b>, not counting the curve, pools and burn address.
      </p>
    </Section>
  );
}

function LinkedSection({ r }: { r: TokenReport }) {
  return (
    <Section title="Linked wallets">
      {r.clusters.length === 0 ? (
        <p className="vz-empty">
          {r.fundingStatus === "pending"
            ? "Checking where the top holders got their ETH. This fills in within a minute."
            : "No wallet handed this token out to three or more holders who still hold it."}
        </p>
      ) : (
        <ul className="vz-clusters">
          {r.clusters.slice(0, 5).map((c) => (
            <li key={`${c.kind}-${c.source}`}>
              <span className="num vz-cluster-pct">{formatPct(c.pct)}</span>
              <span>
                {c.kind === "distribution" ? "Sent out by " : "Funded by "}
                <a className="num" href={explorerAddress(c.source)} target="_blank" rel="noreferrer">
                  {shortAddress(c.source)}
                </a>{" "}
                to {c.wallets} wallets that still hold it
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function CreatorSection({ r, onOpenToken }: { r: TokenReport; onOpenToken?: (address: string) => void }) {
  if (!r.creator) return <Section title="Creator"><p className="vz-empty">The wallet that created this token is not known.</p></Section>;
  return (
    <Section title="Creator" note={shortAddress(r.creator)}>
      {r.devStatus === "pending" ? (
        <p className="vz-empty">Reading this wallet's earlier Pons launches. This fills in within a few seconds.</p>
      ) : r.dev ? (
        <>
          <dl className="vz-values">
            <Value label="Pons launches" value={r.dev.launches.toLocaleString("en-US")} />
            <Value label="Graduated" value={`${r.dev.graduated}`} />
            <Value label="Sold early" value={r.dev.checked ? `${r.dev.sold} of last ${r.dev.checked}` : r.dev.launches === 1 ? "n/a, first launch" : "n/a"} />
            <Value label="Holds now" value={r.holders.creatorPct === 0 ? "0%" : formatPct(r.holders.creatorPct)} />
          </dl>
          {r.dev.recent.length > 0 && (
            <ul className="vz-prior">
              {r.dev.recent.map((p) => (
                <li key={p.token}>
                  {onOpenToken ? (
                    <button type="button" className="vz-linkish" onClick={() => onOpenToken(p.token)}>
                      ${p.symbol}
                    </button>
                  ) : (
                    <a href={`/t/${p.token}`}>${p.symbol}</a>
                  )}
                  <span className="num">{formatAge(nowSec() - p.ts)} ago</span>
                  <span>{p.phase === "pool" ? "graduated" : p.phase === "curve" ? "on curve" : p.phase}</span>
                  <span className={p.creatorSold ? "vz-sold" : undefined}>{p.creatorSold == null ? "" : p.creatorSold ? "creator sold" : "creator held"}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <dl className="vz-values">
          <Value label="Deployer" value={shortAddress(r.creator)} />
          <Value label="Holds now" value={r.holders.creatorPct === 0 ? "0%" : formatPct(r.holders.creatorPct)} />
        </dl>
      )}
    </Section>
  );
}

const LABEL: Record<HolderLabel, string> = {
  creator: "creator",
  curve: "curve",
  pool: "pool",
  burn: "burn",
  launchpad: "locker",
  bundle: "bundle",
  sniper: "sniper",
};

function venue(r: TokenReport): string {
  if (!r.launch) return r.market?.source === "dexscreener" ? "Uniswap pool" : "no pool found";
  if (r.launch.graduatedBlock != null) return "Pons, graduated";
  return "Pons curve";
}

const trim = (v: number) => (v >= 1 ? v.toFixed(2) : v.toPrecision(2));

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="vz-section">
      <h3>
        {title}
        {note && <span className="vz-note">{note}</span>}
      </h3>
      {children}
    </section>
  );
}

// figures are set in the data mono; words ("the creator", "none") stay in the text face
const isFigure = (v: string) => /^(\$|0x|[0-9]|[0-9.]+%)/.test(v);

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={isFigure(value) ? "num" : undefined}>{value}</dd>
    </div>
  );
}

const MARK: Record<Flag["level"], string> = { danger: "High", warn: "Watch", info: "Note", good: "Clear" };
const ORDER: Flag["level"][] = ["danger", "warn", "info", "good"];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** The findings counted by level. A count of facts, not a score. */
function Tally({ flags }: { flags: Flag[] }) {
  const t = tallyFlags(flags);
  const word: Record<Flag["level"], [string, string]> = { danger: ["high", "high"], warn: ["watch", "watch"], info: ["note", "notes"], good: ["clear", "clear"] };
  return (
    <p className="vz-tally" aria-label="Findings by level">
      {ORDER.map((l) => (
        <span key={l} className={`tally-${l}${t[l] === 0 ? " tally-zero" : ""}`}>
          <b>{t[l]}</b> {word[l][t[l] === 1 ? 0 : 1]}
        </span>
      ))}
    </p>
  );
}

/** One line per finding, most serious first. When anything reads high or watch, notes and clear findings fold into
 *  one line under them; with nothing serious, the notes show and only clear findings fold. */
function Findings({ flags }: { flags: Flag[] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...flags].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));
  const serious = sorted.some((f) => f.level === "danger" || f.level === "warn");
  const folds = (f: Flag) => f.level === "good" || (serious && f.level === "info");
  const folded = open ? [] : sorted.filter(folds);
  const shown = folded.length === sorted.length ? sorted : sorted.filter((f) => !folded.includes(f));
  const hidden = shown === sorted ? [] : folded;
  const t = tallyFlags(hidden);
  const what = [t.info && `${t.info} ${t.info === 1 ? "note" : "notes"}`, t.good && `${t.good} clear`].filter(Boolean).join(", ");
  return (
    <section className="vz-section vz-findings-section" aria-label="Findings">
      <ul className="vz-findings">
        {flags.length === 0 && <li className="finding finding-info">Nothing stands out in what the chain shows.</li>}
        {shown.map((f, i) => (
          <li key={i} className={`finding finding-${f.level}`}>
            <span className="finding-mark" role="img" aria-label={MARK[f.level]} />
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
      {hidden.length > 0 && (
        <button type="button" className="vz-more" onClick={() => setOpen(true)} aria-expanded={false}>
          + {what}: {hidden.map((f) => f.text.charAt(0).toLowerCase() + f.text.slice(1)).join(", ")}
        </button>
      )}
    </section>
  );
}

/** Where the supply sits: contracts, flagged wallets, the creator, the rest of the top 10, everyone else. */
function Distribution({ report: r }: { report: TokenReport }) {
  const sum = { contract: 0, burn: 0, flagged: 0, creator: 0, top: 0 };
  let wallets = 0;
  for (const h of r.holders.top) {
    const l = h.labels;
    if (l.includes("curve") || l.includes("pool") || l.includes("launchpad")) sum.contract += h.pct;
    else if (l.includes("burn")) sum.burn += h.pct;
    else if (l.includes("creator")) sum.creator += h.pct;
    else if (l.includes("bundle") || l.includes("sniper")) sum.flagged += h.pct;
    else if (wallets++ < 10) sum.top += h.pct; // unlabelled wallets: only the ten biggest get their own colour
  }
  // the list stops at 20 holders; the bundle and sniper totals cover their smaller wallets too
  sum.flagged = Math.max(sum.flagged, (r.bundle?.holdPct ?? 0) + (r.snipers?.holdPct ?? 0));
  const rest = Math.max(0, 100 - sum.contract - sum.burn - sum.flagged - sum.creator - sum.top);
  const parts = [
    { key: "contract", label: r.launch && r.launch.graduatedBlock == null ? "Curve" : "Pools", pct: sum.contract },
    { key: "flagged", label: "Bundle and snipers", pct: sum.flagged },
    { key: "creator", label: "Creator", pct: sum.creator },
    { key: "top", label: "Other top 10", pct: sum.top },
    { key: "burn", label: "Burned", pct: sum.burn },
    { key: "rest", label: "Everyone else", pct: rest },
  ].filter((p) => p.pct >= 0.05);
  return (
    <figure className="vz-dist">
      <div className="vz-dist-bar" aria-hidden>
        {parts.map((p) => (
          <span key={p.key} className={`dist-${p.key}`} style={{ flexGrow: p.pct }} />
        ))}
      </div>
      <figcaption>
        {parts.map((p) => (
          <span key={p.key} className={`dist-${p.key}`}>
            <i aria-hidden />
            {p.label} <b>{formatPct(p.pct)}</b>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Copies a few lines of fact for a post, with the link to the report. */
export function CopySummary({ report, url }: { report: TokenReport; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-quiet"
      onClick={() => {
        navigator.clipboard
          .writeText(summaryText(report, url))
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {}); // clipboard blocked: nothing to undo
      }}
    >
      {copied ? <CheckIcon size={16} weight="bold" /> : <CopyIcon size={16} />}
      {copied ? "Copied" : "Copy summary"}
    </button>
  );
}

function Actions({ report, url, openFull }: { report: TokenReport; url: string; openFull?: boolean }) {
  return (
    <div className="vz-actions">
      <CopySummary report={report} url={url} />
      {openFull && (
        <a className="btn btn-quiet" href={url} target="_blank" rel="noreferrer">
          Open on vialz.xyz <ArrowUpRightIcon size={16} />
        </a>
      )}
    </div>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="vz-copy num"
      onClick={() => {
        navigator.clipboard
          .writeText(address)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          })
          .catch(() => {}); // clipboard blocked: the address is still on screen to select
      }}
      aria-label={copied ? "Address copied" : "Copy contract address"}
    >
      {shortAddress(address)}
      {copied ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={14} />}
    </button>
  );
}

/** The real host a link goes to, shown on hover, so a look-alike name cannot hide where it points. */
function hostOf(href: string): string {
  try {
    return new URL(href).hostname;
  } catch {
    return href;
  }
}

function Links({ links }: { links: TokenReport["links"] }) {
  const items = [
    links.x && { href: links.x, label: "X", icon: <XLogoIcon size={16} /> },
    links.telegram && { href: links.telegram, label: "Telegram", icon: <TelegramLogoIcon size={16} /> },
    links.website && { href: links.website, label: "Website", icon: <GlobeIcon size={16} /> },
  ].filter(Boolean) as { href: string; label: string; icon: ReactNode }[];
  if (items.length === 0) return null;
  return (
    <nav className="vz-links" aria-label="Project links">
      {items.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noreferrer nofollow" aria-label={`${l.label}: ${hostOf(l.href)}`} title={hostOf(l.href)}>
          {l.icon}
        </a>
      ))}
    </nav>
  );
}

function imageUrl(src: string | null, apiBase: string): string | null {
  // the API keeps only an IPFS content id, and images only ever load through its proxy: a token's own image URL
  // would tell its launcher who is checking the token and from where
  return src && /^(baf|Qm)[a-zA-Z0-9]+$/.test(src) ? `${apiBase}/v1/img/${src}` : null;
}

function TokenImage({ src, symbol, address, apiBase }: { src: string | null; symbol: string; address: string; apiBase: string }) {
  const [failed, setFailed] = useState(false);
  const url = imageUrl(src, apiBase);
  // no image: a tint taken from the address, so tokens without art still look apart
  const hue = parseInt(address.slice(2, 6), 16) % 360;
  return (
    <div className="vz-image" aria-hidden style={{ "--hue": hue } as CSSProperties}>
      {url && !failed ? <img src={url} alt="" width={44} height={44} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : symbol.slice(0, 1)}
    </div>
  );
}
