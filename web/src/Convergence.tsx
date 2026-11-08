import { niceTicks } from "./chart";
import { fmt, money } from "./format";
import type { Estimate } from "./models";

const W = 720;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 40, left: 52 };

/**
 * The running estimate against the number of simulated paths (log scale),
 * with its 95% band, and the exact price when one exists.
 */
export function Convergence({ estimate }: { estimate: Estimate }) {
  const pts = estimate.convergence;
  const band = (k: "call" | "put") =>
    pts.map((p) => {
      const se = k === "call" ? p.callSE : p.putSE;
      return { n: p.paths, mid: p[k], lo: p[k] - 1.96 * se, hi: p[k] + 1.96 * se };
    });
  const call = band("call");
  const put = band("put");
  const all = [...call, ...put].flatMap((b) => [b.lo, b.hi]);
  if (estimate.exact) all.push(estimate.exact.call, estimate.exact.put);
  const yLo = Math.max(0, Math.min(...all));
  const yHi = Math.max(...all);
  const pad = (yHi - yLo) * 0.05 || 1;

  const xLo = Math.log10(pts[0].paths);
  const xHi = Math.log10(pts[pts.length - 1].paths);
  const x = (n: number) => PAD.left + ((Math.log10(n) - xLo) / (xHi - xLo || 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - yLo + pad) / (yHi - yLo + 2 * pad)) * (H - PAD.top - PAD.bottom);
  const line = (b: typeof call, key: "mid" | "lo" | "hi") =>
    b.map((p, i) => `${i ? "L" : "M"}${x(p.n).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const area = (b: typeof call) =>
    `${line(b, "hi")}L${[...b].reverse().map((p) => `${x(p.n).toFixed(1)},${y(p.lo).toFixed(1)}`).join("L")}Z`;
  const powers = pts.map((p) => p.paths).filter((n) => Number.isInteger(Math.log10(n)));

  return (
    <figure className="curve convergence">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Estimated call and put prices as simulated paths increase, with 95% confidence bands">
        {niceTicks(yLo - pad, yHi + pad, 4)
          .filter(({ t }) => t >= yLo - pad && t <= yHi + pad)
          .map(({ t, label }) => (
            <g key={`y${t}`} className="grid">
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {label}
              </text>
            </g>
          ))}
        {powers.map((n) => (
          <text key={n} className="tick" x={x(n)} y={H - PAD.bottom + 20} textAnchor="middle">
            {fmt(n, 0)}
          </text>
        ))}
        <path className="band call" d={area(call)} />
        <path className="band put" d={area(put)} />
        {estimate.exact && (
          <>
            <line className="exact" x1={PAD.left} x2={W - PAD.right} y1={y(estimate.exact.call)} y2={y(estimate.exact.call)} />
            <line className="exact" x1={PAD.left} x2={W - PAD.right} y1={y(estimate.exact.put)} y2={y(estimate.exact.put)} />
          </>
        )}
        <path className="value call" d={line(call, "mid")} />
        <path className="value put" d={line(put, "mid")} />
      </svg>
      <figcaption>
        Shaded bands are 95% confidence intervals; they narrow with the square root of the number of paths.
        {estimate.exact && (
          <>
            {" "}
            Dotted lines mark the exact Black–Scholes prices, {money(estimate.exact.call)} and{" "}
            {money(estimate.exact.put)}.
          </>
        )}
      </figcaption>
    </figure>
  );
}
