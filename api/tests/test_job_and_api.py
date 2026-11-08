import importlib

import numpy as np
import pytest
from fastapi.testclient import TestClient

from calibration import job, store
from calibration.data import rate_for, years_to_expiry
from calibration.heston import HestonParams, call_prices, put_prices

from .test_clean import AT, chain

TRUE = HestonParams(v0=0.03, theta=0.05, kappa=2.5, xi=0.7, rho=-0.75)


def heston_snapshot():
    """A chain priced by Heston itself, with tight spreads, so the fit should pass its checks."""
    snap = chain()
    quotes = []
    for expiry in ["2026-11-23", "2026-12-09", "2027-01-08", "2027-02-08", "2027-05-10", "2027-11-08"]:
        T = years_to_expiry(expiry, AT)
        D = float(np.exp(-rate_for(snap.rates, T) * T))
        F = snap.spot / D
        K = F * np.exp(np.linspace(-0.5, 0.3, 33) * np.sqrt(T))
        for prices, is_call in ((call_prices(K, F, D, T, TRUE), True), (put_prices(K, F, D, T, TRUE), False)):
            for k, p in zip(K, prices):
                quotes.append({"expiry": expiry, "root": "SPXW", "strike": float(k), "is_call": is_call,
                               "bid": float(p) * 0.995, "ask": float(p) * 1.005, "last": float(p)})
    snap.quotes = quotes
    return snap


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "calibration.db")


def test_a_good_day_saves_a_fit_and_rerunning_replaces_it(db_path):
    snap = heston_snapshot()
    assert job.run(db_path, fetch=lambda: snap) == 0
    assert job.run(db_path, trade_date=snap.trade_date) == 0  # refit from the stored snapshot
    db = store.connect(db_path)
    assert db.execute("SELECT COUNT(*) FROM fits").fetchone()[0] == 1
    assert [r["status"] for r in store.recent_runs(db, 5)] == ["ok", "ok"]
    fit = store.latest_fit(db)
    assert fit["rmseIv"] < 0.01
    assert fit["params"]["rho"] == pytest.approx(-0.75, abs=0.1)
    assert len(fit["expiries"]) >= 4


def test_a_day_without_quotes_is_rejected_but_its_snapshot_kept(db_path):
    snap = chain()
    for q in snap.quotes:
        q["bid"] = q["ask"] = 0.0
    assert job.run(db_path, fetch=lambda: snap) == 1
    db = store.connect(db_path)
    (last,) = store.recent_runs(db, 1)
    assert last["status"] == "rejected" and "Outside US market hours" in last["message"]
    assert last["report"]["quotes_used"] == 0 and last["report"]["dropped"]
    assert store.latest_fit(db) is None
    assert store.load_snapshot(db, snap.trade_date).spot == snap.spot


def test_an_error_is_recorded_as_failed(db_path):
    def broken():
        raise ConnectionError("Yahoo unreachable")

    assert job.run(db_path, fetch=broken) == 1
    (last,) = store.recent_runs(store.connect(db_path), 1)
    assert last["status"] == "failed" and "Yahoo unreachable" in last["message"]


def client(db_path, monkeypatch):
    monkeypatch.setenv("CALIBRATION_DB", db_path)
    from calibration import app as app_module

    importlib.reload(app_module)
    return TestClient(app_module.app)


def test_api_before_any_run(db_path, monkeypatch):
    c = client(db_path, monkeypatch)
    assert c.get("/api/health").json() == {"ok": True, "lastSuccess": None, "lastRun": None}
    assert c.get("/api/calibrations/latest").status_code == 503


def test_api_serves_the_latest_fit_history_and_runs(db_path, monkeypatch):
    snap = heston_snapshot()
    job.run(db_path, fetch=lambda: snap)
    c = client(db_path, monkeypatch)

    latest = c.get("/api/calibrations/latest")
    assert latest.status_code == 200
    assert latest.headers["cache-control"] == "public, max-age=300"
    body = latest.json()
    assert set(body["params"]) == {"vol0", "longVol", "kappa", "xi", "rho"}
    assert body["date"] == snap.trade_date
    first = body["expiries"][0]
    assert len(first["strikes"]) == len(first["marketIv"]) == len(first["modelIv"])

    assert len(c.get("/api/calibrations?limit=5").json()) == 1
    assert c.get("/api/runs").json()[0]["status"] == "ok"
    assert c.get("/api/health").json()["lastSuccess"] is not None
