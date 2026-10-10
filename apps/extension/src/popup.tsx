import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeftIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import "@fontsource-variable/archivo/standard.css";
import "@fontsource-variable/martian-mono/standard.css";
import "@vialz/ui";
import "./popup.css";
import { extractAddress, formatAge, padsFor, shortAddress, type PadLevel } from "@vialz/shared";
import { CheckInput, FILL, Mark, Report, ReportError, ReportSkeleton, Vessel, useTokenReport } from "@vialz/ui";

declare const __API_URL__: string;
const API = __API_URL__;
const SITE = API; // the API serves the site too
const RECENT_KEY = "recent";
const RECENT_MAX = 12;

interface Recent {
  address: string;
  symbol: string;
  at: number;
  levels: PadLevel[]; // the six readings when it was checked
}

const PAD_LEVELS: PadLevel[] = ["good", "info", "warn", "danger", "none"];
const validLevels = (v: unknown): PadLevel[] =>
  Array.isArray(v) && v.length === 6 && v.every((l) => PAD_LEVELS.includes(l)) ? (v as PadLevel[]) : Array(6).fill("none");

// Outside the extension (previewing the popup as a plain page) chrome.* is missing; fall back to localStorage.
const inExtension = typeof chrome !== "undefined" && Boolean(chrome.storage?.local);

async function loadRecent(): Promise<Recent[]> {
  try {
    const v = inExtension ? await chrome.storage.local.get(RECENT_KEY) : { [RECENT_KEY]: JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") };
    const list: unknown = v[RECENT_KEY];
    if (!Array.isArray(list)) return [];
    // stored data is checked on the way back in: only well-formed entries with a real address survive
    return list
      .filter((r): r is Recent => typeof r?.address === "string" && extractAddress(r.address) === r.address && typeof r.symbol === "string" && typeof r.at === "number")
      .map((r) => ({ address: r.address, symbol: r.symbol.slice(0, 16), at: r.at, levels: validLevels((r as { levels?: unknown }).levels) }))
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

async function saveRecent(item: Recent): Promise<Recent[]> {
  const list = [item, ...(await loadRecent()).filter((r) => r.address !== item.address)].slice(0, RECENT_MAX);
  try {
    if (inExtension) await chrome.storage.local.set({ [RECENT_KEY]: list });
    else localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // recent checks are a convenience; losing them is fine
  }
  return list;
}

/** The address in the current tab's link (gmgn, fomo, dexscreener and explorers put it there). Clicking the toolbar
 *  icon grants activeTab for that tab, which is exactly the tab the popup opens over. */
function usePageAddress() {
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    if (!inExtension || !chrome.tabs) return;
    const read = () =>
      chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(([tab]) => setAddress(tab?.url ? extractAddress(tab.url) : null))
        .catch(() => setAddress(null));
    void read();
  }, []);
  return address;
}

function Popup() {
  const [address, setAddress] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const pageAddress = usePageAddress();
  const state = useTokenReport(API, address);

  useEffect(() => {
    void loadRecent().then(setRecent);
  }, []);

  // opened over a token page (gmgn, fomo, dexscreener, an explorer): read that token straight away
  const [autoChecked, setAutoChecked] = useState(false);
  useEffect(() => {
    if (pageAddress && !autoChecked && !address) {
      setAutoChecked(true);
      setAddress(pageAddress);
    }
  }, [pageAddress, autoChecked, address]);

  const ready = state.status === "ready" ? state.report : null;
  useEffect(() => {
    if (ready) void saveRecent({ address: ready.address, symbol: ready.symbol, at: Date.now(), levels: padsFor(ready).map((p) => p.level) }).then(setRecent);
  }, [ready?.address, ready?.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback(
    (a: string) => {
      if (a === address) return state.retry();
      if (address) setHistory((h) => [...h, address]);
      setAddress(a);
    },
    [address, state.retry],
  );

  const back = () => {
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setAddress(prev ?? null);
  };

  const home = () => {
    setHistory([]);
    setAddress(null);
  };

  return (
    <div className="panel">
      <header className="panel-head">
        {history.length > 0 ? (
          <button type="button" className="panel-icon" onClick={back} aria-label="Back">
            <ArrowLeftIcon size={18} />
          </button>
        ) : (
          <button type="button" className="panel-icon panel-mark" onClick={home} aria-label="Vialz home" disabled={!address}>
            <Mark size={14} />
          </button>
        )}
        <span className="panel-name">Vialz</span>
        {address && (
          <button type="button" className="panel-chip" onClick={home} >
            <MagnifyingGlassIcon size={14} aria-hidden />
            Check another
          </button>
        )}
      </header>

      {!address && (
        <section className="panel-intro">
          <Vessel className="panel-intro-mark" level={0.5} />
          <h1>Open a token on gmgn or fomo, then click the icon.</h1>
          <p>Or paste a contract address. Every reading comes straight from Robinhood Chain.</p>
        </section>
      )}

      {(!address || state.status === "error") && (
        <CheckInput onCheck={open} initial={state.status === "error" ? "" : (address ?? "")} autoFocus />
      )}

      {pageAddress && pageAddress !== address && (
        <button type="button" className="panel-page" onClick={() => open(pageAddress)}>
          Check this page's token <span className="num">{shortAddress(pageAddress)}</span>
        </button>
      )}

      <div className="panel-body" aria-live="polite">
        {state.status === "loading" && <ReportSkeleton />}
        {state.status === "error" && <ReportError message={state.message} onRetry={state.retry} quiet={state.notFound} />}
        {state.status === "ready" && (
          <Report report={state.report} onOpenToken={open} apiBase={API} shareUrl={`${SITE}/t/${state.report.address}`} openFull />
        )}
      </div>

      {!address && recent.length > 0 && (
        <section className="panel-recent" aria-label="Recent checks">
          <h2>Recent</h2>
          <ul>
            {recent.map((r) => (
              <li key={r.address}>
                <button type="button" onClick={() => open(r.address)}>
                  <span className="panel-rack" aria-hidden>
                    {r.levels.map((l, i) => (
                      <Vessel key={i} className={`pad-${l}`} level={FILL[l]} fill="var(--pad)" glass="var(--glass)" stroke={22} />
                    ))}
                  </span>
                  <b>${r.symbol}</b>
                  <span className="panel-when">{formatAge(Math.floor((Date.now() - r.at) / 1000))} ago</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
