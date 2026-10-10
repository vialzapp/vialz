import { useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon, GlobeIcon, TelegramLogoIcon, XLogoIcon } from "@phosphor-icons/react";
import {
  explorerAddress,
  formatAge,
  formatPct,
  formatSmall,
  formatUsd,
  padsFor,
  shortAddress,
  type Flag,
  type HolderLabel,
  type TokenReport,
} from "@vialz/shared";
import { Strip } from "./Strip";

interface Props {
  report: TokenReport;
  /** where the API lives; token images are proxied through it */
  apiBase?: string;
  /** open another token's report inside the same surface (creator's earlier launches) */
  onOpenToken?: (address: string) => void;
}

const nowSec = () => Math.floor(Date.now() / 1000);

export function Report({ report: r, onOpenToken, apiBase = "" }: Props) {
  const age = r.createdAt != null ? nowSec() - r.createdAt : null;
  const quote = r.launch?.quote.symbol ?? "ETH";

  return (
    <article className="vz-report" aria-label={`Vialz of ${r.name}`}>
      <header className="vz-head">
        <TokenImage src={r.links.image} symbol={r.symbol} apiBase={apiBase} />
        <div className="vz-title">
          <h2>
            {r.name} <span className="vz-ticker">${r.symbol}</span>
          </h2>
          <div className="vz-meta">
            <CopyAddress address={r.address} />
            <span>{age != null ? `${formatAge(age)} old` : "age unknown"}</span>
            <span>{venue(r)}</span>
          </div>
        </div>
        <Links links={r.links} />
      </header>

      <Strip pads={padsFor(r)} />

      <Section title="Findings">
        <ul className="vz-findings">
          {r.flags.length === 0 && <li className="finding finding-info">Nothing stands out in what the chain shows.</li>}
          {r.flags.map((f, i) => (
            <Finding key={i} flag={f} />
          ))}
        </ul>
      </Section>

      {r.market && (
        <Section title="Market" note={r.market.source === "curve" ? "From curve trades on chain" : "Pool data from DexScreener"}>
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
      )}

      {r.launch && (
        <Section title="Launch" note="Pons">
          <div className="vz-progress" role="img" aria-label={`Curve ${Math.round(r.launch.progressPct)}% to graduation`}>
            <div className="vz-progress-bar">
              <span style={{ width: `${Math.max(1, r.launch.progressPct)}%` }} />
            </div>
            <span className="num">
              {r.launch.graduatedBlock != null ? "graduated to Uniswap" : `${r.launch.progressPct.toFixed(1)}% to graduation`}
            </span>
          </div>
          <dl className="vz-values">
            <Value label="Paired with" value={quote} />
            <Value label="Dev buy" value={r.launch.devBuy ? `${trim(r.launch.devBuy)} ${quote}` : "none"} />
            <Value label="Creator tax" value={r.launch.creatorTaxBps != null ? `${(r.launch.creatorTaxBps / 100).toFixed(1)}%` : "n/a"} />
            <Value label="Snipers took" value={r.snipers ? (r.snipers.wallets ? `${formatPct(r.snipers.boughtPct)} in ${r.snipers.wallets} wallets` : "none") : "n/a"} />
            <Value label="Bundle" value={r.launch.bundle.length ? `${r.launch.bundle.length} wallets, ${formatPct(r.bundle?.holdPct)} held` : "none"} />
            <Value
              label="Fees go to"
              value={r.launch.feeRecipient ? (r.launch.feeRecipient === r.creator ? "the creator" : shortAddress(r.launch.feeRecipient)) : "n/a"}
            />
          </dl>
        </Section>
      )}

      <Section title="Holders" note={`${r.holders.count.toLocaleString("en-US")} wallets`}>
        <ol className="vz-holders">
          {r.holders.top.slice(0, 10).map((h, i, top) => (
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

      {r.creator && (
        <Section title="Creator" note={shortAddress(r.creator)}>
          {r.dev ? (
            <>
              <dl className="vz-values">
                <Value label="Pons launches" value={r.dev.launches.toLocaleString("en-US")} />
                <Value label="Graduated" value={`${r.dev.graduated}`} />
                <Value label="Sold early" value={r.dev.checked ? `${r.dev.sold} of last ${r.dev.checked}` : "no earlier launches"} />
                <Value label="Holds now" value={formatPct(r.holders.creatorPct)} />
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
                      <span className={p.creatorSold ? "vz-sold" : undefined}>
                        {p.creatorSold == null ? "" : p.creatorSold ? "creator sold" : "creator held"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <dl className="vz-values">
              <Value label="Deployer" value={shortAddress(r.creator)} />
              <Value label="Holds now" value={formatPct(r.holders.creatorPct)} />
            </dl>
          )}
        </Section>
      )}

      <footer className="vz-footer">
        <span>
          Read from block <span className="num">{r.head.toLocaleString("en-US")}</span> in {(r.tookMs / 1000).toFixed(1)}s.
        </span>
        <span>Facts from the chain, not advice.</span>
      </footer>
    </article>
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

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}

const MARK: Record<Flag["level"], string> = { danger: "High", warn: "Watch", info: "Note", good: "Clear" };

function Finding({ flag }: { flag: Flag }) {
  return (
    <li className={`finding finding-${flag.level}`}>
      <span className="finding-mark">{MARK[flag.level]}</span>
      <span>{flag.text}</span>
    </li>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="vz-copy num"
      onClick={() => {
        void navigator.clipboard.writeText(address).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      aria-label={copied ? "Address copied" : "Copy contract address"}
    >
      {shortAddress(address)}
      {copied ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={14} />}
    </button>
  );
}

function Links({ links }: { links: TokenReport["links"] }) {
  const items = [
    links.x && { href: normalizeUrl(links.x), label: "X", icon: <XLogoIcon size={16} /> },
    links.telegram && { href: normalizeUrl(links.telegram), label: "Telegram", icon: <TelegramLogoIcon size={16} /> },
    links.website && { href: normalizeUrl(links.website), label: "Website", icon: <GlobeIcon size={16} /> },
  ].filter(Boolean) as { href: string; label: string; icon: ReactNode }[];
  if (items.length === 0) return null;
  return (
    <nav className="vz-links" aria-label="Project links">
      {items.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noreferrer nofollow" aria-label={l.label} title={l.href}>
          {l.icon}
        </a>
      ))}
    </nav>
  );
}

function normalizeUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("@")) return `https://x.com/${u.slice(1)}`;
  return `https://${u}`;
}

function imageUrl(src: string | null, apiBase: string): string | null {
  if (!src) return null;
  const cid = src.replace(/^ipfs:\/\//, "").replace(/^https?:\/\/[^/]+\/ipfs\//, "").split(/[/?#]/)[0] ?? "";
  if (/^(baf|Qm)[a-zA-Z0-9]+$/.test(cid)) return `${apiBase}/v1/img/${cid}`;
  return /^https:\/\//.test(src) ? src : null;
}

function TokenImage({ src, symbol, apiBase }: { src: string | null; symbol: string; apiBase: string }) {
  const [failed, setFailed] = useState(false);
  const url = imageUrl(src, apiBase);
  return (
    <div className="vz-image" aria-hidden>
      {url && !failed ? <img src={url} alt="" width={44} height={44} loading="lazy" onError={() => setFailed(true)} /> : symbol.slice(0, 1)}
    </div>
  );
}
