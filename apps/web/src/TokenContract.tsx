import { useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { Mark } from "@vialz/ui";
import { Link } from "./App";

/** The one official token contract: the full address to copy, and our own report on it, so anyone can check it. */
export function TokenContract({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="token-ca">
      <span className="token-ca-label">Official contract</span>
      <code className="token-ca-address">{address}</code>
      <div className="token-ca-actions">
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() =>
            void navigator.clipboard.writeText(address).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            })
          }
        >
          {copied ? <CheckIcon size={15} weight="bold" aria-hidden /> : <CopyIcon size={15} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
        <Link className="btn btn-quiet" href={`/t/${address}`}>
          Read its report
        </Link>
      </div>
      <p className="token-ca-note">Any other contract called Vialz is not ours.</p>
    </div>
  );
}

/** Our own token, under the hero facts and away from the check field (an address next to it reads as an example to
 *  paste): the start and end of the address (6+6, not 4+4, which look-alike fakes copy), tap to copy the full one, and
 *  our own report on it. */
export function TokenPill({ symbol, address }: { symbol: string; address: string }) {
  const [copied, setCopied] = useState(false);
  const short = `${address.slice(0, 8)}…${address.slice(-6)}`;
  return (
    <p className="token-pill">
      <span className="token-pill-label">Our token</span>
      <button
        type="button"
        className="token-pill-copy"
        title={address}
        aria-label={copied ? "Contract copied" : `Copy the $${symbol} contract ${address}`}
        onClick={() =>
          void navigator.clipboard.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        <Mark size={12} />
        <b>${symbol}</b>
        <code>{short}</code>
        {copied ? <CheckIcon size={13} weight="bold" aria-hidden /> : <CopyIcon size={13} aria-hidden />}
      </button>
      <Link className="token-pill-report" href={`/t/${address}`}>
        See our own report →
      </Link>
    </p>
  );
}
