import { price as blackScholes } from "./blackScholes";
import type { Market, Model, Prices } from "./types";

export interface JumpParams {
  vol: number; // σ, diffusion volatility
  lambda: number; // λ, expected jumps per year
  jumpMean: number; // μ_J, mean of the log jump size
  jumpVol: number; // δ, standard deviation of the log jump size
}

/**
 * Merton (1976) jump-diffusion: a Poisson-weighted sum of Black–Scholes prices,
 * term n being the world where exactly n jumps happen before expiry.
 */
export function price(market: Market, { vol, lambda, jumpMean, jumpVol }: JumpParams): Prices {
  const { time: T, rate: r } = market;
  const k = Math.exp(jumpMean + 0.5 * jumpVol * jumpVol) - 1; // expected relative jump
  const lt = lambda * (1 + k) * T;

  let weight = Math.exp(-lt);
  let call = 0;
  let put = 0;
  for (let n = 0; n < 1000; n++) {
    if (n > 0) weight *= lt / n;
    // Past the Poisson mode the weights only shrink, so stop once they're negligible.
    if (n > lt && weight < 1e-17) break;
    const volN = Math.sqrt(vol * vol + (n * jumpVol * jumpVol) / T);
    const rateN = r - lambda * k + (n * (jumpMean + 0.5 * jumpVol * jumpVol)) / T;
    // Weighting by Poisson(λ(1 + k)T) rather than Poisson(λT) absorbs the
    // difference between discounting at rateN and at r.
    const bs = blackScholes({ ...market, rate: rateN }, volN);
    call += weight * bs.call;
    put += weight * bs.put;
  }
  return { call, put };
}

export const merton: Model = {
  id: "merton",
  name: "Merton jumps",
  description:
    "Black–Scholes plus sudden jumps in the price. Jumps fatten the tails, so options far from the strike cost more, especially puts when jumps tend to be downward.",
  params: [
    { key: "vol", label: "Volatility", symbol: "σ", default: 20, min: 1, max: 150, step: 0.5, scale: 0.01, suffix: "%" },
    { key: "lambda", label: "Jumps per year", symbol: "λ", default: 1, min: 0, max: 10, step: 0.1, scale: 1 },
    { key: "jumpMean", label: "Average jump", symbol: "μ", default: -10, min: -50, max: 50, step: 1, scale: 0.01, suffix: "%" },
    { key: "jumpVol", label: "Jump size spread", symbol: "δ", default: 15, min: 0, max: 100, step: 1, scale: 0.01, suffix: "%" },
  ],
  volParam: "vol",
  assumptions:
    "Prices European options on a non-dividend-paying asset whose price diffuses with constant volatility and jumps at random times by log-normal amounts.",
  compareWithBlackScholes: true,
  smile: true,
  validate: (p) => {
    if (![p.vol, p.lambda, p.jumpMean, p.jumpVol].every(Number.isFinite)) return "Fill in every input with a number.";
    if (p.vol <= 0) return "Volatility must be above zero.";
    if (p.lambda < 0) return "Jumps per year can't be negative.";
    if (p.jumpVol < 0) return "Jump size spread can't be negative.";
    return null;
  },
  price: (m, p) => price(m, p as unknown as JumpParams),
};
