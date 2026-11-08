import { black76 } from "./black76";
import { binomial } from "./binomial";
import { blackScholes } from "./blackScholes";
import { merton } from "./merton";
import type { Market, Model, OptionGreeks, Params, Prices } from "./types";

export type { Market, Model, OptionGreeks, ParamSpec, Params, Prices } from "./types";
export { linspace } from "./math";

/** Every model the app offers, in menu order. */
export const MODELS: Model[] = [blackScholes, binomial, merton, black76];

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

/**
 * Greeks by central differences on the model's own price, for models without
 * exact formulas. Bumps are relative to each input so they suit any scale.
 */
export function numericGreeks(model: Model, market: Market, params: Params): OptionGreeks {
  const at = (m: Partial<Market>, p: Params = {}) => model.price({ ...market, ...m }, { ...params, ...p });
  const both = (f: (k: keyof Prices) => number) => ({ call: f("call"), put: f("put") });

  // Small enough for short-dated, low-volatility options, whose price curves
  // sharply near the strike; rounding error in gamma stays below 1e-8.
  const hS = market.spot * 1e-5;
  const up = at({ spot: market.spot + hS });
  const mid = at({});
  const down = at({ spot: market.spot - hS });

  const v = params[model.volParam];
  const hV = Math.max(v * 1e-3, 1e-6);
  const vUp = at({}, { [model.volParam]: v + hV });
  const vDown = at({}, { [model.volParam]: v - hV });

  // Theta looks forward in calendar time, so it shortens maturity; keep T - h above zero.
  const hT = Math.min(1e-4, market.time / 2);
  const tUp = at({ time: market.time + hT });
  const tDown = at({ time: market.time - hT });

  const hR = 1e-4;
  const rUp = at({ rate: market.rate + hR });
  const rDown = at({ rate: market.rate - hR });

  const delta = both((k) => (up[k] - down[k]) / (2 * hS));
  const gamma = both((k) => (up[k] - 2 * mid[k] + down[k]) / (hS * hS));
  const vega = both((k) => (vUp[k] - vDown[k]) / (2 * hV));
  const theta = both((k) => -(tUp[k] - tDown[k]) / (2 * hT));
  const rho = both((k) => (rUp[k] - rDown[k]) / (2 * hR));

  const side = (k: keyof Prices) => ({
    delta: delta[k],
    gamma: gamma[k],
    vega: vega[k],
    theta: theta[k],
    rho: rho[k],
  });
  return { call: side("call"), put: side("put") };
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
