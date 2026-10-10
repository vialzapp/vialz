import { useEffect, useState, type CSSProperties } from "react";
import { CheckInput, Report, ReportError, ReportSkeleton, Vessel, useTokenReport } from "@vialz/ui";
import { navigate } from "../App";
import { API_BASE, CHROME_URL } from "../brand";

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

// the hero rack: five samples, one of them is the rug
const RACK = [0.55, 0.3, 0.7, 0.62, 0.45];
const RUG = 3;

const READINGS = [
  {
    pad: "Snipers",
    reads: "Buys in the launch block and the two blocks after it, by anyone except the creator.",
    high: "Snipers still hold 10% or more of supply.",
  },
  {
    pad: "Bundle",
    reads: "Wallets the creator declared exempt from the opening tax when launching.",
    high: "Those wallets still hold 5% or more.",
  },
  {
    pad: "Top 10",
    reads: "Share of supply in the ten largest wallets. The curve, pools and burn address are left out.",
    high: "The ten wallets hold 50% or more.",
  },
  {
    pad: "Linked",
    reads: "Holders who got the token from one sender, or their first ETH from one funder.",
    high: "One linked group holds 10% or more.",
  },
  {
    pad: "Creator",
    reads: "Every earlier Pons launch from the same wallet: how many, how many graduated, whether the creator sold early.",
    high: "50 or more launches, or early selling in half of the recent ones.",
  },
  {
    pad: "Volume",
    reads: "How much curve volume comes from the five busiest wallets, and wallets that keep flipping.",
    high: "Marked watch when five wallets make 60% of volume.",
  },
];

const LEGEND = [
  { name: "clear", level: "good", fill: 0.5 },
  { name: "note", level: "info", fill: 0.62 },
  { name: "watch", level: "warn", fill: 0.78 },
  { name: "high", level: "danger", fill: 0.95 },
];

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
    a: "Yes. The extension opens next to any site. Paste the address, or press Check this page when the address is in the page's link.",
  },
  {
    q: "Does it need my wallet?",
    a: "No. Vialz only reads public chain data. It never asks for a wallet, a signature or an account.",
  },
  {
    q: "Are clear vials a reason to buy?",
    a: "No. The vials show how a token was launched and who holds it. It can be wrong, late or incomplete, and it says nothing certain about price.",
  },
];

export function Landing() {
  const live = useLiveExample();
  const r = live.state.status === "ready" ? live.state.report : null;

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1>Test any Robinhood Chain token before you buy it.</h1>
            <p className="lede">Paste a contract address. Vialz reads the token's whole history on chain and shows who really holds it.</p>
            <CheckInput size="l" onCheck={(a) => navigate(`/t/${a}`)} />
          </div>

          <div className="hero-rack" aria-hidden>
            {RACK.map((level, i) => (
              <Vessel
                key={i}
                className={i === RUG ? "rack-vial rack-rug" : "rack-vial"}
                level={level}
                fill={i === RUG ? "var(--signal)" : "var(--ink)"}
                glass={i === RUG ? "var(--signal)" : "var(--ink)"}
                style={{ "--i": i } as CSSProperties}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="band" id="extension">
        <div className="wrap split">
          <div className="split-copy">
            <h2>Beside the chart, not in another tab.</h2>
            <p>
              The extension opens right next to the page you are on. On fomo, gmgn or X, paste the address you are looking at and the full report sits
              beside the chart while you decide.
            </p>
            <p>The extension keeps your recent checks on your device. There is nothing to sign in to.</p>
            <a className="btn btn-act" href={CHROME_URL}>
              Add to Chrome
            </a>
          </div>
          <div className="panel-frame" aria-label="The report as it appears in the extension">
            {r ? (
              <Report report={r} />
            ) : live.state.status === "error" ? (
              <ReportError message={live.state.message} />
            ) : (
              <ReportSkeleton />
            )}
          </div>
        </div>
      </section>

      <section className="band" id="reads">
        <div className="wrap">
          <div className="reads-head">
            <h2>Six vials for every token.</h2>
            <div className="legend" aria-label="How a vial reads">
              {LEGEND.map((l) => (
                <span key={l.name} className={`pad-${l.level}`}>
                  <Vessel level={l.fill} fill="var(--pad)" glass="var(--ink-3)" className="legend-vial" /> {l.name}
                </span>
              ))}
            </div>
          </div>
          <div className="reads-table" role="table" aria-label="What each pad reads">
            <div className="reads-row reads-th" role="row">
              <span role="columnheader">Vial</span>
              <span role="columnheader">What Vialz reads</span>
              <span role="columnheader">Marked high when</span>
            </div>
            {READINGS.map((x) => (
              <div className="reads-row" role="row" key={x.pad}>
                <span role="rowheader" className="reads-pad">
                  {x.pad}
                </span>
                <span role="cell">{x.reads}</span>
                <span role="cell" className="reads-high">
                  {x.high}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band" id="chain">
        <div className="wrap chain">
          <div>
            <h2>Straight from the chain.</h2>
            <p>
              Every number comes from Robinhood Chain itself: the token's transfers, the trades on its Pons curve and the launchpad's own records. Market data
              for tokens already trading on Uniswap comes from DexScreener.
            </p>
          </div>
          <dl className="chain-facts">
            <div>
              <dt>Read only</dt>
              <dd>No wallet connection, no signatures. Vialz can look, never touch.</dd>
            </div>
            <div>
              <dt>Facts, not verdicts</dt>
              <dd>It says 87 wallets funded from one address hold 64%. It does not call anything a scam.</dd>
            </div>
            <div>
              <dt>Fresh on every check</dt>
              <dd>Each report is read at the current block and shows which block it came from.</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="band" id="faq">
        <div className="wrap faq">
          <h2>Questions</h2>
          <div>
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
