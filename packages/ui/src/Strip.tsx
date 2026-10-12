import type { CSSProperties } from "react";
import type { Pad } from "@vialz/shared";
import { Vessel } from "./Vessel";

export const READ: Record<Pad["level"], string> = { danger: "high", warn: "watch", info: "note", good: "clear", none: "no data" };

/** How far each vial fills: the stronger the reading, the fuller the vial, up to the brim for high. A V holds the
 *  square of its level, so these steps (a tenth, a quarter, a half, all of it by volume) read apart at a glance. */
export const FILL: Record<Pad["level"], number> = { none: 0, good: 0.3, info: 0.5, warn: 0.75, danger: 1 };

/** What the levels mean, under the shelf: a fuller vial is a stronger reading, never a healthier one. */
export function StripLegend() {
  return (
    <p className="strip-legend">
      {(["good", "info", "warn", "danger"] as const).map((l) => (
        <span key={l} className={`pad-${l}`}>
          <i aria-hidden />
          {READ[l]}
        </span>
      ))}
      <span className="strip-legend-note">the fuller, the stronger</span>
    </p>
  );
}

/** Six vials on one shelf, one per check. Each fills with the colour and level of its reading. */
export function Strip({ pads, size = "m" }: { pads: Pad[]; size?: "m" | "l" }) {
  return (
    <div className={`strip strip-${size}`} role="list" aria-label="Readings">
      {pads.map((p, i) => (
        <div
          key={p.key}
          className={`strip-cell pad-${p.level}`}
          role="listitem"
          aria-label={`${p.label}: ${READ[p.level]}, ${p.reading}`}
          title={`${p.label}: ${p.reading}`}
        >
          <Vessel
            className="strip-vial"
            level={FILL[p.level]}
            fill="var(--pad)"
            glass="var(--glass)"
            surface="var(--surface)"
            stroke={16}
            style={{ "--i": i } as CSSProperties}
          />
          <span className="strip-label" aria-hidden>
            {p.label}
          </span>
          <span className="strip-reading" aria-hidden>
            {p.short}
          </span>
        </div>
      ))}
    </div>
  );
}
