import { useEffect, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { Vessel } from "@vialz/ui";
import { REPO_URL, X_URL } from "../brand";

// The documentation: how to use Vialz, how every reading is computed, and how to run and verify it yourself.
// Thresholds here mirror packages/shared (padsFor) and apps/api (analyze.ts); change them together.

const TOC: { group: string; items: [string, string][] }[] = [
  { group: "Get started", items: [["overview", "Overview"], ["install", "Install"], ["check", "Check a token"]] },
  { group: "Reading a report", items: [["vials", "The six vials"], ["findings", "Findings"], ["sections", "Report sections"]] },
  { group: "How it works", items: [["sources", "Data sources"], ["method", "How each check works"], ["limits", "Limits"]] },
  { group: "Open source", items: [["code", "The code"], ["run", "Run it yourself"], ["settings", "Settings"], ["api", "API"]] },
  { group: "Trust", items: [["permissions", "Permissions and privacy"], ["official", "Official links"], ["security", "Report a vulnerability"]] },
];

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="doc-code">
      <pre>
        <code>{children}</code>
      </pre>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy"}
        onClick={() =>
          void navigator.clipboard.writeText(children.replace(/\s+#.*$/gm, "")).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          })
        }
      >
        {copied ? <CheckIcon size={15} weight="bold" /> : <CopyIcon size={15} />}
      </button>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="doc-section">
      <h2>
        <a href={`#${id}`}>{title}</a>
      </h2>
      {children}
    </section>
  );
}

const VIALS = [
  {
    name: "Snipers",
    reads: "Buys in the launch block and the two blocks after it, by any wallet except the creator. Shows how much of the supply they still hold.",
    levels: "Clear: none. Note: under 3% still held. Watch: 3% or more. High: 10% or more.",
  },
  {
    name: "Bundle",
    reads: "Wallets the creator declared exempt from the opening tax in the launch transaction (Pons launchAndBuy).",
    levels: "Clear: none declared. Note: they sold out. Watch: they hold 1% or more. High: 5% or more.",
  },
  {
    name: "Top 10",
    reads: "Share of supply in the ten largest wallets. The curve, pools, the burn address and launchpad contracts are left out.",
    levels: "Clear: under 15%. Note: 15% or more. Watch: 30% or more. High: 50% or more.",
  },
  {
    name: "Linked",
    reads: "Groups of holders tied to one wallet: one sender handed the token to three or more wallets that still hold it, or three or more top holders got their first ETH from one funder.",
    levels: "Clear: no group found. Note: a group under 3%. Watch: 3% or more. High: 10% or more.",
  },
  {
    name: "Creator",
    reads: "Every earlier Pons launch from the creator's wallet, whether they sold early on their recent launches, and what the creator holds now.",
    levels: "Watch: 10 or more launches, or holds 5% or more. High: 50 or more launches, or sold early in at least half of the last 8.",
  },
  {
    name: "Volume",
    reads: "How much of the curve volume the five busiest wallets made, and how many wallets keep buying and selling.",
    levels: "Note: under 30 trades. Watch: five wallets make 60% or more, or 5 or more wallets flip. Clear otherwise.",
  },
];

const SETTINGS = [
  { name: "PORT", type: "number", def: "8787", text: "Port the API and the site listen on." },
  {
    name: "RH_RPC",
    type: "url",
    def: "https://rpc.mainnet.chain.robinhood.com",
    text: "Robinhood Chain JSON-RPC. It must allow address-filtered eth_getLogs over wide block ranges; the official node allows 10 million blocks per call.",
  },
  { name: "RH_LOGS_SPAN", type: "blocks", def: "9000000", text: "Widest block range asked for in one eth_getLogs call. Lower it if your node rejects wide ranges." },
  { name: "RH_RPC_CONCURRENCY", type: "number", def: "4", text: "Requests in flight at once. The public node rate-limits heavy calls; raise it only on a paid provider." },
  {
    name: "ETHERSCAN_API_KEY",
    type: "key, optional",
    def: "none",
    text: "Turns on funding links: who sent each top holder their first ETH. Plain ETH transfers leave no logs, so this needs an indexed source. Keep it in your host's environment, never in the repository.",
  },
  { name: "VITE_API_URL", type: "url, build time", def: "same origin", text: "API origin the site and the extension call. Set it when building the extension." },
];

export function Docs() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    document.title = "Docs: Vialz";
    const sections = [...document.querySelectorAll<HTMLElement>(".doc-section")];
    // the current section is the last one whose heading has passed the top band of the viewport
    const pick = () => {
      const passed = sections.filter((s) => s.getBoundingClientRect().top <= 140);
      setActive((passed[passed.length - 1] ?? sections[0])?.id ?? "overview");
    };
    const io = new IntersectionObserver(pick, { rootMargin: "-120px 0px -55% 0px", threshold: [0, 1] });
    sections.forEach((s) => io.observe(s));
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    pick();
    return () => io.disconnect();
  }, []);

  return (
    <div className="wrap docs">
      <aside className="docs-toc" aria-label="On this page">
        {TOC.map((g) => (
          <div key={g.group}>
            <p>{g.group}</p>
            <ul>
              {g.items.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} aria-current={active === id ? "true" : undefined}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      <article className="docs-body">
        <header className="docs-head">
          <h1>Docs</h1>
          <p>
            How to use Vialz, how every reading is computed, and how to run and check it yourself. The code is open:{" "}
            <a href={REPO_URL}>github.com/vialzapp/vialz</a>.
          </p>
        </header>

        <Section id="overview" title="Overview">
          <p>
            Vialz reads a token on Robinhood Chain and tells you what the chain shows about it: who sniped the launch, who holds the supply, which
            wallets are linked, what the creator did with their earlier tokens, and how real the volume looks.
          </p>
          <p>
            It only reads. It never connects to a wallet, never asks for a signature or a key, and has no accounts. It works for any token on the
            chain; tokens launched on Pons get the full launch section.
          </p>
        </Section>

        <Section id="install" title="Install">
          <p>
            The Chrome Web Store listing is coming. Until it is live, you can load the extension from the source in about a minute. It works in
            Chrome, Brave, Edge and Arc.
          </p>
          <ol className="doc-steps">
            <li>
              Build it (see <a href="#run">Run it yourself</a>), or download the packaged build from the repository's releases once published.
            </li>
            <li>
              Open <code>chrome://extensions</code> and switch on <b>Developer mode</b> in the top right.
            </li>
            <li>
              Click <b>Load unpacked</b> and pick the <code>apps/extension/dist</code> folder.
            </li>
            <li>Pin Vialz from the puzzle icon in the toolbar, so it is one click away.</li>
          </ol>
          <p className="doc-note">Only install Vialz from the Chrome Web Store link posted on our X account, or build it from this repository yourself.</p>
        </Section>

        <Section id="check" title="Check a token">
          <ol className="doc-steps">
            <li>Click the Vialz icon. The extension opens next to the page you are on.</li>
            <li>
              Paste a contract address, or any link that contains one: an X post, gmgn, fomo, Pons, DexScreener or an explorer page. Vialz pulls the
              address out of it.
            </li>
            <li>
              If the page you are on has an address in its link, a <b>Check this page's token</b> button appears. One click and it is read.
            </li>
            <li>The report arrives in 3 to 15 seconds. Earlier launches by the same creator open in the same view; the arrow takes you back.</li>
          </ol>
          <p>
            Your last checks stay in the extension, on your device. The same report is on the site at <code>/t/0x…</code>, a link you can
            share.
          </p>
        </Section>

        <Section id="vials" title="The six vials">
          <p>
            Every report opens with six vials, one per check. Each fills with the colour of its reading, and the stronger the reading, the fuller
            the vial. An empty vial means there was nothing to read, for example no launch data on a token that did not come from Pons.
          </p>
          <div className="doc-legend">
            {[
              ["good", 0.5, "Clear", "nothing of concern in this check"],
              ["info", 0.62, "Note", "worth knowing, not a warning"],
              ["warn", 0.78, "Watch", "look closer before you buy"],
              ["danger", 0.95, "High", "a pattern often seen before a rug"],
            ].map(([level, fill, name, text]) => (
              <div key={name as string} className={`pad-${level}`}>
                <Vessel level={fill as number} fill="var(--pad)" glass="var(--ink-3)" className="doc-legend-vial" />
                <b>{name}</b>
                <span>{text}</span>
              </div>
            ))}
          </div>
          <div className="doc-table" role="table" aria-label="The six vials">
            <div role="row" className="doc-th">
              <span role="columnheader">Vial</span>
              <span role="columnheader">What it reads</span>
              <span role="columnheader">Levels</span>
            </div>
            {VIALS.map((v) => (
              <div role="row" key={v.name}>
                <span role="rowheader">
                  <b>{v.name}</b>
                </span>
                <span role="cell">{v.reads}</span>
                <span role="cell" className="doc-dim">
                  {v.levels}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="findings" title="Findings">
          <p>
            Under the vials, each finding is one line of fact, marked <b>High</b>, <b>Watch</b>, <b>Note</b> or <b>Clear</b>, most serious first.
            Findings say what the chain shows, for example "87 linked wallets hold 64% of supply" or "Creator sold early in 5 of their last 8
            launches". Vialz never calls a token a scam; that judgement is yours.
          </p>
        </Section>

        <Section id="sections" title="Report sections">
          <dl className="doc-dl">
            <div>
              <dt>Market</dt>
              <dd>
                Price, market cap, volume and buyers. For tokens still on a Pons curve it comes from the curve's own trades, and "In the curve" is
                what the curve actually holds. For tokens trading on Uniswap it comes from DexScreener.
              </dd>
            </div>
            <div>
              <dt>Launch</dt>
              <dd>
                Pons tokens only: progress to graduation, what the token is paired with (ETH, USDG, a stock token or another coin), the dev buy,
                the creator tax, where fees go, snipers and the declared bundle.
              </dd>
            </div>
            <div>
              <dt>Holders</dt>
              <dd>
                The twenty largest balances, rebuilt from every transfer of the token, with labels: curve, pool, burn, locker, creator, sniper,
                bundle. The top 10 share leaves out contracts that are not people.
              </dd>
            </div>
            <div>
              <dt>Linked wallets</dt>
              <dd>Groups of holders tied to one sender or one funder, with the share of supply they hold now.</dd>
            </div>
            <div>
              <dt>Creator</dt>
              <dd>
                The creator's Pons launches, how many graduated, how often they sold early, and their ten most recent tokens. Each one opens its
                own report.
              </dd>
            </div>
          </dl>
          <p className="doc-dim">Every report ends with the block it was read at and how long the read took.</p>
        </Section>

        <Section id="sources" title="Data sources">
          <ul className="doc-list">
            <li>
              <b>Robinhood Chain</b> through its JSON-RPC: every transfer of the token, every trade on its Pons curve, the Pons factory's launch
              records and the launch transaction itself.
            </li>
            <li>
              <b>Pons V2 contracts</b>: the factory <code>0x7ed5…ec7e</code> and the curves it creates. Their layout was first documented by the
              open-source gradgate engine.
            </li>
            <li>
              <b>DexScreener</b> for tokens that already trade in a pool, and for the price of pairs other than ETH.
            </li>
            <li>
              <b>Coinbase</b> for the ETH price in dollars.
            </li>
            <li>
              <b>Etherscan</b>, when enabled, for the first ETH a holder received, which no chain log records.
            </li>
          </ul>
          <p>Nothing is cached for long: a report is read at the current block, and a repeat request within 15 seconds gets the same read.</p>
        </Section>

        <Section id="method" title="How each check works">
          <dl className="doc-dl">
            <div>
              <dt>Snipers</dt>
              <dd>Buys on the curve in the launch block and the two blocks after it, by wallets other than the creator. Their current balances give "still hold".</dd>
            </div>
            <div>
              <dt>Bundle</dt>
              <dd>
                Read from the launch transaction: when a token is launched with launchAndBuy, the creator lists wallets exempt from the opening tax.
                Those wallets are the declared bundle.
              </dd>
            </div>
            <div>
              <dt>Holders</dt>
              <dd>Balances are rebuilt by replaying every Transfer event of the token from its first block. No third-party holder list is used.</dd>
            </div>
            <div>
              <dt>Linked by sender</dt>
              <dd>
                A wallet that sent the token directly to three or more wallets that still hold it. Contracts (routers, pools, aggregators) are
                skipped, so ordinary buys never count. Groups under 0.5% of supply are dropped.
              </dd>
            </div>
            <div>
              <dt>Linked by funder</dt>
              <dd>The 25 largest holders are grouped by the wallet that sent them their first ETH. Three or more with the same funder form a group.</dd>
            </div>
            <div>
              <dt>Creator history</dt>
              <dd>
                Every launch event from the creator's wallet on the Pons factory, across the chain's whole history. Graduation is read for the 60
                most recent; "sold early" means the creator sold on that token's curve within about a day of launch, checked for the last 8.
              </dd>
            </div>
            <div>
              <dt>Volume</dt>
              <dd>From curve trades: the share of volume made by the five busiest wallets, and wallets with at least two buys and two sells.</dd>
            </div>
          </dl>
        </Section>

        <Section id="limits" title="Limits">
          <ul className="doc-list">
            <li>
              A read can be wrong, late or incomplete. Readings describe how a token was launched and who holds it; they say nothing certain about
              its price.
            </li>
            <li>Tokens with millions of transfers are read for 15 seconds at most. Past that, the report shows market data and marks holders as not read.</li>
            <li>Tokens that did not launch on Pons have no launch section, no snipers and no bundle. Holders, linked wallets and market still work.</li>
            <li>
              A shared funder is a fact, not proof of one owner. Exchanges and bridges fund many unrelated wallets, so a funding group is a reason to
              look closer.
            </li>
            <li>The public RPC limits how fast it answers. Under heavy load a report can take longer.</li>
          </ul>
        </Section>

        <Section id="code" title="The code">
          <p>
            Everything is open source under the MIT license: the API that reads the chain, the site and the extension.{" "}
            <a href={REPO_URL}>github.com/vialzapp/vialz</a>
          </p>
          <Code>{`apps/api          # reads the chain and builds a report on request
apps/web          # this site
apps/extension    # the Chrome extension
packages/shared   # report types, address parsing, the six readings
packages/ui       # components shared by the site and the extension`}</Code>
          <p>
            Forks are welcome under the license. A fork is not Vialz: only the build linked from our X account is ours.
          </p>
        </Section>

        <Section id="run" title="Run it yourself">
          <p>You need git and Node 22 or newer.</p>
          <Code>{`git clone ${REPO_URL}.git vialz
cd vialz
npm install
npm run dev:api        # the API on http://localhost:8787
npm run dev:web        # the site on http://localhost:5180`}</Code>
          <p>Build the extension against your own API, then load it unpacked as in Install:</p>
          <Code>{`cd apps/extension
VITE_API_URL=http://localhost:8787 npx vite build --mode development`}</Code>
          <p>
            Check a single token from the command line, without the site: <code>npm run check -w @vialz/api -- 0x…</code>
          </p>
        </Section>

        <Section id="settings" title="Settings">
          <p>The API reads its settings from the environment.</p>
          <div className="doc-settings">
            {SETTINGS.map((s) => (
              <div key={s.name}>
                <div className="doc-setting-head">
                  <code>{s.name}</code>
                  <span>{s.type}</span>
                </div>
                <p>{s.text}</p>
                <p className="doc-dim">
                  Default: <code>{s.def}</code>
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="api" title="API">
          <p>The site and the extension use the same open API. It needs no key and returns JSON.</p>
          <dl className="doc-dl doc-endpoints">
            <div>
              <dt>
                <code>GET /v1/token/:address</code>
              </dt>
              <dd>The full report for a token: launch, market, holders, snipers, bundle, clusters, volume, creator history and findings.</dd>
            </div>
            <div>
              <dt>
                <code>GET /v1/latest</code>
              </dt>
              <dd>The busiest Pons launch of the last hour, as used on the home page.</dd>
            </div>
            <div>
              <dt>
                <code>GET /v1/img/:cid</code>
              </dt>
              <dd>A token image from IPFS, fetched once and cached.</dd>
            </div>
            <div>
              <dt>
                <code>GET /v1/health</code>
              </dt>
              <dd>Answers when the API is up.</dd>
            </div>
          </dl>
          <Code>{`curl http://localhost:8787/v1/token/0x…   # your own API, see Run it yourself`}</Code>
          <p className="doc-dim">Please keep it to a few requests a minute: every report is a fresh read of the chain.</p>
        </Section>

        <Section id="permissions" title="Permissions and privacy">
          <p>The extension asks for three permissions, and nothing else:</p>
          <dl className="doc-dl">
            <div>
              <dt>sidePanel</dt>
              <dd>To open next to the page you are on.</dd>
            </div>
            <div>
              <dt>activeTab</dt>
              <dd>Only when you open Vialz, to read the current page's link and offer to check an address found in it. Page content is never read.</dd>
            </div>
            <div>
              <dt>storage</dt>
              <dd>To keep your recent checks on your device.</dd>
            </div>
          </dl>
          <p>
            When you check a token, only its address is sent to the API. No wallet, no history, no identifiers. The full policy is on the{" "}
            <a href="/privacy">privacy page</a>.
          </p>
        </Section>

        <Section id="official" title="Official links">
          <ul className="doc-list">
            <li>
              X: <a href={X_URL}>@vialzapp</a>
            </li>
            <li>
              Code: <a href={REPO_URL}>github.com/vialzapp/vialz</a>
            </li>
          </ul>
          <p className="doc-note">
            We never DM first. Vialz will never ask you to connect a wallet, sign a message or share a seed phrase. Anything that does is not us.
          </p>
        </Section>

        <Section id="security" title="Report a vulnerability">
          <p>
            Please report security issues privately through GitHub: the repository's <b>Security</b> tab, then <b>Report a vulnerability</b>. Do
            not open a public issue. We aim to answer within 72 hours.
          </p>
        </Section>
      </article>
    </div>
  );
}
