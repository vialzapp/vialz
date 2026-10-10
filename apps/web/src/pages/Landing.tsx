import { useEffect, useRef, useState } from "react";
import { CheckInput, Report, ReportError, ReportSkeleton, Vessel, useTokenReport } from "@vialz/ui";
import { Link, navigate } from "../App";
import { API_BASE, CHROME_LABEL, CHROME_URL, REPO_URL } from "../brand";
import { Code } from "./Docs";

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

/** Adds `in-view` once the element scrolls in. Without JS nothing is armed and the content simply shows. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    el.classList.add("armed");
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          el.classList.add("in-view");
          io.disconnect();
        }
      },
      // the grid is taller than a phone screen, so trigger on the first quarter scrolled into view, not a share of the grid
      { threshold: 0, rootMargin: "0px 0px -25% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

// each vial is shown at a different reading, so the grid also teaches the scale
const VIALS = [
  { name: "Snipers", level: "good", fill: 0.62, reads: "Buys in the launch block and the two after it, by anyone but the creator.", high: "they still hold 10% or more" },
  { name: "Bundle", level: "info", fill: 0.72, reads: "Wallets the creator declared exempt from the opening tax.", high: "they still hold 5% or more" },
  { name: "Top 10", level: "warn", fill: 0.84, reads: "Supply in the ten largest wallets, contracts left out.", high: "they hold 50% or more" },
  { name: "Linked", level: "danger", fill: 0.96, reads: "Holders fed by one sender, or funded by one wallet.", high: "one group holds 10% or more" },
  { name: "Creator", level: "warn", fill: 0.84, reads: "Every earlier Pons launch from the same wallet, and how it ended.", high: "50+ launches, or early selling" },
  { name: "Volume", level: "good", fill: 0.62, reads: "Volume made by the five busiest wallets, and wallets that flip.", high: "five wallets make 60% of it" },
];

const LEGEND = [
  { name: "clear", level: "good", fill: 0.62 },
  { name: "note", level: "info", fill: 0.72 },
  { name: "watch", level: "warn", fill: 0.84 },
  { name: "high", level: "danger", fill: 0.96 },
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
  const grid = useReveal<HTMLDivElement>();

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1>Test any Robinhood Chain token before you buy it.</h1>
            <p className="lede">Paste a contract address. Vialz reads the token's whole history on chain and shows who really holds it.</p>
            <CheckInput size="l" onCheck={(a) => navigate(`/t/${a}`)} />
            <ul className="hero-facts">
              <li>Free</li>
              <li>Read only, no wallet</li>
              <li>
                <a href={REPO_URL}>Open source</a>
              </li>
            </ul>
          </div>

          <div className="hero-live" aria-live="polite">
            <p className="hero-live-label">Live reading of the busiest Pons launch in the last hour</p>
            {r ? (
              <Report report={r} compact={{ href: `/t/${r.address}` }} apiBase={API_BASE} />
            ) : live.failed || live.state.status === "error" ? (
              <ReportError message={live.state.status === "error" ? live.state.message : "No live example right now. Paste any address on the left."} />
            ) : (
              <ReportSkeleton note="Reading the busiest Pons launch of the last hour from the chain." />
            )}
          </div>
        </div>
      </section>

      <section className="band" id="vials">
        <div className="wrap">
          <div className="vials-head">
            <h2>Six vials. One look.</h2>
            <p>
              Every report opens with six vials, one per check. Each fills with the colour of its reading, and the stronger the reading, the
              fuller the vial.
            </p>
            <div className="legend" aria-label="How a vial reads">
              {LEGEND.map((l) => (
                <span key={l.name} className={`pad-${l.level}`}>
                  <Vessel level={l.fill} fill="var(--pad)" glass="var(--ink-3)" className="legend-vial" /> {l.name}
                </span>
              ))}
            </div>
          </div>
          <div className="vial-grid" ref={grid}>
            {VIALS.map((v, i) => (
              <article key={v.name} className={`vial-cell pad-${v.level}`} style={{ "--i": i } as React.CSSProperties}>
                <Vessel level={v.fill} fill="var(--pad)" glass="var(--ink-2)" stroke={22} className="vial-big" />
                <h3>{v.name}</h3>
                <p>{v.reads}</p>
                <p className="vial-high">High when {v.high}.</p>
              </article>
            ))}
          </div>
          <p className="vials-more">
            The exact rules, and how each check is computed, are in the <Link href="/docs#method">docs</Link>.
          </p>
        </div>
      </section>

      <section className="band" id="extension">
        <div className="wrap split">
          <div className="split-copy">
            <h2>Beside the chart, not in another tab.</h2>
            <p>
              The extension opens right next to the page you are on. On fomo, gmgn or X, paste the address you are looking at, or press Check this
              page, and the full report sits beside the chart while you decide.
            </p>
            <p>Your recent checks stay on your device. There is nothing to sign in to.</p>
            <Link className="btn btn-act" href={CHROME_URL}>
              {CHROME_LABEL}
            </Link>
          </div>
          <div className="panel-frame" aria-label="The full report, as the extension shows it">
            {r ? <Report report={r} apiBase={API_BASE} /> : live.state.status === "error" ? <ReportError message={live.state.message} /> : <ReportSkeleton />}
          </div>
        </div>
      </section>

      <section className="band band-sheet" id="open">
        <div className="wrap open">
          <div>
            <h2>Every line is public.</h2>
            <p>
              The API that reads the chain, this site and the extension are open source under the MIT license. Read how each check works, run your
              own copy, or build the extension yourself and compare.
            </p>
            <ul className="open-links">
              <li>
                <a href={REPO_URL}>github.com/vialzapp/vialz</a>
              </li>
              <li>
                <Link href="/docs#method">How each check works</Link>
              </li>
              <li>
                <Link href="/docs#security">Report a vulnerability</Link>
              </li>
            </ul>
          </div>
          <Code>{`git clone ${REPO_URL}.git
cd vialz && npm install
npm run dev:api     # reads the chain on :8787
npm run dev:web     # this site on :5180`}</Code>
        </div>
      </section>

      <section className="band" id="chain">
        <div className="wrap">
          <h2 className="chain-title">Straight from the chain.</h2>
          <dl className="principles">
            <div>
              <dt>Read only</dt>
              <dd>No wallet connection and no signatures. Vialz can look, never touch.</dd>
            </div>
            <div>
              <dt>Facts, not verdicts</dt>
              <dd>It says 87 wallets funded from one address hold 64%. It never calls a token a scam; that call is yours.</dd>
            </div>
            <div>
              <dt>Fresh on every check</dt>
              <dd>Each report is read at the current block from Robinhood Chain itself, and says which block.</dd>
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

      <section className="band final">
        <div className="wrap final-inner">
          <Vessel level={0.5} className="final-mark" />
          <h2>Check it before you ape in.</h2>
          <CheckInput size="l" label="Contract address or link" onCheck={(a) => navigate(`/t/${a}`)} />
        </div>
      </section>
    </>
  );
}
