from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from calibration import black
from calibration.clean import Rejected, clean
from calibration.data import Snapshot, pick_expiries, rate_for, years_to_expiry

AT = datetime(2026, 11, 9, 19, 30, tzinfo=timezone.utc)  # a Monday, 2:30 p.m. in New York
RATES = [[1 / 12, 0.04], [0.25, 0.041], [0.5, 0.042], [1.0, 0.043], [2.0, 0.045]]


def chain(spot=5000.0, vol=0.18, expiries=("2026-11-23", "2026-12-09", "2027-01-08", "2027-02-08", "2027-05-10")):
    """A clean, flat-volatility chain with realistic spreads, plus a few bad quotes."""
    quotes = []
    for e in expiries:
        T = years_to_expiry(e, AT)
        D = np.exp(-rate_for(RATES, T) * T)
        F = spot / D
        for k in np.arange(0.7 * spot, 1.3 * spot, 25.0):
            for is_call in (True, False):
                p = float(black.price(F, k, D, T, vol, is_call))
                half = max(0.05, 0.02 * p)
                quotes.append({"expiry": e, "root": "SPXW", "strike": float(k), "is_call": is_call,
                               "bid": round(max(p - half, 0), 2), "ask": round(p + half, 2), "last": p})
    return Snapshot(fetched_at=AT.isoformat(), spot=spot, rates=RATES, quotes=quotes)


def test_recovers_the_forward_and_volatility_and_drops_bad_quotes():
    snap = chain()
    slices, report = clean(snap)
    assert report["expiries_used"] == 5
    for s in slices:
        expected_forward = 5000.0 * np.exp(rate_for(RATES, s.T) * s.T)
        assert s.forward == pytest.approx(expected_forward, rel=1e-4)
        assert np.all(s.is_call == (s.strikes >= s.forward))  # out-of-the-money side only
        np.testing.assert_allclose(s.market_iv, 0.18, atol=0.01)
        assert len(s.strikes) <= 25
    assert report["dropped"]["strike too far from the money for its maturity"] > 0  # short expiries' wings
    for s in slices:
        assert np.all(np.abs(np.log(s.strikes / s.forward)) <= 2.5 * 0.18 * np.sqrt(s.T) + 0.01)


def test_drops_an_expiry_whose_forward_is_implausible():
    snap = chain()
    # Stale quotes on one expiry: every call 40 dollars too dear, so parity puts the forward far above spot.
    for q in snap.quotes:
        if q["expiry"] == "2027-05-10" and q["is_call"]:
            q["bid"] += 40
            q["ask"] += 40
    slices, report = clean(snap)
    assert "2027-05-10" not in [s.expiry for s in slices]
    assert report["dropped"]["implausible forward (put-call parity disagrees with spot and rates)"] > 0


def test_keeps_only_close_settled_spxw_when_both_roots_are_listed():
    snap = chain()
    extra = [dict(q, root="SPX", bid=q["bid"] + 1, ask=q["ask"] + 1) for q in snap.quotes if q["expiry"] == "2027-01-08"]
    snap.quotes += extra
    _, report = clean(snap)
    assert report["dropped"]["morning-settled duplicate"] == len(extra)


def test_rejects_a_chain_with_no_bids_like_yahoo_after_hours():
    snap = chain()
    for q in snap.quotes:
        q["bid"] = q["ask"] = 0.0
    with pytest.raises(Rejected, match="Outside US market hours"):
        clean(snap)


def test_trade_date_is_new_york_date():
    late = AT.replace(hour=23, minute=0) + timedelta(hours=2)  # 01:00 UTC Tuesday = Monday evening in New York
    assert Snapshot(fetched_at=late.isoformat(), spot=1, rates=RATES).trade_date == "2026-11-09"


def test_picks_one_expiry_per_target_and_skips_the_first_week():
    listed = ["2026-11-10", "2026-11-13", "2026-11-23", "2026-12-09", "2026-12-18", "2027-01-08", "2027-02-08",
              "2027-05-10", "2027-08-09", "2027-11-08", "2028-05-09", "2029-12-21"]
    picked = pick_expiries(listed, AT)
    assert "2026-11-10" not in picked and "2026-11-13" not in picked
    assert picked == sorted(set(picked)) and len(picked) <= 8


def test_rates_interpolate_and_extend_flat():
    assert rate_for(RATES, 0.01) == 0.04
    assert rate_for(RATES, 0.75) == pytest.approx(0.0425)
    assert rate_for(RATES, 5) == 0.045
