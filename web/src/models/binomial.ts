import type { Market, Model, OptionGreeks, Prices } from "./types";

export interface TreeParams {
  vol: number;
  steps: number;
  american: number; // 1 for American exercise, 0 for European
}

interface Tree extends Prices {
  // Option values at the first two time steps, lowest price first, for the Greeks.
  step1: { call: number[]; put: number[] };
  step2: { call: number[]; put: number[] };
  u: number;
  dt: number;
}

/** Cox–Ross–Rubinstein tree, pricing the call and put in one backward pass. */
function build(market: Market, { vol, steps, american }: TreeParams): Tree {
  const { spot: S, strike: K, time: T, rate: r } = market;
  const N = steps;
  const dt = T / N;
  const u = Math.exp(vol * Math.sqrt(dt));
  const d = 1 / u;
  const growth = Math.exp(r * dt);
  const p = (growth - d) / (u - d);
  // Discounted risk-neutral weights for the up and down branches.
  const pu = p / growth;
  const pd = (1 - p) / growth;
  const early = american === 1;
  const uu = u * u;

  const call = new Float64Array(N + 1);
  const put = new Float64Array(N + 1);
  let s = S * d ** N;
  for (let j = 0; j <= N; j++) {
    call[j] = Math.max(s - K, 0);
    put[j] = Math.max(K - s, 0);
    s *= u * u;
  }

  let step1 = { call: [] as number[], put: [] as number[] };
  let step2 = { call: [] as number[], put: [] as number[] };
  for (let i = N - 1; i >= 0; i--) {
    if (early) {
      s = S * d ** i;
      for (let j = 0; j <= i; j++) {
        const c = pu * call[j + 1] + pd * call[j];
        const q = pu * put[j + 1] + pd * put[j];
        call[j] = c > s - K ? c : s - K;
        put[j] = q > K - s ? q : K - s;
        s *= uu;
      }
    } else {
      for (let j = 0; j <= i; j++) {
        call[j] = pu * call[j + 1] + pd * call[j];
        put[j] = pu * put[j + 1] + pd * put[j];
      }
    }
    if (i === 2) step2 = { call: Array.from(call.subarray(0, 3)), put: Array.from(put.subarray(0, 3)) };
    if (i === 1) step1 = { call: Array.from(call.subarray(0, 2)), put: Array.from(put.subarray(0, 2)) };
  }
  return { call: call[0], put: put[0], step1, step2, u, dt };
}

export function price(market: Market, params: TreeParams): Prices {
  const { call, put } = build(market, params);
  return { call, put };
}

/**
 * Delta, gamma and theta read off the tree's first steps, the standard way:
 * bumping the spot by a tiny amount would only move nodes across the strike,
 * and the price as a function of spot has kinks there. Vega and rho bump
 * volatility and rate by amounts large enough to average over that noise.
 */
export function greeks(market: Market, params: TreeParams): OptionGreeks {
  const S = market.spot;
  const t = build(market, params);
  const { u, dt } = t;
  const d = 1 / u;

  const hV = 0.005;
  const vUp = price(market, { ...params, vol: params.vol + hV });
  const vDown = price(market, { ...params, vol: Math.max(params.vol - hV, 1e-4) });
  const hR = 1e-4;
  const rUp = price({ ...market, rate: market.rate + hR }, params);
  const rDown = price({ ...market, rate: market.rate - hR }, params);

  const side = (k: "call" | "put") => {
    const [v1d, v1u] = t.step1[k];
    const [v2dd, v2ud, v2uu] = t.step2[k];
    const deltaUp = (v2uu - v2ud) / (S * u * u - S);
    const deltaDown = (v2ud - v2dd) / (S - S * d * d);
    return {
      delta: (v1u - v1d) / (S * u - S * d),
      gamma: (deltaUp - deltaDown) / (0.5 * (S * u * u - S * d * d)),
      vega: (vUp[k] - vDown[k]) / (params.vol + hV - Math.max(params.vol - hV, 1e-4)),
      // The middle node two steps on has the same spot price, 2·dt later.
      theta: (v2ud - t[k]) / (2 * dt),
      rho: (rUp[k] - rDown[k]) / (2 * hR),
    };
  };
  return { call: side("call"), put: side("put") };
}

export const binomial: Model = {
  id: "binomial",
  name: "Binomial tree",
  description:
    "Builds a tree of possible prices and works back from expiry, so it can price American options, which can be exercised early. Early exercise never pays for a call on a non-dividend-paying asset, but it can for a put.",
  params: [
    { key: "vol", label: "Volatility", symbol: "σ", default: 20, min: 1, max: 150, step: 0.5, scale: 0.01, suffix: "%" },
    { key: "steps", label: "Tree steps", symbol: "N", default: 200, min: 10, max: 500, step: 10, scale: 1, integer: true },
    {
      key: "american",
      label: "Exercise",
      symbol: "",
      default: 1,
      min: 0,
      max: 1,
      step: 1,
      scale: 1,
      choices: [
        { value: 0, label: "European" },
        { value: 1, label: "American" },
      ],
    },
  ],
  volParam: "vol",
  assumptions:
    "Prices options on a non-dividend-paying asset with a Cox–Ross–Rubinstein tree, assuming constant volatility and interest rate.",
  compareWithBlackScholes: true,
  validate: (p, m) => {
    if (![p.vol, p.steps].every(Number.isFinite)) return "Fill in every input with a number.";
    if (p.vol <= 0) return "Volatility must be above zero.";
    if (!Number.isInteger(p.steps) || p.steps < 2 || p.steps > 5000)
      return "Tree steps must be a whole number from 2 to 5,000.";
    // The up-move probability must stay between 0 and 1.
    const dt = m.time / p.steps;
    if (Math.abs(m.rate) * Math.sqrt(dt) >= p.vol)
      return "The tree can't represent this interest rate at this volatility. Add steps or raise volatility.";
    return null;
  },
  price: (m, p) => price(m, p as unknown as TreeParams),
  greeks: (m, p) => greeks(m, p as unknown as TreeParams),
};
