import type { ReactNode } from "react";
import { ArrowDownIcon, LockSimpleIcon, MagnifyingGlassIcon, PuzzlePieceIcon } from "@phosphor-icons/react";
import { shortAddress } from "@vialz/shared";
import { Mark } from "@vialz/ui";

/** A token's price line for the page behind the popup: drawn from the address, so each token gets its own. */
function line(address: string | null): string {
  let seed = parseInt((address ?? "0x5eed").slice(2, 10), 16) || 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let y = 70;
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    y = Math.min(92, Math.max(14, y + (rand() - 0.56) * 14));
    pts.push(`${(i / 48) * 300},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

/**
 * The extension as it is used: a token page open in the browser, the Vialz icon pressed in the toolbar, and the popup
 * hanging under it with the reading. The page behind is only a suggestion of one; the popup is the real report.
 */
export function ExtensionShowcase({ address, children }: { address: string | null; children: ReactNode }) {
  return (
    <div className="ext-showcase">
      {/* a pointer at the toolbar icon, so it reads as the extension and not as part of the site */}
      <span className="ext-callout" aria-hidden>
        Vialz extension
        <ArrowDownIcon size={13} weight="bold" />
      </span>
      <figure className="ext-window" aria-label="The Vialz extension open over a token page">
        <div className="ext-bar" aria-hidden>
          <span className="ext-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="ext-url">
            <LockSimpleIcon size={12} weight="bold" />
            <span>app</span>
            <span className="ext-url-path">/token/{address ? shortAddress(address) : "0x…"}</span>
          </span>
          <span className="ext-icons">
            <PuzzlePieceIcon size={15} />
            <span className="ext-vialz">
              <Mark size={10} />
            </span>
          </span>
        </div>

        <div className="ext-stage">
          <div className="ext-page" aria-hidden>
            <div className="ext-page-title">
              <span />
              <span />
            </div>
            <svg className="ext-chart" viewBox="0 0 300 100" preserveAspectRatio="none">
              <polyline points={line(address)} fill="none" />
            </svg>
            <div className="ext-page-rows">
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className="ext-popup">
            <span className="ext-caret" aria-hidden />
            <div className="ext-popup-head" aria-hidden>
              <Mark size={12} />
              <b>Vialz</b>
              <span className="ext-chip">
                <MagnifyingGlassIcon size={12} />
                Check another
              </span>
            </div>
            <div className="ext-popup-body">{children}</div>
          </div>
        </div>
      </figure>
    </div>
  );
}
