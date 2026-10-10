# Vialz design system

One dark theme, designed as such. Ink surfaces, white for actions, reading colours that only ever mean a reading, and
one brand accent, signal red-orange, which belongs to the rug. No glows, no gradients, no neon.

The mark is a V drawn as a vessel: the arms are the walls, the lower half is the liquid. In the product the six checks
are six vials that fill with the colour of their reading: the stronger the reading, the fuller the vial.

Tokens live in `packages/ui/src/tokens.css` (OKLCH). Brand files and the generator are in `brand/`.

| role | value |
|---|---|
| bg / sheet / well | oklch 0.155 / 0.19 / 0.225, hue 262 |
| ink / ink-2 / ink-3 | oklch 0.955 / 0.74 / 0.58 |
| act (buttons) | near-white pill, ink text |
| signal (the rug) | oklch(0.68 0.2 36) |
| readings | good 155, info 245, warn 78, danger 34 hue |

Type: Archivo Variable (UI and display; headings use `font-stretch: 112-125%`), Martian Mono Variable (numbers,
addresses, readings). Both bundled, never loaded from a CDN.

Radii: 6px small, 12px containers, pills for buttons and the address field. Borders, no shadows.
Motion: vials fill once per report (520ms, 60ms stagger); the hero rack fills in sequence and the rug fills last.
Buttons press to 0.97. Everything respects reduced motion.

Copy: facts, not verdicts. No em dashes. Missing values read "n/a". Call it "the extension", not "the side panel".
