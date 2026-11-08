import numpy as np

from calibration import black
from calibration.fit import Slice, calibrate, model_prices
from calibration.heston import HestonParams

TRUE = HestonParams(v0=0.03, theta=0.05, kappa=2.5, xi=0.7, rho=-0.75)


def synthetic(params: HestonParams, noise_iv: float = 0.0, seed: int = 0) -> list[Slice]:
    """An SPX-like surface priced by Heston itself, optionally with quote noise."""
    rng = np.random.default_rng(seed)
    slices = []
    for T in (0.05, 0.1, 0.25, 0.5, 1.0, 2.0):
        F, D = 5000 * np.exp(0.04 * T), np.exp(-0.045 * T)
        width = 2.5 * 0.2 * np.sqrt(T)
        K = F * np.exp(np.linspace(-width, width * 0.6, 21))
        is_call = K >= F
        s = Slice(f"T{T}", T, F, D, K, is_call, np.zeros_like(K), np.zeros_like(K))
        mid = model_prices(s, params)
        iv = black.implied_vol(mid, F, K, D, T, is_call) + noise_iv * rng.standard_normal(K.size)
        s.mid = black.price(F, K, D, T, iv, is_call)
        s.market_iv = iv
        slices.append(s)
    return slices


def test_recovers_the_parameters_that_made_the_prices():
    fit = calibrate(synthetic(TRUE))
    p = fit.params
    assert fit.rmse_iv < 1e-4
    assert abs(p.v0 - TRUE.v0) < 1e-3
    assert abs(p.theta - TRUE.theta) < 2e-3
    assert abs(p.xi - TRUE.xi) < 0.05
    assert abs(p.rho - TRUE.rho) < 0.02
    assert fit.at_bound == []


def test_noisy_quotes_fit_to_about_the_noise_level():
    fit = calibrate(synthetic(TRUE, noise_iv=0.005, seed=1))
    assert 0.003 < fit.rmse_iv < 0.007
    assert abs(fit.params.rho - TRUE.rho) < 0.1
