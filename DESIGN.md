# Vialz design system

One dark theme, designed as such. Warm graphite surfaces, white for actions, reading colours that only ever mean a reading, and
one brand accent, signal red-orange, which belongs to the rug. No glows, no gradients, no neon.

The mark is a V drawn as a vessel: the arms are the walls, the lower half is the liquid. In the product the six checks
are six vials on one shelf that fill with the colour of their reading: the stronger the reading, the fuller the vial
(clear 0.3, note 0.5, watch 0.75, high to the brim; a V holds the square of its level, so these read apart). A lighter
meniscus line sits on the liquid. Under each vial: a small uppercase label and a short reading in the text face.

Tokens live in `packages/ui/src/tokens.css` (OKLCH). Brand files and the generator are in `brand/`.

| role | value |
|---|---|
| bg / sheet / well | oklch 0.16 / 0.19 / 0.225, chroma 0.006 to 0.008, hue 70 (warm graphite) |
| ink / ink-2 / ink-3 | oklch 0.955 / 0.77 / 0.64, hue 80 to 85 |
| act (buttons) | near-white pill, ink text |
| signal (the rug) | oklch(0.68 0.2 36) |
| readings | good 155, info 245, warn 78, danger 34 hue |

Type: Archivo Variable (UI, display and figures with tabular numbers; headings condensed, the wordmark wide), Martian
Mono Variable for addresses and the holder table only. Both bundled, never loaded from a CDN.

Report order: name and ticker, four stats (market cap, liquidity or curve, holders, age), curve progress, the findings
count, the six vials, findings, then market, launch, holders (with the supply bar), linked wallets, creator.

Radii: 6px small, 12px containers, pills for buttons and the address field. Borders, no shadows.
Motion: vials fill once per report (520ms, 60ms stagger); the hero rack fills in sequence and the rug fills last.
Buttons press to 0.97. Everything respects reduced motion.

Copy: facts, not verdicts. No em dashes. Missing values read "n/a". Call it "the extension".
