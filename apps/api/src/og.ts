// The link card of a token page: what X, Telegram and Discord show when someone shares vialz.xyz/t/<address>.
// Drawn with satori (layout and text to SVG) and resvg (SVG to PNG), in the site's colours, 1200x630.
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { formatAge, formatUsd, padsFor, tallyFlags, type Pad, type TokenReport } from "@vialz/shared";

const require = createRequire(import.meta.url);
const font = (weight: 500 | 700 | 800) => readFileSync(require.resolve(`@fontsource/archivo/files/archivo-latin-${weight}-normal.woff`));
let fonts: { name: string; data: Buffer; weight: 500 | 700 | 800; style: "normal" }[] | null = null;
const loadFonts = () => (fonts ??= ([500, 700, 800] as const).map((weight) => ({ name: "Archivo", data: font(weight), weight, style: "normal" as const })));

// tokens.css, in hex: satori does not read oklch
const C = {
  bg: "#07080a",
  well: "#16171a",
  ink: "#f1f2f4",
  ink2: "#afb1b5",
  ink3: "#84868a",
  rule: "#242528",
  glass: "#616367",
};
const PAD: Record<Pad["level"], string> = { danger: "#f7502a", warn: "#efad32", info: "#62a0ca", good: "#53ad81", none: "#343539" };
const TEXT: Record<Pad["level"], string> = { danger: "#ff8a73", warn: "#f8c562", info: C.ink, good: C.ink, none: C.ink3 };
const FILL: Record<Pad["level"], number> = { none: 0, good: 0.3, info: 0.5, warn: 0.75, danger: 1 };

// the vessel of packages/ui/src/Vessel.tsx, as an SVG data URI
function vessel(level: number, fill: string, glass = C.glass, stroke = 26): string {
  const CX = 200, TOP = 124, W = 196, H = 168;
  const lip = stroke * 0.85, l = CX - W / 2, r = CX + W / 2, by = TOP + H;
  const ly = by - H * Math.min(1, Math.max(0, level));
  const half = (W / 2 / H) * (by - ly);
  const liquid = level > 0 ? `<path d="M${CX - half},${ly} H${CX + half} L${CX},${by} Z" fill="${fill}"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="62 106 276 204">${liquid}<path d="M${l - lip},${TOP} H${l} L${CX},${by} L${r},${TOP} H${r + lip}" fill="none" stroke="${glass}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// a fixed scatter of faint stars, the site's night sky
const STARS = Array.from({ length: 46 }, (_, i) => {
  const x = (i * 263 + 71) % 1200, y = (i * 151 + 37) % 630;
  return { x, y, s: i % 7 === 0 ? 3 : 2, o: 0.18 + ((i * 37) % 30) / 100 };
});

type Node = { type: string; props: Record<string, unknown> & { style?: Record<string, unknown>; children?: unknown } };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style, children, ...extra },
});

function stat(label: string, value: string): Node {
  return h("div", { display: "flex", flexDirection: "column", gap: 8 }, [
    h("div", { fontSize: 19, fontWeight: 700, letterSpacing: 2, color: C.ink3 }, label.toUpperCase()),
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
      h("div", { display: "flex", gap: 8, fontSize: 24, color: C.ink2 }, [h("span", { fontWeight: 800, color }, String(t[k])), h("span", {}, word)]),
    );

  const symbol = r.symbol.length > 14 ? `${r.symbol.slice(0, 13)}…` : r.symbol;
  const name = r.name.length > 34 ? `${r.name.slice(0, 33)}…` : r.name;
  const avatar =
    image && /^image\/(png|jpe?g)$/.test(image.type)
      ? h("img", { width: 112, height: 112, borderRadius: 22, objectFit: "cover" }, undefined, {
          src: `data:${image.type};base64,${image.body.toString("base64")}`,
          width: 112,
          height: 112,
        })
      : h("div", { display: "flex", width: 112, height: 112, borderRadius: 22, background: C.well, alignItems: "center", justifyContent: "center", fontSize: 48, fontWeight: 800, color: C.ink2 }, symbol.slice(0, 1).toUpperCase());

  const root = h(
    "div",
    { position: "relative", display: "flex", flexDirection: "column", width: 1200, height: 630, background: C.bg, fontFamily: "Archivo", color: C.ink, padding: "48px 64px 44px" },
    [
      ...STARS.map((s) => h("div", { position: "absolute", left: s.x, top: s.y, width: s.s, height: s.s, borderRadius: 2, background: "#ffffff", opacity: s.o })),
      // the wordmark and where the facts come from
      h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
        h("div", { display: "flex", alignItems: "center", gap: 14 }, [
          h("img", { width: 46, height: 34 }, undefined, { src: vessel(0.5, C.ink, C.ink), width: 46, height: 34 }),
          h("div", { fontSize: 40, fontWeight: 800, letterSpacing: -1 }, "Vialz"),
        ]),
        h("div", { fontSize: 19, fontWeight: 700, letterSpacing: 2.5, color: C.ink3 }, "READ FROM ROBINHOOD CHAIN"),
      ]),
      // the token
      h("div", { display: "flex", alignItems: "center", gap: 28, marginTop: 42 }, [
        avatar,
        h("div", { display: "flex", flexDirection: "column", gap: 6 }, [
          h("div", { fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }, `$${symbol}`),
          h("div", { fontSize: 28, fontWeight: 500, color: C.ink2 }, name),
        ]),
      ]),
      h("div", { display: "flex", gap: 64, marginTop: 34 }, stats),
      // the six vials
      h(
        "div",
        { display: "flex", flexDirection: "column", marginTop: "auto", borderTop: `1px solid ${C.rule}`, paddingTop: 22 },
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
              h("div", { display: "flex", flexDirection: "column", alignItems: "center", width: 160, gap: 8 }, [
                h("img", { width: 84, height: 62 }, undefined, { src: vessel(FILL[p.level], PAD[p.level]), width: 84, height: 62 }),
                h("div", { fontSize: 17, fontWeight: 700, letterSpacing: 1.5, color: C.ink3, marginTop: 4 }, p.label.toUpperCase()),
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
