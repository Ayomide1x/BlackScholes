import { greeks as bsGreeks, price as bsPrice } from "./blackScholes";
import { linspace } from "./math";
import type { Market, Model, Params } from "./types";

/**
 * The Black–Scholes volatility that reproduces a European option price, or NaN
 * when none does (a price at or outside its no-arbitrage bounds). Newton's
 * method, falling back to bisection whenever a step would leave the bracket.
 */
export function impliedVol(target: number, market: Market, kind: "call" | "put"): number {
  const { spot: S, strike: K, time: T, rate: r } = market;
  const disc = K * Math.exp(-r * T);
  const lower = kind === "call" ? Math.max(S - disc, 0) : Math.max(disc - S, 0);
  const upper = kind === "call" ? S : disc;
  if (!(target > lower + 1e-12 && target < upper - 1e-12)) return NaN;

  let lo = 1e-6;
  let hi = 10;
  let vol = 0.3;
  for (let i = 0; i < 100; i++) {
    const diff = bsPrice(market, vol)[kind] - target;
    if (Math.abs(diff) < 1e-12 * Math.max(1, target)) return vol;
    if (diff > 0) hi = vol;
    else lo = vol;
    const vega = bsGreeks(market, vol)[kind].vega;
    const next = vol - diff / vega;
    vol = vega > 1e-12 && next > lo && next < hi ? next : 0.5 * (lo + hi);
    if (hi - lo < 1e-12) return vol;
  }
  return vol;
}

export interface SmileCurve {
  time: number;
  points: { strike: number; vol: number }[]; // vol is NaN where no implied volatility exists
}

/**
 * Implied volatility across strikes for several maturities. Each point inverts
 * the out-of-the-money option (puts below the forward, calls above), whose
 * price is mostly time value and so pins the volatility down best.
 */
export function smile(model: Model, market: Market, params: Params, times: number[], strikes = 41): SmileCurve[] {
  const ks = linspace(market.spot * 0.6, market.spot * 1.5, strikes);
  return times.map((time) => {
    const forward = market.spot * Math.exp(market.rate * time);
    return {
      time,
      points: ks.map((strike) => {
        const m = { ...market, strike, time };
        const kind = strike < forward ? "put" : "call";
        return { strike, vol: impliedVol(model.price(m, params)[kind], m, kind) };
      }),
    };
  });
}
