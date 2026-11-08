import { price as blackScholes } from "./blackScholes";
import { numericGreeks } from "./greeks";
import type { ConvergencePoint, Estimate, Market, Model } from "./types";

export interface SimParams {
  vol: number;
  paths: number;
  asian: number; // 1 for an average-price (Asian) payoff, 0 for European
  fixings: number; // dates averaged over, evenly spaced up to expiry (Asian only)
}

// Every run starts from the same seed, so the same inputs always give the same
// estimate, and bumped prices for the Greeks share their random numbers.
const SEED = 20261107;

/** mulberry32: a small, fast 32-bit generator; plenty for a few million draws. */
function uniforms(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draws, two at a time by Marsaglia's polar method. */
function normals(seed: number) {
  const u = uniforms(seed);
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const z = spare;
      spare = null;
      return z;
    }
    let x: number, y: number, s: number;
    do {
      x = 2 * u() - 1;
      y = 2 * u() - 1;
      s = x * x + y * y;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    spare = y * m;
    return x * m;
  };
}

/** Checkpoints for the convergence chart: 1, 2 and 5 times each power of ten, then the total. */
function checkpoints(total: number) {
  const out: number[] = [];
  for (let p = 100; p < total; p *= 10) for (const m of [1, 2, 5]) if (m * p < total) out.push(m * p);
  out.push(total);
  return out;
}

/**
 * Simulates the asset under the risk-neutral measure. Paths come in antithetic
 * pairs (z and −z); each pair's average payoff is one independent sample.
 */
export function estimate(market: Market, { vol, paths, asian, fixings }: SimParams): Estimate {
  const { spot: S, strike: K, time: T, rate: r } = market;
  const steps = asian === 1 ? fixings : 1;
  const dt = T / steps;
  const drift = (r - 0.5 * vol * vol) * dt;
  const diffusion = vol * Math.sqrt(dt);
  const disc = Math.exp(-r * T);
  const z = normals(SEED);
  const shocks = new Float64Array(steps);

  // The payoff's underlying value: the final price, or the average over the fixings.
  const level = (sign: number) => {
    let s = S;
    let sum = 0;
    for (let i = 0; i < steps; i++) {
      s *= Math.exp(drift + sign * diffusion * shocks[i]);
      sum += s;
    }
    return sum / steps;
  };

  const pairs = Math.max(1, Math.round(paths / 2));
  const marks = checkpoints(pairs * 2).map((n) => n / 2);
  const convergence: ConvergencePoint[] = [];
  let next = 0;
  let c1 = 0, c2 = 0, p1 = 0, p2 = 0; // running sums of samples and their squares

  for (let n = 1; n <= pairs; n++) {
    for (let i = 0; i < steps; i++) shocks[i] = z();
    const a = level(1);
    const b = level(-1);
    const c = 0.5 * (Math.max(a - K, 0) + Math.max(b - K, 0));
    const p = 0.5 * (Math.max(K - a, 0) + Math.max(K - b, 0));
    c1 += c;
    c2 += c * c;
    p1 += p;
    p2 += p * p;
    if (n === marks[next]) {
      const se = (s1: number, s2: number) => (n > 1 ? Math.sqrt(Math.max(s2 / n - (s1 / n) ** 2, 0) / (n - 1)) : 0);
      convergence.push({
        paths: 2 * n,
        call: (disc * c1) / n,
        put: (disc * p1) / n,
        callSE: disc * se(c1, c2),
        putSE: disc * se(p1, p2),
      });
      next++;
    }
  }

  const last = convergence[convergence.length - 1];
  return {
    call: last.call,
    put: last.put,
    callSE: last.callSE,
    putSE: last.putSE,
    convergence,
    exact: asian === 1 ? undefined : blackScholes(market, vol),
  };
}

export const monteCarlo: Model = {
  id: "monte-carlo",
  name: "Monte Carlo",
  description:
    "Simulates thousands of random price paths and averages the payoffs. It's slower and only approximate, but it handles payoffs with no formula, like an Asian option, which pays on the average price over its life.",
  params: [
    { key: "vol", label: "Volatility", symbol: "σ", default: 20, min: 1, max: 150, step: 0.5, scale: 0.01, suffix: "%" },
    { key: "paths", label: "Simulated paths", symbol: "n", default: 50000, min: 1000, max: 500000, step: 1000, scale: 1, integer: true },
    {
      key: "asian",
      label: "Payoff",
      symbol: "",
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      scale: 1,
      choices: [
        { value: 0, label: "European" },
        { value: 1, label: "Asian (average price)" },
      ],
    },
    {
      key: "fixings",
      label: "Averaging dates",
      symbol: "m",
      default: 12,
      min: 1,
      max: 252,
      step: 1,
      scale: 1,
      integer: true,
      onlyWhen: { key: "asian", value: 1 },
    },
  ],
  volParam: "vol",
  assumptions:
    "Simulates a non-dividend-paying asset with constant volatility and interest rate. Prices are estimates; the range shown is a 95% confidence interval.",
  compareWithBlackScholes: true,
  heavy: true,
  validate: (p) => {
    if (![p.vol, p.paths, p.fixings].every(Number.isFinite)) return "Fill in every input with a number.";
    if (p.vol <= 0) return "Volatility must be above zero.";
    if (!Number.isInteger(p.paths) || p.paths < 100 || p.paths > 2_000_000)
      return "Simulated paths must be a whole number from 100 to 2,000,000.";
    if (p.asian === 1 && (!Number.isInteger(p.fixings) || p.fixings < 1 || p.fixings > 1000))
      return "Averaging dates must be a whole number from 1 to 1,000.";
    return null;
  },
  estimate: (m, p) => estimate(m, p as unknown as SimParams),
  price: (m, p) => {
    const e = estimate(m, p as unknown as SimParams);
    return { call: e.call, put: e.put };
  },
  // Shared random numbers keep bumped prices comparable, but each path's payoff
  // has a kink at the strike, so bumps must be wide enough to smooth over it.
  greeks: (m, p) => numericGreeks(monteCarlo, m, p, { spot: 0.01, vol: 0.05, time: 1 / 365 }),
};
