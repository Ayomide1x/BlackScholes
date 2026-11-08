import { useEffect, useMemo, useRef, useState } from "react";
import {
  curvePoints,
  priceGrid,
  smile,
  smileTimes,
  summarize,
  type CurvePoint,
  type Estimate,
  type Market,
  type Model,
  type OptionGreeks,
  type Params,
  type Prices,
  type SmileCurve,
} from "../models";
import type { Reply, Request } from "./protocol";

export interface Grid {
  call: (number | null)[][]; // null until that cell has been priced
  put: (number | null)[][];
  fresh: boolean[]; // per row: priced with the current inputs
}

export interface Pricing {
  prices: Prices | null;
  estimate: Estimate | null;
  greeks: OptionGreeks | null;
  grid: Grid | null;
  curve: CurvePoint[] | null;
  smile: SmileCurve[] | null; // only for models that draw one
  /** Which results are from earlier inputs and still being recomputed. */
  busy: { prices: boolean; greeks: boolean; grid: boolean; curve: boolean; smile: boolean };
}

interface Args {
  model: Model;
  market: Market;
  params: Params;
  valid: boolean;
  grid: { spots: number[]; vols: number[] } | null; // vols in model units
}

let nextId = 1;

/** One background worker. Starting a job while another is running cancels the old one. */
class Lane {
  private worker: Worker | null = null;
  private running = false;

  run(make: (id: number) => Request, onReply: (r: Reply) => void, isLast: (r: Reply) => boolean) {
    if (this.worker && this.running) this.stop();
    this.worker ??= new Worker(new URL("./pricing.worker.ts", import.meta.url), { type: "module" });
    const id = nextId++;
    this.running = true;
    this.worker.onmessage = (e: MessageEvent<Reply>) => {
      if (e.data.id !== id) return;
      if (isLast(e.data)) this.running = false;
      onReply(e.data);
    };
    this.worker.postMessage(make(id));
  }

  stop() {
    this.worker?.terminate();
    this.worker = null;
    this.running = false;
  }
}

const IDLE = { prices: false, greeks: false, grid: false, curve: false, smile: false };
const blank = (rows: number, cols: number) => Array.from({ length: rows }, () => Array<number | null>(cols).fill(null));

/**
 * Prices, Greeks, the heatmap grid and the value curve for the current inputs.
 * Light models are computed right here; heavy ones in background workers, with
 * the previous results kept on screen (and flagged busy) until new ones arrive.
 */
export function usePricing({ model, market, params, valid, grid }: Args): Pricing {
  const heavy = model.heavy === true;
  // Each result is recomputed only when an input it depends on changes. The grid
  // overrides spot and the volatility parameter, and the curve overrides spot.
  const summaryKey = valid ? JSON.stringify([model.id, market, params]) : null;
  const gridKey =
    valid && grid ? JSON.stringify([model.id, { ...market, spot: 0 }, { ...params, [model.volParam]: 0 }, grid]) : null;
  const curveKey = valid ? JSON.stringify([model.id, { ...market, spot: 0 }, params]) : null;
  // The smile varies strike and maturity itself.
  const smileKey = valid && model.smile ? JSON.stringify([model.id, { ...market, strike: 0 }, params]) : null;

  const syncSummary = useMemo(
    () => (!heavy && summaryKey ? summarize(model, market, params) : null),
    [heavy, summaryKey],
  );
  const syncGrid = useMemo((): Grid | null => {
    if (heavy || !gridKey || !grid) return null;
    const g = priceGrid(model, market, params, grid.spots, grid.vols);
    return { ...g, fresh: g.call.map(() => true) };
  }, [heavy, gridKey]);
  const syncCurve = useMemo(
    () => (!heavy && curveKey ? curvePoints(model, market, params) : null),
    [heavy, curveKey],
  );
  const syncSmile = useMemo(
    () => (!heavy && smileKey ? smile(model, market, params, smileTimes(market.time)) : null),
    [heavy, smileKey],
  );

  const lanes = useRef<{ summary: Lane; grid: Lane; curve: Lane; smile: Lane } | null>(null);
  lanes.current ??= { summary: new Lane(), grid: new Lane(), curve: new Lane(), smile: new Lane() };
  useEffect(() => () => Object.values(lanes.current!).forEach((l) => l.stop()), []);
  useEffect(() => {
    if (!heavy) Object.values(lanes.current!).forEach((l) => l.stop());
  }, [heavy]);

  const [summary, setSummary] = useState<{
    modelId: string;
    prices: Prices | null;
    estimate: Estimate | null;
    greeks: OptionGreeks | null;
    pricesBusy: boolean;
    greeksBusy: boolean;
  } | null>(null);
  const [heat, setHeat] = useState<{ shape: string; grid: Grid; busy: boolean } | null>(null);
  const [curve, setCurve] = useState<{ modelId: string; points: CurvePoint[]; busy: boolean } | null>(null);
  const [smiles, setSmiles] = useState<{ modelId: string; curves: SmileCurve[]; busy: boolean } | null>(null);

  useEffect(() => {
    if (!heavy || !summaryKey) return;
    setSummary((s) =>
      s?.modelId === model.id
        ? { ...s, pricesBusy: true, greeksBusy: true }
        : { modelId: model.id, prices: null, estimate: null, greeks: null, pricesBusy: true, greeksBusy: true },
    );
    lanes.current!.summary.run(
      (id) => ({ id, kind: "summary", modelId: model.id, market, params }),
      (r) => {
        if (r.kind === "prices") setSummary((s) => s && { ...s, prices: r.prices, estimate: r.estimate, pricesBusy: false });
        if (r.kind === "greeks") setSummary((s) => s && { ...s, greeks: r.greeks, greeksBusy: false });
      },
      (r) => r.kind === "greeks",
    );
  }, [heavy, summaryKey]);

  useEffect(() => {
    if (!heavy || !gridKey || !grid) return;
    const rows = grid.vols.length;
    const cols = grid.spots.length;
    const shape = `${model.id}:${rows}x${cols}`;
    // Same shape: keep the old values on screen, marked stale, until each row is redone.
    setHeat((h) =>
      h?.shape === shape
        ? { ...h, grid: { ...h.grid, fresh: h.grid.fresh.map(() => false) }, busy: true }
        : { shape, grid: { call: blank(rows, cols), put: blank(rows, cols), fresh: Array(rows).fill(false) }, busy: true },
    );
    lanes.current!.grid.run(
      (id) => ({ id, kind: "grid", modelId: model.id, market, params, spots: grid.spots, vols: grid.vols }),
      (r) => {
        if (r.kind !== "row") return;
        setHeat((h) => {
          if (!h) return h;
          const call = h.grid.call.slice();
          const put = h.grid.put.slice();
          const fresh = h.grid.fresh.slice();
          call[r.row] = r.call;
          put[r.row] = r.put;
          fresh[r.row] = true;
          return { ...h, grid: { call, put, fresh }, busy: !fresh.every(Boolean) };
        });
      },
      (r) => r.kind === "row" && r.row === rows - 1,
    );
  }, [heavy, gridKey]);

  useEffect(() => {
    if (!heavy || !curveKey) return;
    setCurve((c) => (c?.modelId === model.id ? { ...c, busy: true } : null));
    lanes.current!.curve.run(
      (id) => ({ id, kind: "curve", modelId: model.id, market, params }),
      (r) => {
        if (r.kind === "curve") setCurve({ modelId: model.id, points: r.points, busy: false });
      },
      (r) => r.kind === "curve",
    );
  }, [heavy, curveKey]);

  useEffect(() => {
    if (!heavy || !smileKey) return;
    setSmiles((s) => (s?.modelId === model.id ? { ...s, busy: true } : null));
    lanes.current!.smile.run(
      (id) => ({ id, kind: "smile", modelId: model.id, market, params }),
      (r) => {
        if (r.kind === "smile") setSmiles({ modelId: model.id, curves: r.curves, busy: false });
      },
      (r) => r.kind === "smile",
    );
  }, [heavy, smileKey]);

  if (!valid) return { prices: null, estimate: null, greeks: null, grid: null, curve: null, smile: null, busy: IDLE };
  if (!heavy)
    return {
      ...(syncSummary ?? { prices: null, estimate: null, greeks: null }),
      grid: syncGrid,
      curve: syncCurve,
      smile: syncSmile,
      busy: IDLE,
    };

  const s = summary?.modelId === model.id ? summary : null;
  // Only a grid of the current size can be drawn against the current axes.
  const h = grid && heat?.shape === `${model.id}:${grid.vols.length}x${grid.spots.length}` ? heat : null;
  const c = curve?.modelId === model.id ? curve : null;
  const sm = model.smile && smiles?.modelId === model.id ? smiles : null;
  return {
    prices: s?.prices ?? null,
    estimate: s?.estimate ?? null,
    greeks: s?.greeks ?? null,
    grid: h?.grid ?? null,
    curve: c?.points ?? null,
    smile: sm?.curves ?? null,
    busy: {
      prices: s?.pricesBusy ?? true,
      greeks: s?.greeksBusy ?? true,
      grid: h?.busy ?? true,
      curve: c?.busy ?? true,
      smile: sm?.busy ?? true,
    },
  };
}
