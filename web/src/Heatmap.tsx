import { fmt } from "./format";
import type { ParamSpec } from "./models";

interface Props {
  kind: "call" | "put";
  grid: (number | null)[][]; // rows = vols (ascending), cols = spots (ascending); null until priced
  fresh: boolean[]; // per row: priced with the current inputs
  spots: number[];
  vols: number[]; // the model's volatility input, in display units
  volSpec: ParamSpec;
  underlying: { label: string; symbol: string };
  current: { spot: number; vol: number }; // vol in display units
}

function nearest(values: number[], x: number) {
  let best = 0;
  values.forEach((v, i) => {
    if (Math.abs(v - x) < Math.abs(values[best] - x)) best = i;
  });
  return best;
}

export function Heatmap({ kind, grid, fresh, spots, vols, volSpec, underlying, current }: Props) {
  const suffix = volSpec.suffix === "%" ? "%" : "";
  const flat = grid.flat().filter((v): v is number => v !== null);
  const lo = flat.length ? Math.min(...flat) : 0;
  const hi = flat.length ? Math.max(...flat) : 0;
  // Only mark the current inputs when they fall inside the grid.
  const inside =
    current.spot >= spots[0] &&
    current.spot <= spots[spots.length - 1] &&
    current.vol >= vols[0] &&
    current.vol <= vols[vols.length - 1];
  const markRow = inside ? nearest(vols, current.vol) : -1;
  const markCol = inside ? nearest(spots, current.spot) : -1;
  // Highest volatility on top, like a chart's y axis.
  const rows = vols.map((_, i) => vols.length - 1 - i);

  return (
    <figure className={`heatmap ${kind}`}>
      <figcaption>
        <span className="heatmap-title">{kind === "call" ? "Call" : "Put"} price</span>
        <span className="legend" aria-hidden="true">
          {flat.length ? fmt(lo) : ""}
          <span className="legend-bar" />
          {flat.length ? fmt(hi) : ""}
        </span>
      </figcaption>
      <div className="heatmap-scroll">
        <table style={{ "--cols": spots.length } as React.CSSProperties}>
          <tbody>
            {rows.map((r) => (
              <tr key={r} className={fresh[r] ? undefined : "stale"}>
                <th scope="row">
                  {fmt(vols[r], 0)}
                  {suffix}
                </th>
                {grid[r].map((v, c) => {
                  if (v === null) return <td key={c} className="pending" />;
                  const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
                  const mix = Math.round(6 + 84 * t);
                  return (
                    <td
                      key={c}
                      className={[mix > 52 ? "dark" : "", r === markRow && c === markCol ? "mark" : ""].join(" ")}
                      style={{ "--mix": `${mix}%` } as React.CSSProperties}
                      title={`${underlying.label} ${fmt(spots[c])}, ${volSpec.label.toLowerCase()} ${fmt(vols[r], 1)}${suffix}: ${fmt(v)}`}
                    >
                      {fmt(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th />
              {spots.map((s, c) => (
                <th key={c} scope="col">
                  {fmt(s, s >= 1000 ? 0 : 1)}
                </th>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="axes">
        <span>
          Rows: {volSpec.label.toLowerCase()} <i>{volSpec.symbol}</i>
        </span>
        <span>
          Columns: {underlying.label.toLowerCase()} <i>{underlying.symbol}</i>
        </span>
      </p>
    </figure>
  );
}
