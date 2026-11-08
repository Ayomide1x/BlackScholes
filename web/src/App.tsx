import { useMemo, useState } from "react";
import { MODELS, blackScholes, linspace, validate, type Market, type Model, type Params } from "./models";
import { usePricing } from "./pricing/usePricing";
import { Convergence } from "./Convergence";
import { SmileChart } from "./SmileChart";
import { NumberField } from "./NumberField";
import { Formula } from "./Formula";
import { GreeksTable } from "./GreeksTable";
import { Heatmap } from "./Heatmap";
import { PriceCurve } from "./PriceCurve";
import { PricePanel } from "./PricePanel";
import { ChoiceField, ModelSwitch } from "./ModelSwitch";

const LINKEDIN = "https://www.linkedin.com/in/ayomide-ogunbowale-91a6341ba/";
const GITHUB = "https://github.com/Ayomide1x/BlackScholes";

// Inputs as typed: the rate and percentage parameters are in display units.
interface Form {
  spot: number;
  strike: number;
  time: number;
  ratePct: number;
}

interface Range {
  spotMin: number;
  spotMax: number;
  volMin: number; // the model's volatility input, display units
  volMax: number;
}

const START: Form = { spot: 100, strike: 100, time: 1, ratePct: 5 };

const defaults = (model: Model): Params => Object.fromEntries(model.params.map((p) => [p.key, p.default]));

// Same defaults as the original app: spot ±20%, volatility ×0.5 to ×1.5.
const rangeAround = (f: Form, vol: number): Range => ({
  spotMin: +(f.spot * 0.8).toFixed(2),
  spotMax: +(f.spot * 1.2).toFixed(2),
  volMin: +(vol * 0.5).toFixed(1),
  volMax: +(vol * 1.5).toFixed(1),
});

function rangeError(r: Range, volLabel: string): string | null {
  if (![r.spotMin, r.spotMax, r.volMin, r.volMax].every(Number.isFinite))
    return "Fill in every heatmap bound with a number.";
  if (r.spotMin <= 0 || r.volMin <= 0) return "Heatmap minimums must be above zero.";
  if (r.spotMin >= r.spotMax) return "Set the heatmap's minimum spot below its maximum.";
  if (r.volMin >= r.volMax) return `Set the heatmap's minimum ${volLabel} below its maximum.`;
  return null;
}

export function App() {
  const [modelId, setModelId] = useState(MODELS[0].id);
  const model = MODELS.find((m) => m.id === modelId)!;
  const volSpec = model.params.find((p) => p.key === model.volParam)!;
  const underlying = model.underlying ?? { label: "Spot price", symbol: "S" };

  const [form, setForm] = useState<Form>(START);
  // Each model keeps its own inputs (display units), so switching back restores them.
  const [shownByModel, setShownByModel] = useState<Record<string, Params>>(() =>
    Object.fromEntries(MODELS.map((m) => [m.id, defaults(m)])),
  );
  const shown = shownByModel[model.id];
  // The heatmap range follows the inputs until someone edits it.
  const [customRange, setCustomRange] = useState<Range | null>(null);
  const [cells, setCells] = useState(10);

  const market: Market = useMemo(
    () => ({ spot: form.spot, strike: form.strike, time: form.time, rate: form.ratePct / 100 }),
    [form],
  );
  const params: Params = useMemo(
    () => Object.fromEntries(model.params.map((p) => [p.key, shown[p.key] * p.scale])),
    [model, shown],
  );
  const error = validate(model, market, params);
  const range = customRange ?? rangeAround(form, shown[model.volParam]);
  const rError = rangeError(range, volSpec.label.toLowerCase());
  const axes = useMemo(() => {
    if (rError) return null;
    const vols = linspace(range.volMin, range.volMax, cells);
    return { spots: linspace(range.spotMin, range.spotMax, cells), vols, modelVols: vols.map((v) => v * volSpec.scale) };
  }, [rError, range.spotMin, range.spotMax, range.volMin, range.volMax, cells, volSpec]);
  const gridSpec = useMemo(() => (axes ? { spots: axes.spots, vols: axes.modelVols } : null), [axes]);

  const { prices, estimate, greeks, grid, curve, smile, busy } = usePricing({
    model,
    market,
    params,
    valid: !error,
    grid: gridSpec,
  });
  const note = error ? null : (model.note?.(params, market) ?? null);
  const reference =
    prices && model.compareWithBlackScholes ? blackScholes.price(market, { vol: params[model.volParam] }) : null;
  const set = (k: keyof Form) => (v: number) => setForm((f) => ({ ...f, [k]: v }));
  const setParam = (k: string) => (v: number) =>
    setShownByModel((s) => ({ ...s, [model.id]: { ...s[model.id], [k]: v } }));
  const switchModel = (id: string) => {
    setModelId(id);
    setCustomRange(null);
  };
  const setRange = (k: keyof Range) => (v: number) => setCustomRange({ ...range, [k]: v });

  return (
    <>
      <header className="site">
        <h1>Option pricer</h1>
        <p>
          Made by <a href={LINKEDIN}>Ayomide Ogunbowale</a>. <a href={GITHUB}>Read the source on GitHub</a>.
        </p>
      </header>

      <main>
        <section className="top">
          <form className="inputs" onSubmit={(e) => e.preventDefault()} aria-label="Model inputs">
            <ModelSwitch models={MODELS} value={model.id} onChange={switchModel} />
            <p className="model-about">{model.description}</p>
            <NumberField symbol={<i>{underlying.symbol}</i>} label={underlying.label} value={form.spot} onChange={set("spot")} min={1} max={500} step={0.5} />
            <NumberField symbol={<i>K</i>} label="Strike price" value={form.strike} onChange={set("strike")} min={1} max={500} step={0.5} />
            <NumberField symbol={<i>T</i>} label="Time to maturity" value={form.time} onChange={set("time")} min={0.01} max={5} step={0.01} suffix="years" />
            {model.params.filter((p) => !p.onlyWhen || shown[p.onlyWhen.key] === p.onlyWhen.value).map((p) =>
              p.choices ? (
                <ChoiceField
                  key={p.key}
                  label={p.label}
                  name={`${model.id}-${p.key}`}
                  choices={p.choices}
                  value={shown[p.key]}
                  onChange={setParam(p.key)}
                />
              ) : (
              <NumberField
                key={p.key}
                symbol={<i>{p.symbol}</i>}
                label={p.label}
                value={shown[p.key]}
                onChange={setParam(p.key)}
                min={p.min}
                max={p.max}
                step={p.step}
                suffix={p.suffix}
              />
              ),
            )}
            <NumberField symbol={<i>r</i>} label="Risk-free rate" value={form.ratePct} onChange={set("ratePct")} min={-2} max={15} step={0.05} suffix="%" />
            {note && <p className="model-note">{note}</p>}
            <button type="button" className="quiet" onClick={() => { setForm(START); setShownByModel((s) => ({ ...s, [model.id]: defaults(model) })); setCustomRange(null); }}>
              Reset inputs
            </button>
          </form>

          <div className={busy.prices ? "results busy" : "results"}>
            {error ? (
              <p className="error" role="alert">{error}</p>
            ) : !prices ? (
              <p className="waiting">Calculating…</p>
            ) : model.id === blackScholes.id ? (
              <Formula market={market} vol={params.vol} prices={prices} />
            ) : (
              <PricePanel prices={prices} estimate={estimate} reference={reference} />
            )}
          </div>
        </section>

        {!error && (
          <>
            <section aria-labelledby="greeks-h" className={busy.greeks ? "busy" : undefined}>
              <h2 id="greeks-h">Sensitivities</h2>
              <p className="lede">How each price responds to small changes in one input, with the others held still.</p>
              {greeks ? <GreeksTable greeks={greeks} vol={volSpec} /> : <p className="waiting">Calculating…</p>}
            </section>

            {estimate && (
              <section aria-labelledby="conv-h" className={busy.prices ? "busy" : undefined}>
                <h2 id="conv-h">How the estimate settles</h2>
                <p className="lede">
                  The simulated price after each batch of paths. More paths narrow the range, but halving it takes four
                  times as many.
                </p>
                <Convergence estimate={estimate} />
              </section>
            )}

            <section aria-labelledby="heat-h">
              <h2 id="heat-h">
                Prices across {underlying.label.toLowerCase()} and {volSpec.label.toLowerCase()}
              </h2>
              <p className="lede">
                Each cell reprices the option at one {underlying.label.toLowerCase()} and {volSpec.label.toLowerCase()}, keeping the other
                inputs fixed. The outlined cell is closest to your inputs.
              </p>
              <div className="range">
                <RangeBox label={`${underlying.label} from`} value={range.spotMin} onChange={setRange("spotMin")} />
                <RangeBox label="to" value={range.spotMax} onChange={setRange("spotMax")} />
                <RangeBox label={`${volSpec.label} from`} value={range.volMin} onChange={setRange("volMin")} suffix={volSpec.suffix} />
                <RangeBox label="to" value={range.volMax} onChange={setRange("volMax")} suffix={volSpec.suffix} />
                <label className="range-box">
                  <span>Grid</span>
                  <select value={cells} onChange={(e) => setCells(Number(e.target.value))}>
                    {[6, 8, 10, 12].map((n) => (
                      <option key={n} value={n}>
                        {n} × {n}
                      </option>
                    ))}
                  </select>
                </label>
                {customRange && (
                  <button type="button" className="quiet" onClick={() => setCustomRange(null)}>
                    Follow inputs again
                  </button>
                )}
              </div>
              {rError || !axes ? (
                <p className="error" role="alert">{rError}</p>
              ) : !grid ? (
                <p className="waiting">Calculating…</p>
              ) : (
                <div className="heatmaps">
                  {(["call", "put"] as const).map((kind) => (
                    <Heatmap
                      key={kind}
                      kind={kind}
                      grid={grid[kind]}
                      fresh={grid.fresh}
                      spots={axes.spots}
                      vols={axes.vols}
                      volSpec={volSpec}
                      underlying={underlying}
                      current={{ spot: market.spot, vol: shown[model.volParam] }}
                    />
                  ))}
                </div>
              )}
            </section>

            {model.smile && (
              <section aria-labelledby="smile-h">
                <h2 id="smile-h">Implied volatility across strikes</h2>
                <p className="lede">
                  The volatility you'd have to put into Black–Scholes to get this model's price at each strike, using
                  out-of-the-money options. It's how traders compare models with each other and with the market.
                </p>
                {smile ? (
                  <div className={busy.smile ? "busy" : undefined}>
                    <SmileChart
                      curves={smile}
                      spot={market.spot}
                      flatVol={params[model.volParam]}
                      flatLabel={`${volSpec.symbol} = ${shown[model.volParam]}${volSpec.suffix ?? ""}`}
                    />
                  </div>
                ) : (
                  <p className="waiting">Calculating…</p>
                )}
              </section>
            )}

            <section aria-labelledby="curve-h">
              <h2 id="curve-h">Value across {underlying.label.toLowerCase()}s</h2>
              {curve ? (
                <div className={busy.curve ? "busy" : undefined}>
                  <PriceCurve data={curve} spot={market.spot} strike={market.strike} prices={prices} underlying={underlying} />
                </div>
              ) : (
                <p className="waiting">Calculating…</p>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="site">
        <p>
          {model.assumptions} Everything is calculated in your browser.
        </p>
      </footer>
    </>
  );
}

function RangeBox(props: { label: string; value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="range-box">
      <span>{props.label}</span>
      <span className="field-box">
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(props.value) ? props.value : ""}
          onChange={(e) => props.onChange(e.target.value.trim() === "" ? NaN : Number(e.target.value))}
        />
        {props.suffix && <span className="suffix">{props.suffix}</span>}
      </span>
    </label>
  );
}
