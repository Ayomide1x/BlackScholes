import { fmt } from "./format";

/** Round-number axis ticks covering lo to hi, about `count` of them. */
export function niceTicks(lo: number, hi: number, count: number) {
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(t);
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return ticks.map((t) => ({ t, label: fmt(t, digits) }));
}
