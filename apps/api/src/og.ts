// The link card of a token page: what X, Telegram and Discord show when someone shares vialz.xyz/t/<address>.
// Drawn with satori (layout and text to SVG) and resvg (SVG to PNG), in the site's colours, 1200x630.
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { formatAge, formatUsd, padsFor, tallyFlags, type Pad, type TokenReport } from "@vialz/shared";

const require = createRequire(import.meta.url);
const file = (path: string) => readFileSync(require.resolve(path));
type Font = { name: string; data: Buffer; weight: 500 | 600 | 700 | 800; style: "normal" };
let fonts: Font[] | null = null;
// Archivo for figures and text, Barlow Condensed for the lettering (names, labels), as on the site
const loadFonts = () =>
  (fonts ??= [
    ...([500, 700, 800] as const).map((weight) => ({ name: "Archivo", data: file(`@fontsource/archivo/files/archivo-latin-${weight}-normal.woff`), weight, style: "normal" as const })),
    ...([500, 600] as const).map((weight) => ({ name: "Barlow", data: file(`@fontsource/barlow-condensed/files/barlow-condensed-latin-${weight}-normal.woff`), weight, style: "normal" as const })),
  ]);

// tokens.css (the borosilicate palette), in hex: satori does not read oklch
const C = {
  bg: "#070a0a",
  sheet: "#0f1414",
  well: "#161c1d",
  ink: "#eff1ed",
  ink2: "#b3b9b6",
  ink3: "#87908e",
  rule: "#252c2c",
  glass: "#728582",
};
const PAD: Record<Pad["level"], string> = { danger: "#f7502a", warn: "#efad32", info: "#62a0ca", good: "#53ad81", none: "#3c4444" };
// the lit surface of each liquid, as in report.css
const SURFACE: Record<Pad["level"], string> = { danger: "#ff9a78", warn: "#ffd779", info: "#a9cbe8", good: "#9fd6b4", none: "#3c4444" };
const TEXT: Record<Pad["level"], string> = { danger: "#ff8a73", warn: "#f8c562", info: C.ink, good: C.ink, none: C.ink3 };
const FILL: Record<Pad["level"], number> = { none: 0, good: 0.3, info: 0.5, warn: 0.75, danger: 1 };

// the vessel of packages/ui/src/Vessel.tsx, as an SVG data URI
function vessel(level: number, fill: string, glass = C.glass, stroke = 26, surface?: string, shine = false): string {
  const CX = 200, TOP = 124, W = 196, H = 168;
  const lip = stroke * 0.85, l = CX - W / 2, r = CX + W / 2, by = TOP + H;
  const ly = by - H * Math.min(1, Math.max(0, level));
  const half = (W / 2 / H) * (by - ly);
  const liquid = level > 0 ? `<path d="M${CX - half},${ly} H${CX + half} L${CX},${by} Z" fill="${fill}"/>` : "";
  const meniscus =
    level > 0 && surface && half > stroke
      ? `<path d="M${CX - half + stroke * 0.6},${ly} H${CX + half - stroke * 0.6}" stroke="${surface}" stroke-width="${stroke * 0.6}" stroke-linecap="round"/>`
      : "";
  // light caught on the upper outer edge of the left wall
  const streak = shine
    ? `<path d="M${l + W * 0.05 - stroke * 0.17},${TOP + H * 0.1 + stroke * 0.1} L${l + W * 0.25 - stroke * 0.17},${TOP + H * 0.5 + stroke * 0.1}" stroke="#f3f8f6" stroke-opacity="0.4" stroke-width="${stroke * 0.16}" stroke-linecap="round"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="62 106 276 204">${liquid}${meniscus}<path d="M${l - lip},${TOP} H${l} L${CX},${by} L${r},${TOP} H${r + lip}" fill="none" stroke="${glass}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>${streak}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// a fixed scatter of faint stars, the site's night sky
const STARS = Array.from({ length: 46 }, (_, i) => {
  const x = (i * 263 + 71) % 1200, y = (i * 151 + 37) % 630;
  return { x, y, s: i % 7 === 0 ? 3 : 2, o: 0.14 + ((i * 37) % 26) / 100, c: i % 3 === 0 ? "#efe9dc" : "#dce6f2" };
});

type Node = { type: string; props: Record<string, unknown> & { style?: Record<string, unknown>; children?: unknown } };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style, children, ...extra },
});

function stat(label: string, value: string): Node {
  return h("div", { display: "flex", flexDirection: "column", gap: 8 }, [
    h("div", { fontFamily: "Barlow", fontSize: 22, fontWeight: 600, letterSpacing: 1.6, color: C.ink3 }, label.toUpperCase()),
    h("div", { fontSize: 38, fontWeight: 700, color: C.ink }, value),
  ]);
}

export async function tokenCard(r: TokenReport, image: { type: string; body: Buffer } | null): Promise<Buffer> {
  const pads = padsFor(r);
  // a token too big to read in one pass has most vials empty: the card shows its findings instead of a row of n/a
  const sparse = pads.filter((p) => p.short === "n/a").length >= 4;
  const rank = { danger: 0, warn: 1, good: 2, info: 3 } as const;
  const findings = [...r.flags].sort((a, b) => rank[a.level] - rank[b.level]).slice(0, 3);
  const t = tallyFlags(r.flags);
  const m = r.market;
  const stats: Node[] = [stat("Mcap", formatUsd(m?.mcapUsd ?? null))];
  if (r.launch && r.launch.graduatedBlock == null) stats.push(stat("To graduation", `${Math.round(r.launch.progressPct)}%`));
  else stats.push(stat("Liquidity", formatUsd(m?.liquidityUsd ?? null)));
  stats.push(stat("Holders", r.holders.count ? r.holders.count.toLocaleString("en-US") : "n/a"));
  stats.push(stat("Age", r.createdAt ? formatAge(Date.now() / 1000 - r.createdAt) : "n/a"));

  const tally = (
    [
      ["danger", "high", "#ff8a73"],
      ["warn", "watch", "#f8c562"],
      ["info", "notes", C.ink],
      ["good", "clear", C.ink],
    ] as const
  )
    .filter(([k]) => t[k] > 0)
    .map(([k, word, color]) =>
      h("div", { display: "flex", alignItems: "center", gap: 8, fontSize: 24, color: C.ink2 }, [
        h("div", { width: 11, height: 11, borderRadius: 2, background: PAD[k] }),
        h("span", { fontWeight: 800, color }, String(t[k])),
        h("span", {}, word),
      ]),
    );

  const symbol = r.symbol.length > 14 ? `${r.symbol.slice(0, 13)}…` : r.symbol;
  const name = r.name.length > 34 ? `${r.name.slice(0, 33)}…` : r.name;
  const avatar =
    image && /^image\/(png|jpe?g)$/.test(image.type)
      ? h("img", { width: 112, height: 112, borderRadius: 22, objectFit: "cover", border: `1px solid ${C.rule}` }, undefined, {
          src: `data:${image.type};base64,${image.body.toString("base64")}`,
          width: 112,
          height: 112,
        })
      : h("div", { display: "flex", width: 112, height: 112, borderRadius: 22, background: C.well, alignItems: "center", justifyContent: "center", fontFamily: "Barlow", fontSize: 56, fontWeight: 600, color: C.ink2 }, symbol.slice(0, 1).toUpperCase());

  const root = h(
    "div",
    {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      width: 1200,
      height: 630,
      // the faintest light from the top, as on the site
      backgroundImage: `linear-gradient(180deg, #0e1414 0%, ${C.bg} 70%)`,
      backgroundColor: C.bg,
      fontFamily: "Archivo",
      color: C.ink,
      padding: "46px 64px 0",
    },
    [
      ...STARS.map((s) => h("div", { position: "absolute", left: s.x, top: s.y, width: s.s, height: s.s, borderRadius: 2, background: s.c, opacity: s.o })),
      // the wordmark and where the facts come from
      h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
        h("div", { display: "flex", alignItems: "center", gap: 14 }, [
          h("img", { width: 46, height: 34 }, undefined, { src: vessel(0.5, C.ink, C.ink), width: 46, height: 34 }),
          h("div", { fontSize: 40, fontWeight: 800, letterSpacing: -1 }, "Vialz"),
        ]),
        h("div", { fontFamily: "Barlow", fontSize: 22, fontWeight: 600, letterSpacing: 2.4, color: C.ink3 }, "READ FROM ROBINHOOD CHAIN"),
      ]),
      // the token
      h("div", { display: "flex", alignItems: "center", gap: 28, marginTop: 42 }, [
        avatar,
        h("div", { display: "flex", flexDirection: "column", gap: 6 }, [
          h("div", { fontFamily: "Barlow", fontSize: 92, fontWeight: 600, lineHeight: 0.95 }, `$${symbol}`),
          h("div", { fontSize: 28, fontWeight: 500, color: C.ink2 }, name),
        ]),
      ]),
      h("div", { display: "flex", gap: 64, marginTop: 30 }, stats),
      // the six vials
      h(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          marginTop: "auto",
          marginLeft: -64,
          marginRight: -64,
          padding: "20px 64px 30px",
          borderTop: `1px solid ${C.rule}`,
          background: C.sheet,
        },
        [
          h("div", { display: "flex", justifyContent: "space-between", alignItems: "center" }, [
            h("div", { display: "flex", gap: 26 }, tally.length ? tally : [h("div", { fontSize: 24, color: C.ink2 }, "No findings")]),
            h("div", { fontSize: 20, color: C.ink3 }, "Facts from the chain, not advice."),
          ]),
          sparse
            ? h(
                "div",
                { display: "flex", flexDirection: "column", gap: 14, marginTop: 22 },
                findings.map((f) =>
                  h("div", { display: "flex", alignItems: "center", gap: 16, fontSize: 28, color: C.ink }, [
                    h("div", { width: 14, height: 14, borderRadius: 3, background: PAD[f.level] }),
                    h("div", {}, f.text.length > 70 ? `${f.text.slice(0, 69)}…` : f.text),
                  ]),
                ),
              )
            : h(
            "div",
            { display: "flex", justifyContent: "space-between", marginTop: 18 },
            pads.map((p) =>
              h("div", { display: "flex", flexDirection: "column", alignItems: "center", width: 160, gap: 6 }, [
                h("img", { width: 92, height: 68 }, undefined, { src: vessel(FILL[p.level], PAD[p.level], C.glass, 22, SURFACE[p.level], true), width: 92, height: 68 }),
                h("div", { fontFamily: "Barlow", fontSize: 20, fontWeight: 600, letterSpacing: 1.4, color: C.ink3, marginTop: 6 }, p.label.toUpperCase()),
                h("div", { fontSize: 30, fontWeight: 800, color: TEXT[p.level] }, p.short),
              ]),
            ),
          ),
        ],
      ),
    ],
  );

  const svg = await satori(root as never, { width: 1200, height: 630, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}
