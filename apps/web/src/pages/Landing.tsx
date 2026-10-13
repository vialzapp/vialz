import { useEffect, useRef, useState, type CSSProperties } from "react";
import { padsFor, type Pad, type TokenReport } from "@vialz/shared";
import { CheckInput, FILL, READ, Report, ReportError, ReportSkeleton, Vessel, useTokenReport, vesselTop } from "@vialz/ui";
import { Link, navigate, Out } from "../App";
import { ExtensionShowcase } from "../Showcase";
import { API_BASE, REPO_URL } from "../brand";

/** The busiest Pons launch of the last hour, read live: the page proves the product with a real token. */
function useLiveExample() {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/v1/latest`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { token: string }) => setToken(j.token))
      .catch(() => setFailed(true));
  }, []);
  return { token, failed, state: useTokenReport(API_BASE, token) };
}

// the reference ranges, as on a lab sheet: what each check reads, and the reading at each level
type Scale = [clear: string | null, note: string | null, watch: string | null, high: string | null];
const CHECKS: { key: string; name: string; reads: string; scale: Scale }[] = [
  { key: "snipers", name: "Snipers", reads: "Buys in the first 3 seconds after launch, by anyone but the creator and the bundle.", scale: ["none", "hold under 3%", "hold 3%+", "hold 10%+"] },
  { key: "bundle", name: "Bundle", reads: "Wallets the creator declared exempt from the opening tax.", scale: ["none", "hold under 1%", "hold 1%+", "hold 5%+"] },
  { key: "holders", name: "Top 10", reads: "Supply in the ten largest wallets. The curve, pools and burn address are left out.", scale: ["under 15%", "15%+", "30%+", "50%+"] },
  { key: "linked", name: "Linked", reads: "Holders who got the token straight from one wallet, three or more of them still holding.", scale: ["none", "a group under 3%", "a group 3%+", "a group 10%+"] },
  { key: "creator", name: "Creator", reads: "Every earlier Pons launch from the same wallet, and whether the creator sold early.", scale: ["2 to 9 launches", "first launch", "10+ launches", "50+, or sold early"] },
  { key: "volume", name: "Volume", reads: "Curve volume made by the five busiest wallets, and wallets that keep flipping.", scale: ["spread out", "under 30 trades", "5 wallets make 60%+", null] },
];
const LEVELS = [
  ["good", "Clear"],
  ["info", "Note"],
  ["warn", "Watch"],
  ["danger", "High"],
] as const;

const FAQ = [
  {
    q: "Which tokens can it read?",
    a: "Any token on Robinhood Chain. Pons launches also get the launch section: curve progress, dev buy, declared bundle, snipers and the creator's record.",
  },
  {
    q: "How long does a check take?",
    a: "Usually a few seconds: the token's name and numbers show first, the readings follow. The first check of a token with a long history can take up to 15 seconds. Vialz reads the chain on every check instead of keeping a stale copy. A busy token with hundreds of thousands of transfers gets its holders from Blockscout's index and skips linked wallets and volume.",
  },
  {
    q: "Which pages does it read by itself?",
    a: "Token pages on gmgn, fomo, DexScreener and the block explorer: click the Vialz icon and that token is read straight away. Anywhere else, paste the address.",
  },
  {
    q: "Does it need my wallet?",
    a: "No. Vialz only reads public chain data. It never asks for a wallet, a signature or an account.",
  },
  {
    q: "Are clear vials a reason to buy?",
    a: "No. The vials show how a token was launched and who holds it. They can be wrong, late or incomplete, and say nothing certain about price.",
  },
  {
    q: "Can I check the code?",
    a: "Yes. The API, this site and the extension are open source under the MIT license, and the docs explain how every reading is computed.",
  },
];

// The marks on each vial's glass: where a reading turns note, watch and high. The same thresholds the vials use.
const RACK: { key: Pad["key"]; label: string; marks: [note: string | null, watch: string | null, high: string | null] }[] = [
  { key: "snipers", label: "Snipers", marks: ["<3%", "3%", "10%"] },
  { key: "bundle", label: "Bundle", marks: ["<1%", "1%", "5%"] },
  { key: "holders", label: "Top 10", marks: ["15%", "30%", "50%"] },
  { key: "linked", label: "Linked", marks: ["<3%", "3%", "10%"] },
  { key: "creator", label: "Creator", marks: ["1st", "10", "50"] },
  { key: "volume", label: "Top 5 vol", marks: ["<30 tx", "60%", null] },
];
const MARK_LEVELS = [FILL.info, FILL.warn, FILL.danger];

/** The six vials at full size, graduated like lab glass, filled once when they come into view. */
function Rack({ report, title, caption, more = true }: { report: TokenReport | null; title: string; caption: string; more?: boolean }) {
  const pads = report ? padsFor(report) : null;
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section className="rack-band" aria-label="The six vials">
      <div className="wrap rack-grid">
        <div className="rack-head">
          <h2>{title}</h2>
          <p>
            {caption} The marks on the glass are the thresholds: the further a reading goes, the higher the vial fills.
          </p>
          {more && (
            <Link href="/how" className="text-link">
              How each one reads
            </Link>
          )}
        </div>
        <div ref={ref} className={`rack${seen && pads ? " rack-on" : ""}`} role="list">
          {RACK.map(({ key, label, marks }, i) => {
            const p = pads?.find((x) => x.key === key);
            const level = p?.level ?? "none";
            return (
              <div
                key={key}
                role="listitem"
                className={`rack-cell pad-${level}`}
                style={{ "--i": i } as CSSProperties}
                aria-label={p ? `${p.label}: ${READ[level]}, ${p.reading}` : label}
              >
                <div className="rack-glass">
                  <Vessel className="rack-vial" level={FILL[level]} fill="var(--pad)" glass="var(--glass)" surface="var(--surface)" stroke={13} ticks={MARK_LEVELS.slice(0, 2)} />
                  {marks.map((m, j) =>
                    m ? (
                      <span key={j} className="rack-mark" style={{ top: `${vesselTop(MARK_LEVELS[j]!) * 100}%` }} aria-hidden>
                        {m}
                      </span>
                    ) : null,
                  )}
                </div>
                <b className="rack-label">{p?.label ?? label}</b>
                <span className="rack-reading">{p?.short ?? "…"}</span>
                <span className="rack-level">{p ? READ[level] : "reading"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Landing() {
  const live = useLiveExample();
  const r = live.state.status === "ready" ? live.state.report : null;
  // a token checked from the field reads right here, in place of the live example; the full page is one link away
  const [checked, setChecked] = useState<string | null>(null);
  const mine = useTokenReport(API_BASE, checked);

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1>Read the chain before you ape.</h1>
            <p className="lede">Snipers, the bundle, top holders and the dev's own bag, read live from Robinhood Chain.</p>
            <CheckInput size="l" onCheck={(a) => (a === checked ? mine.retry() : setChecked(a))} busy={mine.status === "loading"} />
            <ul className="hero-facts">
              <li>Free</li>
              <li>Never asks for a wallet</li>
              <li>
                <Out href={REPO_URL}>Open source</Out>
              </li>
            </ul>
          </div>

          <div className="hero-live" aria-live="polite">
            <ExtensionShowcase
              address={checked ?? r?.address ?? live.token}
              title={
                <>
                  <b>{checked ? (mine.status === "ready" ? `$${mine.report.symbol}` : "Your token") : r ? `$${r.symbol}` : "Reading"}</b>
                  <small>{checked ? "your check, read from the chain" : "the busiest Pons launch this hour"}</small>
                  {checked && (
                    <button type="button" className="hero-live-back" onClick={() => setChecked(null)}>
                      Show the live launch
                    </button>
                  )}
                </>
              }
            >
              {checked ? (
                mine.status === "ready" ? (
                  <Report report={mine.report} compact={{ href: `/t/${mine.report.address}` }} apiBase={API_BASE} />
                ) : mine.status === "error" ? (
                  <ReportError message={mine.message} onRetry={mine.retry} quiet={mine.notFound} />
                ) : (
                  <ReportSkeleton quick={mine.status === "loading" ? mine.quick : undefined} apiBase={API_BASE} />
                )
              ) : r ? (
                <Report report={r} compact={{ href: `/t/${r.address}` }} apiBase={API_BASE} />
              ) : live.failed || live.state.status === "error" ? (
                <ReportError message={live.state.status === "error" ? live.state.message : "No live example right now. Paste any address on the left."} />
              ) : (
                <ReportSkeleton note="Reading it from the chain." quick={live.state.status === "loading" ? live.state.quick : undefined} apiBase={API_BASE} />
              )}
            </ExtensionShowcase>
          </div>
        </div>
      </section>
    </>
  );
}

/** What each of the six vials reads, at each level. */
export function HowItReads() {
  const live = useLiveExample();
  const r = live.state.status === "ready" ? live.state.report : null;
  return (
    <div className="page">
      <section className="band band-ranges" id="vials">
        <div className="wrap">
          <div className="ranges-head">
            <h1>What the six vials read.</h1>
            <p>
              Each vial fills with the colour of its reading, and the stronger the reading, the fuller it gets: a high reading fills it to the
              brim. They state what the chain shows, never a verdict.
            </p>
          </div>
          <Rack
            report={r}
            more={false}
            title={r ? `$${r.symbol}, read just now.` : "A live launch, read now."}
            caption={
              r
                ? "The busiest Pons launch this hour, straight from the chain."
                : live.failed
                  ? "No live launch to show right now."
                  : "The busiest Pons launch this hour is being read."
            }
          />
          <div className="ranges" role="table" aria-label="What each vial reads at each level">
            <div className="ranges-row ranges-th" role="row">
              <span role="columnheader">Vial</span>
              <span role="columnheader">Reads</span>
              {LEVELS.map(([level, name]) => (
                <span role="columnheader" key={level} className={`ranges-level pad-${level}`}>
                  <Vessel level={FILL[level]} fill="var(--pad)" glass="var(--glass)" surface="var(--surface)" stroke={18} className="ranges-vial" />
                  {name}
                </span>
              ))}
            </div>
            {CHECKS.map((c) => (
              <div role="row" key={c.key} className="ranges-row">
                <span role="rowheader" className="ranges-name">
                  {c.name}
                </span>
                <span role="cell" className="ranges-reads">
                  {c.reads}
                </span>
                {c.scale.map((v, i) => (
                  <span role="cell" key={i} className={`ranges-cell pad-${LEVELS[i]![0]}${v ? "" : " ranges-cell-empty"}`} data-level={LEVELS[i]![1]}>
                    {v ?? "n/a"}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="ranges-more">
            Exact rules for every reading are in the <Link href="/docs#method">docs</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}

/** Short answers to what people ask first. */
export function FaqPage() {
  return (
    <div className="page">
      <section className="band band-faq" id="faq">
        <div className="wrap faq">
          <div className="faq-head">
            <h1>Questions</h1>
            <p>
              Anything else: ask <Out href="https://x.com/vialzapp">@vialzapp</Out> on X, or read how every reading is worked out in the{" "}
              <Link href="/docs">docs</Link>.
            </p>
          </div>
          <div className="faq-list">
            {FAQ.map((f) => (
              <section key={f.q} className="faq-item">
                <h2>{f.q}</h2>
                <p>{f.a}</p>
              </section>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/** The full report, straight away: paste an address, or read the busiest launch of the last hour in full. */
export function FullReportPage() {
  const live = useLiveExample();
  const r = live.state.status === "ready" ? live.state.report : null;
  return (
    <div className="page page-report">
      <div className="wrap">
        <div className="report-head">
          <h1>Full report.</h1>
          <p>Every reading on one page: the vials and findings, market, launch, holders, linked wallets and the creator's record.</p>
        </div>
        <CheckInput size="l" onCheck={(a) => navigate(`/t/${a}`)} label="Contract address or link" />
        <p className="report-live-label" role="status">
          {r ? `Read just now: $${r.symbol}, the busiest Pons launch of the last hour` : "Reading the busiest Pons launch of the last hour"}
        </p>
        {r ? (
          <Report report={r} onOpenToken={(a) => navigate(`/t/${a}`)} apiBase={API_BASE} />
        ) : live.failed || live.state.status === "error" ? (
          <ReportError message={live.state.status === "error" ? live.state.message : "No live example right now. Paste any address above."} />
        ) : (
          <ReportSkeleton quick={live.state.status === "loading" ? live.state.quick : undefined} apiBase={API_BASE} />
        )}
      </div>
    </div>
  );
}
