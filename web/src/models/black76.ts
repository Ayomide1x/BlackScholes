import { normCdf } from "./math";
import type { Market, Model, Prices } from "./types";

/** Black (1976): European options on a futures price F. The `spot` input holds F. */
export function price({ spot: F, strike: K, time: T, rate: r }: Market, vol: number): Prices {
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(F / K) + 0.5 * vol * vol * T) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;
  const disc = Math.exp(-r * T);
  return {
    call: disc * (F * normCdf(d1) - K * normCdf(d2)),
    put: disc * (K * normCdf(-d2) - F * normCdf(-d1)),
  };
}

export const black76: Model = {
  id: "black-76",
  name: "Black-76",
  description:
    "Black–Scholes for options on futures. The futures price already includes the cost of carrying the asset, so only the payoff is discounted.",
  underlying: { label: "Futures price", symbol: "F" },
  params: [
    { key: "vol", label: "Volatility", symbol: "σ", default: 20, min: 1, max: 150, step: 0.5, scale: 0.01, suffix: "%" },
  ],
  volParam: "vol",
  assumptions: "Prices European options on a futures contract, assuming constant volatility and interest rate.",
  validate: (p) => (Number.isFinite(p.vol) && p.vol > 0 ? null : "Volatility must be above zero."),
  price: (m, p) => price(m, p.vol),
};
