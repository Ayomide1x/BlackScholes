"""Heston (1993) European option prices, vectorised over strikes.

The same formulation as web/src/models/heston.ts: the "little Heston trap"
characteristic function (Albrecher et al., 2007), with a − d computed as
−(d² − a²)/(a + d) so small ξ doesn't cancel away the digits, and both
Gil-Pelaez probabilities folded into one integral.

Prices here take the forward F and discount factor D directly, because the
calibrator measures those from the market rather than assuming a rate.
"""

from dataclasses import dataclass

import numpy as np

# 10-point Gauss–Legendre nodes and weights on [−1, 1].
_GL_X, _GL_W = np.polynomial.legendre.leggauss(10)


@dataclass(frozen=True)
class HestonParams:
    v0: float  # today's variance
    theta: float  # long-run variance
    kappa: float  # mean-reversion speed, per year
    xi: float  # volatility of variance
    rho: float  # correlation between price and variance shocks

    def as_vols(self) -> dict:
        """The frontend's units: volatilities rather than variances."""
        return {
            "vol0": float(np.sqrt(self.v0)),
            "longVol": float(np.sqrt(self.theta)),
            "kappa": float(self.kappa),
            "xi": float(self.xi),
            "rho": float(self.rho),
        }


def characteristic(u: np.ndarray, log_forward: float, T: float, p: HestonParams) -> np.ndarray:
    """E[exp(iu ln S_T)] under the risk-neutral measure, for complex u."""
    iu = 1j * u
    a = p.kappa - p.rho * p.xi * iu
    w = p.xi**2 * (iu + u * u)  # d² − a²
    d = np.sqrt(a * a + w)
    a_minus_d = -w / (a + d)
    g = a_minus_d / (a + d)
    edt = np.exp(-d * T)
    C = p.kappa * p.theta / p.xi**2 * (a_minus_d * T - 2 * np.log((1 - g * edt) / (1 - g)))
    D = a_minus_d / p.xi**2 * (1 - edt) / (1 - g * edt)
    return np.exp(iu * log_forward + C + D * p.v0)


def nodes(upper: float, width: float = 2.0) -> tuple[np.ndarray, np.ndarray]:
    """Gauss–Legendre nodes and weights on (0, upper], in panels of `width`."""
    panels = max(1, int(np.ceil(upper / width)))
    mids = (np.arange(panels) + 0.5) * width
    u = (mids[:, None] + 0.5 * width * _GL_X[None, :]).ravel()
    w = np.tile(0.5 * width * _GL_W, panels)
    return u, w


def integration_limit(forward: float, T: float, p: HestonParams) -> float:
    """Where the integrand has become negligible, found by probing outwards.

    The integrand decays like exp(−u² v T / 2) at first and only exponentially in
    u further out, so no closed-form bound suits every input; widening the
    probe until |φ(u − i)| + F|φ(u)| is tiny relative to F·u does.
    """
    lnF = np.log(forward)
    u = 20.0
    while u < 8000:
        mag = abs(characteristic(np.array([u - 1j]), lnF, T, p)[0]) + forward * abs(characteristic(np.array([u]), lnF, T, p)[0])
        if mag < 1e-14 * forward * u:
            break
        u *= 1.5
    return u * 1.5


def call_prices(
    strikes: np.ndarray,
    forward: float,
    discount: float,
    T: float,
    p: HestonParams,
    grid: tuple[np.ndarray, np.ndarray] | None = None,
) -> np.ndarray:
    """Call prices for every strike at one maturity.

    `grid` fixes the integration nodes; the calibrator passes the same nodes on
    every iteration so the objective it minimises is smooth in the parameters.
    """
    u, w = grid if grid is not None else nodes(integration_limit(forward, T, p))
    lnF = np.log(forward)
    phi = characteristic(u, lnF, T, p)  # E[S_T^{iu}]
    phi_shift = characteristic(u - 1j, lnF, T, p)  # E[S_T^{1+iu}]
    K = np.asarray(strikes, dtype=float)[:, None]
    integrand = (np.exp(-1j * u[None, :] * np.log(K)) * (phi_shift[None, :] - K * phi[None, :]) / (1j * u[None, :])).real
    total = integrand @ w
    return discount * (0.5 * (forward - K[:, 0]) + total / np.pi)


def put_prices(strikes, forward, discount, T, p, grid=None) -> np.ndarray:
    """By put-call parity: P = C − D (F − K)."""
    K = np.asarray(strikes, dtype=float)
    return call_prices(K, forward, discount, T, p, grid) - discount * (forward - K)
