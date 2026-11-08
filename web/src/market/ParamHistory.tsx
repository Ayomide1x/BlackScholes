import { niceTicks } from "../chart";
import { fmt, signed } from "../format";
import type { FitSummary } from "./useCalibration";

const SERIES: { label: string; symbol: string; value: (f: FitSummary) => number; show: (v: number) => string }[] = [
  { label: "Current volatility", symbol: "σ₀", value: (f) => f.params.vol0 * 100, show: (v) => `${fmt(v, 1)}%` },
  { label: "Long-run volatility", symbol: "σ̄", value: (f) => f.params.longVol * 100, show: (v) => `${fmt(v, 1)}%` },
  { label: "Reversion speed", symbol: "κ", value: (f) => f.params.kappa, show: (v) => fmt(v) },
  { label: "Volatility of volatility", symbol: "ξ", value: (f) => f.params.xi * 100, show: (v) => `${fmt(v, 0)}%` },
  { label: "Price–volatility correlation", symbol: "ρ", value: (f) => f.params.rho, show: (v) => signed(v, 2) },
  { label: "Fit error", symbol: "", value: (f) => f.rmseIv * 100, show: (v) => `${fmt(v)} pts` },
];

const W = 300;
const H = 120;
const PAD = { top: 10, right: 10, bottom: 22, left: 40 };

const short = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Each fitted parameter, and the fit error, day by day: one small chart apiece. */
export function ParamHistory({ history }: { history: FitSummary[] }) {
  if (history.length < 2)
    return (
      <p className="waiting">
        The history fills in as the job runs each weekday; there {history.length === 1 ? "is 1 fit" : "are no fits"} so
        far.
      </p>
    );

  // Dates are spaced by calendar time, so weekends and missed days show as gaps.
  const t = history.map((f) => Date.parse(`${f.date}T12:00:00Z`));
  const tLo = t[0];
  const tHi = t[t.length - 1];
  const x = (v: number) => PAD.left + ((v - tLo) / (tHi - tLo)) * (W - PAD.left - PAD.right);

  return (
    <div className="history">
      {SERIES.map((s) => {
        const values = history.map(s.value);
        const lo = Math.min(...values);
        const hi = Math.max(...values);
        const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1;
        const y = (v: number) => PAD.top + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (H - PAD.top - PAD.bottom);
        const line = values.map((v, i) => `${i ? "L" : "M"}${x(t[i]).toFixed(1)},${y(v).toFixed(1)}`).join("");
        return (
          <figure key={s.label} className="panel curve">
            <figcaption>
              {s.symbol && <span className="sym">{s.symbol}</span>} {s.label}
              <span className="history-now">{s.show(values[values.length - 1])}</span>
            </figcaption>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.label} from ${history[0].date} to ${history[history.length - 1].date}`}>
              {niceTicks(lo - pad, hi + pad, 2)
                .filter(({ t: v }) => v >= lo - pad && v <= hi + pad)
                .map(({ t: v }) => (
                  <g key={v} className="grid">
                    <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
                    <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end">
                      {signed(v, Math.abs(hi - lo) < 1 ? 2 : 0)}
                    </text>
                  </g>
                ))}
              <text className="tick" x={PAD.left} y={H - 6} textAnchor="start">
                {short(history[0].date)}
              </text>
              <text className="tick" x={W - PAD.right} y={H - 6} textAnchor="end">
                {short(history[history.length - 1].date)}
              </text>
              <path className="fit-line" d={line} />
              {values.map((v, i) => (
                <circle key={i} cx={x(t[i])} cy={y(v)} r={history.length > 40 ? 1.5 : 2.5} className="history-dot">
                  <title>{`${history[i].date}: ${s.show(v)}`}</title>
                </circle>
              ))}
            </svg>
          </figure>
        );
      })}
    </div>
  );
}
