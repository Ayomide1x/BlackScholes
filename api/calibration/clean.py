"""From a raw snapshot to quotes worth fitting, with a count of everything dropped and why."""

from collections import Counter
from datetime import datetime

import numpy as np

from . import black
from .data import Snapshot, rate_for, years_to_expiry
from .fit import Slice

MIN_MID = 0.10  # dollars: below this, the tick size dominates the price
MAX_SPREAD = 0.5  # bid-ask spread as a fraction of the mid
STRIKES_PER_EXPIRY = 25
# Strikes within this many "standard deviations" of the forward, |ln(K/F)| ≤ WIDTH·σ·√T
# with σ the expiry's at-the-money implied vol: the band widens with maturity, so short
# expiries don't bring in far wings no diffusion model can match.
BAND_WIDTH = 2.5
# The forward implied by put-call parity must sit near spot grown at the risk-free rate:
# dividends pull it down a little (SPX yields about 1–2% a year), never up.
MAX_FORWARD_GAP = 0.02  # plus this much per year to expiry
# Refuse to fit when too little survives cleaning.
MIN_QUOTES = 40
MIN_EXPIRIES = 4


class Rejected(Exception):
    """The data isn't good enough to fit today; the message says why."""

    def __init__(self, message: str, report: dict | None = None):
        super().__init__(message)
        self.report = report


def _good(q: dict) -> bool:
    return q["bid"] > 0 and q["ask"] > q["bid"]


def clean(snap: Snapshot) -> tuple[list[Slice], dict]:
    at = datetime.fromisoformat(snap.fetched_at)
    dropped: Counter = Counter()
    slices = []

    by_expiry: dict[str, list[dict]] = {}
    for q in snap.quotes:
        by_expiry.setdefault(q["expiry"], []).append(q)

    for expiry, quotes in sorted(by_expiry.items()):
        T = years_to_expiry(expiry, at)
        D = float(np.exp(-rate_for(snap.rates, T) * T))

        # Monthly expiries list both SPX (settled at the open) and SPXW (at the
        # close). Keep the close-settled SPXW, which matches the time to expiry.
        roots = {q["root"] for q in quotes}
        if "SPXW" in roots and len(roots) > 1:
            dropped["morning-settled duplicate"] += sum(q["root"] != "SPXW" for q in quotes)
            quotes = [q for q in quotes if q["root"] == "SPXW"]

        calls = {q["strike"]: q for q in quotes if q["is_call"]}
        puts = {q["strike"]: q for q in quotes if not q["is_call"]}

        # The forward from put-call parity, C − P = D (F − K), at the strikes
        # nearest the money where both sides have a real two-sided quote.
        pairs = sorted(
            (k for k in calls if k in puts and _good(calls[k]) and _good(puts[k])),
            key=lambda k: abs(k - snap.spot / D),
        )[:8]
        if len(pairs) < 3:
            dropped["no forward (too few two-sided quotes near the money)"] += len(quotes)
            continue
        mid = lambda q: 0.5 * (q["bid"] + q["ask"])  # noqa: E731
        F = float(np.median([k + (mid(calls[k]) - mid(puts[k])) / D for k in pairs]))
        gap = np.log(F * D / snap.spot)  # about −(dividend yield)·T
        if not -MAX_FORWARD_GAP * (1 + T) <= gap <= 0.005:
            dropped["implausible forward (put-call parity disagrees with spot and rates)"] += len(quotes)
            continue

        rows = []
        for k in sorted(set(calls) | set(puts)):
            q = calls.get(k) if k >= F else puts.get(k)  # the out-of-the-money side
            if q is None:
                continue
            if not _good(q):
                dropped["no two-sided quote"] += 1
                continue
            m = mid(q)
            if m < MIN_MID:
                dropped["price under $0.10"] += 1
                continue
            if (q["ask"] - q["bid"]) / m > MAX_SPREAD:
                dropped["spread over 50% of price"] += 1
                continue
            if not 0.5 <= k / F <= 1.5:
                dropped["strike outside 50–150% of forward"] += 1
                continue
            rows.append((k, q["is_call"], m))
        if not rows:
            continue

        K = np.array([r[0] for r in rows])
        is_call = np.array([r[1] for r in rows])
        mids = np.array([r[2] for r in rows])
        iv = black.implied_vol(mids, F, K, D, T, is_call)
        ok = np.isfinite(iv)
        dropped["no implied volatility (price outside bounds)"] += int((~ok).sum())
        K, is_call, mids, iv = K[ok], is_call[ok], mids[ok], iv[ok]
        if not len(K):
            continue

        atm = float(iv[np.argmin(np.abs(np.log(K / F)))])
        inside = np.abs(np.log(K / F)) <= BAND_WIDTH * atm * np.sqrt(T)
        dropped["strike too far from the money for its maturity"] += int((~inside).sum())
        K, is_call, mids, iv = K[inside], is_call[inside], mids[inside], iv[inside]

        if len(K) > STRIKES_PER_EXPIRY:
            # Evenly spaced in log-moneyness, so neither wing dominates the fit.
            x = np.log(K / F)
            keep = sorted({int(np.argmin(np.abs(x - t))) for t in np.linspace(x.min(), x.max(), STRIKES_PER_EXPIRY)})
            dropped["thinned to 25 strikes per expiry"] += len(K) - len(keep)
            K, is_call, mids, iv = K[keep], is_call[keep], mids[keep], iv[keep]

        slices.append(Slice(expiry, T, F, D, K, is_call, mids, iv))

    report = {
        "quotes_seen": len(snap.quotes),
        "quotes_used": int(sum(len(s.strikes) for s in slices)),
        "expiries_used": len(slices),
        "dropped": dict(dropped),
    }
    if report["quotes_used"] < MIN_QUOTES or len(slices) < MIN_EXPIRIES:
        top = ", ".join(f"{n} {why}" for why, n in dropped.most_common(3)) or "none"
        raise Rejected(
            f"Only {report['quotes_used']} usable quotes across {len(slices)} expiries "
            f"(need {MIN_QUOTES} across {MIN_EXPIRIES}). Most dropped: {top}. "
            "Outside US market hours Yahoo shows no bids or asks.",
            report,
        )
    return slices, report
