// src/lib/search/kpiFromTable.ts
//
// THE BIG NUMBER CARDS. A short table that holds ONE amount per row (a deposit per size of house, a premium per month, a rate per grade) is the kind of answer a reader's eye goes to
// first when the amounts stand as large cards. The writer is told not to repeat the table's numbers in a chart, so on some runs it drew the cards and on others it did not (owner,
// 11 Nov 2026: "that kind of result attracts the users eye ... that is a must where it is possible"). The cards are therefore built here, from the table's own cells, which the
// engine has already checked against the circulars: no figure is new. Pure.
import type { SynthesisChart, SynthesisResult, SynthesisTable } from "./executiveSynthesis";

const MONEY = /^\s*(?:₹|rs\.?)\s*([\d,]+(?:\.\d+)?)\s*(lakhs?|crores?|cr\b)?/i;
const PERCENT = /^\s*([\d.]+)\s*%/;
/** how many cards are worth drawing: two to four rows, each with its own figure */
const MIN_CARDS = 2;
const MAX_CARDS = 4;

interface Parsed { value: number; unit: string }
const parseCell = (cell: string): Parsed | null => {
  const text = (cell || "").trim();
  const m = MONEY.exec(text);
  if (m) {
    const value = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(value)) return null;
    const scale = (m[2] || "").toLowerCase();
    return { value, unit: scale ? `₹ ${scale.startsWith("l") ? "Lakh" : "Crore"}` : "₹" };
  }
  const p = PERCENT.exec(text);
  if (p) {
    const value = Number(p[1]);
    return Number.isFinite(value) ? { value, unit: "%" } : null;
  }
  return null;
};

/** The cards of one table, or null when it is not that shape: every row has an amount (or a percentage) first in the same column, all in one unit, and the figures are not all alike. */
export function kpiFromTable(t: SynthesisTable | null | undefined): SynthesisChart | null {
  if (!t || t.rows.length < MIN_CARDS || t.rows.length > MAX_CARDS || t.columns.length < 2) return null;
  for (let col = 1; col < t.columns.length; col++) {
    const parsed = t.rows.map((r) => parseCell(r[col] ?? ""));
    if (parsed.some((p) => p === null)) continue;
    const ps = parsed as Parsed[];
    if (new Set(ps.map((p) => p.unit)).size !== 1) continue;
    if (new Set(ps.map((p) => p.value)).size < 2) continue;
    const labels = t.rows.map((r) => (r[0] ?? "").trim());
    if (labels.some((l) => !l || parseCell(l))) continue;
    return {
      type: "kpi",
      title: (t.title || "").trim() || t.columns[col],
      subtitle: t.title ? t.columns[col] : undefined,
      unit: ps[0].unit,
      items: t.rows.map((r, i) => ({ label: labels[i], value: ps[i].value, detail: (r[col] ?? "").trim() })),
      sources: t.sources ? [...t.sources] : undefined,
    };
  }
  return null;
}

/** The result with cards added when it has none and fewer than two charts, from the first table that gives them. The result is not changed in place. */
export function withKpiCards(r: SynthesisResult): SynthesisResult {
  const charts = r.charts ?? [];
  if (charts.length >= 2 || charts.some((c) => c.type === "kpi")) return r;
  for (const t of [r.table, r.extraTable]) {
    const card = kpiFromTable(t);
    if (card) return { ...r, charts: [...charts, card] };
  }
  return r;
}
