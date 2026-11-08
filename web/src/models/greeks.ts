import type { Market, Model, OptionGreeks, Params, Prices } from "./types";

export interface Bumps {
  spot: number; // relative to the spot price
  vol: number; // relative to the volatility parameter
  time: number; // years
}

// Small enough for short-dated, low-volatility options, whose price curves
// sharply near the strike; rounding error in gamma stays below 1e-8.
const PRECISE: Bumps = { spot: 1e-5, vol: 1e-3, time: 1e-4 };

/**
 * Greeks by central differences on the model's own price, for models without
 * exact formulas. Simulated prices are noisy at tiny scales, so Monte Carlo
 * passes larger bumps.
 */
export function numericGreeks(model: Model, market: Market, params: Params, bumps: Bumps = PRECISE): OptionGreeks {
  const at = (m: Partial<Market>, p: Params = {}) => model.price({ ...market, ...m }, { ...params, ...p });
  const both = (f: (k: keyof Prices) => number) => ({ call: f("call"), put: f("put") });

  const hS = market.spot * bumps.spot;
  const up = at({ spot: market.spot + hS });
  const mid = at({});
  const down = at({ spot: market.spot - hS });

  const v = params[model.volParam];
  const hV = Math.max(v * bumps.vol, 1e-6);
  const vUp = at({}, { [model.volParam]: v + hV });
  const vDown = at({}, { [model.volParam]: v - hV });

  // Theta looks forward in calendar time, so it shortens maturity; keep T - h above zero.
  const hT = Math.min(bumps.time, market.time / 2);
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
