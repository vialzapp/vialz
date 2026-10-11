import { useEffect, useState } from "react";
import { CheckInput, FILL, Report, ReportError, ReportSkeleton, Vessel, useTokenReport } from "@vialz/ui";
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
  { key: "snipers", name: "Snipers", reads: "Buys in the launch block and the two after it, by anyone but the creator and the bundle.", scale: ["none", "hold under 3%", "hold 3%+", "hold 10%+"] },
  { key: "bundle", name: "Bundle", reads: "Wallets the creator declared exempt from the opening tax.", scale: ["none", "hold under 1%", "hold 1%+", "hold 5%+"] },
  { key: "holders", name: "Top 10", reads: "Supply in the ten largest wallets. The curve, pools and burn address are left out.", scale: ["under 15%", "15%+", "30%+", "50%+"] },
  { key: "linked", name: "Linked", reads: "Holders fed the token by one sender, or their first ETH by one funder.", scale: ["none", "a group under 3%", "a group 3%+", "a group 10%+"] },
  { key: "creator", name: "Creator", reads: "Every earlier Pons launch from the same wallet, and whether the creator sold early.", scale: ["under 10 launches", null, "10+ launches", "50+, or sold early"] },
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
    a: "Usually 3 to 15 seconds. Vialz reads the token's history from the chain on every check instead of keeping a stale copy. Tokens with millions of transfers show market data and skip the holder breakdown for now.",
  },
  {
    q: "Does it work on fomo, gmgn and X?",
    a: "Yes. Click the Vialz icon on a token page and that token is read straight away. On any other page, paste an address or a link.",
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
            <h1>Check any token before you buy it.</h1>
            <p className="lede">
              Paste a Robinhood Chain contract address. Vialz reads the token's whole history on chain and shows who really holds it.
            </p>
            <CheckInput size="l" onCheck={(a) => (a === checked ? mine.retry() : setChecked(a))} busy={mine.status === "loading"} />
            <ul className="hero-facts">
              <li>Free</li>
              <li>No wallet</li>
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
          <h1>Questions</h1>
          {FAQ.map((f) => (
            <section key={f.q} className="faq-item">
              <h2>{f.q}</h2>
              <p>{f.a}</p>
            </section>
          ))}
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
