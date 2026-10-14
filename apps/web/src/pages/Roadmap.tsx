import type { ReactNode } from "react";
import { Vessel } from "@vialz/ui";
import { Link, Out } from "../App";
import { REPO_URL, STORE_URL, X_URL } from "../brand";

// What is out, what is being built, and every release. Plain facts, no dates promised that are not set.

type Step = { when: string; title: string; state: "done" | "now" | "next"; text: ReactNode; items?: ReactNode[] };

// oldest first: where we were, where we are, what comes
const STEPS: Step[] = [
  {
    when: "10 October 2026",
    title: "First reads",
    state: "done",
    text: "Vialz reads a Robinhood Chain token straight from the chain: snipers, the bundle, top holders, linked wallets and the creator's record. The first site and the extension go up the same day.",
  },
  {
    when: "11 October 2026",
    title: "Ready for the store",
    state: "done",
    text: "The extension opens from the toolbar and reads the token of the page you are on. Reads get faster, the privacy policy goes up, and version 1.0.0 is sent to the Chrome Web Store.",
  },
  {
    when: "12–13 October 2026",
    title: "The glass look, sharper reads",
    state: "done",
    text: "The site and the extension get the look they have now, and every token page a link card for X and Telegram.",
    items: [
      "Snipers are the buys of the first 3 seconds after launch",
      "The dev's own bag: bought, sold, moved, burned, bought back",
      "Busy tokens with thousands of holders read through Blockscout's index",
    ],
  },
  {
    when: "14 October 2026",
    title: "Launch",
    state: "done",
    text: (
      <>
        Vialz 1.0.0 passes the Chrome Web Store review and goes live. The code opens on <Out href={REPO_URL}>GitHub</Out> under MIT, with a free API
        anyone can use.
      </>
    ),
  },
  {
    when: "Now",
    title: "1.0.1 and a daily recap",
    state: "now",
    text: "Version 1.0.1 is in Chrome Web Store review and reaches every copy by itself once approved. On X, one post a day: what launched on Robinhood Chain and how many launches had a big bundle, snipers or a dev who sold early.",
  },
  {
    when: "Next",
    title: "Buy after the check",
    state: "next",
    text: "A swap on vialz.xyz, right under the report: read the token, then buy it in the same place. Optional and only on the site: the check never asks for a wallet, and the extension stays read-only.",
    items: ["Extension 1.0.2: a clearer report for the busiest tokens, bigger labels on small screens, recent tokens on the first screen"],
  },
  {
    when: "Later",
    title: "Beyond Robinhood Chain",
    state: "next",
    text: "The same six readings on more chains, Solana first.",
    items: ["Vialz on X: tag the account under a post with a contract address and get the readings back in the thread"],
  },
];

type Release = { version: string; when: string; status?: string; lead: string; items: string[] };

const RELEASES: Release[] = [
  {
    version: "1.0.1",
    when: "Sent for review on 14 October 2026",
    status: "in review",
    lead: "The look of the site, and a few things that save a click.",
    items: [
      "The glass look of vialz.xyz: new type for the vials and headings, the same colours as the site.",
      "Share on X straight from a report, with the readings and the link already written.",
      "A tip to pin the icon to the toolbar, shown until you hide it.",
      "Links to vialz.xyz, the docs and X on the first screen, and the site in Chrome's own menu for the extension.",
      "Same two permissions as before: activeTab and storage.",
    ],
  },
  {
    version: "Reports",
    when: "13 and 14 October 2026",
    lead: "Read on the server, so every copy of the extension and the site gets these at once, no update needed.",
    items: [
      "Snipers are the buys of the first 3 seconds after launch, measured by the chain's own block pace.",
      "A dev who buys back in after launch gets a line of its own, with how many buys and how much.",
      "Busy tokens, with thousands of holders, take their biggest wallets from Blockscout's index and read the ten biggest from the chain on every check.",
      "Token pictures that are too large are shrunk on the server, so they show everywhere and load faster.",
    ],
  },
  {
    version: "1.0.0",
    when: "14 October 2026",
    lead: "The first public release, on the Chrome Web Store.",
    items: [
      "Six vials: snipers, bundle, top 10, linked wallets, the creator and the volume, each filled by how strong the reading is.",
      "The dev's own bag: bought, sold, moved to other wallets, burned, held now.",
      "Reads the token of the page you are on (gmgn, fomo, DexScreener, the explorer), or any address or link you paste.",
      "Recent checks kept on your device. No wallet, no account.",
    ],
  },
];

export function Roadmap() {
  return (
    <div className="page">
      <section className="band band-faq">
        <div className="wrap faq">
          <div className="faq-head">
            <h1>Roadmap</h1>
            <p>
              Where Vialz started, where it is now and what comes next. Checking a token stays free and never asks for a wallet. News first on{" "}
              <Out href={X_URL}>@vialzapp</Out>.
            </p>
          </div>

          <ol className="road">
            {STEPS.map((st) => (
              <li key={st.title} className={`road-step road-${st.state}`}>
                <span className="road-node" aria-hidden>
                  <Vessel className="road-vial" level={st.state === "done" ? 1 : st.state === "now" ? 0.55 : 0} fill="var(--node)" glass="var(--node-glass)" stroke={24} />
                </span>
                <div className="road-body">
                  <p className="road-when">
                    {st.when}
                    {st.state === "now" && <span className="road-here">You are here</span>}
                  </p>
                  <h2>{st.title}</h2>
                  <p>{st.text}</p>
                  {st.items && (
                    <ul>
                      {st.items.map((i, k) => (
                        <li key={k}>{i}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="band band-faq band-updates" id="updates">
        <div className="wrap faq">
          <div className="faq-head">
            <h2 className="updates-title">Updates</h2>
            <p>
              Every version of the extension and every change to how tokens are read. Install from the <Out href={STORE_URL}>Chrome Web Store</Out>; it
              updates itself.
            </p>
          </div>
          <div className="updates">
            {RELEASES.map((r) => (
              <article key={r.version} className="update">
                <header>
                  <h3>{r.version === "Reports" ? "Reports" : `Version ${r.version}`}</h3>
                  {r.status && <span className="update-status">{r.status}</span>}
                  <time>{r.when}</time>
                </header>
                <p className="update-lead">{r.lead}</p>
                <ul>
                  {r.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
