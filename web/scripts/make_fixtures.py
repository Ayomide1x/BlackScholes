"""Reference values for src/models/blackScholes.test.ts, from Python's standard library.

    python3 scripts/make_fixtures.py > src/models/fixtures.json
"""
import json
from math import exp, log, sqrt
from statistics import NormalDist

N = NormalDist()
CASES = [
    # spot, strike, time, vol, rate
    (100, 100, 1, 0.2, 0.05),
    (100, 90, 2, 0.2, 0.05),
    (50, 80, 0.25, 0.35, 0.01),
    (150, 100, 0.5, 0.6, 0.08),
    (100, 100, 0.01, 0.05, 0.0),
    (20, 25, 3, 1.2, -0.01),
]


def bs(S, K, T, v, r):
    d1 = (log(S / K) + (r + 0.5 * v * v) * T) / (v * sqrt(T))
    d2 = d1 - v * sqrt(T)
    disc = exp(-r * T)
    pdf = N.pdf(d1)
    decay = -S * pdf * v / (2 * sqrt(T))
    return {
        "inputs": {"spot": S, "strike": K, "time": T, "vol": v, "rate": r},
        "call": S * N.cdf(d1) - K * disc * N.cdf(d2),
        "put": K * disc * N.cdf(-d2) - S * N.cdf(-d1),
        "callGreeks": {
            "delta": N.cdf(d1),
            "gamma": pdf / (S * v * sqrt(T)),
            "vega": S * pdf * sqrt(T),
            "theta": decay - r * K * disc * N.cdf(d2),
            "rho": K * T * disc * N.cdf(d2),
        },
        "putGreeks": {
            "delta": N.cdf(d1) - 1,
            "gamma": pdf / (S * v * sqrt(T)),
            "vega": S * pdf * sqrt(T),
            "theta": decay + r * K * disc * N.cdf(-d2),
            "rho": -K * T * disc * N.cdf(-d2),
        },
    }


print(json.dumps([bs(*c) for c in CASES], indent=2))
