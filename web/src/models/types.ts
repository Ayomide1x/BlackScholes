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
  integer?: boolean; // whole numbers only, e.g. tree steps
  /** A fixed set of values shown as a switch instead of a number box. */
  choices?: { value: number; label: string }[];
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
  /** One or two sentences on what the model adds, shown under the model switch. */
  description: string;
  /** What the first input is called, if not the spot price (Black-76 prices futures). */
  underlying?: { label: string; symbol: string };
  params: ParamSpec[];
  /** The parameter that plays volatility: heatmap rows vary it and vega measures it. */
  volParam: string;
  /** What the model assumes, in a sentence for the page footer. */
  assumptions: string;
  /** A message for the first invalid parameter, or null. Market inputs are checked separately. */
  validate(params: Params, market: Market): string | null;
  /** Show the price next to Black–Scholes with the same inputs, where the difference means something. */
  compareWithBlackScholes?: boolean;
  price(market: Market, params: Params): Prices;
  /** Exact Greeks, when the model has them; otherwise they're estimated numerically. */
  greeks?(market: Market, params: Params): OptionGreeks;
}
