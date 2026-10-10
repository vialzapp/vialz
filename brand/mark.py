# The Vialz mark: a V drawn as a vessel. The upper arms are the walls, the lower part is solid: filled to a level.
import math, sys
BLUE = "#2348ce"; WHITE = "#f5f7fb"; SIGNAL = "#ff5a36"

def vessel(cx, top, w, h, stroke, level, ink, lip=None):
    lip = stroke * 0.85 if lip is None else lip
    l, r, by = cx - w / 2, cx + w / 2, top + h
    walls = (f'<path d="M{l-lip:.1f},{top:.1f} H{l:.1f} L{cx:.1f},{by:.1f} L{r:.1f},{top:.1f} H{r+lip:.1f}" fill="none" '
             f'stroke="{ink}" stroke-width="{stroke:.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
    ly = by - h * level
    half = (w / 2) / h * (by - ly)
    liquid = f'<path d="M{cx-half:.1f},{ly:.1f} H{cx+half:.1f} L{cx:.1f},{by:.1f} Z" fill="{ink}"/>'
    return liquid + walls

def svg(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{rect}{body}</svg>'

if __name__ == "__main__":
    m = lambda ink: vessel(200, 124, 196, 168, 26, float(sys.argv[1]) if len(sys.argv) > 1 else 0.5, ink)
    open('mark.svg', 'w').write(svg(400, 400, m(WHITE), BLUE))
    open('mark-white.svg', 'w').write(svg(400, 400, m(WHITE)))
    open('mark-blue.svg', 'w').write(svg(400, 400, m(BLUE)))
