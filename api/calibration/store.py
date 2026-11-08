"""SQLite storage: every run, every day's raw snapshot, every day's fit.

One writer (the daily job) and a few readers (the API), so a single file is
plenty. Snapshots and fits are keyed by New York trade date, so re-running a
day replaces that day's rows instead of adding duplicates.
"""

import gzip
import json
import sqlite3
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id          INTEGER PRIMARY KEY,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    trade_date  TEXT,
    status      TEXT NOT NULL,          -- running | ok | rejected | failed
    message     TEXT,
    report      TEXT                    -- JSON: quotes seen, used, dropped by reason
);
CREATE TABLE IF NOT EXISTS snapshots (
    trade_date  TEXT PRIMARY KEY,
    fetched_at  TEXT NOT NULL,
    spot        REAL NOT NULL,
    data        BLOB NOT NULL           -- gzipped Snapshot JSON
);
CREATE TABLE IF NOT EXISTS fits (
    trade_date  TEXT PRIMARY KEY,
    run_id      INTEGER NOT NULL REFERENCES runs(id),
    fitted_at   TEXT NOT NULL,
    spot        REAL NOT NULL,
    params      TEXT NOT NULL,          -- JSON, in the frontend's units
    rmse_iv     REAL NOT NULL,
    quotes_used INTEGER NOT NULL,
    at_bound    TEXT NOT NULL,          -- JSON list of parameter names
    points      TEXT NOT NULL           -- JSON: per expiry, market and model implied vols
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: str) -> sqlite3.Connection:
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    return db


def connect_readonly(path: str) -> sqlite3.Connection:
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    return db


def start_run(db) -> int:
    with db:
        return db.execute("INSERT INTO runs (started_at, status) VALUES (?, 'running')", (now(),)).lastrowid


def finish_run(db, run_id: int, status: str, message: str, trade_date: str | None = None, report: dict | None = None):
    with db:
        db.execute(
            "UPDATE runs SET finished_at = ?, status = ?, message = ?, trade_date = ?, report = ? WHERE id = ?",
            (now(), status, message, trade_date, json.dumps(report) if report else None, run_id),
        )


def save_snapshot(db, snap) -> None:
    with db:
        db.execute(
            "INSERT OR REPLACE INTO snapshots (trade_date, fetched_at, spot, data) VALUES (?, ?, ?, ?)",
            (snap.trade_date, snap.fetched_at, snap.spot, gzip.compress(snap.to_json().encode())),
        )


def load_snapshot(db, trade_date: str):
    from .data import Snapshot

    row = db.execute("SELECT data FROM snapshots WHERE trade_date = ?", (trade_date,)).fetchone()
    if row is None:
        raise LookupError(f"No snapshot stored for {trade_date}.")
    return Snapshot.from_json(gzip.decompress(row["data"]).decode())


def save_fit(db, trade_date: str, run_id: int, spot: float, fit: dict) -> None:
    with db:
        db.execute(
            """INSERT OR REPLACE INTO fits
               (trade_date, run_id, fitted_at, spot, params, rmse_iv, quotes_used, at_bound, points)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (trade_date, run_id, now(), spot, json.dumps(fit["params"]), fit["rmse_iv"], fit["quotes_used"],
             json.dumps(fit["at_bound"]), json.dumps(fit["points"])),
        )


def _fit_row(row, with_points: bool) -> dict:
    out = {
        "date": row["trade_date"],
        "fittedAt": row["fitted_at"],
        "spot": row["spot"],
        "params": json.loads(row["params"]),
        "rmseIv": row["rmse_iv"],
        "quotesUsed": row["quotes_used"],
        "atBound": json.loads(row["at_bound"]),
    }
    if with_points:
        out["expiries"] = json.loads(row["points"])
    return out


def latest_fit(db) -> dict | None:
    row = db.execute("SELECT * FROM fits ORDER BY trade_date DESC LIMIT 1").fetchone()
    return _fit_row(row, with_points=True) if row else None


def fit_history(db, limit: int) -> list[dict]:
    rows = db.execute("SELECT * FROM fits ORDER BY trade_date DESC LIMIT ?", (limit,)).fetchall()
    return [_fit_row(r, with_points=False) for r in rows]


def recent_runs(db, limit: int) -> list[dict]:
    rows = db.execute("SELECT * FROM runs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [
        {
            "id": r["id"],
            "startedAt": r["started_at"],
            "finishedAt": r["finished_at"],
            "date": r["trade_date"],
            "status": r["status"],
            "message": r["message"],
            "report": json.loads(r["report"]) if r["report"] else None,
        }
        for r in rows
    ]


def last_success(db) -> str | None:
    row = db.execute("SELECT finished_at FROM runs WHERE status = 'ok' ORDER BY id DESC LIMIT 1").fetchone()
    return row["finished_at"] if row else None
