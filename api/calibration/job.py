"""The daily calibration job.

    python -m calibration.job                  fetch today's snapshot, then fit
    python -m calibration.job --date 2026-11-09  refit a stored snapshot

Every run is recorded with its outcome: ok, rejected (the data or the fit
didn't pass its checks; nothing is saved as a fit) or failed (an error).
Exits non-zero unless the run was ok, so cron logs show trouble.
"""

import argparse
import os
import sys
import traceback

from . import store
from .clean import Rejected, clean
from .data import fetch_snapshot
from .fit import calibrate

MAX_RMSE_IV = 0.03  # three volatility points: worse than this, Heston doesn't describe the day


def run(db_path: str, trade_date: str | None = None, fetch=fetch_snapshot) -> int:
    db = store.connect(db_path)
    run_id = store.start_run(db)
    day = trade_date
    report = None
    try:
        if trade_date:
            snap = store.load_snapshot(db, trade_date)
        else:
            snap = fetch()
            day = snap.trade_date
            store.save_snapshot(db, snap)  # kept even if the fit is rejected, to retry later

        slices, report = clean(snap)
        fit = calibrate(slices)
        report = {**report, "rmse_iv": fit.rmse_iv, "iterations": fit.iterations, "at_bound": fit.at_bound}
        if fit.rmse_iv > MAX_RMSE_IV:
            raise Rejected(
                f"Fit error {fit.rmse_iv * 100:.2f} volatility points is over the "
                f"{MAX_RMSE_IV * 100:.0f}-point limit; not saved."
            )

        store.save_fit(db, day, run_id, snap.spot, {
            "params": fit.params.as_vols(),
            "rmse_iv": fit.rmse_iv,
            "quotes_used": report["quotes_used"],
            "at_bound": fit.at_bound,
            "points": [
                {
                    "expiry": s.expiry,
                    "time": s.T,
                    "forward": s.forward,
                    "strikes": s.strikes.tolist(),
                    "marketIv": s.market_iv.tolist(),
                    "modelIv": [None if v != v else float(v) for v in m],  # NaN → null
                }
                for s, m in zip(slices, fit.model_iv)
            ],
        })
        message = f"Fitted {report['quotes_used']} quotes across {report['expiries_used']} expiries; error {fit.rmse_iv * 100:.2f} vol points."
        store.finish_run(db, run_id, "ok", message, day, report)
        print(f"{day}: ok. {message} Parameters: {fit.params.as_vols()}")
        return 0
    except Rejected as e:
        store.finish_run(db, run_id, "rejected", str(e), day, e.report or report)
        print(f"{day}: rejected. {e}", file=sys.stderr)
        return 1
    except Exception as e:  # noqa: BLE001 - any failure is recorded, then reported
        store.finish_run(db, run_id, "failed", f"{type(e).__name__}: {e}", day, report)
        traceback.print_exc()
        return 1
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibrate Heston to today's SPX options.")
    parser.add_argument("--db", default=os.environ.get("CALIBRATION_DB", "calibration.db"))
    parser.add_argument("--date", help="refit the stored snapshot for this New York date (YYYY-MM-DD)")
    args = parser.parse_args()
    sys.exit(run(args.db, args.date))


if __name__ == "__main__":
    main()
