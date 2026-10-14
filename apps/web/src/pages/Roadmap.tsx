import type { ReactNode } from "react";
import { Vessel } from "@vialz/ui";
import { Link, Out } from "../App";
import { REPO_URL, STORE_URL, TOKEN, X_URL } from "../brand";
import { TokenContract } from "../TokenContract";

// What is out, what is being built, and every release. Plain facts, no dates promised that are not set.

type Step = { when: string; title: string; state: "done" | "now" | "next"; text: ReactNode; items?: ReactNode[]; contract?: boolean; sealed?: boolean };

// oldest first: where we were, where we are, what comes
const STEPS: Step[] = [
  {
    when: "10 October 2026",
    title: "First reads",
    state: "done",
    text: "Vialz reads its first tokens straight from Robinhood Chain: who sniped the launch, the bundle the creator declared, the biggest holders, wallets fed by one sender and every earlier launch from the same creator. No database in between: each check replays the token's own history. The first site and the extension go up the same day.",
  },
  {
    when: "11 October 2026",
    title: "Ready for the store",
    state: "done",
    text: "The extension moves into the toolbar: open a token on gmgn, fomo, DexScreener or the explorer, click the icon, and that token is read. The name and numbers show in a second while the rest loads. The privacy policy goes up, and version 1.0.0 goes to the Chrome Web Store.",
  },
  {
    when: "12–13 October 2026",
    title: "The glass look, sharper reads",
    state: "done",
    text: "Vialz gets the look it has now, and every token page gets a link card for X and Telegram. The readings get sharper:",
    items: [
      "Snipers are the buys of the first 3 seconds after launch, measured by the chain's own block pace",
      "The dev's own bag: what they bought, sold, moved to other wallets or burned",
      "Busy tokens with thousands of holders are read through Blockscout's index in seconds",
    ],
  },
  {
    when: "14 October 2026",
    title: "Through the review",
    state: "done",
    text: (
      <>
        Vialz 1.0.0 passes the Chrome Web Store review. The code opens on <Out href={REPO_URL}>GitHub</Out> under MIT, so anyone can see what the
        extension does, and the API behind it is free to use with no key.
      </>
    ),
  },
  {
    when: "Now",
    title: "Launch",
    state: "now",
    text: "The site and the extension open to everyone. Install Vialz from the Chrome Web Store, open any Robinhood Chain token and click the icon: snipers, bundle, holders, linked wallets, the creator and the volume in a few seconds. Free, no wallet, no account. Version 1.0.1 reaches every copy through the store by itself.",
  },
  {
    when: "Next",
    title: "Daily chain recap",
    state: "next",
    text: "Once a day on X, the chain in numbers: how many tokens launched in the last 24 hours, how many came with a big bundle or snipers still holding, and how many devs sold early. Taken from the same readings as the extension, so every number can be checked against a token's own report.",
  },
  // sealed: shown as a step, with nothing in it to read (placeholder bars, no text in the page or the code)
  { when: "Next", title: "", state: "next", text: null, sealed: true },
  {
    when: "Next",
    title: "Extension 1.0.2",
    state: "next",
    text: "Polish from the first days of use. Busy tokens get a report that says plainly what was read and what was not, labels grow on small screens, and the first screen shows your recent tokens with their six vials, so a second look takes one click.",
  },
  {
    when: "Next",
    title: "Vialz DEX",
    state: "next",
    text: "Our own exchange on vialz.xyz. Read a token, then buy it in the same place, right under its report, instead of copying the address to another site. Trading is optional and only on the site: checking never asks for a wallet, you connect one only to trade, and the extension stays read-only.",
  },
  {
    when: "Later",
    title: "Watchlist and alerts",
    state: "next",
    text: "Keep the tokens you hold or watch on a list in the extension. Vialz reads them again and tells you when something changes that you would want to know: the dev sells, the bundle starts dumping, one wallet takes a big share.",
  },
  {
    when: "Later",
    title: "Vialz on X",
    state: "next",
    text: "Tag @vialzapp under any post with a contract address and get the six vials back in the thread, so everyone reading that post sees them too.",
  },
  {
    when: "Later",
    title: "Vialz on Telegram",
    state: "next",
    text: "A Telegram bot with the same check: send it a contract or a link and get the report back. Add it to a group and it answers there, so the whole chat sees the readings before anyone apes.",
  },
  {
    when: "Later",
    title: "More chains",
    state: "next",
    text: "The same six readings beyond Robinhood Chain: Solana first, where most launches happen today, then Base and BNB Chain.",
  },
  {
    when: "Later",
    title: "More browsers",
    state: "next",
    text: "Vialz in the Firefox and Microsoft Edge add-on stores. It already runs in Brave, Arc and other Chromium browsers from the Chrome Web Store.",
  },
];

type Release = { version: string; when: string; status?: string; lead: string; items: string[] };

const RELEASES: Release[] = [
  {
    version: "1.0.1",
    when: "October 2026",
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
                {st.sealed ? (
                  <div className="road-body road-sealed">
                    <p className="road-when">
                      {st.when}
                      <span className="road-seal">Sealed until it ships</span>
                    </p>
                    <div className="road-veil" aria-hidden>
                      <i style={{ width: "46%", height: 26 }} />
                      <i style={{ width: "92%" }} />
                      <i style={{ width: "84%" }} />
                      <i style={{ width: "58%" }} />
                      <i style={{ width: "64%", marginTop: 10 }} />
                      <i style={{ width: "52%" }} />
                      <i style={{ width: "60%" }} />
                    </div>
                  </div>
                ) : (
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
                  {st.contract && TOKEN && <TokenContract address={TOKEN.address} />}
                </div>
                )}
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
