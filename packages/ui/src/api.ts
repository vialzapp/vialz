import { useCallback, useEffect, useRef, useState } from "react";
import { isPending, type ApiError, type TokenReport } from "@vialz/shared";

export type ReportState =
  | { status: "idle" }
  | { status: "loading"; address: string }
  | { status: "ready"; address: string; report: TokenReport; refreshing: boolean }
  | { status: "error"; address: string; message: string; notFound: boolean };

/** A failed read, with the API's error code when it sent one. */
export class ReportFailure extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
  }
}

export async function fetchReport(apiBase: string, address: string, signal?: AbortSignal): Promise<TokenReport> {
  let res: Response;
  try {
    const timeout = AbortSignal.timeout(45_000);
    const both = signal && "any" in AbortSignal ? AbortSignal.any([signal, timeout]) : (signal ?? timeout);
    res = await fetch(`${apiBase}/v1/token/${address}`, { signal: both });
  } catch (e) {
    if ((e as Error).name === "AbortError" && signal?.aborted) throw e;
    if ((e as Error).name === "TimeoutError") throw new ReportFailure("The read took too long. Try again in a few seconds.");
    throw new ReportFailure("Can't reach the Vialz server. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ReportFailure(body?.message ?? `The server answered ${res.status}. Try again in a few seconds.`, body?.error ?? null);
  }
  return (await res.json()) as TokenReport;
}

/** A report that will not be read again: whatever is still pending is shown as not available. */
const settled = (r: TokenReport): TokenReport => ({
  ...r,
  fundingStatus: r.fundingStatus === "pending" ? "off" : r.fundingStatus,
  devStatus: r.devStatus === "pending" ? "off" : r.devStatus,
});

/** Loads a report for `address` and re-reads it while funding lookups are still pending. `retry` reads it again. */
export function useTokenReport(apiBase: string, address: string | null): ReportState & { retry: () => void } {
  const [state, setState] = useState<ReportState>({ status: "idle" });
  const [nonce, setNonce] = useState(0);
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
        if (isPending(report)) {
          // the creator's record lands within seconds, funding within a minute: poll fast first, then slower
          if (polls < 14) timer.current = setTimeout(() => void load(true), polls++ < 4 ? 2_000 : 4_000);
          // out of polls: show what we have and stop promising more
          else setState({ status: "ready", address, report: settled(report), refreshing: false });
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        // a failed re-read keeps the report but stops promising funding results that will not come
        if (refresh) setState((s) => (s.status === "ready" ? { ...s, refreshing: false, report: settled(s.report) } : s));
        else setState({ status: "error", address, message: (e as Error).message, notFound: e instanceof ReportFailure && e.code === "not_found" });
      }
    };
    void load(false);

    return () => {
      ctrl.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [apiBase, address, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  // until the effect runs, state may still belong to the previous address: never hand that out under the new one
  if (!address) return { status: "idle", retry };
  if (state.status === "idle" || state.address !== address) return { status: "loading", address, retry };
  return { ...state, retry };
}
