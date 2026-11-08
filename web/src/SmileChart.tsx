import { niceTicks } from "./chart";
import type { SmileCurve } from "./models";

const W = 720;
const H = 280;
const PAD = { top: 16, right: 16, bottom: 40, left: 52 };
// Shorter maturities lighter, the option's own maturity (the middle curve) full strength.
const SHADES = [0.45, 1, 0.7];
const DASHES = ["4 4", "", "1 4"];

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
const years = (t: number) =>
  t < 1 ? plural(+(t * 12).toFixed(1), "month") : plural(+t.toFixed(2), "year");

/** Black–Scholes implied volatility across strikes, one line per maturity. */
export function SmileChart({
  curves,
  spot,
  flatVol,
  flatLabel,
}: {
  curves: SmileCurve[];
  spot: number;
  flatVol: number; // the model's own volatility input, for the flat Black–Scholes reference
  flatLabel: string;
}) {
  const strikes = curves[0].points.map((p) => p.strike);
  const vols = curves.flatMap((c) => c.points.map((p) => p.vol)).filter(Number.isFinite);
  if (!vols.length) return <p className="waiting">No implied volatilities exist for these inputs.</p>;
  vols.push(flatVol);
  const lo = Math.min(...vols);
  const hi = Math.max(...vols);
  const pad = (hi - lo) * 0.08 || 0.01;
  const yLo = Math.max(0, lo - pad);
  const yHi = hi + pad;
  const xLo = strikes[0];
  const xHi = strikes[strikes.length - 1];
  const x = (k: number) => PAD.left + ((k - xLo) / (xHi - xLo)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - yLo) / (yHi - yLo)) * (H - PAD.top - PAD.bottom);

  // Break the line wherever a point has no implied volatility.
  const path = (c: SmileCurve) => {
    let d = "";
    let pen = false;
    for (const p of c.points) {
      if (!Number.isFinite(p.vol)) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(p.strike).toFixed(1)},${y(p.vol).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  return (
    <figure className="curve smile">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Implied volatility against strike for three maturities">
        {niceTicks(yLo * 100, yHi * 100, 4).map(({ t, label }) => (
          <g key={`y${t}`} className="grid">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t / 100)} y2={y(t / 100)} />
            <text x={PAD.left - 8} y={y(t / 100)} dy="0.32em" textAnchor="end">
              {label}%
            </text>
          </g>
        ))}
        {niceTicks(xLo, xHi, 6).map(({ t, label }) => (
          <text key={`x${t}`} className="tick" x={x(t)} y={H - PAD.bottom + 20} textAnchor="middle">
            {label}
          </text>
        ))}
        <line className="strike" x1={x(spot)} x2={x(spot)} y1={PAD.top} y2={H - PAD.bottom} />
        <text className="strike-label" x={x(spot) + 6} y={PAD.top + 10}>
          S
        </text>
        <line className="flat" x1={PAD.left} x2={W - PAD.right} y1={y(flatVol)} y2={y(flatVol)} />
        {curves.map((c, i) => (
          <path
            key={c.time}
            className="smile-line"
            d={path(c)}
            style={{ strokeOpacity: SHADES[i], strokeDasharray: DASHES[i] }}
          />
        ))}
      </svg>
      <figcaption>
        <span className="smile-legend">
          {curves.map((c, i) => (
            <span key={c.time}>
              <svg width="28" height="8" aria-hidden="true">
                <line x1="0" x2="28" y1="4" y2="4" style={{ strokeOpacity: SHADES[i], strokeDasharray: DASHES[i] }} />
              </svg>
              {years(c.time)}
            </span>
          ))}
          <span>
            <svg width="28" height="8" aria-hidden="true">
              <line className="flat" x1="0" x2="28" y1="4" y2="4" />
            </svg>
            Black–Scholes at {flatLabel}
          </span>
        </span>
        Strikes run along the bottom. Black–Scholes would need a different volatility for every strike to match these
        prices; a flat line would mean it needs just one.
      </figcaption>
    </figure>
  );
}
