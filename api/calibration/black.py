"""Black (1976) prices and implied volatility in forward terms, vectorised.

With the forward F and discount factor D measured from the market, this is
Black–Scholes without needing to know the rate or dividend yield separately.
"""

import numpy as np
from scipy.special import ndtr


def price(F, K, D, T, vol, is_call):
    F, K, vol = np.asarray(F, float), np.asarray(K, float), np.asarray(vol, float)
    s = vol * np.sqrt(T)
    d1 = (np.log(F / K) + 0.5 * s * s) / s
    d2 = d1 - s
    call = D * (F * ndtr(d1) - K * ndtr(d2))
    put = D * (K * ndtr(-d2) - F * ndtr(-d1))
    return np.where(is_call, call, put)


def vega(F, K, D, T, vol):
    """∂price/∂vol, the same for calls and puts."""
    s = np.asarray(vol, float) * np.sqrt(T)
    d1 = (np.log(F / np.asarray(K, float)) + 0.5 * s * s) / s
    return D * F * np.exp(-0.5 * d1 * d1) / np.sqrt(2 * np.pi) * np.sqrt(T)


def implied_vol(target, F, K, D, T, is_call, lo=1e-4, hi=5.0, iterations=80):
    """Bisection on every quote at once; NaN where the price is outside its no-arbitrage bounds."""
    target = np.asarray(target, float)
    K = np.asarray(K, float)
    is_call = np.broadcast_to(is_call, target.shape)
    intrinsic = D * np.where(is_call, np.maximum(F - K, 0), np.maximum(K - F, 0))
    ceiling = D * np.where(is_call, F, K)
    ok = (target > intrinsic + 1e-10) & (target < ceiling - 1e-10)

    a = np.full(target.shape, lo)
    b = np.full(target.shape, hi)
    for _ in range(iterations):
        mid = 0.5 * (a + b)
        too_high = price(F, K, D, T, mid, is_call) > target
        b = np.where(too_high, mid, b)
        a = np.where(too_high, a, mid)
    return np.where(ok, 0.5 * (a + b), np.nan)
