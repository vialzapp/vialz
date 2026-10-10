/** Placeholder in the shape of the report while the chain is read (5 to 15 seconds). */
export function ReportSkeleton({ note }: { note?: string }) {
  return (
    <div className="vz-skeleton" aria-busy="true">
      <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 12, alignItems: "center" }}>
        <div className="sk" style={{ width: 44, height: 44 }} />
        <div style={{ display: "grid", gap: 8 }}>
          <div className="sk" style={{ height: 16, width: "55%" }} />
          <div className="sk" style={{ height: 12, width: "80%" }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="sk" style={{ height: 28 }} />
        ))}
      </div>
      {[90, 70, 80].map((w, i) => (
        <div key={i} className="sk" style={{ height: 12, width: `${w}%` }} />
      ))}
      <p className="vz-loading-note" role="status">
        {note ?? "Reading the token's whole history from the chain. This takes a few seconds."}
      </p>
    </div>
  );
}

export function ReportError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="vz-error" role="alert">
      <b>Couldn't read this token</b>
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-quiet vz-retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
