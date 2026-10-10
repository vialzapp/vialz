import { useEffect, useState } from "react";
import { Vessel } from "./Vessel";

// what the API does while the popup waits, in the order it does it
const STEPS = ["Reading every transfer", "Finding snipers and the bundle", "Looking for linked wallets", "Checking the creator's launches"];

/** Placeholder in the shape of the report while the chain is read (5 to 15 seconds): six empty glasses on the shelf. */
export function ReportSkeleton({ note }: { note?: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (note) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800);
    return () => clearInterval(t);
  }, [note]);

  return (
    <div className="vz-skeleton" aria-busy="true">
      <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 12, alignItems: "center" }}>
        <div className="sk" style={{ width: 44, height: 44, borderRadius: 10 }} />
        <div style={{ display: "grid", gap: 8 }}>
          <div className="sk" style={{ height: 16, width: "55%" }} />
          <div className="sk" style={{ height: 12, width: "40%" }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="sk" style={{ height: 30 }} />
        ))}
      </div>
      <div className="strip" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="strip-cell pad-none">
            <Vessel className="strip-vial" level={0} glass="var(--glass)" stroke={16} />
            <div className="sk" style={{ height: 9, width: 36, marginTop: 2 }} />
            <div className="sk" style={{ height: 13, width: 26, marginTop: 6 }} />
          </div>
        ))}
      </div>
      <p className="vz-loading-note" role="status">
        {note ?? (
          <>
            <span className="vz-loading-step">{STEPS[step]}</span>. Straight from the chain, about 5 seconds.
          </>
        )}
      </p>
    </div>
  );
}

/** A read that failed. `quiet` is for an address that simply is not a token: nothing went wrong, nothing to retry. */
export function ReportError({ message, onRetry, quiet }: { message: string; onRetry?: () => void; quiet?: boolean }) {
  return (
    <div className={quiet ? "vz-error vz-error-quiet" : "vz-error"} role="alert">
      <b>{quiet ? "Nothing to read here" : "Couldn't read this token"}</b>
      <span>{message}</span>
      {onRetry && !quiet && (
        <button type="button" className="btn btn-quiet vz-retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
