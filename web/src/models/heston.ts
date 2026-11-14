import { add, c, div, exp, log, mul, scale, sqrt, sub, type Complex } from "./complex";
import type { Market, Model, Prices } from "./types";

export interface HestonParams {
  vol0: number; // √v₀, today's volatility
  longVol: number; // √θ, the volatility variance reverts to
  kappa: number; // κ, speed of mean reversion, per year
  xi: number; // ξ, volatility of variance
  rho: number; // ρ, correlation between price and variance shocks
}

/**
 * 2κσ̄² / ξ²: above 1 the Feller condition holds and variance stays strictly
 * positive; at or below 1 it can touch zero.
 */
export const fellerRatio = (p: Pick<HestonParams, "kappa" | "longVol" | "xi">) =>
  (2 * p.kappa * p.longVol ** 2) / p.xi ** 2;

/**
 * Characteristic function of ln S_T, in the "little Heston trap" form
 * (Albrecher et al., 2007), which avoids the branch-cut jumps of Heston's
 * original formula at long maturities.
 */
function characteristic(u: Complex, { spot: S, time: T, rate: r }: Market, p: HestonParams): Complex {
  const v0 = p.vol0 * p.vol0;
  const theta = p.longVol * p.longVol;
  const { kappa, xi, rho } = p;
  const iu = c(-u.im, u.re); // i·u
  const a = sub(c(kappa), scale(iu, rho * xi)); // κ − ρξiu
  const w = scale(add(iu, mul(u, u)), xi * xi); // d² − a²
  const d = sqrt(add(mul(a, a), w));
  // a − d written as −(d² − a²)/(a + d): for small ξ, d is nearly a, and the
  // plain difference would lose most of its digits before being divided by ξ².
  const aMinusD = scale(div(w, add(a, d)), -1);
  const g = div(aMinusD, add(a, d));
  const edt = exp(scale(d, -T));
  const oneMinusGedt = sub(c(1), mul(g, edt));
  const C = scale(
    sub(scale(aMinusD, T), scale(log(div(oneMinusGedt, sub(c(1), g))), 2)),
    (kappa * theta) / (xi * xi),
  );
  const D = scale(div(mul(aMinusD, sub(c(1), edt)), oneMinusGedt), 1 / (xi * xi));
  return exp(add(add(scale(iu, Math.log(S) + r * T), C), scale(D, v0)));
}

// 10-point Gauss–Legendre nodes and weights on [−1, 1].
const GL_X = [
  -0.9739065285171717, -0.8650633666889845, -0.6794095682990244, -0.4333953941292472, -0.1488743389816312,
  0.1488743389816312, 0.4333953941292472, 0.6794095682990244, 0.8650633666889845, 0.9739065285171717,
];
const GL_W = [
  0.0666713443086881, 0.1494513491505806, 0.219086362515982, 0.2692667193099963, 0.2955242247147529,
  0.2955242247147529, 0.2692667193099963, 0.219086362515982, 0.1494513491505806, 0.0666713443086881,
];

/**
 * Gil-Pelaez inversion, with the two probabilities folded into one integral:
 *   C = (S − K e^{−rT}) / 2 + (e^{−rT}/π) ∫₀^∞ Re[ e^{−iu ln K} (φ(u − i) − K φ(u)) / (iu) ] du
 * integrated panel by panel until the integrand has died away.
 */
export function price(market: Market, p: HestonParams): Prices {
  const { spot: S, strike: K, time: T, rate: r } = market;
  const lnK = Math.log(K);
  const integrand = (u: number) => {
    const shift = exp(c(0, -u * lnK));
    const num = sub(characteristic(c(u, -1), market, p), scale(characteristic(c(u), market, p), K));
    return div(mul(shift, num), c(0, u)).re;
  };

  // Panels two units wide resolve the integrand's oscillation, which has a
  // period of 2π/|ln(F/K)|: at least π for strikes within e² of the forward.
  const WIDTH = 2;
  let total = 0;
  let quiet = 0;
  for (let panel = 0; panel < 5000 && quiet < 3; panel++) {
    const mid = (panel + 0.5) * WIDTH;
    let sum = 0;
    for (let k = 0; k < 10; k++) sum += GL_W[k] * integrand(mid + 0.5 * WIDTH * GL_X[k]);
    sum *= 0.5 * WIDTH;
    total += sum;
    quiet = Math.abs(sum) < 1e-12 * (S + K) ? quiet + 1 : 0;
  }

  const disc = Math.exp(-r * T);
  const call = 0.5 * (S - K * disc) + (disc / Math.PI) * total;
  return { call, put: call - S + K * disc };
}

export const heston: Model = {
  id: "heston",
  name: "Heston",
  description:
    "Volatility itself moves at random, drifting back towards a long-run level. When price and volatility move in opposite directions (ρ below zero), low strikes trade at higher implied volatility: the skew seen in equity markets.",
  params: [
    { key: "vol0", label: "Current volatility", symbol: "σ₀", default: 20, min: 1, max: 100, step: 0.5, scale: 0.01, suffix: "%" },
    { key: "longVol", label: "Long-run volatility", symbol: "σ̄", default: 20, min: 1, max: 100, step: 0.5, scale: 0.01, suffix: "%" },
    { key: "kappa", label: "Reversion speed", symbol: "κ", default: 2.5, min: 0.1, max: 10, step: 0.1, scale: 1 },
    { key: "xi", label: "Volatility of volatility", symbol: "ξ", default: 40, min: 1, max: 200, step: 1, scale: 0.01, suffix: "%" },
    { key: "rho", label: "Price–volatility correlation", symbol: "ρ", default: -0.7, min: -0.99, max: 0.99, step: 0.01, scale: 1 },
  ],
  volParam: "vol0",
  assumptions:
    "Prices European options on a non-dividend-paying asset whose variance follows a mean-reverting square-root process, with a constant interest rate.",
  compareWithBlackScholes: true,
  smile: true,
  heavy: true,
  validate: (p) => {
    if (![p.vol0, p.longVol, p.kappa, p.xi, p.rho].every(Number.isFinite)) return "Fill in every input with a number.";
    if (p.vol0 <= 0 || p.longVol <= 0) return "Volatilities must be above zero.";
    if (p.kappa <= 0) return "Reversion speed must be above zero.";
    if (p.xi <= 0) return "Volatility of volatility must be above zero.";
    if (p.rho <= -1 || p.rho >= 1) return "Correlation must be between −1 and 1.";
    return null;
  },
  note: (p) =>
    fellerRatio(p as unknown as HestonParams) <= 1
      ? "Variance can touch zero with these inputs (2κσ̄² ≤ ξ², the Feller condition fails). Prices are still valid."
      : null,
  price: (m, p) => price(m, p as unknown as HestonParams),
};
