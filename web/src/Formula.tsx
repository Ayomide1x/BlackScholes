import type { Market, Prices } from "./models";
import { d1d2 } from "./models/blackScholes";
import { normCdf } from "./models/math";
import { fmt, money, signed } from "./format";

const S = () => <i>S</i>;
const K = () => <i>K</i>;
const N = ({ d }: { d: string }) => (
  <>
    <i>N</i>(<i>{d.startsWith("−") ? "−d" : "d"}</i>
    <sub>{d.slice(-1)}</sub>)
  </>
);
const Disc = () => (
  <>
    <i>e</i>
    <sup>
      −<i>rT</i>
    </sup>
  </>
);

/** The pricing formula, then the same line with today's numbers in it. */
export function Formula({ market: inputs, vol, prices: result }: { market: Market; vol: number; prices: Prices }) {
  const disc = Math.exp(-inputs.rate * inputs.time);
  const { d1, d2 } = d1d2(inputs, vol);
  return (
    <div className="formula">
      <div className="formula-side call">
        <h2 className="formula-name">Call</h2>
        <p className="eq math">
          <i>C</i> = <S />·<N d="1" /> − <K />·<Disc />·<N d="2" />
        </p>
        <p className="eq subst">
          = {fmt(inputs.spot)} × {fmt(normCdf(d1), 4)} − {fmt(inputs.strike)} × {fmt(disc, 4)} ×{" "}
          {fmt(normCdf(d2), 4)}
        </p>
        <p className="price" aria-live="polite">
          {money(result.call)}
        </p>
      </div>
      <div className="formula-side put">
        <h2 className="formula-name">Put</h2>
        <p className="eq math">
          <i>P</i> = <K />·<Disc />·<N d="−2" /> − <S />·<N d="−1" />
        </p>
        <p className="eq subst">
          = {fmt(inputs.strike)} × {fmt(disc, 4)} × {fmt(normCdf(-d2), 4)} − {fmt(inputs.spot)} ×{" "}
          {fmt(normCdf(-d1), 4)}
        </p>
        <p className="price" aria-live="polite">
          {money(result.put)}
        </p>
      </div>
      <p className="ds math">
        <span>
          <i>d</i>
          <sub>1</sub> = {signed(d1)}
        </span>
        <span>
          <i>d</i>
          <sub>2</sub> = <i>d</i>
          <sub>1</sub> − <i>σ</i>√<i>T</i> = {signed(d2)}
        </span>
      </p>
    </div>
  );
}
