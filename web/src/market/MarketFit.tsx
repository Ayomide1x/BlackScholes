import { useState } from "react";
import { niceTicks } from "../chart";
import { fmt, signed } from "../format";
import { fellerRatio, type Params } from "../models";
import { ParamHistory } from "./ParamHistory";
import type { Calibration, CalibrationExpiry, CalibrationState, RunStatus } from "./useCalibration";

const day = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const BOUND_NAMES: Record<string, string> = {
  v0: "Current volatility σ₀",
  theta: "Long-run volatility σ̄",
  kappa: "Reversion speed κ",
  xi: "Volatility of volatility ξ",
  rho: "Correlation ρ",
};

/** The fitted parameters in the Heston inputs' display units, rounded to their steps. */
export function fittedInputs(fit: Calibration): Params {
  const p = fit.params;
  return {
    vol0: +(p.vol0 * 100).toFixed(1),
    longVol: +(p.longVol * 100).toFixed(1),
    kappa: +p.kappa.toFixed(2),
    xi: Math.round(p.xi * 100),
    rho: +p.rho.toFixed(2),
  };
}

/** The latest Heston fit to S&P 500 index options, with each expiry's smile. */
export function MarketFit({ state, onUse }: { state: CalibrationState; onUse: (inputs: Params) => void }) {
  const [used, setUsed] = useState(false);

  if (state.kind === "loading") return <p className="waiting">Loading the latest fit…</p>;
  if (state.kind === "unavailable")
    return <p className="waiting">The calibration service isn't reachable right now, so there's no market fit to show.</p>;

  const { fit, history, lastRun } = state;
  if (!fit)
    return (
      <>
        <p className="waiting">No fit yet. The job runs each weekday while US markets are open.</p>
        {lastRun && <RunNote run={lastRun} />}
      </>
    );

  const inputs = fittedInputs(fit);
  const feller = fellerRatio(fit.params);
  // Only mention the last run when it's newer than the fit and didn't succeed.
  const newer = lastRun && lastRun.status !== "ok" && (lastRun.date ?? "") >= fit.date;

  return (
    <div className="market">
      <dl className="fit-summary">
        <div>
          <dt>Prices from</dt>
          <dd>{day(fit.date)}</dd>
        </div>
        <div>
          <dt>S&amp;P 500 index</dt>
          <dd>{fmt(fit.spot)}</dd>
        </div>
        <div>
          <dt>Quotes fitted</dt>
          <dd>
            {fit.quotesUsed} across {fit.expiries.length} expiries
          </dd>
        </div>
        <div>
          <dt>Fit error</dt>
          <dd>{fmt(fit.rmseIv * 100)} volatility points</dd>
        </div>
      </dl>

      <div className="fit-params">
        <table className="greeks">
          <tbody>
            <tr>
              <th scope="row"><span className="sym">σ₀</span> Current volatility</th>
              <td className="num">{fmt(inputs.vol0, 1)}%</td>
            </tr>
            <tr>
              <th scope="row"><span className="sym">σ̄</span> Long-run volatility</th>
              <td className="num">{fmt(inputs.longVol, 1)}%</td>
            </tr>
            <tr>
              <th scope="row"><span className="sym">κ</span> Reversion speed</th>
              <td className="num">{fmt(inputs.kappa)}</td>
            </tr>
            <tr>
              <th scope="row"><span className="sym">ξ</span> Volatility of volatility</th>
              <td className="num">{fmt(inputs.xi, 0)}%</td>
            </tr>
            <tr>
              <th scope="row"><span className="sym">ρ</span> Price–volatility correlation</th>
              <td className="num">{signed(inputs.rho, 2)}</td>
            </tr>
            <tr className="feller-row">
              <th scope="row">
                <span className="sym">F</span> Feller ratio <span className="muted">2κσ̄² / ξ²</span>
              </th>
              <td className="num">
                <span
                  className={`badge ${feller > 1 ? "holds" : "fails"}`}
                  title={
                    feller > 1
                      ? "Above 1: the Feller condition holds, so variance stays strictly above zero."
                      : "At or below 1: the Feller condition fails, so variance can touch zero."
                  }
                >
                  {feller > 1 ? "holds" : "fails"}
                </span>{" "}
                {fmt(feller)}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="fit-actions">
          <button
            type="button"
            className="quiet"
            onClick={() => {
              onUse(inputs);
              setUsed(true);
            }}
          >
            Use these values
          </button>
          <p className="waiting" aria-live="polite">
            {used ? "Loaded into the Heston inputs above." : "Loads them into the Heston inputs above."}
          </p>
          {feller <= 1 && (
            <p className="model-note">
              This fit breaks the Feller condition (2κσ̄² ≤ ξ²), so the model's variance can touch zero. Fits to index
              options usually do, because only a high ξ produces their steep skew. The prices here are still valid;
              a simulation of this model would need to handle variance at zero.
            </p>
          )}
          {fit.atBound.length > 0 && (
            <p className="model-note">
              {fit.atBound.map((n) => BOUND_NAMES[n] ?? n).join(" and ")} ended at the fit's limit. Heston can only
              match the steep short-dated skew of index options with extreme values: a known weakness of the model.
            </p>
          )}
        </div>
      </div>

      {newer && <RunNote run={lastRun!} />}

      <div className="panels">
        {fit.expiries.map((e) => (
          <ExpiryPanel key={e.expiry} e={e} />
        ))}
      </div>
      <p className="axes market-legend">
        <span>
          <svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="3.5" className="dot put" /></svg> Market,
          from puts
        </span>
        <span>
          <svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="3.5" className="dot call" /></svg> Market,
          from calls
        </span>
        <span>
          <svg width="24" height="8" aria-hidden="true"><line x1="0" x2="24" y1="4" y2="4" className="fit-line" /></svg>{" "}
          Fitted Heston
        </span>
        <span>Strike as a percentage of each expiry's forward price</span>
      </p>

      <h3 className="history-h">How the fit has moved</h3>
      <p className="lede">
        Each day's fitted values over the last six months. Point at a dot for its date and value.
      </p>
      <ParamHistory history={history} />
    </div>
  );
}

function RunNote({ run }: { run: RunStatus }) {
  const what = run.status === "rejected" ? "was rejected" : run.status === "failed" ? "failed" : "is still running";
  // The first sentence says what went wrong; /api/runs has the full drop counts.
  const reason = run.message?.split(/(?<=\.)\s/)[0];
  return (
    <p className="waiting run-note">
      The latest run{run.date ? `, for ${day(run.date)},` : ""} {what}
      {reason ? `: ${reason}` : "."}
    </p>
  );
}

const W = 300;
const H = 190;
const PAD = { top: 10, right: 10, bottom: 26, left: 38 };

function ExpiryPanel({ e }: { e: CalibrationExpiry }) {
  const m = e.strikes.map((k) => (k / e.forward) * 100);
  const vols = [...e.marketIv, ...e.modelIv.filter((v): v is number => v !== null)].map((v) => v * 100);
  const xLo = Math.min(...m);
  const xHi = Math.max(...m);
  const yLo = Math.min(...vols);
  const yHi = Math.max(...vols);
  const pad = (yHi - yLo) * 0.08 || 1;
  const x = (v: number) => PAD.left + ((v - xLo) / (xHi - xLo || 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - yLo + pad) / (yHi - yLo + 2 * pad)) * (H - PAD.top - PAD.bottom);
  let line = "";
  let pen = false;
  e.modelIv.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    line += `${pen ? "L" : "M"}${x(m[i]).toFixed(1)},${y(v * 100).toFixed(1)}`;
    pen = true;
  });
  const days = Math.round(e.time * 365);

  return (
    <figure className="panel curve">
      <figcaption>
        {day(e.expiry)}, <span className="muted">{days} days</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Market and fitted implied volatility for the ${e.expiry} expiry`}>
        {niceTicks(yLo - pad, yHi + pad, 3)
          .filter(({ t }) => t >= yLo - pad && t <= yHi + pad)
          .map(({ t, label }) => (
            <g key={`y${t}`} className="grid">
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {label}%
              </text>
            </g>
          ))}
        {niceTicks(xLo, xHi, 4).map(({ t, label }) => (
          <text key={`x${t}`} className="tick" x={x(t)} y={H - PAD.bottom + 18} textAnchor="middle">
            {label}%
          </text>
        ))}
        <line className="strike" x1={x(100)} x2={x(100)} y1={PAD.top} y2={H - PAD.bottom} />
        {e.marketIv.map((v, i) => (
          <circle key={i} cx={x(m[i])} cy={y(v * 100)} r={3} className={`dot ${m[i] >= 100 ? "call" : "put"}`} />
        ))}
        <path className="fit-line" d={line} />
      </svg>
    </figure>
  );
}
