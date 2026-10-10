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
  stroke?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Vessel({ level = 0.5, fill = "currentColor", glass = "currentColor", stroke = 26, className, style, title }: Props) {
  const lip = stroke * 0.85;
  const l = CX - W / 2;
  const r = CX + W / 2;
  const by = TOP + H;
  const ly = by - H * Math.min(1, Math.max(0, level));
  const half = (W / 2 / H) * (by - ly);
  return (
    <svg viewBox={VIEWBOX} className={className} style={style} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {level > 0 && <path className="vessel-liquid" d={`M${CX - half},${ly} H${CX + half} L${CX},${by} Z`} fill={fill} />}
      <path
        d={`M${l - lip},${TOP} H${l} L${CX},${by} L${r},${TOP} H${r + lip}`}
        fill="none"
        stroke={glass}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The logo: the vessel half full, in one colour. */
export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  return <Vessel level={0.5} className={className} style={{ width: size * 1.35, height: size }} />;
}
