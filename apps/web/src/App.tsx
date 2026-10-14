import { XLogoIcon } from "@phosphor-icons/react";
import { useEffect, useState, type AnchorHTMLAttributes, type ReactElement } from "react";
import { extractAddress } from "@vialz/shared";
import { Mark } from "@vialz/ui";
import { FaqPage, FullReportPage, HowItReads, Landing } from "./pages/Landing";
import { TokenPage } from "./pages/TokenPage";
import { Privacy } from "./pages/Privacy";
import { Roadmap } from "./pages/Roadmap";
import { Docs } from "./pages/Docs";
import { CHROME_LABEL, CHROME_URL, REPO_URL, X_URL } from "./brand";


// A three-route site does not need a router library: the path is state, links push to history.
export function navigate(to: string) {
  if (to !== location.pathname + location.hash) {
    history.pushState(null, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  const id = to.split("#")[1];
  if (!id) return window.scrollTo({ top: 0 });
  // the target may belong to the page that is about to render: wait a frame for it
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 30);
}

/** A link off the site: always a new tab, so Vialz stays open behind it. */
export function Out({ href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" {...rest} />;
}

export function Link({ href = "/", ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || !href.startsWith("/")) return;
        e.preventDefault();
        navigate(href);
      }}
    />
  );
}

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return path;
}

// the site's sections, each its own page
const PAGES: Record<string, () => ReactElement> = {
  "/how": HowItReads,
  "/report": FullReportPage,
  "/faq": FaqPage,
  "/docs": Docs,
  "/privacy": Privacy,
  "/roadmap": Roadmap,
};
const MENU: [string, string][] = [
  ["/how", "How it reads"],
  ["/report", "Full report"],
  ["/faq", "FAQ"],
  ["/roadmap", "Roadmap"],
  ["/docs", "Docs"],
];

function NotFoundPage() {
  return (
    <div className="page page-missing">
      <div className="wrap">
        <h1>Nothing here.</h1>
        <p>
          This page does not exist. <Link href="/">Check a token</Link> or read the <Link href="/docs">docs</Link>.
        </p>
      </div>
    </div>
  );
}

export function App() {
  const path = usePath();
  const token = path.startsWith("/t/") ? extractAddress(path.slice(3)) : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const Page = path === "/" ? Landing : (PAGES[path] ?? NotFoundPage);

  // links from before the split pointed at sections of the home page
  useEffect(() => {
    const old: Record<string, string> = { "#vials": "/how", "#faq": "/faq", "#extension": CHROME_URL };
    const to = path === "/" ? old[location.hash] : path === "/extension" ? CHROME_URL : undefined;
    if (!to) return;
    if (!to.startsWith("/")) return void location.replace(to); // the store listing, once it exists
    history.replaceState(null, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
    const id = to.split("#")[1];
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 30);
  }, [path]);
  useEffect(() => setMenuOpen(false), [path]);
  // one title per section; token pages set their own once the report is in
  useEffect(() => {
    const titles: Record<string, string> = {
      "/": "Vialz, the Robinhood Chain token checker",
      "/how": "How it reads | Vialz",
      "/report": "Full report | Vialz",
      "/faq": "FAQ | Vialz",
      "/docs": "Docs | Vialz",
      "/privacy": "Privacy | Vialz",
      "/roadmap": "Roadmap | Vialz",
    };
    if (!token) document.title = titles[path] ?? "Not found | Vialz";
  }, [path, token]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="nav">
        <div className="wrap nav-row">
          <Link href="/" className="wordmark" aria-label="Vialz home">
            <Mark size={18} />
            Vialz
          </Link>
          <nav className={menuOpen ? "nav-links nav-open" : "nav-links"} id="menu" aria-label="Main">
            {MENU.map(([href, label]) => (
              <Link key={href} href={href} aria-current={path === href || (href === "/report" && token) ? "page" : undefined}>
                {label}
              </Link>
            ))}
            <Out href={REPO_URL}>GitHub</Out>
            <Out href={X_URL} className="nav-x" aria-label="Vialz on X">
              <XLogoIcon size={17} aria-hidden />
            </Out>
            {CHROME_URL.startsWith("/") ? (
              <Link className="btn btn-act nav-cta" href={CHROME_URL}>
                {CHROME_LABEL}
              </Link>
            ) : (
              <Out className="btn btn-act nav-cta" href={CHROME_URL}>
                {CHROME_LABEL}
              </Out>
            )}
          </nav>
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
      </header>
      <main id="main">
        {token ? <TokenPage address={token} /> : <Page />}
      </main>
      <footer className="footer">
        <div className="wrap footer-row">
          <span className="wordmark wordmark-s">Vialz</span>
          <p>Reads Robinhood Chain. Not affiliated with Robinhood. Open source, MIT. Nothing here is financial advice.</p>
          <nav aria-label="Footer">
            <Link href="/docs">Docs</Link>
            <Link href="/roadmap">Roadmap</Link>
            <Out href={REPO_URL}>GitHub</Out>
            <Out href={X_URL}>X @vialzapp</Out>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
