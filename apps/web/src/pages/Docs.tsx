import { Link, Out } from "../App";
import { useEffect, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { FILL, Vessel } from "@vialz/ui";
import { CHROME_URL, REPO_URL, X_URL } from "../brand";

// the store listing, once VITE_CHROME_URL points at it (until then CHROME_URL is this page's own install steps)
const STORE_URL = CHROME_URL.startsWith("https://") ? CHROME_URL : null;

// The documentation: how to use Vialz, how every reading is computed, and how to run and verify it yourself.
// Thresholds here mirror packages/shared (padsFor) and apps/api (analyze.ts); change them together.

const TOC: { group: string; items: [string, string][] }[] = [
  { group: "Get started", items: [["overview", "Overview"], ["install", "Install"], ["check", "Check a token"]] },
  { group: "Reading a report", items: [["vials", "The six vials"], ["findings", "Findings"], ["sections", "Report sections"]] },
  { group: "How it works", items: [["sources", "Data sources"], ["method", "How each check works"], ["limits", "Limits"]] },
  { group: "Open source", items: [["code", "The code"], ["run", "Run it yourself"], ["settings", "Settings"], ["api", "API"]] },
  { group: "Trust", items: [["permissions", "Permissions and privacy"], ["official", "Official links"], ["security", "Report a vulnerability"]] },
];

export function Code({ children }: { children: string }) {
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

// each vial's reading at each level, clear to high; null where a level does not apply
type Scale = [clear: string | null, note: string | null, watch: string | null, high: string | null];
const VIALS: { name: string; reads: string; scale: Scale; extra?: string }[] = [
  {
    name: "Snipers",
    reads: "Buys in the first 3 seconds after launch, by any wallet except the creator and the declared bundle. Shows how much of the supply they still hold.",
    scale: ["none", "under 3% still held", "3% or more", "10% or more"],
  },
  {
    name: "Bundle",
    reads: "Wallets the creator declared exempt from the opening tax in the launch transaction (Pons launchAndBuy).",
    scale: ["none declared", "they hold under 1%", "1% or more", "5% or more"],
    extra: "No reading when the launch did not use launchAndBuy.",
  },
  {
    name: "Top 10",
    reads: "Share of supply in the ten largest wallets. The curve, pools, the burn address and launchpad contracts are left out.",
    scale: ["under 15%", "15% or more", "30% or more", "50% or more"],
  },
  {
    name: "Linked",
    reads: "Groups of holders tied to one wallet: one sender handed the token straight to three or more wallets that still hold it. Read from the token's own transfers.",
    scale: ["no group found", "a group under 3%", "3% or more", "10% or more"],
  },
  {
    name: "Creator",
    reads: "Every earlier Pons launch from the creator's wallet, whether they sold early on their recent launches, and what the creator holds now.",
    scale: ["2 to 9 launches", "first launch", "10+ launches, or holds 5%+", "50+ launches, or sold early"],
    extra: "Sold early: in at least half of the last 8 launches, with 3 or more to compare.",
  },
  {
    name: "Volume",
    reads: "How much of the curve volume the five busiest wallets made, and how many wallets keep buying and selling.",
    scale: ["spread out", "under 30 trades", "5 wallets make 60%+, or 5+ flip", null],
  },
];
const LEVELS = [
  ["good", "Clear"],
  ["info", "Note"],
  ["warn", "Watch"],
  ["danger", "High"],
] as const;

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
    name: "BLOCKSCOUT_API_KEY",
    type: "key, optional",
    def: "none",
    text: "Lets busy tokens (thousands of holders) take their biggest balances from Blockscout's index instead of being read transfer by transfer. Keep it in your host's environment, never in the repository.",
  },
  { name: "VITE_API_URL", type: "url, build time", def: "same origin", text: "API origin the site and the extension call. Set it when building the extension." },
];

export function Docs() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    document.title = "Docs | Vialz";
    const sections = [...document.querySelectorAll<HTMLElement>(".doc-section")];
    // the current section is the last one whose heading has passed the top band of the viewport
    const pick = () => {
      const passed = sections.filter((s) => s.getBoundingClientRect().top <= Math.min(innerHeight * 0.4, 300));
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
            <Out href={REPO_URL}>github.com/vialzapp/vialz</Out>.
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
          {STORE_URL ? (
            <p>
              Install it from the <Out href={STORE_URL}>Chrome Web Store</Out>. It works in Chrome, Brave, Edge and Arc. You can also load it from
              the source in about a minute:
            </p>
          ) : (
            <p>
              The Chrome Web Store listing is coming. Until it is live, you can load the extension from the source in about a minute. It works in
              Chrome, Brave, Edge and Arc.
            </p>
          )}
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
          <p className="doc-note">
            <b>Only install Vialz</b> from the Chrome Web Store link posted on our X account, or build it from this repository yourself.
          </p>
        </Section>

        <Section id="check" title="Check a token">
          <ol className="doc-steps">
            <li>Click the Vialz icon in the toolbar. A small window opens under it.</li>
            <li>
              Paste a contract address, or any link that contains one: an X post, gmgn, fomo, Pons, DexScreener or an explorer page. Vialz pulls the
              address out of it.
            </li>
            <li>
              If the page you are on has a token address in its link (gmgn, fomo, DexScreener, an explorer), Vialz reads that token straight away.
              Chrome only shows the extension the link of the tab you clicked it on, nothing else.
            </li>
            <li>The report arrives in 3 to 15 seconds. Earlier launches by the same creator open in the same window; the arrow takes you back.</li>
          </ol>
          <p>
            Your last checks stay in the extension, on your device. Remove one with its cross, or all of them with Clear all. The same report is on the site at <code>/t/0x…</code>, a link you can
            share.
          </p>
        </Section>

        <Section id="vials" title="The six vials">
          <p>
            Every report opens with six vials, one per check. Each fills with the colour of its reading, and the stronger the reading, the fuller
            the vial: a high reading fills it to the brim. An empty vial means there was nothing to read, for example no launch data on a token that did not come from Pons.
          </p>
          <div className="doc-legend">
            {[
              ["good", FILL.good, "Clear", "nothing of concern in this check"],
              ["info", FILL.info, "Note", "worth knowing, not a warning"],
              ["warn", FILL.warn, "Watch", "look closer before you buy"],
              ["danger", FILL.danger, "High", "a pattern often seen before a rug"],
            ].map(([level, fill, name, text]) => (
              <div key={name as string} className={`pad-${level}`}>
                <Vessel level={fill as number} fill="var(--pad)" glass="var(--glass)" surface="var(--surface)" stroke={18} className="doc-legend-vial" />
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
                <span role="cell">
                  <ul className="doc-scale">
                    {v.scale.map((value, i) =>
                      value ? (
                        <li key={i} className={`pad-${LEVELS[i]![0]}`}>
                          <span>{LEVELS[i]![1]}</span>
                          {value}
                        </li>
                      ) : null,
                    )}
                  </ul>
                  {v.extra && <p className="doc-extra">{v.extra}</p>}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="findings" title="Findings">
          <p>
            Above the vials, a line counts the findings at each level. Under them, each finding is one line of fact, marked by a square in the
            colour of its level (<b>High</b>, <b>Watch</b>, <b>Note</b> or <b>Clear</b>), most serious first. Clear findings fold into one
            line when there is anything else to read.
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
              <dd>Groups of holders who got the token from one sender, with the share of supply they hold now.</dd>
            </div>
            <div>
              <dt>Creator</dt>
              <dd>
                First, what the creator's own wallet did with this token, read from its transfers: how much of the supply it bought (the dev
                buy included) and for how much ETH, what share of that it sold back and for how much, what share it moved to other wallets (a
                common way to look like the creator holds nothing), and what it holds now. Then their Pons launches, how many graduated, how
                often they sold early, and their ten most recent tokens. Each one opens its own report.
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
              <b>Blockscout</b>, when a key is set, for the biggest balances of busy tokens that are too long to read in one go.
            </li>
          </ul>
          <p>
            Nothing is kept for long: a report is read at the current block. A repeat check within a few minutes is answered from memory at once
            and read again in the background, so the next one is fresh.
          </p>
        </Section>

        <Section id="method" title="How each check works">
          <dl className="doc-dl">
            <div>
              <dt>Snipers</dt>
              <dd>
                Buys on the curve in the first 3 seconds after launch (about 30 blocks: Robinhood Chain makes a block every 0.1 s), by wallets other than the creator and the declared bundle (the
                bundle has its own vial). Their current balances give "still hold".
              </dd>
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
              <dd>
                Balances are rebuilt by replaying every Transfer event of the token from its first block. Busy tokens, with thousands of holders,
                take their 50 biggest balances from Blockscout's index instead; the ten biggest are read again from the chain on every check.
              </dd>
            </div>
            <div>
              <dt>Linked by sender</dt>
              <dd>
                A wallet that sent the token directly to three or more wallets that still hold it. Contracts (routers, pools, aggregators) are
                skipped, so ordinary buys never count. Groups under 0.5% of supply are dropped.
              </dd>
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
            <li>
              Busy tokens, with thousands of holders, take their biggest balances from Blockscout's index. Their linked wallets and volume are not
              read.
            </li>
            <li>Tokens that did not launch on Pons have no launch section, no snipers and no bundle. Holders, linked wallets and market still work.</li>
            <li>
              A linked group is a fact, not proof of one owner. A wallet can hand tokens out for honest reasons, so a group is a reason to look
              closer.
            </li>
            <li>The public RPC limits how fast it answers. Under heavy load a report can take longer.</li>
          </ul>
        </Section>

        <Section id="code" title="The code">
          <p>
            Everything is open source under the MIT license: the API that reads the chain, the site and the extension.{" "}
            <Out href={REPO_URL}>github.com/vialzapp/vialz</Out>
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
          <p>The extension asks for two permissions, and nothing else:</p>
          <dl className="doc-dl">
            <div>
              <dt>activeTab</dt>
              <dd>
                Only when you click the Vialz icon, and only for that tab: its link is read to find a token address. Page content, other tabs and
                your history are never read.
              </dd>
            </div>
            <div>
              <dt>storage</dt>
              <dd>To keep your recent checks on your device.</dd>
            </div>
          </dl>
          <p>
            When you check a token, only its address is sent to the API. No wallet, no history, no identifiers. The full policy is on the{" "}
            <Link href="/privacy">privacy page</Link>.
          </p>
        </Section>

        <Section id="official" title="Official links">
          <ul className="doc-list">
            <li>
              Site: <Out href="https://vialz.xyz">vialz.xyz</Out>
            </li>
            <li>
              X: <Out href={X_URL}>@vialzapp</Out>
            </li>
            {STORE_URL && (
              <li>
                Extension: <Out href={STORE_URL}>Chrome Web Store</Out>
              </li>
            )}
            <li>
              Code: <Out href={REPO_URL}>github.com/vialzapp/vialz</Out>
            </li>
            <li>
              Email: <a href="mailto:hello@vialz.xyz">hello@vialz.xyz</a>
            </li>
          </ul>
          <p className="doc-note">
            <b>We never DM first.</b> Vialz will never ask you to connect a wallet, sign a message or share a seed phrase. Anything that does is not us.
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
