"""Reference prices for src/models/models.test.ts, from Python's standard library.

    python3 scripts/make_model_fixtures.py > src/models/model-fixtures.json

Merton is written in its other textbook form (Poisson(λT) weights with an
explicit drift adjustment) so the test also checks the TypeScript algebra.
"""
import json
from math import exp, factorial, log, sqrt
from statistics import NormalDist

N = NormalDist()


def bs(S, K, T, v, r):
    d1 = (log(S / K) + (r + 0.5 * v * v) * T) / (v * sqrt(T))
    d2 = d1 - v * sqrt(T)
    return (
        S * N.cdf(d1) - K * exp(-r * T) * N.cdf(d2),
        K * exp(-r * T) * N.cdf(-d2) - S * N.cdf(-d1),
    )


def black76(F, K, T, v, r):
    d1 = (log(F / K) + 0.5 * v * v * T) / (v * sqrt(T))
    d2 = d1 - v * sqrt(T)
    disc = exp(-r * T)
    return disc * (F * N.cdf(d1) - K * N.cdf(d2)), disc * (K * N.cdf(-d2) - F * N.cdf(-d1))


def merton(S, K, T, v, r, lam, mu, delta):
    k = exp(mu + 0.5 * delta**2) - 1
    call = put = 0.0
    for n in range(170):
        w = exp(-lam * T) * (lam * T) ** n / factorial(n)
        rn = r - lam * k + n * (mu + 0.5 * delta**2) / T
        vn = sqrt(v * v + n * delta**2 / T)
        c, p = bs(S, K, T, vn, rn)
        adj = exp((rn - r) * T)
        call += w * adj * c
        put += w * adj * p
    return call, put


def crr(S, K, T, v, r, steps, american):
    dt = T / steps
    u = exp(v * sqrt(dt))
    d = 1 / u
    p = (exp(r * dt) - d) / (u - d)
    disc = exp(-r * dt)
    spot = lambda i, j: S * u**j * d ** (i - j)
    call = [max(spot(steps, j) - K, 0) for j in range(steps + 1)]
    put = [max(K - spot(steps, j), 0) for j in range(steps + 1)]
    for i in range(steps - 1, -1, -1):
        for j in range(i + 1):
            c = disc * (p * call[j + 1] + (1 - p) * call[j])
            q = disc * (p * put[j + 1] + (1 - p) * put[j])
            call[j] = max(c, spot(i, j) - K) if american else c
            put[j] = max(q, K - spot(i, j)) if american else q
    return call[0], put[0]


MARKETS = [
    # spot, strike, time, vol, rate
    (100, 100, 1, 0.2, 0.05),
    (80, 100, 0.5, 0.35, 0.03),
    (130, 100, 2, 0.15, 0.08),
]

out = {"black76": [], "merton": [], "binomial": []}
for S, K, T, v, r in MARKETS:
    market = {"spot": S, "strike": K, "time": T, "rate": r}
    c, p = black76(S, K, T, v, r)
    out["black76"].append({"market": market, "params": {"vol": v}, "call": c, "put": p})
    for lam, mu, delta in [(1, -0.1, 0.15), (3, 0.05, 0.3), (0, 0, 0)]:
        c, p = merton(S, K, T, v, r, lam, mu, delta)
        params = {"vol": v, "lambda": lam, "jumpMean": mu, "jumpVol": delta}
        out["merton"].append({"market": market, "params": params, "call": c, "put": p})
    for steps in (50, 200):
        for american in (0, 1):
            c, p = crr(S, K, T, v, r, steps, american)
            params = {"vol": v, "steps": steps, "american": american}
            out["binomial"].append({"market": market, "params": params, "call": c, "put": p})

print(json.dumps(out, indent=2))
