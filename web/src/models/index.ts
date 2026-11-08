import { black76 } from "./black76";
import { binomial } from "./binomial";
import { blackScholes } from "./blackScholes";
import { heston } from "./heston";
import { merton } from "./merton";
import { monteCarlo } from "./monteCarlo";
import { numericGreeks } from "./greeks";
import { linspace } from "./math";
import type { Estimate, Market, Model, OptionGreeks, Params, Prices } from "./types";

export type { ConvergencePoint, Estimate, Market, Model, OptionGreeks, ParamSpec, Params, Prices } from "./types";
export { linspace } from "./math";
export { numericGreeks } from "./greeks";
export { impliedVol, smile, type SmileCurve } from "./impliedVol";

/** Every model the app offers, in menu order. */
export const MODELS: Model[] = [blackScholes, binomial, monteCarlo, heston, merton, black76];

export { blackScholes };

/** A message for the first invalid market input, or null. */
export function validateMarket(m: Market): string | null {
  if (![m.spot, m.strike, m.time, m.rate].every(Number.isFinite)) return "Fill in every input with a number.";
  if (m.spot <= 0) return "Spot price must be above zero.";
  if (m.strike <= 0) return "Strike price must be above zero.";
  if (m.time <= 0) return "Time to maturity must be above zero.";
  return null;
}

export function validate(model: Model, market: Market, params: Params): string | null {
  return validateMarket(market) ?? model.validate(params, market);
}

export function greeksOf(model: Model, market: Market, params: Params): OptionGreeks {
  return model.greeks ? model.greeks(market, params) : numericGreeks(model, market, params);
}

/** Call and put prices over a grid: rows vary the model's volatility parameter, columns the spot. */
export function priceGrid(model: Model, market: Market, params: Params, spots: number[], vols: number[]) {
  const call: number[][] = [];
  const put: number[][] = [];
  for (const vol of vols) {
    const cRow: number[] = [];
    const pRow: number[] = [];
    for (const spot of spots) {
      const r = model.price({ ...market, spot }, { ...params, [model.volParam]: vol });
      cRow.push(r.call);
      pRow.push(r.put);
    }
    call.push(cRow);
    put.push(pRow);
  }
  return { call, put };
}

export interface CurvePoint extends Prices {
  spot: number;
  callPayoff: number;
  putPayoff: number;
}

/** Option value today and payoff at expiry, from 40% to 160% of the strike. */
export function curvePoints(model: Model, market: Market, params: Params, points = 81): CurvePoint[] {
  const spots = linspace(Math.max(market.strike * 0.4, 0.01), market.strike * 1.6, points);
  return spots.map((spot) => {
    const r = model.price({ ...market, spot }, params);
    return {
      spot,
      call: r.call,
      put: r.put,
      callPayoff: Math.max(spot - market.strike, 0),
      putPayoff: Math.max(market.strike - spot, 0),
    };
  });
}

export interface Summary {
  prices: Prices;
  estimate: Estimate | null;
  greeks: OptionGreeks | null; // null while a worker is still computing them
}

/** Prices (with the simulation's error, if any) and Greeks at the current inputs. */
export function summarize(model: Model, market: Market, params: Params): Summary {
  const estimate = model.estimate?.(market, params) ?? null;
  const prices = estimate ? { call: estimate.call, put: estimate.put } : model.price(market, params);
  return { prices, estimate, greeks: greeksOf(model, market, params) };
}

/** Maturities for the smile chart: a quarter of, all of, and twice the option's own. */
export const smileTimes = (time: number) => [time / 4, time, time * 2];
