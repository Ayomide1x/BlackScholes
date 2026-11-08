import type { CurvePoint, Estimate, Market, OptionGreeks, Params, Prices, SmileCurve } from "../models";

/** Work the page sends to the pricing worker. Each request carries an id; replies echo it. */
export type Request =
  | { id: number; kind: "summary"; modelId: string; market: Market; params: Params }
  | { id: number; kind: "grid"; modelId: string; market: Market; params: Params; spots: number[]; vols: number[] }
  | { id: number; kind: "curve"; modelId: string; market: Market; params: Params }
  | { id: number; kind: "smile"; modelId: string; market: Market; params: Params };

export type Reply =
  | { id: number; kind: "prices"; prices: Prices; estimate: Estimate | null }
  | { id: number; kind: "greeks"; greeks: OptionGreeks }
  | { id: number; kind: "row"; row: number; call: number[]; put: number[] }
  | { id: number; kind: "curve"; points: CurvePoint[] }
  | { id: number; kind: "smile"; curves: SmileCurve[] };
