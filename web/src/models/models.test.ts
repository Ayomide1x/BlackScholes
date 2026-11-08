import { describe, expect, it } from "vitest";
import { black76 } from "./black76";
import { binomial } from "./binomial";
import { blackScholes } from "./blackScholes";
import { merton } from "./merton";
import { validate } from "./index";
import fixtures from "./model-fixtures.json";

const market = { spot: 100, strike: 100, time: 1, rate: 0.05 };
const parity = (m: typeof market) => m.spot - m.strike * Math.exp(-m.rate * m.time);

describe.each([
  ["Black-76", black76, fixtures.black76],
  ["Merton", merton, fixtures.merton],
  ["binomial", binomial, fixtures.binomial],
] as const)("%s", (_, model, cases) => {
  it.each(cases)("matches the Python reference for %o", (f) => {
    const p = model.price(f.market, f.params);
    expect(p.call).toBeCloseTo(f.call, 10);
    expect(p.put).toBeCloseTo(f.put, 10);
  });
});

describe("Black-76", () => {
  it("equals Black–Scholes on the spot price implied by the futures price", () => {
    const F = 105;
    const spot = F * Math.exp(-market.rate * market.time);
    const b76 = black76.price({ ...market, spot: F }, { vol: 0.25 });
    const bs = blackScholes.price({ ...market, spot }, { vol: 0.25 });
    expect(b76.call).toBeCloseTo(bs.call, 12);
    expect(b76.put).toBeCloseTo(bs.put, 12);
  });
});

describe("Merton", () => {
  const params = { vol: 0.2, lambda: 2, jumpMean: -0.1, jumpVol: 0.2 };

  it("reduces to Black–Scholes without jumps", () => {
    const m = merton.price(market, { ...params, lambda: 0 });
    const bs = blackScholes.price(market, { vol: 0.2 });
    expect(m.call).toBeCloseTo(bs.call, 12);
    expect(m.put).toBeCloseTo(bs.put, 12);
  });

  it("satisfies put-call parity", () => {
    const p = merton.price(market, params);
    expect(p.call - p.put).toBeCloseTo(parity(market), 10);
  });

  it("makes far out-of-the-money puts dearer than Black–Scholes when jumps are downward", () => {
    const far = { ...market, strike: 70 };
    expect(merton.price(far, params).put).toBeGreaterThan(blackScholes.price(far, { vol: 0.2 }).put);
  });
});

describe("binomial", () => {
  const euro = { vol: 0.2, steps: 2000, american: 0 };

  it("converges to Black–Scholes for European options", () => {
    const tree = binomial.price(market, euro);
    const bs = blackScholes.price(market, { vol: 0.2 });
    expect(Math.abs(tree.call - bs.call)).toBeLessThan(0.005);
    expect(Math.abs(tree.put - bs.put)).toBeLessThan(0.005);
  });

  it("satisfies put-call parity for European options", () => {
    const p = binomial.price(market, { ...euro, steps: 200 });
    expect(p.call - p.put).toBeCloseTo(parity(market), 10);
  });

  it("prices an American call like a European one, and an American put higher", () => {
    const eu = binomial.price(market, { ...euro, steps: 200 });
    const am = binomial.price(market, { ...euro, steps: 200, american: 1 });
    expect(am.call).toBeCloseTo(eu.call, 10);
    expect(am.put).toBeGreaterThan(eu.put + 0.1);
  });

  it("never prices an American option below its exercise value", () => {
    const deep = { ...market, spot: 60 };
    expect(binomial.price(deep, { ...euro, steps: 200, american: 1 }).put).toBeGreaterThanOrEqual(40);
  });

  it("reads Greeks off the tree close to Black–Scholes' for European options", () => {
    const tree = binomial.greeks!(market, { ...euro, steps: 1000 });
    const exact = blackScholes.greeks!(market, { vol: 0.2 });
    for (const side of ["call", "put"] as const) {
      expect(tree[side].delta).toBeCloseTo(exact[side].delta, 3);
      expect(tree[side].gamma).toBeCloseTo(exact[side].gamma, 3);
      expect(tree[side].theta).toBeCloseTo(exact[side].theta, 2);
      expect(Math.abs(tree[side].vega - exact[side].vega)).toBeLessThan(0.01 * exact[side].vega);
      expect(Math.abs(tree[side].rho - exact[side].rho)).toBeLessThan(0.01 * Math.abs(exact[side].rho));
    }
  });

  it("rejects a tree whose up-move probability leaves 0 to 1", () => {
    expect(validate(binomial, { ...market, rate: 0.5 }, { vol: 0.01, steps: 10, american: 1 })).toMatch(/steps/);
    expect(validate(binomial, market, { vol: 0.2, steps: 10.5, american: 1 })).toMatch(/whole number/);
  });
});
