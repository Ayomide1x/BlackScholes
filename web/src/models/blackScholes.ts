import { normCdf, normPdf } from "./math";
import type { Market, Model, OptionGreeks, Params, Prices } from "./types";

export function d1d2({ spot: S, strike: K, time: T, rate: r }: Market, vol: number) {
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * vol * vol) * T) / (vol * sqrtT);
  return { d1, d2: d1 - vol * sqrtT };
}

export function price(market: Market, vol: number): Prices {
  const { spot: S, strike: K, time: T, rate: r } = market;
  const { d1, d2 } = d1d2(market, vol);
  const disc = Math.exp(-r * T);
  // Separate expressions rather than put-call parity keep deep in/out-of-the-money
  // prices accurate.
  return {
    call: S * normCdf(d1) - K * disc * normCdf(d2),
    put: K * disc * normCdf(-d2) - S * normCdf(-d1),
  };
}

export function greeks(market: Market, vol: number): OptionGreeks {
  const { spot: S, strike: K, time: T, rate: r } = market;
  const { d1, d2 } = d1d2(market, vol);
  const sqrtT = Math.sqrt(T);
  const disc = Math.exp(-r * T);
  const Nd1 = normCdf(d1);
  const Nd2 = normCdf(d2);
  const pd1 = normPdf(d1);

  const gamma = pd1 / (S * vol * sqrtT);
  const vega = S * pd1 * sqrtT;
  const decay = -(S * pd1 * vol) / (2 * sqrtT);

  return {
    call: {
      delta: Nd1,
      gamma,
      vega,
      theta: decay - r * K * disc * Nd2,
      rho: K * T * disc * Nd2,
    },
    put: {
      delta: Nd1 - 1,
      gamma,
      vega,
      theta: decay + r * K * disc * normCdf(-d2),
      rho: -K * T * disc * normCdf(-d2),
    },
  };
}

export const blackScholes: Model = {
  id: "black-scholes",
  name: "Black–Scholes",
  params: [
    { key: "vol", label: "Volatility", symbol: "σ", default: 20, min: 1, max: 150, step: 0.5, scale: 0.01, suffix: "%" },
  ],
  volParam: "vol",
  assumptions:
    "Prices European options on a non-dividend-paying asset, assuming constant volatility and interest rate.",
  validate: (p: Params) => (Number.isFinite(p.vol) && p.vol > 0 ? null : "Volatility must be above zero."),
  price: (m, p) => price(m, p.vol),
  greeks: (m, p) => greeks(m, p.vol),
};
