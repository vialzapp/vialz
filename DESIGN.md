# Vialz design system

World: a lab assay sheet. Cool paper, ink, values in a data mono, one ultramarine for actions. Result colours
(good, info, warn, danger) only ever mean a reading. The signature element is the test strip: six reagent pads that
develop into the colour of their reading.

Tokens live in `packages/ui/src/tokens.css` (OKLCH, light and a separately designed dark theme).

| role | light | dark |
|---|---|---|
| paper / sheet / well | 0.975 / 0.993 / 0.955 L, hue 255 | 0.17 / 0.205 / 0.235 L |
| ink / ink-2 / ink-3 | 0.20 / 0.45 / 0.58 L | 0.94 / 0.74 / 0.60 L |
| act (actions, links, focus) | oklch(0.47 0.21 266) | oklch(0.72 0.14 268) |
| pads | good 155, info 245, warn 80, danger 27 hue | same hues, darker |

Type: Archivo Variable (UI and display; headings use `font-stretch: 112-125%`), Martian Mono Variable (numbers,
addresses, pad readings). Both bundled, never loaded from a CDN.

Radii: 4px small, 8px containers. Borders, no shadows. Motion: the pads develop once per report (420ms, 55ms
stagger; 700ms with 90ms stagger in the site hero), buttons press to 0.97. Everything respects reduced motion.

Copy: facts, not verdicts. No em dashes. Missing values read "n/a".
