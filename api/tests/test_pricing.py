import json
import math
from pathlib import Path

import numpy as np
import pytest

from calibration import black
from calibration.heston import HestonParams, call_prices, put_prices


def _fixtures():
    # Inside the Docker test stage the file is copied next to the tests;
    # in the repo it lives with the TypeScript tests that use it too.
    here = Path(__file__).parent
    for path in (here / "heston-fixtures.json", here.parents[1] / "web/src/models/heston-fixtures.json"):
        if path.exists():
            return json.loads(path.read_text())
    raise FileNotFoundError("heston-fixtures.json")


def _params(p):
    return HestonParams(v0=p["vol0"] ** 2, theta=p["longVol"] ** 2, kappa=p["kappa"], xi=p["xi"], rho=p["rho"])


def test_matches_fang_oosterlee_benchmark():
    p = HestonParams(v0=0.0175, theta=0.0398, kappa=1.5768, xi=0.5751, rho=-0.5711)
    assert call_prices(np.array([100.0]), 100.0, 1.0, 1.0, p)[0] == pytest.approx(5.785155450, abs=1e-7)


@pytest.mark.parametrize("case", _fixtures())
def test_matches_the_same_reference_as_the_frontend(case):
    m = case["market"]
    F = m["spot"] * math.exp(m["rate"] * m["time"])
    D = math.exp(-m["rate"] * m["time"])
    call = call_prices(np.array([m["strike"]]), F, D, m["time"], _params(case["params"]))[0]
    assert call == pytest.approx(case["call"], abs=1e-6)


def test_agrees_with_simulation_where_the_original_formula_fails():
    # Same case and simulation as web/src/models/heston.test.ts: 0.3301 ± 0.0106.
    p = HestonParams(v0=0.09, theta=0.04, kappa=5, xi=1, rho=-0.9)
    call = call_prices(np.array([100.0]), 90.0, 1.0, 0.25, p)[0]
    assert abs(call - 0.3301) < 0.0106


def test_put_call_parity_and_many_strikes_at_once():
    p = HestonParams(v0=0.04, theta=0.05, kappa=2, xi=0.6, rho=-0.7)
    K = np.linspace(60, 160, 21)
    c = call_prices(K, 105.0, 0.97, 1.5, p)
    q = put_prices(K, 105.0, 0.97, 1.5, p)
    np.testing.assert_allclose(c - q, 0.97 * (105.0 - K), atol=1e-10)
    assert np.all(np.diff(c) < 0)  # calls get cheaper as the strike rises


def test_implied_vol_round_trip():
    K = np.array([80.0, 100.0, 120.0, 80.0, 100.0, 120.0])
    is_call = np.array([True, True, True, False, False, False])
    vols = np.array([0.35, 0.2, 0.15, 0.35, 0.2, 0.15])
    prices = black.price(100.0, K, 0.98, 0.5, vols, is_call)
    np.testing.assert_allclose(black.implied_vol(prices, 100.0, K, 0.98, 0.5, is_call), vols, atol=1e-10)


def test_implied_vol_is_nan_outside_bounds():
    out = black.implied_vol(np.array([0.0, 200.0]), 100.0, np.array([100.0, 100.0]), 1.0, 1.0, True)
    assert np.isnan(out).all()
