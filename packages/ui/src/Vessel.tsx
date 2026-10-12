import type { CSSProperties } from "react";

// The Vialz vessel: a V drawn as a flask. The arms are the walls, the lower part is the liquid, filled to `level`.
// Same geometry as brand/mark.py, in a viewBox cropped to the shape.
const CX = 200;
const TOP = 124;
const W = 196;
const H = 168;
const VIEWBOX = "62 106 276 204";

interface Props {
  level?: number; // 0..1 of the height
  fill?: string; // liquid colour
  glass?: string; // wall colour
  surface?: string; // meniscus colour; none when left out
  stroke?: number;
  /** graduation marks on the glass, at these levels (0..1), like the enamel marks on lab glassware */
  ticks?: number[];
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/** Where a level sits in the vessel's box, from the top, as a share of its height: for labels set beside the glass. */
export const vesselTop = (level: number) => (TOP + H - H * level - 106) / 204;

export function Vessel({ level = 0.5, fill = "currentColor", glass = "currentColor", surface, stroke = 26, ticks, className, style, title }: Props) {
  const lip = stroke * 0.85;
  const l = CX - W / 2;
  const r = CX + W / 2;
  const by = TOP + H;
  const ly = by - H * Math.min(1, Math.max(0, level));
  const half = (W / 2 / H) * (by - ly);
  return (
    <svg viewBox={VIEWBOX} className={className} style={style} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {level > 0 && (
        <g className="vessel-liquid">
          <path d={`M${CX - half},${ly} H${CX + half} L${CX},${by} Z`} fill={fill} />
          {/* the meniscus: a lighter line on the surface is what makes it read as liquid */}
          {surface && half > stroke && (
            <path className="vessel-surface" d={`M${CX - half + stroke * 0.6},${ly} H${CX + half - stroke * 0.6}`} stroke={surface} strokeWidth={stroke * 0.6} strokeLinecap="round" />
          )}
        </g>
      )}
      {ticks?.map((t) => {
        const y = by - H * t;
        const x = CX + (W / 2 / H) * (by - y) - stroke * 0.55;
        return <path key={t} className="vessel-tick" d={`M${x - stroke * 1.3},${y} H${x}`} strokeWidth={stroke * 0.32} strokeLinecap="round" />;
      })}
      <path
        d={`M${l - lip},${TOP} H${l} L${CX},${by} L${r},${TOP} H${r + lip}`}
        fill="none"
        stroke={glass}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* light caught on the outer edge of the left wall, upper half: shown only where a page turns it on */}
      <path
        className="vessel-specular"
        d={`M${l + W * 0.05 - stroke * 0.17},${TOP + H * 0.1 + stroke * 0.1} L${l + W * 0.25 - stroke * 0.17},${TOP + H * 0.5 + stroke * 0.1}`}
        strokeWidth={stroke * 0.16}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The logo: the vessel half full, in one colour. */
export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  return <Vessel level={0.5} className={className} style={{ width: size * 1.35, height: size }} />;
}
