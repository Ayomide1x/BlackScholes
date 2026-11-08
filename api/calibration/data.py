"""Fetching a market snapshot: an SPX option chain and Treasury yields.

Everything the calibration needs is captured in a Snapshot, which is stored
as-is, so a day can be recalibrated later (after improving the cleaning or the
fit) without fetching again.
"""

import csv
import io
import json
import math
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

NEW_YORK = ZoneInfo("America/New_York")

# Expiries to fit, as target maturities in days: dense where the skew changes
# fastest, sparse at the long end. The nearest listed expiry to each is used.
TARGET_DAYS = [14, 30, 60, 91, 182, 273, 365, 547]
MIN_DAYS = 7

# FRED series (constant-maturity Treasury yields, percent) and their maturities in years.
FRED_SERIES = {"DGS1MO": 1 / 12, "DGS3MO": 0.25, "DGS6MO": 0.5, "DGS1": 1.0, "DGS2": 2.0}
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + ",".join(FRED_SERIES)


@dataclass
class Snapshot:
    fetched_at: str  # ISO 8601, UTC
    spot: float
    rates: list[list[float]]  # [maturity in years, continuously compounded rate]
    quotes: list[dict] = field(default_factory=list)  # expiry, root, strike, is_call, bid, ask, last
    source: str = "yahoo"

    @property
    def trade_date(self) -> str:
        """The New York calendar date the snapshot belongs to: one calibration per day."""
        return datetime.fromisoformat(self.fetched_at).astimezone(NEW_YORK).date().isoformat()

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @staticmethod
    def from_json(text: str) -> "Snapshot":
        return Snapshot(**json.loads(text))


def years_to_expiry(expiry: str, at: datetime) -> float:
    """SPX weeklies settle on the close: 4 p.m. New York time on the expiry date."""
    close = datetime.combine(date.fromisoformat(expiry), time(16, 0), NEW_YORK)
    return (close - at).total_seconds() / (365.0 * 86400.0)


def rate_for(rates: list[list[float]], T: float) -> float:
    """Linear interpolation in maturity, flat beyond the ends."""
    pts = sorted(rates)
    if T <= pts[0][0]:
        return pts[0][1]
    for (t0, r0), (t1, r1) in zip(pts, pts[1:]):
        if T <= t1:
            return r0 + (r1 - r0) * (T - t0) / (t1 - t0)
    return pts[-1][1]


def pick_expiries(expiries: list[str], at: datetime) -> list[str]:
    days = {e: years_to_expiry(e, at) * 365 for e in expiries}
    usable = [e for e, d in days.items() if d >= MIN_DAYS]
    chosen = []
    for target in TARGET_DAYS:
        if not usable:
            break
        best = min(usable, key=lambda e: abs(days[e] - target))
        if best not in chosen:
            chosen.append(best)
    return sorted(chosen)


def fetch_rates(url: str = FRED_URL) -> list[list[float]]:
    """The latest day on which every series has a value, as continuous rates."""
    # FRED's bot protection stalls requests from unfamiliar User-Agents, so keep
    # urllib's default rather than naming this client.
    with urllib.request.urlopen(url, timeout=30) as resp:
        rows = list(csv.DictReader(io.StringIO(resp.read().decode())))
    for row in reversed(rows):
        values = [row.get(s, "").strip() for s in FRED_SERIES]
        if all(v not in ("", ".") for v in values):
            # Treasury yields are quoted with semi-annual compounding.
            return [[t, 2 * math.log(1 + float(v) / 200)] for t, v in zip(FRED_SERIES.values(), values)]
    raise RuntimeError("FRED returned no day with every Treasury yield filled in.")


def fetch_snapshot() -> Snapshot:
    import yfinance as yf  # only the calibrator job needs it, not the API

    now = datetime.now(timezone.utc)
    ticker = yf.Ticker("^SPX")
    spot = float(ticker.fast_info["last_price"])
    rates = fetch_rates()
    quotes = []
    for expiry in pick_expiries(list(ticker.options), now):
        chain = ticker.option_chain(expiry)
        for frame, is_call in ((chain.calls, True), (chain.puts, False)):
            for row in frame.itertuples():
                quotes.append({
                    "expiry": expiry,
                    "root": "".join(ch for ch in row.contractSymbol[:4] if ch.isalpha()),
                    "strike": float(row.strike),
                    "is_call": is_call,
                    "bid": float(row.bid or 0),
                    "ask": float(row.ask or 0),
                    "last": float(row.lastPrice or 0),
                })
    return Snapshot(fetched_at=now.isoformat(), spot=spot, rates=rates, quotes=quotes)
