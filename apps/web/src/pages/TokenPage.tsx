import { useEffect, useState } from "react";
import { CheckIcon, LinkSimpleIcon } from "@phosphor-icons/react";
import { CheckInput, CopySummary, Report, ReportError, ReportSkeleton, useTokenReport } from "@vialz/ui";
import { navigate } from "../App";
import { API_BASE } from "../brand";

export function TokenPage({ address }: { address: string }) {
  const state = useTokenReport(API_BASE, address);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = state.status === "ready" ? `$${state.report.symbol} · Vialz` : "Reading · Vialz";
  }, [state]);

  return (
    <section className="token-page">
      <div className="wrap token-wrap">
        <div className="token-tools">
          <CheckInput
            initial={address}
            onCheck={(a) => (a === address ? state.retry() : navigate(`/t/${a}`))}
            busy={state.status === "loading"}
            label="Check another token"
          />
        </div>
        {state.status === "loading" && <ReportSkeleton quick={state.quick} apiBase={API_BASE} />}
        {state.status === "error" && <ReportError message={state.message} onRetry={state.retry} quiet={state.notFound} />}
        {state.status === "ready" && (
          <>
            <Report report={state.report} onOpenToken={(a) => navigate(`/t/${a}`)} apiBase={API_BASE} headingLevel={1} />
            <div className="token-share">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  navigator.clipboard
                    .writeText(location.href)
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1400);
                    })
                    .catch(() => {});
                }}
              >
                {copied ? <CheckIcon size={16} weight="bold" /> : <LinkSimpleIcon size={16} />}
                {copied ? "Link copied" : "Copy link"}
              </button>
              <CopySummary report={state.report} url={`${location.origin}/t/${state.report.address}`} />
              {state.refreshing && <span className="token-refresh">Checking where top holders got their ETH</span>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
