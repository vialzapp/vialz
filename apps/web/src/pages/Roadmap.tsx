import type { ReactNode } from "react";
import { Vessel } from "@vialz/ui";
import { Link, Out } from "../App";
import { REPO_URL, STORE_URL, X_URL } from "../brand";

// What is out, what is being built, and every release. Plain facts, no dates promised that are not set.

type Stage = { key: string; name: string; fill: number; items: { title: string; text: ReactNode }[] };

const STAGES: Stage[] = [
  {
    key: "shipped",
    name: "Shipped",
    fill: 1,
    items: [
      {
        title: "Chrome extension",
        text: "Six vials for any Robinhood Chain token, read the moment you click. On gmgn, fomo, DexScreener and the explorer it picks up the token by itself.",
      },
      {
        title: "Full reports on the site",
        text: "Every token has its own page at vialz.xyz/t/… with the full report, and a link card that shows the readings when it is shared.",
      },
      {
        title: "Open source and a free API",
        text: (
          <>
            The extension, the site and the server are on <Out href={REPO_URL}>GitHub</Out> under MIT. The same API the extension uses is open to
            anyone, no key: see the <Link href="/docs#api">docs</Link>.
          </>
        ),
      },
    ],
  },
  {
    key: "now",
    name: "Now",
    fill: 0.6,
    items: [
      { title: "Extension 1.0.1", text: "In Chrome Web Store review. It installs itself on every copy once it is approved. See Updates below." },
      {
        title: "Daily chain recap",
        text: "One post a day on X: how many tokens launched on Robinhood Chain, how many with a big bundle, snipers or a dev who sold early.",
      },
    ],
  },
  {
    key: "next",
    name: "Next",
    fill: 0.35,
    items: [
      {
        title: "Buy after the check",
        text: "A swap on vialz.xyz, right under the report: read the token, then buy it in the same place. Optional, and only on the site. The check itself never asks for a wallet, and the extension stays read-only.",
      },
      {
        title: "Extension 1.0.2",
        text: "A clearer report for the busiest tokens, bigger labels on small screens, and recent tokens on the first screen.",
      },
    ],
  },
  {
    key: "later",
    name: "Later",
    fill: 0,
    items: [
      { title: "More chains", text: "The same six readings beyond Robinhood Chain, Solana first." },
      { title: "Vialz on X", text: "Tag the account under a post with a contract address and get the readings back in the thread." },
    ],
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
              What Vialz does today, what comes next, and every release. Checking a token stays free and never asks for a wallet. News first on{" "}
              <Out href={X_URL}>@vialzapp</Out>.
            </p>
          </div>

          <div className="road">
            {STAGES.map((s) => (
              <section key={s.key} className={`road-stage road-${s.key}`} aria-label={s.name}>
                <h2>
                  <Vessel className="road-vial" level={s.fill} fill="var(--ink-2)" glass="var(--glass)" stroke={22} />
                  {s.name}
                </h2>
                <ul>
                  {s.items.map((i) => (
                    <li key={i.title}>
                      <b>{i.title}</b>
                      <p>{i.text}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
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
