import { useState } from "react";
import type { CurvePoint, Prices } from "./models";
import { niceTicks } from "./chart";
import { money } from "./format";

const W = 720;
const H = 300;
const PAD = { top: 16, right: 16, bottom: 36, left: 52 };

/** Option value today and payoff at expiry, across underlying prices around the strike. */
export function PriceCurve({
  data,
  spot,
  strike,
  prices,
  underlying,
}: {
  data: CurvePoint[];
  spot: number;
  strike: number;
  prices: Prices | null; // at the current spot, for the dots
  underlying: { label: string };
}) {
  const [hover, setHover] = useState<number | null>(null);

  const xLo = data[0].spot;
  const xHi = data[data.length - 1].spot;
  const yHi = Math.max(...data.map((d) => Math.max(d.call, d.put, d.callPayoff, d.putPayoff))) * 1.05;
  const x = (s: number) => PAD.left + ((s - xLo) / (xHi - xLo)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / yHi) * (H - PAD.top - PAD.bottom);
  const path = (key: "call" | "put" | "callPayoff" | "putPayoff") =>
    data.map((d, i) => `${i ? "L" : "M"}${x(d.spot).toFixed(1)},${y(d[key]).toFixed(1)}`).join("");

  const at = hover === null ? null : data[hover];
  const now = spot >= xLo && spot <= xHi ? prices : null;

  return (
    <figure className="curve">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Call and put value across ${underlying.label.toLowerCase()}s, with payoff at expiry`}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const sx = ((e.clientX - box.left) / box.width) * W;
          const t = (sx - PAD.left) / (W - PAD.left - PAD.right);
          setHover(t < 0 || t > 1 ? null : Math.round(t * (data.length - 1)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {niceTicks(0, yHi, 4).map(({ t, label }) => (
          <g key={`y${t}`} className="grid">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {label}
            </text>
          </g>
        ))}
        {niceTicks(xLo, xHi, 6).map(({ t, label }) => (
          <text key={`x${t}`} className="tick" x={x(t)} y={H - PAD.bottom + 20} textAnchor="middle">
            {label}
          </text>
        ))}
        <line className="strike" x1={x(strike)} x2={x(strike)} y1={PAD.top} y2={H - PAD.bottom} />
        <text className="strike-label" x={x(strike) + 6} y={PAD.top + 10}>
          K
        </text>
        <path className="payoff call" d={path("callPayoff")} />
        <path className="payoff put" d={path("putPayoff")} />
        <path className="value call" d={path("call")} />
        <path className="value put" d={path("put")} />
        {now && (
          <g className="now">
            <circle cx={x(spot)} cy={y(now.call)} r={4.5} className="call" />
            <circle cx={x(spot)} cy={y(now.put)} r={4.5} className="put" />
          </g>
        )}
        {at && (
          <g className="hover">
            <line x1={x(at.spot)} x2={x(at.spot)} y1={PAD.top} y2={H - PAD.bottom} />
            <circle cx={x(at.spot)} cy={y(at.call)} r={3.5} className="call" />
            <circle cx={x(at.spot)} cy={y(at.put)} r={3.5} className="put" />
          </g>
        )}
      </svg>
      <figcaption>
        {at ? (
          <>
            At {underlying.label.toLowerCase()} <b>{money(at.spot)}</b>: call <b className="call">{money(at.call)}</b>, put{" "}
            <b className="put">{money(at.put)}</b>
          </>
        ) : (
          <>
            Solid lines show value today; dashed lines show payoff at expiry. Dots mark your {underlying.label.toLowerCase()}. Point at the
            chart to read values.
          </>
        )}
      </figcaption>
    </figure>
  );
}
