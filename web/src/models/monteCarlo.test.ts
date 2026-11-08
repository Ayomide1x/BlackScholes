import { describe, expect, it } from "vitest";
import { blackScholes } from "./blackScholes";
import { estimate, monteCarlo } from "./monteCarlo";
import { validate } from "./index";

const market = { spot: 100, strike: 100, time: 1, rate: 0.05 };
const euro = { vol: 0.2, paths: 50000, asian: 0, fixings: 12 };

describe("Monte Carlo", () => {
  it("lands within 3 standard errors of Black–Scholes for European options", () => {
    const e = estimate(market, euro);
    const bs = blackScholes.price(market, { vol: 0.2 });
    expect(Math.abs(e.call - bs.call)).toBeLessThan(3 * e.callSE);
    expect(Math.abs(e.put - bs.put)).toBeLessThan(3 * e.putSE);
    expect(e.callSE).toBeLessThan(0.05);
  });

  it("gives the same estimate every time for the same inputs", () => {
    expect(estimate(market, euro)).toEqual(estimate(market, euro));
  });

  it("reports the exact price only when there is a formula", () => {
    expect(estimate(market, euro).exact).toEqual(blackScholes.price(market, { vol: 0.2 }));
    expect(estimate(market, { ...euro, asian: 1 }).exact).toBeUndefined();
  });

  it("records checkpoints up to the total number of paths, with shrinking error", () => {
    const { convergence } = estimate(market, euro);
    expect(convergence.map((c) => c.paths)).toEqual([100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000]);
    expect(convergence[convergence.length - 1].callSE).toBeLessThan(convergence[1].callSE / 4);
  });

  it("prices an Asian call below the European one, since averaging lowers volatility", () => {
    const asian = estimate(market, { ...euro, asian: 1 });
    expect(asian.call).toBeLessThan(estimate(market, euro).call - 1);
  });

  it("treats an Asian option with one averaging date as European", () => {
    const one = estimate(market, { ...euro, asian: 1, fixings: 1 });
    const e = estimate(market, euro);
    expect(one.call).toBeCloseTo(e.call, 12);
    expect(one.put).toBeCloseTo(e.put, 12);
  });

  it("estimates Greeks close to Black–Scholes' for European options", () => {
    const g = monteCarlo.greeks!(market, { ...euro, paths: 200000 });
    const exact = blackScholes.greeks!(market, { vol: 0.2 });
    for (const side of ["call", "put"] as const) {
      expect(g[side].delta).toBeCloseTo(exact[side].delta, 2);
      expect(Math.abs(g[side].gamma - exact[side].gamma)).toBeLessThan(0.1 * exact[side].gamma);
      expect(Math.abs(g[side].vega - exact[side].vega)).toBeLessThan(0.05 * exact[side].vega);
      expect(Math.abs(g[side].theta - exact[side].theta)).toBeLessThan(0.1 * Math.abs(exact[side].theta));
      expect(Math.abs(g[side].rho - exact[side].rho)).toBeLessThan(0.05 * Math.abs(exact[side].rho));
    }
  });

  it("rejects fractional path counts", () => {
    expect(validate(monteCarlo, market, { ...euro, paths: 1000.5 })).toMatch(/whole number/);
    expect(validate(monteCarlo, market, euro)).toBeNull();
  });
});
