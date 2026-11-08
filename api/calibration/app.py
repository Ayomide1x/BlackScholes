"""Read-only HTTP API over the calibration database, served under /api."""

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse

from . import store

DB_PATH = os.environ.get("CALIBRATION_DB", "calibration.db")
# Fits change once a day, so browsers and Caddy may reuse a response briefly.
CACHE = {"Cache-Control": "public, max-age=300"}

app = FastAPI(title="Heston calibration", docs_url="/api/docs", openapi_url="/api/openapi.json")


def _db():
    if not Path(DB_PATH).exists():
        raise HTTPException(503, "No calibration has run yet.")
    return store.connect_readonly(DB_PATH)


@app.get("/api/health")
def health():
    """Up, plus when the job last succeeded, so a silently broken fetch shows."""
    if not Path(DB_PATH).exists():
        return {"ok": True, "lastSuccess": None, "lastRun": None}
    db = _db()
    try:
        runs = store.recent_runs(db, 1)
        return {"ok": True, "lastSuccess": store.last_success(db), "lastRun": runs[0] if runs else None}
    finally:
        db.close()


@app.get("/api/calibrations/latest")
def latest():
    db = _db()
    try:
        fit = store.latest_fit(db)
    finally:
        db.close()
    if fit is None:
        raise HTTPException(404, "No calibration has succeeded yet.")
    return JSONResponse(fit, headers=CACHE)


@app.get("/api/calibrations")
def history(limit: int = Query(90, ge=1, le=1000)):
    db = _db()
    try:
        return JSONResponse(store.fit_history(db, limit), headers=CACHE)
    finally:
        db.close()


@app.get("/api/runs")
def runs(limit: int = Query(20, ge=1, le=200)):
    db = _db()
    try:
        return store.recent_runs(db, limit)
    finally:
        db.close()
