import { describe, expect, it } from "vitest";
import { blackScholes } from "./blackScholes";
import { fellerRatio, heston } from "./heston";
import { impliedVol, smile } from "./impliedVol";
import fixtures from "./heston-fixtures.json";

const market = { spot: 100, strike: 100, time: 1, rate: 0.05 };
const params = { vol0: 0.2, longVol: 0.2, kappa: 2, xi: 0.5, rho: -0.7 };

describe("Heston", () => {
  it("matches the Fang–Oosterlee (2008) benchmark", () => {
    const m = { spot: 100, strike: 100, time: 1, rate: 0 };
    const p = { vol0: Math.sqrt(0.0175), longVol: Math.sqrt(0.0398), kappa: 1.5768, xi: 0.5751, rho: -0.5711 };
    expect(heston.price(m, p).call).toBeCloseTo(5.78515545, 7);
  });

  // The Python reference integrates with a trapezoid rule, accurate to about 1e-7.
  it.each(fixtures)("matches the Python reference for %o", (f) => {
    expect(heston.price(f.market, f.params).call).toBeCloseTo(f.call, 6);
  });

  it("agrees with a simulation where Heston's original formula breaks down", () => {
    // 40,000 full-truncation Euler paths in Python gave 0.3301 ± 0.0106 (95%).
    const m = { spot: 90, strike: 100, time: 0.25, rate: 0 };
    const p = { vol0: 0.3, longVol: 0.2, kappa: 5, xi: 1, rho: -0.9 };
    const call = heston.price(m, p).call;
    expect(call).toBeGreaterThan(0.3301 - 0.0106);
    expect(call).toBeLessThan(0.3301 + 0.0106);
  });

  it("satisfies put-call parity", () => {
    const p = heston.price(market, params);
    expect(p.call - p.put).toBeCloseTo(market.spot - market.strike * Math.exp(-market.rate * market.time), 10);
  });

  // With ρ ≠ 0 the gap shrinks only in proportion to ξ; uncorrelated, it shrinks like ξ².
  it("approaches Black–Scholes as volatility of volatility goes to zero", () => {
    const h = heston.price(market, { ...params, xi: 1e-3, rho: 0 });
    const bs = blackScholes.price(market, { vol: 0.2 });
    expect(h.call).toBeCloseTo(bs.call, 4);
    expect(h.put).toBeCloseTo(bs.put, 4);
  });

  it("computes the Feller ratio 2κσ̄² / ξ²", () => {
    expect(fellerRatio(params)).toBeCloseTo(0.64, 12); // 2·2·0.04 / 0.25
    expect(fellerRatio({ kappa: 2.5, longVol: 0.2, xi: 0.4 })).toBeCloseTo(1.25, 12);
    expect(fellerRatio({ kappa: 1, longVol: 0.5, xi: Math.SQRT1_2 })).toBeCloseTo(1, 12); // the boundary
  });

  it("flags inputs that break the Feller condition, 2κσ̄² > ξ²", () => {
    expect(heston.note!(params, market)).toMatch(/Feller/); // 2·2·0.04 = 0.16 ≤ 0.25
    expect(heston.note!({ ...params, kappa: 2.5, xi: 0.4 }, market)).toBeNull(); // 0.2 > 0.16
  });
});

describe("impliedVol", () => {
  it.each([0.05, 0.2, 0.8])("recovers the volatility behind a Black–Scholes price (σ = %s)", (vol) => {
    // Strikes about one standard deviation either side, where the option has real time value.
    for (const strike of [100 * Math.exp(-vol), 100, 100 * Math.exp(vol)]) {
      const m = { ...market, strike };
      const p = blackScholes.price(m, { vol });
      expect(impliedVol(p.call, m, "call")).toBeCloseTo(vol, 8);
      expect(impliedVol(p.put, m, "put")).toBeCloseTo(vol, 8);
    }
  });

  it("returns NaN for prices outside the no-arbitrage bounds", () => {
    expect(impliedVol(0, market, "call")).toBeNaN();
    expect(impliedVol(150, market, "call")).toBeNaN();
  });
});

describe("smile", () => {
  it("is flat for Black–Scholes", () => {
    const [curve] = smile(blackScholes, market, { vol: 0.25 }, [1], 9);
    for (const p of curve.points) expect(p.vol).toBeCloseTo(0.25, 8);
  });

  it("skews down in strike for Heston with negative correlation", () => {
    const iv = (strike: number) => {
      const m = { ...market, strike };
      return impliedVol(heston.price(m, params).call, m, "call");
    };
    expect(iv(80)).toBeGreaterThan(iv(100) + 0.01);
    expect(iv(100)).toBeGreaterThan(iv(120) + 0.01);
  });

  it("inverts out-of-the-money options and covers every maturity asked for", () => {
    const curves = smile(heston, market, params, [0.25, 1, 2], 9);
    expect(curves.map((c) => c.time)).toEqual([0.25, 1, 2]);
    for (const c of curves) expect(c.points.every((p) => Number.isFinite(p.vol))).toBe(true);
  });
});
