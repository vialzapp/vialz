import { useEffect, useState, type AnchorHTMLAttributes } from "react";
import { extractAddress } from "@vialz/shared";
import { Mark } from "@vialz/ui";
import { Landing } from "./pages/Landing";
import { TokenPage } from "./pages/TokenPage";
import { Privacy } from "./pages/Privacy";
import { Docs } from "./pages/Docs";
import { CHROME_LABEL, CHROME_URL, REPO_URL, X_URL } from "./brand";

const IN_STORE = Boolean(import.meta.env.VITE_CHROME_URL);

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

export function App() {
  const path = usePath();
  const token = path.startsWith("/t/") ? extractAddress(path.slice(3)) : null;

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
          <nav className="nav-links" aria-label="Main">
            <Link href="/#vials">How it reads</Link>
            <Link href="/docs">Docs</Link>
            <Out href={REPO_URL}>GitHub</Out>
            <Out href={X_URL}>X</Out>
            <Link className={IN_STORE ? "btn btn-act nav-cta" : "nav-install"} href={CHROME_URL}>
              {IN_STORE ? CHROME_LABEL : "Install beta"}
            </Link>
          </nav>
        </div>
      </header>
      <main id="main">
        {token ? <TokenPage address={token} /> : path === "/privacy" ? <Privacy /> : path === "/docs" ? <Docs /> : <Landing />}
      </main>
      <footer className="footer">
        <div className="wrap footer-row">
          <span className="wordmark wordmark-s">Vialz</span>
          <p>Reads Robinhood Chain. Not affiliated with Robinhood. Open source, MIT. Nothing here is financial advice.</p>
          <nav aria-label="Footer">
            <Link href="/docs">Docs</Link>
            <Out href={REPO_URL}>GitHub</Out>
            <Out href={X_URL}>X @vialzapp</Out>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
