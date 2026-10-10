import { useEffect, useId, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { extractAddress } from "@vialz/shared";

interface Props {
  onCheck: (address: string) => void;
  initial?: string;
  autoFocus?: boolean;
  busy?: boolean;
  size?: "m" | "l";
  label?: string;
}

/** The one field: paste an address or any link that contains one. Pasting a valid address checks it right away. */
export function CheckInput({ onCheck, initial = "", autoFocus, busy, size = "m", label = "Contract address or link" }: Props) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => setValue(initial), [initial]);

  const submit = (raw: string) => {
    const address = extractAddress(raw);
    if (!address) {
      setError(raw.trim() ? "That doesn't contain a contract address (0x and 40 characters)." : "Paste a contract address first.");
      return;
    }
    setError(null);
    setValue(address);
    onCheck(address);
  };

  return (
    <form
      className={`check check-${size}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      noValidate
    >
      <label htmlFor={id} className="check-label">
        {label}
      </label>
      <div className="check-row">
        <MagnifyingGlassIcon className="check-icon" size={18} aria-hidden />
        <input
          id={id}
          value={value}
          autoFocus={autoFocus}
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          placeholder="0x…"
          aria-invalid={error != null}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (extractAddress(text)) {
              e.preventDefault();
              submit(text);
            }
          }}
        />
        <button className="btn btn-act" type="submit" disabled={busy}>
          {busy ? "Reading" : "Check"}
        </button>
      </div>
      {error && (
        <p id={`${id}-err`} className="check-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
