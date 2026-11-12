// src/lib/live/gold.ts
//
// GOLD AND SILVER IN INDIA, from the page of the India Bullion and Jewellers Association (IBJA), whose rates are the ones the trade follows. The page carries today's rates in labelled cells
// (lblGold999_AM ...) and, for its own chart, the PM rate of every trading day for the last four months or so (hidden fields HdnGold and HdnSilver, as JSON): that is the "trend", and it is OFFICIAL
// data, not an estimate. Gold is per 10 grams, silver per kilogram, before GST and making charges.
//   24 carat = 999 purity, 22 carat = 916 purity.
// Pure: the page's text in, the numbers out (tested on a saved copy of the page).
import { DateTime } from "luxon";

const ZONE = "Asia/Kolkata";

export interface MetalPoint {
  /** YYYY-MM-DD */
  date: string;
  gold24: number;
  gold22: number;
  silver: number;
}

export interface MetalRates {
  /** today's opening (AM) rates; PM is added when IBJA has published it */
  gold24Per10g: number;
  gold22Per10g: number;
  gold24PerGram: number;
  gold22PerGram: number;
  silverPerKg: number;
  silverPerGram: number;
  /** which session of today these are: "AM" or "PM" */
  session: "AM" | "PM";
  /** the change against the last PM close in the history */
  change: { gold24: { abs: number; pct: number } | null; gold22: { abs: number; pct: number } | null; silver: { abs: number; pct: number } | null };
  /** the PM rate of each trading day, oldest first */
  history: MetalPoint[];
  /** "13 Jul to 11 Nov 2026" */
  rangeText: string;
}

const num = (s: string | undefined): number | null => {
  const n = Number((s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function cell(html: string, id: string): number | null {
  const m = new RegExp(`id="${id}">([^<]*)<`).exec(html);
  return num(m?.[1]);
}

function hidden(html: string, id: string): unknown {
  const m = new RegExp(`id="${id}"\\s+value="([^"]*)"`).exec(html);
  if (!m) return null;
  const text = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'");
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface ChartJson {
  labels?: string[];
  purity999?: Array<number | string | null>;
  purity916?: Array<number | string | null>;
  silverRate?: Array<number | string | null>;
}

const isoOf = (label: string): string | null => {
  const d = DateTime.fromFormat(label, "dd/MM/yyyy", { zone: ZONE });
  return d.isValid ? (d.toISODate() as string) : null;
};

const pct = (now: number, then: number | undefined) => (then ? { abs: Math.round(now - then), pct: Math.round(((now - then) / then) * 10000) / 100 } : null);

/** The rates and the trend from the text of the IBJA page; null when the page does not hold them (the page changed, or it is not the page). */
export function parseIbja(html: string): MetalRates | null {
  const am999 = cell(html, "lblGold999_AM"), pm999 = cell(html, "lblGold999_PM");
  const am916 = cell(html, "lblGold916_AM"), pm916 = cell(html, "lblGold916_PM");
  const amAg = cell(html, "lblSilver999_AM"), pmAg = cell(html, "lblSilver999_PM");
  const g24 = pm999 ?? am999, g22 = pm916 ?? am916, ag = pmAg ?? amAg;
  if (!g24 || !g22 || !ag) return null;
  const session: "AM" | "PM" = pm999 ? "PM" : "AM";

  const gold = hidden(html, "HdnGold") as ChartJson | null;
  const silver = hidden(html, "HdnSilver") as ChartJson | null;
  const history: MetalPoint[] = [];
  if (gold?.labels && gold.purity999 && gold.purity916) {
    const silverByLabel = new Map<string, number>();
    silver?.labels?.forEach((l, i) => { const v = num(String(silver.silverRate?.[i] ?? "")); if (v) silverByLabel.set(l, v); });
    gold.labels.forEach((l, i) => {
      const date = isoOf(l), a = num(String(gold.purity999?.[i] ?? "")), b = num(String(gold.purity916?.[i] ?? "")), c = silverByLabel.get(l);
      if (date && a && b && c) history.push({ date, gold24: a, gold22: b, silver: c });
    });
    history.sort((x, y) => x.date.localeCompare(y.date));
  }
  const last = history[history.length - 1];
  const first = history[0];
  const fmt = (iso: string, withYear: boolean) => DateTime.fromISO(iso, { zone: ZONE }).toFormat(withYear ? "d LLL yyyy" : "d LLL");
  return {
    gold24Per10g: g24,
    gold22Per10g: g22,
    gold24PerGram: Math.round((g24 / 10) * 100) / 100,
    gold22PerGram: Math.round((g22 / 10) * 100) / 100,
    silverPerKg: ag,
    silverPerGram: Math.round((ag / 1000) * 100) / 100,
    session,
    change: { gold24: pct(g24, last?.gold24), gold22: pct(g22, last?.gold22), silver: pct(ag, last?.silver) },
    history,
    rangeText: first && last ? `${fmt(first.date, false)} to ${fmt(last.date, true)}` : "",
  };
}
