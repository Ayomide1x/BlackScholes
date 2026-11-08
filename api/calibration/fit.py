"""Fit Heston's five parameters to a cleaned set of option quotes."""

from dataclasses import dataclass

import numpy as np
from scipy.optimize import least_squares

from . import black
from .heston import HestonParams, call_prices, characteristic, nodes


@dataclass
class Slice:
    """Quotes for one expiry, already cleaned (see clean.py)."""

    expiry: str  # YYYY-MM-DD
    T: float  # years to expiry
    forward: float
    discount: float
    strikes: np.ndarray
    is_call: np.ndarray  # out-of-the-money side: puts below the forward, calls above
    mid: np.ndarray
    market_iv: np.ndarray


@dataclass
class Fit:
    params: HestonParams
    rmse_iv: float  # root-mean-square implied-volatility error, in volatility units
    model_iv: list[np.ndarray]  # per slice, aligned with its strikes
    iterations: int
    at_bound: list[str]  # parameter names that ended on a bound


# Generous, but bounded so the optimiser can't wander into numerically silly regions.
NAMES = ["v0", "theta", "kappa", "xi", "rho"]
LOWER = np.array([1e-4, 1e-4, 0.05, 0.05, -0.99])
UPPER = np.array([1.0, 1.0, 15.0, 3.0, 0.99])


def _grid(s: Slice, start: HestonParams):
    """Fixed integration nodes for a slice: wide enough for any parameters the
    fit is likely to visit, and the same on every iteration so the objective
    is smooth. Sized from a low-variance, high-ξ version of the starting point,
    whose integrand decays slowest."""
    slow = HestonParams(v0=min(start.v0, 0.01), theta=min(start.theta, 0.01), kappa=start.kappa, xi=2.0, rho=start.rho)
    lnF = np.log(s.forward)
    u = 20.0
    while u < 8000:
        mag = abs(characteristic(np.array([u - 1j]), lnF, s.T, slow)[0]) + s.forward * abs(
            characteristic(np.array([u]), lnF, s.T, slow)[0]
        )
        if mag < 1e-12 * s.forward * u:
            break
        u *= 1.5
    return nodes(u * 1.5)


def model_prices(s: Slice, p: HestonParams, grid=None) -> np.ndarray:
    calls = call_prices(s.strikes, s.forward, s.discount, s.T, p, grid)
    return np.where(s.is_call, calls, calls - s.discount * (s.forward - s.strikes))


def calibrate(slices: list[Slice]) -> Fit:
    """Least squares on vega-weighted price errors, which approximate implied-vol
    errors without inverting every model price on every iteration. Starts from a
    few correlations and keeps the best result, since the fit can stall in a
    local minimum when ρ starts on the wrong side."""
    atm = float(np.nanmedian(np.concatenate([s.market_iv for s in slices])))
    vegas = [np.maximum(black.vega(s.forward, s.strikes, s.discount, s.T, s.market_iv), 1e-3) for s in slices]
    base = HestonParams(v0=atm**2, theta=atm**2, kappa=2.0, xi=0.6, rho=-0.6)
    grids = [_grid(s, base) for s in slices]

    def residuals(x):
        p = HestonParams(*x)
        return np.concatenate([(model_prices(s, p, g) - s.mid) / v for s, g, v in zip(slices, grids, vegas)])

    best = None
    for rho in (-0.7, -0.3, 0.2):
        x0 = np.clip([atm**2, atm**2, 2.0, 0.6, rho], LOWER, UPPER)
        r = least_squares(residuals, x0, bounds=(LOWER, UPPER), x_scale="jac", max_nfev=400)
        if best is None or r.cost < best.cost:
            best = r

    p = HestonParams(*best.x)
    model_iv = [
        black.implied_vol(model_prices(s, p, g), s.forward, s.strikes, s.discount, s.T, s.is_call)
        for s, g in zip(slices, grids)
    ]
    err = np.concatenate([m - s.market_iv for m, s in zip(model_iv, slices)])
    span = UPPER - LOWER
    at_bound = [n for n, x, lo, hi, w in zip(NAMES, best.x, LOWER, UPPER, span) if x - lo < 1e-3 * w or hi - x < 1e-3 * w]
    return Fit(
        params=p,
        rmse_iv=float(np.sqrt(np.nanmean(err**2))),
        model_iv=model_iv,
        iterations=int(best.nfev),
        at_bound=at_bound,
    )
