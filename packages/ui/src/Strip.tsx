import type { CSSProperties } from "react";
import type { Pad } from "@vialz/shared";
import { Vessel } from "./Vessel";

const READ: Record<Pad["level"], string> = { danger: "high", warn: "watch", info: "note", good: "clear", none: "no data" };
// how far each vial fills: the stronger the reading, the fuller the vial
// a V holds little at the bottom (volume grows with the square of the level), so even "clear" fills past half
const LEVEL: Record<Pad["level"], number> = { good: 0.62, info: 0.72, warn: 0.84, danger: 0.96, none: 0 };

/** Six vials, one per check. Each fills with the colour and level of its reading. */
export function Strip({ pads, size = "m" }: { pads: Pad[]; size?: "m" | "l" }) {
  return (
    <div className={`strip strip-${size}`} role="list" aria-label="Readings">
      {pads.map((p, i) => (
        <div key={p.key} className={`strip-cell pad-${p.level}`} role="listitem" aria-label={`${p.label}: ${READ[p.level]}, ${p.reading}`}>
          <Vessel className="strip-vial" level={LEVEL[p.level]} fill="var(--pad)" glass="var(--glass)" style={{ "--i": i } as CSSProperties} />
          <span className="strip-label">{p.label}</span>
          <span className="strip-reading num">{p.reading}</span>
        </div>
      ))}
    </div>
  );
}
