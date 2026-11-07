/** Inputs every model shares. */
export interface Market {
  spot: number; // S
  strike: number; // K
  time: number; // T, in years
  rate: number; // r, continuously compounded (0.05 = 5%)
}

/** One model-specific input, such as volatility. */
export interface ParamSpec {
  key: string;
  label: string;
  symbol: string; // shown in the math face, e.g. "σ"
  default: number; // in display units
  min: number; // slider bounds, display units
  max: number;
  step: number;
  scale: number; // display units × scale = model units (0.01 for a percentage)
  suffix?: string;
}

/** Model-specific inputs, in model units, keyed by ParamSpec.key. */
export type Params = Record<string, number>;

export interface Prices {
  call: number;
  put: number;
}

export interface Greeks {
  delta: number;
  gamma: number;
  vega: number; // per 1.00 change in the model's volatility parameter
  theta: number; // per year
  rho: number; // per 1.00 change in r
}

export interface OptionGreeks {
  call: Greeks;
  put: Greeks;
}

export interface Model {
  id: string;
  name: string;
  params: ParamSpec[];
  /** The parameter that plays volatility: heatmap rows vary it and vega measures it. */
  volParam: string;
  /** What the model assumes, in a sentence for the page footer. */
  assumptions: string;
  /** A message for the first invalid parameter, or null. Market inputs are checked separately. */
  validate(params: Params): string | null;
  price(market: Market, params: Params): Prices;
  /** Exact Greeks, when the model has them; otherwise they're estimated numerically. */
  greeks?(market: Market, params: Params): OptionGreeks;
}
