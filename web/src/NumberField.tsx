import { useEffect, useId, useState } from "react";

interface Props {
  symbol: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number; // slider bounds; the text box accepts anything
  max: number;
  step: number;
  suffix?: string;
}

/** A labelled number box with a slider under it. */
export function NumberField({ symbol, label, value, onChange, min, max, step, suffix }: Props) {
  const id = useId();
  // Keep the raw text while typing so "0." or "" don't get rewritten mid-edit.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    const shown = draft.trim() === "" ? NaN : Number(draft);
    if (!Object.is(shown, value)) setDraft(Number.isNaN(value) ? "" : String(value));
  }, [value]);

  return (
    <div className="field">
      <label htmlFor={id}>
        <span className="sym">{symbol}</span>
        <span>{label}</span>
      </label>
      <div className="field-box">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value.trim() === "" ? NaN : Number(e.target.value));
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
      <input
        type="range"
        aria-label={`${label} slider`}
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
