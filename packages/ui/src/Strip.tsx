import type { Pad } from "@vialz/shared";

const READ: Record<Pad["level"], string> = { danger: "high", warn: "watch", info: "note", good: "clear", none: "no data" };

/** Six reagent pads on one strip. Each pad develops into the colour of its reading. */
export function Strip({ pads, size = "m" }: { pads: Pad[]; size?: "m" | "l" }) {
  return (
    <div className={`strip strip-${size}`} role="list" aria-label="Test strip">
      {pads.map((p, i) => (
        <div key={p.key} className="strip-cell" role="listitem" aria-label={`${p.label}: ${READ[p.level]}, ${p.reading}`}>
          <span className={`strip-pad pad-${p.level}`} style={{ "--i": i } as React.CSSProperties} />
          <span className="strip-label">{p.label}</span>
          <span className="strip-reading num">{p.reading}</span>
        </div>
      ))}
    </div>
  );
}
