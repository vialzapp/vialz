import { useEffect, useState, type AnchorHTMLAttributes } from "react";
import { extractAddress } from "@vialz/shared";
import { Mark } from "@vialz/ui";
import { Landing } from "./pages/Landing";
import { TokenPage } from "./pages/TokenPage";
import { Privacy } from "./pages/Privacy";
import { Docs } from "./pages/Docs";
import { CHROME_LABEL, CHROME_URL, REPO_URL } from "./brand";

// A three-route site does not need a router library: the path is state, links push to history.
export function navigate(to: string) {
  if (to === location.pathname + location.hash) return;
  history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  if (!to.includes("#")) window.scrollTo({ top: 0 });
}

export function Link({ href = "/", ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || !href.startsWith("/") || href.startsWith("/#")) return;
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
            <a href="/#vials">How it reads</a>
            <Link href="/docs">Docs</Link>
            <a href={REPO_URL}>GitHub</a>
            <Link className="btn btn-act nav-cta" href={CHROME_URL}>
              {CHROME_LABEL}
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
          <p>Reads Robinhood Chain. Not affiliated with Robinhood. Nothing here is financial advice.</p>
          <nav aria-label="Footer">
            <Link href="/docs">Docs</Link>
            <a href={REPO_URL}>GitHub</a>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
