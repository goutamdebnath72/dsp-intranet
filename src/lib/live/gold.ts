// src/lib/live/gold.ts
//
// GOLD AND SILVER IN INDIA, from the page of the India Bullion and Jewellers Association (IBJA), whose rates are the ones the trade follows. The page carries today's rates in labelled cells
// (lblGold999_AM ...) and, for its own chart, the PM rate of every trading day for the last four months or so (hidden fields HdnGold and HdnSilver, as JSON): that is the "trend", and it is OFFICIAL
// data, not an estimate. Gold is per 10 grams, silver per kilogram, before GST and making charges.
//   24 carat = 999 purity, 22 carat = 916 purity.
// Pure: the page's text in, the numbers out (tested on a saved copy of the page).
import { DateTime } from "luxon";
import { fromYearAgo, reachesYearAgo } from "./yearWindow";

const ZONE = "Asia/Kolkata";

export interface MetalPoint {
  /** YYYY-MM-DD */
  date: string;
  gold24: number;
  gold22: number;
  silver: number;
  /** true for a day worked out from the gold/silver ETF (before IBJA's own page begins), never for an IBJA rate */
  est?: boolean;
  /** set on the first point of the year when there is no rate for that exact day (a weekend or a holiday): the day of the rate it really is (the last one before) */
  carried?: string;
}

/** How the days before IBJA's page begins were worked out, and how close that method came on the days where both exist. */
export interface Estimate {
  /** first and last estimated day, YYYY-MM-DD */
  from: string;
  to: string;
  /** the first day of IBJA's own record */
  officialFrom: string;
  /** how many days exist in both records (the days the method was checked on) */
  checkedDays: number;
  /** average and largest difference (percent) from IBJA's rate on those days */
  gold: { avgPct: number; maxPct: number };
  silver: { avgPct: number; maxPct: number };
  /** set when the fund prices are the copy kept with the app (the live source did not answer): the last day that copy covers */
  savedThrough?: string;
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
  /** present when earlier days were added by estimate (marked est. in `history`) */
  estimate?: Estimate;
  /** why the earlier days could not be added this time (the chart then shows IBJA's own days only) */
  estimateUnavailable?: string;
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


// ---- THE YEAR BEFORE IBJA'S PAGE BEGINS ----
// IBJA's page keeps only about four months. For the earlier days (up to a year) the closing price of the gold and silver ETFs traded on the NSE (Nippon India "Gold BeES" and "Silver BeES"), which move with the Indian
// price, is scaled to IBJA's rate on the days where both exist. That is an ESTIMATE and is always shown as one: dashed, marked "est.", with how close the method came. If the ETF record is missing, too short, or does not
// follow IBJA closely enough on the overlap, nothing is added and the chart stays on IBJA's own days.

export interface EtfSeries {
  /** YYYY-MM-DD (Indian date), oldest first */
  dates: string[];
  closes: number[];
}

/** The daily closes from a Yahoo chart answer (range 1y, interval 1d); null when it does not hold a usable record. */
export function parseEtfSeries(json: unknown): EtfSeries | null {
  const res = (json as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } })?.chart?.result?.[0];
  const ts = res?.timestamp, cl = res?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(cl) || ts.length !== cl.length) return null;
  const dates: string[] = [], closes: number[] = [];
  ts.forEach((t, i) => {
    const c = cl[i];
    if (typeof t !== "number" || typeof c !== "number" || !Number.isFinite(c) || c <= 0) return;
    const d = DateTime.fromSeconds(t, { zone: ZONE }).toISODate();
    if (!d || (dates.length && d <= dates[dates.length - 1])) return;
    dates.push(d);
    closes.push(c);
  });
  return dates.length >= 100 ? { dates, closes } : null;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** the scale from the ETF to IBJA, from the days both exist; null when the two do not follow each other closely (then no estimate is made) */
function fit(history: MetalPoint[], pick: (p: MetalPoint) => number, etf: EtfSeries): { scale: number; avgPct: number; maxPct: number; days: number } | null {
  const at = new Map(etf.dates.map((d, i) => [d, etf.closes[i]] as const));
  const ratios: number[] = [];
  for (const p of history) {
    const c = at.get(p.date);
    if (c) ratios.push(pick(p) / c);
  }
  if (ratios.length < 40) return null;
  const scale = mean(ratios);
  const errs = ratios.map((x) => (Math.abs(x - scale) / scale) * 100);
  const avgPct = mean(errs), maxPct = Math.max(...errs);
  // a method that is off by this much on the days it can be checked is not shown at all
  if (maxPct > 3 || avgPct > 1.2) return null;
  return { scale, avgPct: r2(avgPct), maxPct: r2(maxPct), days: ratios.length };
}

/** IBJA's rates with the earlier days added by estimate (see above); the rates themselves are returned unchanged when no honest estimate can be made. */
export function extendHistory(rates: MetalRates, gold: EtfSeries | null, silver: EtfSeries | null, savedThrough?: string, now: DateTime = DateTime.now()): MetalRates {
  if (!gold || !silver || rates.history.length < 40) return rates;
  // a record that stops well before IBJA's first day would leave a hole between the estimate and the real rates
  const gapDays = (a: string, b: string) => DateTime.fromISO(b, { zone: ZONE }).diff(DateTime.fromISO(a, { zone: ZONE }), "days").days;
  if (gapDays(gold.dates[gold.dates.length - 1], rates.history[0].date) > 6 || gapDays(silver.dates[silver.dates.length - 1], rates.history[0].date) > 6) return rates;
  const g = fit(rates.history, (p) => p.gold24, gold), s = fit(rates.history, (p) => p.silver, silver);
  if (!g || !s) return rates;
  const k22 = mean(rates.history.map((p) => p.gold22 / p.gold24));
  const firstOfficial = rates.history[0].date;
  const silverAt = new Map(silver.dates.map((d, i) => [d, silver.closes[i]] as const));
  const added: MetalPoint[] = [];
  gold.dates.forEach((d, i) => {
    const sv = silverAt.get(d);
    if (d >= firstOfficial || !sv) return;
    const g24 = Math.round(gold.closes[i] * g.scale);
    added.push({ date: d, gold24: g24, gold22: Math.round(g24 * k22), silver: Math.round(sv * s.scale), est: true });
  });
  if (added.length < 20) return rates;
  // THE YEAR RUNS FROM THE SAME DATE A YEAR BACK TO THE LATEST IBJA DAY (see yearWindow.ts): the record is cut at that date, its first point holding the rate in force on it; if the fund record does not reach back that far, it is left as it is
  const whole = [...added, ...rates.history];
  const history = reachesYearAgo(whole, now) ? fromYearAgo(whole, now) : whole;
  const first = history[0], last = history[history.length - 1];
  const years = first.date.slice(0, 4) !== last.date.slice(0, 4);
  const fmt = (iso: string, withYear: boolean) => DateTime.fromISO(iso, { zone: ZONE }).toFormat(withYear ? "d LLL yyyy" : "d LLL");
  return {
    ...rates,
    history,
    rangeText: `${fmt(first.date, years)} to ${fmt(last.date, true)}`,
    estimate: {
      from: added[0].date,
      to: added[added.length - 1].date,
      officialFrom: firstOfficial,
      checkedDays: Math.min(g.days, s.days),
      gold: { avgPct: g.avgPct, maxPct: g.maxPct },
      silver: { avgPct: s.avgPct, maxPct: s.maxPct },
      ...(savedThrough ? { savedThrough } : {}),
    },
  };
}
