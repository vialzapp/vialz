import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeftIcon, XIcon } from "@phosphor-icons/react";
import "@fontsource-variable/archivo/standard.css";
import "@fontsource-variable/martian-mono/standard.css";
import "@vialz/ui";
import "./panel.css";
import { extractAddress, shortAddress } from "@vialz/shared";
import { CheckInput, Mark, Report, ReportError, ReportSkeleton, useTokenReport } from "@vialz/ui";

declare const __API_URL__: string;
const API = __API_URL__;
const RECENT_KEY = "recent";
const RECENT_MAX = 12;

interface Recent {
  address: string;
  symbol: string;
  at: number;
}

// Outside the extension (previewing the panel as a plain page) chrome.* is missing; fall back to localStorage.
const inExtension = typeof chrome !== "undefined" && Boolean(chrome.storage?.local);

async function loadRecent(): Promise<Recent[]> {
  try {
    const v = inExtension ? await chrome.storage.local.get(RECENT_KEY) : { [RECENT_KEY]: JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") };
    const list: unknown = v[RECENT_KEY];
    if (!Array.isArray(list)) return [];
    // stored data is checked on the way back in: only well-formed entries with a real address survive
    return list
      .filter((r): r is Recent => typeof r?.address === "string" && extractAddress(r.address) === r.address && typeof r.symbol === "string" && typeof r.at === "number")
      .map((r) => ({ address: r.address, symbol: r.symbol.slice(0, 16), at: r.at }))
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

/** The address in the active tab's link (gmgn, fomo, dexscreener and explorers put it there). Needs the activeTab grant from opening the panel. */
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
    chrome.tabs.onActivated.addListener(read);
    chrome.tabs.onUpdated.addListener(read);
    return () => {
      chrome.tabs.onActivated.removeListener(read);
      chrome.tabs.onUpdated.removeListener(read);
    };
  }, []);
  return address;
}

function Panel() {
  const [address, setAddress] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const pageAddress = usePageAddress();
  const state = useTokenReport(API, address);

  useEffect(() => {
    void loadRecent().then(setRecent);
  }, []);

  useEffect(() => {
    if (state.status === "ready") void saveRecent({ address: state.address, symbol: state.report.symbol, at: Date.now() }).then(setRecent);
  }, [state]);

  const open = useCallback(
    (a: string) => {
      if (address && a !== address) setHistory((h) => [...h, address]);
      setAddress(a);
    },
    [address],
  );

  const back = () => {
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setAddress(prev ?? null);
  };

  return (
    <div className="panel">
      <header className="panel-head">
        {address ? (
          <button type="button" className="panel-icon" onClick={back} aria-label="Back">
            <ArrowLeftIcon size={18} />
          </button>
        ) : (
          <span className="panel-mark" aria-hidden>
            <Mark size={14} />
          </span>
        )}
        <span className="panel-name">Vialz</span>
        {address && (
          <button
            type="button"
            className="panel-icon panel-close"
            onClick={() => {
              setHistory([]);
              setAddress(null);
            }}
            aria-label="Clear"
          >
            <XIcon size={18} />
          </button>
        )}
      </header>

      <CheckInput onCheck={open} initial={address ?? ""} autoFocus busy={state.status === "loading"} />

      {pageAddress && pageAddress !== address && (
        <button type="button" className="panel-page" onClick={() => open(pageAddress)}>
          Check this page's token <span className="num">{shortAddress(pageAddress)}</span>
        </button>
      )}

      {state.status === "loading" && <ReportSkeleton />}
      {state.status === "error" && <ReportError message={state.message} />}
      {state.status === "ready" && <Report report={state.report} onOpenToken={open} apiBase={API} />}

      {state.status === "idle" && (
        <section className="panel-recent" aria-label="Recent checks">
          {recent.length === 0 ? (
            <p className="panel-hint">Paste a contract address or a gmgn, fomo, X or DexScreener link. Vialz reads the token straight from Robinhood Chain.</p>
          ) : (
            <>
              <h2>Recent</h2>
              <ul>
                {recent.map((r) => (
                  <li key={r.address}>
                    <button type="button" onClick={() => open(r.address)}>
                      <b>${r.symbol}</b>
                      <span className="num">{shortAddress(r.address)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Panel />
  </StrictMode>,
);
