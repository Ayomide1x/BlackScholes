import { describe, expect, it } from "vitest";
import { blackScholes } from "./blackScholes";
import { linspace, normCdf } from "./math";
import { numericGreeks, priceGrid, validate } from "./index";
import fixtures from "./fixtures.json";

const split = ({ vol, ...market }: (typeof fixtures)[number]["inputs"]) => ({ market, params: { vol } });

describe("normCdf", () => {
  it("matches known values", () => {
    expect(normCdf(0)).toBe(0.5);
    expect(normCdf(1.959963984540054)).toBeCloseTo(0.975, 14);
    expect(normCdf(-1)).toBeCloseTo(0.15865525393145707, 14);
    expect(normCdf(8)).toBeCloseTo(1, 14);
    expect(normCdf(-40)).toBe(0);
  });
});

describe("Black–Scholes", () => {
  it.each(fixtures)("matches the Python reference for %o", (f) => {
    const { market, params } = split(f.inputs);
    const p = blackScholes.price(market, params);
    const g = blackScholes.greeks!(market, params);
    expect(p.call).toBeCloseTo(f.call, 10);
    expect(p.put).toBeCloseTo(f.put, 10);
    for (const k of ["delta", "gamma", "vega", "theta", "rho"] as const) {
      expect(g.call[k]).toBeCloseTo(f.callGreeks[k], 10);
      expect(g.put[k]).toBeCloseTo(f.putGreeks[k], 10);
    }
  });

  it("satisfies put-call parity", () => {
    const market = { spot: 123, strike: 117, time: 0.7, rate: 0.04 };
    const p = blackScholes.price(market, { vol: 0.31 });
    expect(p.call - p.put).toBeCloseTo(market.spot - market.strike * Math.exp(-market.rate * market.time), 10);
  });
});

describe("numericGreeks", () => {
  // Checked against Black–Scholes' exact Greeks, so models without formulas can rely on it.
  it.each(fixtures)("agrees with the exact Greeks for %o", (f) => {
    const { market, params } = split(f.inputs);
    const exact = blackScholes.greeks!(market, params);
    const approx = numericGreeks(blackScholes, market, params);
    for (const side of ["call", "put"] as const) {
      for (const k of ["delta", "gamma", "vega", "theta", "rho"] as const) {
        const tol = 1e-4 * Math.max(1, Math.abs(exact[side][k]));
        expect(Math.abs(approx[side][k] - exact[side][k])).toBeLessThan(tol);
      }
    }
  });
});

describe("validate", () => {
  const market = { spot: 100, strike: 100, time: 1, rate: 0.05 };
  it("accepts good inputs, including a negative rate", () => {
    expect(validate(blackScholes, market, { vol: 0.2 })).toBeNull();
    expect(validate(blackScholes, { ...market, rate: -0.01 }, { vol: 0.2 })).toBeNull();
  });
  it("rejects non-positive spot, strike, time and volatility", () => {
    expect(validate(blackScholes, { ...market, spot: 0 }, { vol: 0.2 })).toMatch(/Spot/);
    expect(validate(blackScholes, { ...market, time: 0 }, { vol: 0.2 })).toMatch(/maturity/);
    expect(validate(blackScholes, { ...market, rate: NaN }, { vol: 0.2 })).toMatch(/number/);
    expect(validate(blackScholes, market, { vol: 0 })).toMatch(/Volatility/);
  });
});

describe("priceGrid", () => {
  it("puts volatility on rows and spot on columns", () => {
    const market = { spot: 100, strike: 100, time: 1, rate: 0.05 };
    const g = priceGrid(blackScholes, market, { vol: 0.2 }, [90, 110], [0.1, 0.3]);
    expect(g.call[1][0]).toBeCloseTo(blackScholes.price({ ...market, spot: 90 }, { vol: 0.3 }).call, 12);
    expect(g.put[0][1]).toBeCloseTo(blackScholes.price({ ...market, spot: 110 }, { vol: 0.1 }).put, 12);
  });
});

describe("linspace", () => {
  it("includes both ends", () => {
    expect(linspace(80, 120, 5)).toEqual([80, 90, 100, 110, 120]);
  });
});
