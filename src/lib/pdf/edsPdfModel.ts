// src/lib/pdf/edsPdfModel.ts
//
// THE DOCUMENT MODEL OF THE "DOWNLOAD AS PDF" OF AN EXECUTIVE DEEP SYNTHESIS (EDS) REPLY.
//
// The reply is structured data (headline, overview, findings, tables, charts, sources), so the PDF is DRAWN from that data (vector text and vector charts, selectable and
// searchable), never a screenshot of the screen. This file turns the reply into print-ready blocks: text runs with their script (so each run gets a font that has its
// glyphs), table cells in the same reading as on screen (rate / approver / note), chart geometry (already scaled), the sources and the file name. Pure: no I/O, no PDF
// library, no clock (the caller passes `now`), so every rule is tested (edsPdfModel.selftest.ts). edsPdfDocument.tsx only paints what this model says.
import { DateTime } from "luxon";
import type { SynthesisChart, SynthesisResult, SynthesisTable } from "@/lib/search/executiveSynthesis";
import { formatCircularTitle } from "@/lib/circularTitle";
import { chartDecimals, compactChartValue, formatValue, groupRupees, looksLikeAuthority, splitValueBracket } from "@/components/ExecutiveBriefing";

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

export type Script = "latin" | "rupee" | "devanagari" | "bengali";

export interface Run {
  text: string;
  script: Script;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

/** Characters the embedded fonts do not have, written the plain way. (Everything else the replies use - ₹ × – — • ° ½ and curly quotes - is in the fonts.) */
const PLAIN: Array<[RegExp, string]> = [
  [/≥/g, ">="],
  [/≤/g, "<="],
  [/→|➔|➜|➝/g, "->"],
  [/←/g, "<-"],
  [/≈/g, "~"],
  [/≠/g, "!="],
  [/[✓✔☑]/gu, "Yes"],
  [/[✗✘]/gu, "No"],
  [/[​﻿]/g, ""], // zero-width space / BOM: nothing to draw
  [/ /g, " "],
];
// emoji (the on-screen "✅" and friends) cannot be drawn by the fonts: removed, never shown as an empty box
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

export function pdfSafe(text: string): string {
  let t = String(text ?? "");
  for (const [re, to] of PLAIN) t = t.replace(re, to);
  return t.replace(EMOJI, "").replace(/[ \t]{2,}/g, " ");
}

const scriptOf = (ch: string): Script => {
  const c = ch.codePointAt(0)!;
  if (c === 0x20b9) return "rupee";
  if (c >= 0x0900 && c <= 0x097f) return "devanagari";
  if (c >= 0x0980 && c <= 0x09ff) return "bengali";
  return "latin";
};

/**
 * Splits text into runs of one script each. The Hindi and Bengali fonts hold only their own script (no space, digit or ASCII punctuation), so a space, an ASCII digit or a
 * punctuation mark is always drawn in the main font: "सेल स्थापना" is the word "सेल", a space, and the word "स्थापना". A zero-width joiner stays inside its word (it takes part in shaping).
 */
export function splitScripts(text: string): Array<{ text: string; script: Script }> {
  const out: Array<{ text: string; script: Script }> = [];
  for (const ch of String(text ?? "")) {
    const joiner = ch === "\u200C" || ch === "\u200D";
    const prev = out[out.length - 1];
    const s: Script = joiner && prev ? prev.script : scriptOf(ch);
    if (prev && prev.script === s && s !== "rupee") prev.text += ch;
    else out.push({ text: ch, script: s });
  }
  return out;
}

/** Inline markdown of a finding or paragraph (**bold**, *italic*, `code`) -> runs, with rupee grouping and plain symbols, each run split by script. */
export function inlineRuns(input: unknown): Run[] {
  const text = pdfSafe(groupRupees(typeof input === "string" ? input : input == null ? "" : String(input)));
  const runs: Run[] = [];
  const push = (raw: string, style: Pick<Run, "bold" | "italic" | "code">) => {
    if (!raw) return;
    for (const part of splitScripts(raw)) runs.push({ ...part, ...style });
  };
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) push(text.slice(last, m.index), {});
    if (m[1] !== undefined) push(m[1], { bold: true });
    else if (m[2] !== undefined) push(m[2], { italic: true });
    else if (m[3] !== undefined) push(m[3], { code: true });
    last = re.lastIndex;
  }
  if (last < text.length) push(text.slice(last), {});
  return runs;
}

/** Plain text of runs (for the file name, tests and the document's own title). */
export const plainOf = (runs: Run[]): string => runs.map((r) => r.text).join("");

/* ------------------------------------------------------------------ *
 * Table cells (the same reading as on screen: renderEnterpriseTableCell)
 * ------------------------------------------------------------------ */

export type CellKind = "label" | "none" | "rate" | "amount" | "plain";

export interface CellModel {
  kind: CellKind;
  /** the main text (the rate, the amount, the value, the label) */
  main: Run[];
  /** who approves ("Head of P&A"), when the bracket names an authority */
  authority?: Run[];
  /** a note: the bracket that is not an authority, and the [condition] */
  notes: Run[][];
}

const NOT_APPLICABLE = /^(?:not\s+(?:applicable|permitted|allowed|stated)|n\/?a|nil|none|-)/i;

export function parseCell(cell: string, colIndex: number): CellModel {
  const trimmed = (cell || "").replace(/\s*\[\s*\]/g, "").trim();
  if (colIndex === 0) return { kind: "label", main: inlineRuns(trimmed), notes: [] };
  if (NOT_APPLICABLE.test(trimmed)) return { kind: "none", main: inlineRuns(trimmed), notes: [] };
  const auth = splitValueBracket(trimmed);
  if (auth) {
    const bracket = auth.bracket;
    const isAuthority = !!bracket && looksLikeAuthority(bracket);
    const condition = auth.condition;
    return {
      kind: "rate",
      main: inlineRuns(auth.rate),
      authority: isAuthority ? inlineRuns(bracket) : undefined,
      notes: [...(bracket && !isAuthority ? [inlineRuns(bracket)] : []), ...(condition ? [inlineRuns(condition)] : [])],
    };
  }
  const bare = /^(₹|Rs\.?)?\s*(\d{1,3}(?:,\d{2,3})*|\d+)(\.\d+)?(\/-)?$/.exec(trimmed);
  const bareInt = bare ? Number(bare[2].replace(/,/g, "")) : NaN;
  if (bare && !(!bare[3] && !bare[1] && bareInt >= 1900 && bareInt <= 2100)) {
    const shown = `${bare[1] ? `${bare[1]} ` : ""}${bareInt.toLocaleString("en-IN")}${bare[3] ?? ""}${bare[4] ?? ""}`;
    return { kind: "amount", main: inlineRuns(shown), notes: [] };
  }
  return { kind: "plain", main: inlineRuns(trimmed), notes: [] };
}

export interface TableModel {
  title?: string;
  columns: Run[][];
  /** column widths in percent (the first column 28%, the others share the rest equally: the same as on screen) */
  widths: number[];
  rows: CellModel[][];
  /** the circulars it was read from, as the archive names them ("Circular 046 (2022)") */
  sources: string[];
}

/* A table stays in one block (it moves to the next page whole, with its heading) only if it FITS on a page. The painter used to decide that by the number of rows (12 or fewer), but an
 * 11-row table whose rows wrap to 3 or 4 lines is taller than a page, and the PDF library then draws the page on top of itself. So the height is estimated here, from the text and the
 * column widths, on the generous side: a table judged too tall only runs on over the page break (its heading row repeats), which is always safe; one judged short enough must really fit. */
export const PDF_BODY_WIDTH_PT = 511; // A4 (595 pt) less the 42 pt side margins
export const PDF_BODY_HEIGHT_PT = 718; // A4 (842 pt) less the top (66) and bottom (58) margins
const TABLE_WHOLE_LIMIT_PT = 560; // leaves room for the section heading, the title and a possible paragraph above it on the same page

const textLen = (runs: Run[] | undefined) => (runs ?? []).reduce((n, r) => n + r.text.length, 0);

const cellLines = (chars: number, fontPt: number, widthPct: number) => {
  const inner = Math.max(20, (PDF_BODY_WIDTH_PT * widthPct) / 100 - 14); // less the cell's side padding
  const perLine = Math.max(4, Math.floor(inner / (fontPt * 0.6))); // bold text, a wide average letter: on the safe side
  return Math.max(1, Math.ceil(chars / perLine));
};
function rowHeightOf(t: TableModel, cells: CellModel[]): number {
  return (
    Math.max(
      ...cells.map((c, ci) => {
        const w = t.widths[ci] ?? 100 / cells.length;
        let h = cellLines(textLen(c.main), 9.4, w) * 14;
        if (c.authority) h += cellLines(textLen(c.authority), 7.9, w) * 11 + 4;
        for (const n of c.notes) h += cellLines(textLen(n), 7.9, w) * 11 + 2;
        return h;
      }),
    ) + 14
  ); // the cell's top and bottom padding and its rule
}
const headHeightOf = (t: TableModel) => Math.max(...t.columns.map((c, ci) => cellLines(textLen(c), 7.8, t.widths[ci] ?? 100 / t.columns.length) * 11)) + 14;

export function estimateTableHeight(t: TableModel): number {
  return (t.title ? 18 : 0) + headHeightOf(t) + t.rows.reduce((n, r) => n + rowHeightOf(t, r), 0) + (t.sources.length ? 26 : 0) + 12;
}

/** True when the table is short enough to be kept whole (moved to the next page as one block). */
export function tableFitsOnePage(t: TableModel): boolean {
  return estimateTableHeight(t) <= TABLE_WHOLE_LIMIT_PT;
}

export function tableModel(table: SynthesisTable, citations: SynthesisResult["citations"]): TableModel {
  const n = Math.max(1, table.columns.length);
  const widths = n === 1 ? [100] : table.columns.map((_, i) => (i === 0 ? 28 : 72 / (n - 1)));
  return {
    title: table.title ? pdfSafe(table.title) : undefined,
    columns: table.columns.map((c) => inlineRuns(c)),
    widths,
    rows: table.rows.map((row) => row.map((cell, ci) => parseCell(cell, ci))),
    sources: sourceNames(table.sources, citations),
  };
}

/* ------------------------------------------------------------------ *
 * Sources
 * ------------------------------------------------------------------ */

/** How the archive names a circular: its label ("Circular 046 (2022)"), else the year of its date, else "Source". */
export function sourceName(c: SynthesisResult["citations"][number]): string {
  if (c.label) return c.label;
  const year = c.publishedAt && /^\d{4}/.test(c.publishedAt) ? c.publishedAt.slice(0, 4) : "";
  return year || "Source";
}

export function sourceNames(ids: number[] | undefined, citations: SynthesisResult["citations"]): string[] {
  return (ids ?? []).map((id) => citations.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c).map(sourceName);
}

/* ------------------------------------------------------------------ *
 * Charts: the geometry is computed here, already scaled to the drawing area
 * ------------------------------------------------------------------ */

export const PALETTE = ["#f59e0b", "#0ea5e9", "#10b981", "#8b5cf6", "#ef4444", "#ec4899", "#14b8a6", "#f97316"];
export const SERIES_A = "#f59e0b";
export const SERIES_B = "#0ea5e9";

/** "Nice" axis ticks from 0 (or the minimum) to a rounded maximum: 0, 50, 100, 150. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min);
  const hi = max <= lo ? lo + 1 : max;
  const raw = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v < hi + step * 0.999; v += step) {
    out.push(Math.round(v * 1e6) / 1e6);
    if (v >= hi) break;
  }
  return out;
}

/** The path of a ring slice (angles in radians, 0 at 12 o'clock, clockwise). A full circle is drawn as two halves, as one arc cannot start and end at the same point. */
export function slicePath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const mid = a0 + Math.PI;
    return `${slicePath(cx, cy, rOuter, rInner, a0, mid)} ${slicePath(cx, cy, rOuter, rInner, mid, a1 - 1e-6)}`;
  }
  const pt = (r: number, a: number) => `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${pt(rOuter, a0)} A ${rOuter} ${rOuter} 0 ${large} 1 ${pt(rOuter, a1)} L ${pt(rInner, a1)} A ${rInner} ${rInner} 0 ${large} 0 ${pt(rInner, a0)} Z`;
}

export interface ChartBase {
  title: string;
  subtitle?: string;
  /** "Metric: ₹" - not for a timeline */
  metric?: string;
  sources: string[];
}
export interface PieModel extends ChartBase { type: "pie"; total: string; slices: Array<{ label: string; value: string; percent: string; color: string; path: string; detail?: string }> }
export interface BarModel extends ChartBase { type: "bar"; series: Array<{ name: string; color: string }>; rows: Array<{ label: string; detail?: string; bars: Array<{ value: string; widthPct: number; color: string }> }> }
export interface LineModel extends ChartBase {
  type: "line";
  width: number;
  height: number;
  yTicks: Array<{ y: number; label: string }>;
  points: Array<{ x: number; y: number; label: string; value: string }>;
  path: string;
}
export interface ScatterModel extends ChartBase {
  type: "scatter";
  width: number;
  height: number;
  xName: string;
  yName: string;
  xTicks: Array<{ x: number; label: string }>;
  yTicks: Array<{ y: number; label: string }>;
  points: Array<{ x: number; y: number; label: string }>;
}
export interface TimelineModel extends ChartBase { type: "timeline"; items: Array<{ n: number; label: string; detail?: string }> }
export interface KpiModel extends ChartBase { type: "kpi"; items: Array<{ value: string; label: string; detail?: string }> }
export type ChartModel = PieModel | BarModel | LineModel | ScatterModel | TimelineModel | KpiModel;

/** Drawing area of the line and scatter charts, in points (the card inside an A4 page with 44 pt margins is about 480 pt wide). */
export const PLOT_W = 440;
export const PLOT_H = 190;
const PAD_L = 46;
const PAD_R = 14;
const PAD_T = 12;
const PAD_B = 30;

export function chartModel(chart: SynthesisChart, citations: SynthesisResult["citations"]): ChartModel | null {
  const dec = chartDecimals(chart);
  const base: ChartBase = {
    title: pdfSafe(chart.title),
    subtitle: chart.subtitle ? pdfSafe(chart.subtitle) : undefined,
    metric: chart.unit && chart.type !== "timeline" ? pdfSafe(`Metric: ${chart.unit}`) : undefined,
    sources: sourceNames(chart.sources, citations),
  };
  const items = chart.items ?? [];
  if (!items.length) return null;
  switch (chart.type) {
    case "pie": {
      const total = items.reduce((s, it) => s + Math.max(0, it.value), 0);
      if (total <= 0) return null;
      let a = 0;
      const slices = items.map((it, i) => {
        const part = (Math.max(0, it.value) / total) * Math.PI * 2;
        const slice = { label: pdfSafe(it.label), value: formatValue(it.value, chart.unit, dec), percent: `${((Math.max(0, it.value) / total) * 100).toFixed(1).replace(/\.0$/, "")}%`, color: PALETTE[i % PALETTE.length], path: part > 0 ? slicePath(70, 70, 66, 38, a, a + part) : "", detail: it.detail ? pdfSafe(it.detail) : undefined };
        a += part;
        return slice;
      });
      return { ...base, type: "pie", total: formatValue(total, chart.unit, dec), slices };
    }
    case "bar": {
      const hasB = items.some((it) => typeof it.secondaryValue === "number");
      const [aName, bName] = chart.entityLabels ?? ["Value", "Comparison"];
      const max = Math.max(1e-9, ...items.flatMap((it) => [it.value, typeof it.secondaryValue === "number" ? it.secondaryValue : 0]));
      const bar = (v: number, color: string) => ({ value: formatValue(v, chart.unit, dec), widthPct: Math.max(v > 0 ? 1.5 : 0, Math.min(100, (v / max) * 100)), color });
      return {
        ...base,
        type: "bar",
        series: hasB ? [{ name: pdfSafe(aName), color: SERIES_A }, { name: pdfSafe(bName), color: SERIES_B }] : [],
        rows: items.map((it) => ({
          label: pdfSafe(it.label),
          detail: it.detail ? pdfSafe(it.detail) : undefined,
          bars: [bar(it.value, SERIES_A), ...(hasB && typeof it.secondaryValue === "number" ? [bar(it.secondaryValue, SERIES_B)] : [])],
        })),
      };
    }
    case "line": {
      const values = items.map((it) => it.value);
      const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
      const lo = ticks[0], hi = ticks[ticks.length - 1];
      const plotW = PLOT_W - PAD_L - PAD_R, plotH = PLOT_H - PAD_T - PAD_B;
      const x = (i: number) => PAD_L + (items.length === 1 ? plotW / 2 : (i * plotW) / (items.length - 1));
      const y = (v: number) => PAD_T + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
      const points = items.map((it, i) => ({ x: x(i), y: y(it.value), label: pdfSafe(it.label), value: compactChartValue(it.value, chart.unit, dec) }));
      return {
        ...base,
        type: "line",
        width: PLOT_W,
        height: PLOT_H,
        yTicks: ticks.map((t) => ({ y: y(t), label: compactChartValue(t, chart.unit, dec) })),
        points,
        path: points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" "),
      };
    }
    case "scatter": {
      const pts = items.filter((it) => typeof it.secondaryValue === "number");
      if (!pts.length) return null;
      const xs = pts.map((it) => it.value), ys = pts.map((it) => it.secondaryValue as number);
      const xt = niceTicks(Math.min(...xs), Math.max(...xs), 4), yt = niceTicks(Math.min(...ys), Math.max(...ys), 4);
      const x0 = xt[0], x1 = xt[xt.length - 1], y0 = yt[0], y1 = yt[yt.length - 1];
      const plotW = PLOT_W - PAD_L - PAD_R, plotH = PLOT_H - PAD_T - PAD_B;
      const X = (v: number) => PAD_L + ((v - x0) / (x1 - x0 || 1)) * plotW;
      const Y = (v: number) => PAD_T + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH;
      const [xName, yName] = chart.entityLabels ?? ["X", "Y"];
      return {
        ...base,
        type: "scatter",
        width: PLOT_W,
        height: PLOT_H,
        xName: pdfSafe(xName),
        yName: pdfSafe(yName),
        xTicks: xt.map((t) => ({ x: X(t), label: compactChartValue(t, undefined, dec) })),
        yTicks: yt.map((t) => ({ y: Y(t), label: compactChartValue(t, undefined, dec) })),
        points: pts.map((it) => ({ x: X(it.value), y: Y(it.secondaryValue as number), label: pdfSafe(it.label) })),
      };
    }
    case "timeline":
      return { ...base, type: "timeline", items: items.map((it, i) => ({ n: i + 1, label: pdfSafe(it.label), detail: it.detail ? pdfSafe(it.detail) : undefined })) };
    case "kpi":
      return { ...base, type: "kpi", items: items.map((it) => ({ value: formatValue(it.value, chart.unit, dec), label: pdfSafe(it.label), detail: it.detail ? pdfSafe(it.detail) : undefined })) };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * The whole document
 * ------------------------------------------------------------------ */

export interface PdfSource {
  n: number;
  label: string;
  title: string;
  date: string | null;
}

export interface PdfModel {
  fileName: string;
  title: string;
  question: string | null;
  /** "10 November 2026, 08:42 IST" */
  generatedAt: string;
  overview: Run[][];
  findings: Array<{ runs: Run[]; refs: string[] }>;
  charts: ChartModel[];
  tables: TableModel[];
  sources: PdfSource[];
  abbreviations: Array<{ abbr: string; full: string }>;
}

const DISPLAY_DATE = "d MMM yyyy";

/** The file name: "EDS-Accommodation-retention-Type-A-vs-B-2026-11-10.pdf" (ASCII only, no spaces, at most about 70 characters of title). */
export function edsPdfFileName(headline: string | undefined, now: DateTime): string {
  const slug = pdfSafe(headline ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+$/g, "");
  // at most about 70 characters of title, cut between words (never in the middle of a word or a year)
  const cut = slug.length <= 70 ? slug : slug.slice(0, 70).replace(/-[^-]*$/, "");
  return `EDS-${cut || "Briefing"}-${now.toFormat("yyyy-LL-dd")}.pdf`;
}

export function buildEdsPdfModel(data: SynthesisResult, opts: { question?: string | null; now: DateTime; abbreviations: Array<[string, string]> }): PdfModel {
  const citations = data.citations ?? [];
  const title = pdfSafe(data.headline?.trim() || "Executive briefing");
  const question = opts.question && opts.question.trim() ? pdfSafe(opts.question.trim().replace(/\s+/g, " ")) : null;
  return {
    fileName: edsPdfFileName(data.headline, opts.now),
    title,
    question,
    generatedAt: `${opts.now.toFormat("d MMMM yyyy, HH:mm")} ${opts.now.zoneName === "Asia/Kolkata" ? "IST" : opts.now.offsetNameShort}`,
    overview: String(data.overview ?? "").split(/\n\n+/).map((p) => p.trim()).filter(Boolean).map((p) => inlineRuns(p)),
    findings: (data.keyFindings ?? []).filter((f) => f && String(f.text ?? "").trim()).map((f) => ({ runs: inlineRuns(f.text), refs: sourceNames(f.sources, citations) })),
    charts: (data.charts ?? []).map((c) => chartModel(c, citations)).filter((c): c is ChartModel => c !== null),
    tables: [data.table, data.extraTable].filter((t): t is SynthesisTable => !!t && t.rows.length > 0).map((t) => tableModel(t, citations)),
    sources: citations.map((c, i) => ({
      n: i + 1,
      label: sourceName(c),
      title: pdfSafe(formatCircularTitle(c.headline)),
      date: c.publishedAt && /^\d{4}-\d{2}-\d{2}/.test(c.publishedAt) ? dateText(c.publishedAt) : null,
    })),
    abbreviations: opts.abbreviations.map(([abbr, full]) => ({ abbr: pdfSafe(abbr), full: pdfSafe(full) })),
  };

  function dateText(iso: string): string | null {
    const d = DateTime.fromISO(iso.slice(0, 10), { zone: "utc" }); // a calendar date, not a moment: no zone shift
    return d.isValid ? d.toFormat(DISPLAY_DATE) : null;
  }
}

/** True when the reply holds something to put in a PDF (an error reply or an empty one has no download button). */
export function hasPdfContent(data: SynthesisResult | null | undefined): boolean {
  if (!data || data.error) return false;
  return !!(String(data.overview ?? "").trim() || (data.keyFindings ?? []).length || (data.table?.rows.length ?? 0) || (data.extraTable?.rows.length ?? 0) || (data.charts ?? []).length);
}
