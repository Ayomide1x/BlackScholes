import type { Estimate, Prices } from "./models";
import { money, signed } from "./format";

const diff = (x: number) => (x > 0 ? `+${signed(x, 2)}` : signed(x, 2));

/** Call and put prices for models without a one-line formula, optionally beside Black–Scholes. */
export function PricePanel({
  prices,
  estimate,
  reference,
}: {
  prices: Prices;
  estimate: Estimate | null;
  reference: Prices | null;
}) {
  return (
    <div className="formula">
      {(["call", "put"] as const).map((k) => (
        <div key={k} className={`formula-side ${k}`}>
          <h2 className="formula-name">{k === "call" ? "Call" : "Put"}</h2>
          <p className="price" aria-live="polite">
            {money(prices[k])}
          </p>
          {estimate && (
            <p className="interval">
              ± {money(1.96 * (k === "call" ? estimate.callSE : estimate.putSE))} at 95% confidence
            </p>
          )}
          {reference && (
            <p className="compare">
              Black–Scholes gives {money(reference[k])}. Difference: <b>{diff(prices[k] - reference[k])}</b>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
