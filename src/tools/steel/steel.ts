// src/tools/steel/steel.ts
//
// THE LOGIC OF THE STEEL CARD (pure, no React): the retail prices as chart points and month-on-month changes, the steel CPSEs month by month with the same month a year earlier, and India's and the world's production.
// The figures are in mos.ts (the Ministry of Steel's reports) and companies.ts (the companies' own results); how they are drawn is in SteelCard.tsx. Tested in steel.selftest.ts.
// Nothing is estimated here: a change is computed from two published figures, and a figure that is not published is null and is drawn as a gap.
import { DateTime } from "luxon";
import type { TrendPoint } from "@/components/tools/live/LivePieces";
import { IRON_ORE, RETAIL, SAIL_MONTHLY, WSA_MONTHLY, type CpseMonth, type RetailPoint } from "./mos";
import { INDIA_ANNUAL, INDIA_HALF } from "./mosAnnual";

export type Product = "tmt" | "hrc" | "crc";
export const PRODUCTS: ReadonlyArray<{ id: Product; name: string; spec: string; use: string; color: string; gradient: string }> = [
  { id: "tmt", name: "TMT bar", spec: "10 mm", use: "reinforcement bars for buildings and bridges (a long product)", color: "#ea580c", gradient: "from-orange-500 to-amber-600" },
  { id: "hrc", name: "HR coil", spec: "2.50 mm", use: "hot-rolled coil: the base flat product for pipes, tubes, fabrication and cold rolling", color: "#2563eb", gradient: "from-blue-600 to-indigo-600" },
  { id: "crc", name: "CR coil", spec: "0.63 mm", use: "cold-rolled coil: thin, smooth sheet for appliances, vehicles and panels", color: "#0d9488", gradient: "from-teal-600 to-emerald-600" },
];

/** "2026-09" -> "Sep 2026" */
export const monthLabel = (ym: string): string => DateTime.fromISO(`${ym}-01`, { zone: "Asia/Kolkata" }).toFormat("LLL yyyy");
export const monthShort = (ym: string): string => DateTime.fromISO(`${ym}-01`, { zone: "Asia/Kolkata" }).toFormat("LLL");
/** the last day of a month, as the reports date their prices ("2026-09-30") */
export const monthEnd = (ym: string): string => DateTime.fromISO(`${ym}-01`, { zone: "Asia/Kolkata" }).endOf("month").toISODate() as string;
export const monthShift = (ym: string, k: number): string => DateTime.fromISO(`${ym}-01`, { zone: "Asia/Kolkata" }).plus({ months: k }).toFormat("yyyy-MM");

/** percent change from `then` to `now`, one decimal; null when either is missing or `then` is zero */
export function pct(now: number | null | undefined, then: number | null | undefined): number | null {
  if (now === null || now === undefined || then === null || then === undefined || then === 0) return null;
  return Math.round(((now - then) / then) * 1000) / 10;
}

/** Rs 65,750 -> "₹65,750" in the Indian way of grouping (65,750; 1,05,000) */
export const inr = (n: number): string => `₹${Math.round(n).toLocaleString("en-IN")}`;
/** "+15.5%" / "-5.7%" / "0.0%" */
export const signed = (p: number): string => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}%`;
export const f1 = (n: number): string => n.toFixed(1);
export const f2 = (n: number): string => n.toFixed(2);
export const f3 = (n: number): string => n.toFixed(3);

// ---- RETAIL PRICES
export const retailValue = (p: RetailPoint, id: Product): number => p[id];
export function retailPoints(id: Product): TrendPoint[] {
  return RETAIL.map((p) => ({ label: monthShort(p.month), full: `${DateTime.fromISO(monthEnd(p.month), { zone: "Asia/Kolkata" }).toFormat("d LLL yyyy")}`, iso: monthEnd(p.month), value: retailValue(p, id) }));
}
export const latestRetail = (): RetailPoint => RETAIL[RETAIL.length - 1];
/** the change over the month before (computed from the two published figures) and over the first month in the record */
export function retailChange(id: Product): { month: number | null; since: number | null; previous: RetailPoint | null } {
  const last = latestRetail(), prev = RETAIL.length > 1 ? RETAIL[RETAIL.length - 2] : null, first = RETAIL[0];
  return { month: prev ? pct(last[id], prev[id]) : null, since: pct(last[id], first[id]), previous: prev };
}
/** the highest and lowest month-end price in the record */
export function retailRange(id: Product): { hi: RetailPoint; lo: RetailPoint } {
  let hi = RETAIL[0], lo = RETAIL[0];
  for (const p of RETAIL) { if (p[id] >= hi[id]) hi = p; if (p[id] <= lo[id]) lo = p; }
  return { hi, lo };
}
/** HR coil over TMT: how much dearer the flat product is than the long one (percent of the TMT price) */
export const flatPremium = (p: RetailPoint): number => Math.round(((p.hrc - p.tmt) / p.tmt) * 1000) / 10;
export const ironOreLatest = (): { month: string; lumps: number } | null => {
  for (let i = IRON_ORE.length - 1; i >= 0; i--) { const v = IRON_ORE[i].lumps; if (v !== null) return { month: IRON_ORE[i].month, lumps: v }; }
  return null;
};

// ---- THE STEEL CPSES (million tonnes, MT: the unit the steel trade uses; the Ministry's own table is in lakh tonnes and is divided by 10 when the file is written)
export const cpseByMonth = (rows: readonly CpseMonth[]): Map<string, CpseMonth> => new Map(rows.map((r) => [r.month, r]));
/** a month's figure and the same month a year earlier, with the change; null when either month is not in the record */
export function yearOnYear(rows: ReadonlyArray<{ month: string }>, month: string, pick: (r: never) => number | null): { now: number; then: number; change: number } | null {
  const by = new Map(rows.map((r) => [r.month, r]));
  const a = by.get(month), b = by.get(monthShift(month, -12));
  const now = a ? pick(a as never) : null, then = b ? pick(b as never) : null;
  const change = pct(now, then);
  return now !== null && then !== null && change !== null ? { now, then, change } : null;
}
/** the total of a figure over the months of a financial year to date (April to the month), or null when a month is missing */
export function fyToDate(rows: ReadonlyArray<{ month: string }>, lastMonth: string, pick: (r: never) => number | null): number | null {
  const y = Number(lastMonth.slice(0, 4)), m = Number(lastMonth.slice(5));
  const fyStart = m >= 4 ? y : y - 1;
  const by = new Map(rows.map((r) => [r.month, r]));
  let sum = 0;
  for (let k = 0; ; k++) {
    const ym = monthShift(`${fyStart}-04`, k);
    if (ym > lastMonth) break;
    const r = by.get(ym), v = r ? pick(r as never) : null;
    if (v === null) return null;
    sum += v;
  }
  return Math.round(sum * 1000) / 1000;
}
export const latestSail = (): CpseMonth => SAIL_MONTHLY[SAIL_MONTHLY.length - 1];

// ---- INDIA AND THE WORLD
export const wsaSeries = (country: string): ReadonlyArray<readonly [string, number]> => WSA_MONTHLY[country] ?? [];
export const indiaShareOfWorld = (month: string): number | null => {
  const i = WSA_MONTHLY.India?.find((x) => x[0] === month)?.[1], w = WSA_MONTHLY.World?.find((x) => x[0] === month)?.[1];
  return i && w ? Math.round((i / w) * 1000) / 10 : null;
};
export const indiaGrowth = (): Array<{ fy: string; crude: number; change: number | null }> =>
  INDIA_ANNUAL.filter((y) => !y.partial).map((y, i, a) => ({ fy: y.fy, crude: y.crude, change: i > 0 ? pct(y.crude, a[i - 1].crude) : null }));
export const halfYearChange = (): number | null => pct(INDIA_HALF[INDIA_HALF.length - 1].crude, INDIA_HALF[INDIA_HALF.length - 2].crude);
