import type { Model } from "./models";

/** Picks the pricing model; a row of radio buttons styled as a switch. */
export function ModelSwitch({ models, value, onChange }: { models: Model[]; value: string; onChange: (id: string) => void }) {
  return (
    <fieldset className="switch model-switch">
      <legend>Model</legend>
      <div className="switch-options">
        {models.map((m) => (
          <label key={m.id}>
            <input type="radio" name="model" value={m.id} checked={m.id === value} onChange={() => onChange(m.id)} />
            <span>{m.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A model input with a fixed set of values, such as European or American exercise. */
export function ChoiceField(props: {
  label: string;
  name: string;
  choices: { value: number; label: string }[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset className="switch">
      <legend>{props.label}</legend>
      <div className="switch-options">
        {props.choices.map((c) => (
          <label key={c.value}>
            <input
              type="radio"
              name={props.name}
              value={c.value}
              checked={c.value === props.value}
              onChange={() => props.onChange(c.value)}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
