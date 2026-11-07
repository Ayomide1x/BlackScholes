import { fmt } from "./format";
import type { ParamSpec } from "./models";

interface Props {
  kind: "call" | "put";
  grid: number[][]; // rows = vols (ascending), cols = spots (ascending)
  spots: number[];
  vols: number[]; // the model's volatility input, in display units
  volSpec: ParamSpec;
  current: { spot: number; vol: number }; // vol in display units
}

function nearest(values: number[], x: number) {
  let best = 0;
  values.forEach((v, i) => {
    if (Math.abs(v - x) < Math.abs(values[best] - x)) best = i;
  });
  return best;
}

export function Heatmap({ kind, grid, spots, vols, volSpec, current }: Props) {
  const suffix = volSpec.suffix === "%" ? "%" : "";
  const flat = grid.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
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
          {fmt(lo)}
          <span className="legend-bar" />
          {fmt(hi)}
        </span>
      </figcaption>
      <div className="heatmap-scroll">
        <table style={{ "--cols": spots.length } as React.CSSProperties}>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <th scope="row">
                  {fmt(vols[r], 0)}
                  {suffix}
                </th>
                {grid[r].map((v, c) => {
                  const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
                  const mix = Math.round(6 + 84 * t);
                  return (
                    <td
                      key={c}
                      className={[mix > 52 ? "dark" : "", r === markRow && c === markCol ? "mark" : ""].join(" ")}
                      style={{ "--mix": `${mix}%` } as React.CSSProperties}
                      title={`Spot ${fmt(spots[c])}, ${volSpec.label.toLowerCase()} ${fmt(vols[r], 1)}${suffix}: ${fmt(v)}`}
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
          Columns: spot price <i>S</i>
        </span>
      </p>
    </figure>
  );
}
