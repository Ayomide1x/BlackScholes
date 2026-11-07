export const fmt = (x: number, digits = 2) =>
  Number.isFinite(x)
    ? x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "—";

export const money = (x: number) => (Number.isFinite(x) ? `$${fmt(x)}` : "—");

/** Signed, with a true minus sign so columns of numbers line up. */
export const signed = (x: number, digits = 4) =>
  Number.isFinite(x) ? (x < 0 ? `−${fmt(-x, digits)}` : fmt(x, digits)) : "—";
