import type { OptionGreeks, ParamSpec } from "./models";
import { signed } from "./format";

// Shown in the units traders quote: vega per 1 point of the model's volatility
// input (as displayed), rho per 1 percentage point, theta per calendar day.
const rows = (vol: ParamSpec) =>
  [
    { key: "delta", name: "Delta", sym: "Δ", scale: 1, meaning: "Price change per $1 move in the underlying" },
    { key: "gamma", name: "Gamma", sym: "Γ", scale: 1, meaning: "Delta change per $1 move in the underlying" },
    { key: "vega", name: "Vega", sym: "ν", scale: vol.scale, meaning: `Price change per 1 point of ${vol.label.toLowerCase()}` },
    { key: "theta", name: "Theta", sym: "Θ", scale: 1 / 365, meaning: "Price change per day that passes" },
    { key: "rho", name: "Rho", sym: "ρ", scale: 0.01, meaning: "Price change per 1 point of interest rate" },
  ] as const;

export function GreeksTable({ greeks: result, vol }: { greeks: OptionGreeks; vol: ParamSpec }) {
  return (
    <table className="greeks">
      <thead>
        <tr>
          <th scope="col">Greek</th>
          <th scope="col" className="num call">
            Call
          </th>
          <th scope="col" className="num put">
            Put
          </th>
          <th scope="col" className="meaning">
            What it measures
          </th>
        </tr>
      </thead>
      <tbody>
        {rows(vol).map((r) => (
          <tr key={r.key}>
            <th scope="row">
              <span className="sym">{r.sym}</span> {r.name}
            </th>
            <td className="num">{signed(result.call[r.key] * r.scale)}</td>
            <td className="num">{signed(result.put[r.key] * r.scale)}</td>
            <td className="meaning">{r.meaning}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
