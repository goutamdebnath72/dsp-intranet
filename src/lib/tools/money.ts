// src/lib/tools/money.ts
//
// THE SMALL MONEY HELPERS THAT THE CALCULATORS SHARE: a typed number ("1,00,000"), the shape of a refused input (Problem), a range check, and rupees in Indian grouping.
// Pure; the numbers a person types are used in the browser and are never stored, logged or sent anywhere.

export const RATE_DEFAULTS_AS_OF = "November 2026";

/** a number typed by a person: "1,00,000", " 8.5 ", "" (nothing -> NaN) */
export function num(s: string | number | undefined | null): number {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[,\s₹]/g, "").trim();
  if (t === "") return NaN;
  return Number(t);
}

export interface Problem {
  error: string;
}
export const isProblem = (x: unknown): x is Problem => !!x && typeof x === "object" && "error" in (x as object);

export const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;

/** ₹ with Indian grouping and no paise unless the amount has them (an approximation does not need them) */
export function rupees(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const r = Math.round(v);
  const neg = r < 0;
  const s = Math.abs(r).toString();
  const g = s.length > 3 ? `${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${s.slice(-3)}` : s;
  return `${neg ? "-" : ""}₹ ${g}`;
}
