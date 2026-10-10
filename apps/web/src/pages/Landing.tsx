import { useEffect, useState } from "react";
import { CheckInput, FILL, Report, ReportError, ReportSkeleton, Vessel, useTokenReport } from "@vialz/ui";
import { Link, navigate, Out } from "../App";
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
                <Out href={REPO_URL}>Open source</Out>
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

      <section className="band band-extension" id="extension">
        <div className="wrap extension">
          <h2>One click from the toolbar.</h2>
          <div>
            <p>
              On a token page on gmgn, fomo or DexScreener, click the Vialz icon and the token is read straight away. Anywhere else, paste an address or a
              link. Your recent checks stay on your device.
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

    </>
  );
}
