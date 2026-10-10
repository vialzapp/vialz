import { useEffect, useRef, useState } from "react";
import type { ApiError, TokenReport } from "@vialz/shared";

export type ReportState =
  | { status: "idle" }
  | { status: "loading"; address: string }
  | { status: "ready"; address: string; report: TokenReport; refreshing: boolean }
  | { status: "error"; address: string; message: string };

export async function fetchReport(apiBase: string, address: string, signal?: AbortSignal): Promise<TokenReport> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/v1/token/${address}`, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error("Can't reach the Vialz server. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.message ?? `The server answered ${res.status}. Try again in a few seconds.`);
  }
  return (await res.json()) as TokenReport;
}

/** Loads a report for `address` and re-reads it while funding lookups are still pending. */
export function useTokenReport(apiBase: string, address: string | null): ReportState {
  const [state, setState] = useState<ReportState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!address) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    let polls = 0;
    setState({ status: "loading", address });

    const load = async (refresh: boolean) => {
      if (refresh) setState((s) => (s.status === "ready" ? { ...s, refreshing: true } : s));
      try {
        const report = await fetchReport(apiBase, address, ctrl.signal);
        setState({ status: "ready", address, report, refreshing: false });
        if (report.fundingStatus === "pending" && polls++ < 8) timer.current = setTimeout(() => void load(true), 4_000);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (refresh) setState((s) => (s.status === "ready" ? { ...s, refreshing: false } : s));
        else setState({ status: "error", address, message: (e as Error).message });
      }
    };
    void load(false);

    return () => {
      ctrl.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [apiBase, address]);

  return state;
}
