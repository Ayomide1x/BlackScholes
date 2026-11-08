"""Reference Heston prices for src/models/heston.test.ts, from Python's standard library.

    python3 scripts/make_heston_fixtures.py > src/models/heston-fixtures.json

Deliberately different from the TypeScript: Heston's original two-probability
form (P1 and P2 integrated separately), the original characteristic function
rather than the "little trap" rewrite, and a plain trapezoid rule on a fine
grid rather than Gauss–Legendre panels. Agreement means the algebra holds, not
that one routine was copied into the other.

The cases stay where the original form is reliable. With high volatility of
variance and strong negative correlation (S=90, K=100, T=0.25, v0=0.09,
θ=0.04, κ=5, ξ=1, ρ=−0.9) its complex logarithm jumps branches and it returns
a negative call price; the test checks that case against a simulation instead.
"""
import cmath
import json
from math import exp, log, pi, sqrt


def heston_call(S, K, T, r, v0, theta, kappa, xi, rho):
    x = log(S)

    def f(u, j):
        # Heston (1993), equations (17)-(18).
        b = kappa - rho * xi if j == 1 else kappa
        uj = 0.5 if j == 1 else -0.5
        d = cmath.sqrt((rho * xi * 1j * u - b) ** 2 - xi**2 * (2 * uj * 1j * u - u * u))
        g = (b - rho * xi * 1j * u + d) / (b - rho * xi * 1j * u - d)
        C = r * 1j * u * T + kappa * theta / xi**2 * (
            (b - rho * xi * 1j * u + d) * T - 2 * cmath.log((1 - g * cmath.exp(d * T)) / (1 - g))
        )
        D = (b - rho * xi * 1j * u + d) / xi**2 * (1 - cmath.exp(d * T)) / (1 - g * cmath.exp(d * T))
        return cmath.exp(C + D * v0 + 1j * u * x)

    def P(j):
        h = 0.005
        total = 0.0
        for n in range(1, 40001):  # u from 0.005 to 200; the integrand is finite at 0
            u = n * h
            w = 0.5 if n == 40000 else 1.0
            total += w * (cmath.exp(-1j * u * log(K)) * f(u, j) / (1j * u)).real
        # The missing [0, h] slice, using the integrand's value at h.
        total += 0.5 * (cmath.exp(-1j * h * log(K)) * f(h, j) / (1j * h)).real
        return 0.5 + h * total / pi

    return S * P(1) - K * exp(-r * T) * P(2)


CASES = [
    # spot, strike, time, rate, vol0, longVol, kappa, xi, rho
    (100, 100, 1.0, 0.05, 0.2, 0.2, 2.0, 0.5, -0.7),
    (100, 80, 0.5, 0.03, 0.25, 0.3, 1.0, 0.8, -0.5),
    (100, 125, 2.0, 0.02, 0.15, 0.2, 3.0, 0.3, 0.3),
    (100, 95, 0.25, 0.04, 0.3, 0.25, 4.0, 0.6, -0.8),
]

out = []
for S, K, T, r, s0, sbar, kappa, xi, rho in CASES:
    out.append({
        "market": {"spot": S, "strike": K, "time": T, "rate": r},
        "params": {"vol0": s0, "longVol": sbar, "kappa": kappa, "xi": xi, "rho": rho},
        "call": heston_call(S, K, T, r, s0**2, sbar**2, kappa, xi, rho),
    })
print(json.dumps(out, indent=2))
