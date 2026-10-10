import { useEffect, useState } from "react";
import { padsFor, type Pad } from "@vialz/shared";
import { CheckInput, Report, ReportError, ReportSkeleton, Vessel, useTokenReport } from "@vialz/ui";
import { Link, navigate } from "../App";
import { API_BASE, CHROME_LABEL, CHROME_URL, REPO_URL } from "../brand";

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

const LEVEL_FILL: Record<Pad["level"], number> = { good: 0.62, info: 0.72, warn: 0.84, danger: 0.96, none: 0 };

// the reference ranges, as on a lab sheet: what each check reads and when it reads high
const CHECKS: { key: Pad["key"]; name: string; reads: string; high: string }[] = [
  { key: "snipers", name: "Snipers", reads: "Buys in the launch block and the two after it, by anyone but the creator and the bundle.", high: "hold 10% or more" },
  { key: "bundle", name: "Bundle", reads: "Wallets the creator declared exempt from the opening tax.", high: "hold 5% or more" },
  { key: "holders", name: "Top 10", reads: "Supply in the ten largest wallets. The curve, pools and burn address are left out.", high: "50% or more" },
  { key: "linked", name: "Linked", reads: "Holders fed the token by one sender, or their first ETH by one funder.", high: "one group holds 10% or more" },
  { key: "creator", name: "Creator", reads: "Every earlier Pons launch from the same wallet, and whether the creator sold early.", high: "50+ launches, or sold early in half" },
  { key: "volume", name: "Volume", reads: "Curve volume made by the five busiest wallets, and wallets that keep flipping.", high: "5 wallets make 60% (watch)" },
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
    a: "Yes. The extension opens next to any site. Paste the address, or press Check this page when the address is in the link of the tab you opened it on.",
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
  const pads = r ? padsFor(r) : null;

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1>Check any token before you buy it.</h1>
            <p className="lede">
              Paste a Robinhood Chain contract address. Vialz reads the token's whole history on chain and shows who really holds it.
            </p>
            <CheckInput size="l" onCheck={(a) => navigate(`/t/${a}`)} />
            <ul className="hero-facts">
              <li>Free</li>
              <li>No wallet</li>
              <li>
                <a href={REPO_URL}>Open source</a>
              </li>
            </ul>
          </div>

          <div className="hero-live">
            <p className="hero-live-label" role="status">
              {r ? `Read just now: $${r.symbol}, the busiest Pons launch of the last hour` : "Reading the busiest Pons launch of the last hour"}
            </p>
            {r ? (
              <Report report={r} compact={{ href: `/t/${r.address}` }} apiBase={API_BASE} />
            ) : live.failed || live.state.status === "error" ? (
              <ReportError message={live.state.status === "error" ? live.state.message : "No live example right now. Paste any address on the left."} />
            ) : (
              <ReportSkeleton note="Reading it from the chain." />
            )}
          </div>
        </div>
      </section>

      <section className="band band-ranges" id="vials">
        <div className="wrap">
          <div className="ranges-head">
            <h2>What the six vials read.</h2>
            <p>
              Each vial fills with the colour of its reading: clear, note, watch or high. They state what the chain shows, never a verdict.
              {r && ` The vials below are $${r.symbol}, read a moment ago.`}
            </p>
          </div>
          <div className="ranges" role="table" aria-label="Reference ranges">
            <div className="ranges-row ranges-th" role="row">
              <span role="columnheader">Vial</span>
              <span role="columnheader">Reads</span>
              <span role="columnheader">High when</span>
            </div>
            {CHECKS.map((c) => {
              const pad = pads?.find((p) => p.key === c.key);
              const level = pad?.level ?? "none";
              return (
                <div role="row" key={c.key} className={`ranges-row pad-${level}`}>
                  <span role="rowheader" className="ranges-name">
                    <Vessel level={LEVEL_FILL[level]} fill="var(--pad)" glass="var(--ink-3)" className="ranges-vial" />
                    <b>{c.name}</b>
                    {pad && <span className="num ranges-reading">{pad.reading}</span>}
                  </span>
                  <span role="cell">{c.reads}</span>
                  <span role="cell" className="num ranges-high">
                    {c.high}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="ranges-more">
            Exact rules for every reading are in the <Link href="/docs#method">docs</Link>.
          </p>
        </div>
      </section>

      <section className="band band-extension" id="extension">
        <div className="wrap extension">
          <h2>Opens next to the chart.</h2>
          <div>
            <p>
              On fomo, gmgn or X, open the extension, paste the address you are looking at or press Check this page, and the full report sits beside
              the chart while you decide. Your recent checks stay on your device.
            </p>
            <Link className="text-link" href={CHROME_URL}>
              {CHROME_LABEL}
            </Link>
          </div>
        </div>
      </section>

      <section className="band band-faq" id="faq">
        <div className="wrap faq">
          <h2>Questions</h2>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="band band-final">
        <div className="wrap final">
          <h2>Check it before you ape in.</h2>
          <CheckInput size="l" label="Contract address or link" onCheck={(a) => navigate(`/t/${a}`)} />
        </div>
      </section>
    </>
  );
}
