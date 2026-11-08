/** Just enough complex arithmetic for characteristic functions. */
export interface Complex {
  re: number;
  im: number;
}

export const c = (re: number, im = 0): Complex => ({ re, im });
export const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const mul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
export const scale = (a: Complex, k: number): Complex => ({ re: a.re * k, im: a.im * k });

export function div(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

export function exp(a: Complex): Complex {
  const m = Math.exp(a.re);
  return { re: m * Math.cos(a.im), im: m * Math.sin(a.im) };
}

/** Principal logarithm. */
export function log(a: Complex): Complex {
  return { re: Math.log(Math.hypot(a.re, a.im)), im: Math.atan2(a.im, a.re) };
}

/**
 * Principal square root (non-negative real part). The smaller component is
 * found by division rather than from r − |re|, which would cancel to nothing
 * when the other component is tiny.
 */
export function sqrt(a: Complex): Complex {
  if (a.re === 0 && a.im === 0) return { re: 0, im: 0 };
  const r = Math.hypot(a.re, a.im);
  if (a.re >= 0) {
    const re = Math.sqrt((r + a.re) / 2);
    return { re, im: a.im / (2 * re) };
  }
  const im = Math.sqrt((r - a.re) / 2) * (a.im < 0 ? -1 : 1);
  return { re: a.im / (2 * im), im };
}
