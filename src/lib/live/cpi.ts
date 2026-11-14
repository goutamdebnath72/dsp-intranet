// src/lib/live/cpi.ts
//
// THE ALL-INDIA CONSUMER PRICE INDEX (CPI) AND THE INFLATION RATE, from the Ministry of Statistics and Programme Implementation (MoSPI): the monthly index of all India (Combined, Urban, Rural) and of each State and Union
// Territory, and the year-on-year inflation rate for the last 1, 3, 5 and 10 years. This is the CPI of the people at large; it is NOT the CPI for Industrial Workers (AICPI-IW) of the Labour Bureau, on which the dearness
// allowance rests (src/lib/live/aicpi.ts).
//
// SOURCE: the open data service of MoSPI (api.mospi.gov.in, "eSankhyiki"), read without a login (a call is then limited to pages of 100 rows, which is all that is needed):
//   * from January 2026 the NEW series, base 2024 = 100:   /api/cpi/getCPIData?base_year=2024&division_code=0 (the "CPI (General)" rows; year, month_code, limit, page)
//   * to December 2025 the OLD series, base 2012 = 100:    /api/cpi/getCPIIndex?base_year=2012&series=Current&state_code=99&group_code=0 (the "General" rows of all India)
// MoSPI's own inflation rate is read as it is given (it is not worked out here): for the new series it is the rate over the same month of the year before, from the series linked back. The chart of the rate is therefore
// the old series to December 2025 and the new one after it, the way MoSPI and the sites that follow it (Trading Economics) draw it. Checked on 14 Nov 2026 against the figures of the Trading Economics chart: October 2026 6.09,
// January 2026 2.74, December 2025 1.33, October 2025 0.25; and against MoSPI's own dashboard: all-India Rural 110.73, Urban 109.22, Combined 110.05 for October 2026.
// A month MoSPI has not yet published is simply absent: nothing is estimated. MoSPI releases the index of a month on the 12th of the next (at 4 pm).
import { DateTime } from "luxon";
import { getJson, UpstreamError } from "./http";

export const ZONE = "Asia/Kolkata";
export const MOSPI_API = "https://api.mospi.gov.in/api/cpi";
export const MOSPI_SITE = "https://www.mospi.gov.in/themes/product/9-consumer-price-index-cpi";
export const OLD_FROM = 2016;
export const SECTORS = ["Combined", "Urban", "Rural"] as const;
export type Sector = (typeof SECTORS)[number];
export const ALL_INDIA = "All India";
/** how many months the column charts show at most (the latest twelve of the new series) */
export const MONTHS_SHOWN = 12;

export interface CpiRow {
  /** "2012" (to December 2025) or "2024" (from January 2026) */
  base: "2012" | "2024";
  /** YYYY-MM */
  month: string;
  state: string;
  sector: Sector;
  index: number;
  /** MoSPI's inflation rate (percent, year on year) */
  inflation: number | null;
}

export class CpiError extends UpstreamError {}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
export const monthShort = (ym: string): string => SHORT[Number(ym.slice(5, 7)) - 1];
/** "Oct 2026" */
export const monthText = (ym: string): string => `${monthShort(ym)} ${ym.slice(0, 4)}`;
const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const nextOf = (a: string): string => { const y = Number(a.slice(0, 4)), m = Number(a.slice(5, 7)); return m === 12 ? ym(y + 1, 1) : ym(y, m + 1); };

/** the months from `from` to `to`, both included (YYYY-MM), oldest first */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 600; m = nextOf(m)) out.push(m);
  return out;
}

/** the latest month whose index MoSPI has published by `now`: the index of a month comes out on the 12th of the next, at 4 pm Indian time */
export function latestDue(now: DateTime = DateTime.now()): string {
  const t = now.setZone(ZONE);
  const out = t.day > 12 || (t.day === 12 && t.hour >= 16);
  const d = t.startOf("month").minus({ months: out ? 1 : 2 });
  return d.toFormat("yyyy-MM");
}

/** the day the index of `month` is due: the 12th of the month after it */
export function dueDay(month: string): string {
  return DateTime.fromISO(`${month}-01`, { zone: ZONE }).plus({ months: 1 }).set({ day: 12 }).toFormat("d LLLL yyyy");
}

const num = (x: unknown): number | null => {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const sectorOf = (s: unknown): Sector | null => (SECTORS as readonly string[]).includes(String(s)) ? (String(s) as Sector) : null;
const monthNo = (name: unknown): number => MONTH_NAMES.findIndex((m) => m === String(name)) + 1;

/**
 * The rows of one reply, CHECKED: only the "CPI (General)" rows (the new series) or the "General-Overall" rows (the old), each with a known month, State name, sector and a plausible index (60 to 400) and rate (-30 to 60 percent).
 * A reply that is not the service's, or holds none of these rows, is an error (never an empty answer taken for truth).
 */
export function parseRows(json: unknown, base: "2012" | "2024"): CpiRow[] {
  const j = json as { data?: unknown; statusCode?: unknown; msg?: unknown };
  if (!j || typeof j !== "object" || !Array.isArray(j.data)) throw new CpiError("MoSPI's CPI service gave an answer that is not the one expected.");
  const out: CpiRow[] = [];
  for (const r of j.data as Array<Record<string, unknown>>) {
    const general = base === "2024" ? r.division === "CPI (General)" && !r.group : r.group === "General" && r.subgroup === "General-Overall";
    if (!general || String(r.base_year ?? r.baseyear) !== base) continue;
    const sector = sectorOf(r.sector), year = Number(r.year), mo = monthNo(r.month), state = typeof r.state === "string" ? r.state.trim() : "";
    const index = num(r.index), inflation = num(r.inflation);
    if (!sector || !state || !Number.isInteger(year) || year < 2000 || year > 2100 || !mo || index === null || index < 60 || index > 400) continue;
    if (inflation !== null && (inflation < -30 || inflation > 60)) continue;
    out.push({ base, month: ym(year, mo), state, sector, index, inflation });
  }
  return out;
}

export type JsonGetter = (url: string) => Promise<unknown>;
export const defaultGetter: JsonGetter = (url) => getJson<unknown>(url, { timeoutMs: 20000 });

/** every page of a query (100 rows a page, the most the service gives); a reply that says it has more pages than 40 is refused */
async function paged(url: string, base: "2012" | "2024", get: JsonGetter): Promise<CpiRow[]> {
  const out: CpiRow[] = [];
  for (let page = 1; page <= 40; page++) {
    const j = (await get(`${url}&limit=100&page=${page}`)) as { meta_data?: { totalPages?: number }; msg?: string };
    const rows = parseRows(j, base);
    out.push(...rows);
    const total = Number(j?.meta_data?.totalPages ?? 1);
    if (!(total > page)) break;
    if (page === 40) throw new CpiError("MoSPI's CPI service has more pages than expected.");
  }
  return out;
}

/** the new series (base 2024), every State, all three sectors, for these months of one year (month numbers 1 to 12) */
export async function askNew(year: number, months: number[], get: JsonGetter = defaultGetter): Promise<CpiRow[]> {
  if (!months.length) return [];
  return paged(`${MOSPI_API}/getCPIData?base_year=2024&year=${year}&month_code=${months.join(",")}&division_code=0`, "2024", get);
}

/** the old series (base 2012), all India, all three sectors, for these years: the inflation of the years before 2026 */
export async function askOld(years: number[], get: JsonGetter = defaultGetter): Promise<CpiRow[]> {
  if (!years.length) return [];
  return paged(`${MOSPI_API}/getCPIIndex?base_year=2012&series=Current&year=${years.join(",")}&state_code=99&group_code=0`, "2012", get);
}

/** the new months from `from` to `to` (YYYY-MM): one request per year */
export async function askNewMonths(from: string, to: string, get: JsonGetter = defaultGetter): Promise<CpiRow[]> {
  const byYear = new Map<number, number[]>();
  for (const m of monthsBetween(from, to)) {
    const y = Number(m.slice(0, 4));
    byYear.set(y, [...(byYear.get(y) ?? []), Number(m.slice(5, 7))]);
  }
  const out: CpiRow[] = [];
  for (const [y, ms] of byYear) out.push(...(await askNew(y, ms, get)));
  return out;
}

/** everything, for an empty store: the new series from January 2026 to the latest due month, and the old series from 2016 to 2025 */
export async function askAll(now: DateTime = DateTime.now(), get: JsonGetter = defaultGetter): Promise<CpiRow[]> {
  const due = latestDue(now);
  const newer = due >= "2026-01" ? await askNewMonths("2026-01", due, get) : [];
  const older = await askOld(Array.from({ length: 10 }, (_, i) => OLD_FROM + i), get);
  return [...older, ...newer];
}

/** one sector's months, aligned to the month list of the answer: a month MoSPI has no figure for is null */
export interface SectorSeries {
  index: Array<number | null>;
  inflation: Array<number | null>;
}
export interface StateSeries {
  name: string;
  sectors: Record<Sector, SectorSeries>;
}
export interface InflationPoint {
  /** YYYY-MM */
  month: string;
  /** percent, year on year (all India, Combined) */
  value: number;
  base: "2012" | "2024";
}
export interface Cpi {
  baseYear: "2024";
  /** the latest month published, YYYY-MM */
  latest: string;
  /** the months of the column charts (at most twelve, ending with the latest), oldest first */
  months: string[];
  india: Record<Sector, SectorSeries>;
  /** each State and Union Territory, by name */
  states: StateSeries[];
  /** all India Combined inflation, month by month, from January 2016 */
  inflation: InflationPoint[];
  /** the month after the latest, and the day its index is due */
  next: { month: string; day: string };
}

const empty = (n: number): SectorSeries => ({ index: new Array(n).fill(null), inflation: new Array(n).fill(null) });

/** The answer built from the saved rows: nothing is added, a missing month is null. A store without the new series (not yet loaded) is an error. */
export function buildCpi(rows: CpiRow[]): Cpi {
  const fresh = rows.filter((r) => r.base === "2024");
  if (!fresh.length) throw new CpiError("No consumer price index has been saved yet.");
  const allMonths = [...new Set(fresh.map((r) => r.month))].sort();
  const latest = allMonths[allMonths.length - 1];
  const months = allMonths.slice(-MONTHS_SHOWN);
  const at = new Map(months.map((m, i) => [m, i]));
  const byState = new Map<string, StateSeries>();
  for (const r of fresh) {
    const i = at.get(r.month);
    if (i === undefined) continue;
    let st = byState.get(r.state);
    if (!st) { st = { name: r.state, sectors: { Combined: empty(months.length), Urban: empty(months.length), Rural: empty(months.length) } }; byState.set(r.state, st); }
    st.sectors[r.sector].index[i] = r.index;
    st.sectors[r.sector].inflation[i] = r.inflation;
  }
  const india = byState.get(ALL_INDIA);
  if (!india) throw new CpiError("The saved consumer price index has no all-India figures.");
  byState.delete(ALL_INDIA);
  const states = [...byState.values()].sort((a, b) => a.name.localeCompare(b.name));
  // the inflation of all India, Combined: the old series where there is no new one for the month
  const infl = new Map<string, InflationPoint>();
  for (const r of rows) {
    if (r.state !== ALL_INDIA || r.sector !== "Combined" || r.inflation === null) continue;
    const have = infl.get(r.month);
    if (!have || (r.base === "2024" && have.base === "2012")) infl.set(r.month, { month: r.month, value: r.inflation, base: r.base });
  }
  const inflation = [...infl.values()].sort((a, b) => a.month.localeCompare(b.month));
  const nxt = nextOf(latest);
  return { baseYear: "2024", latest, months, india: india.sectors, states, inflation, next: { month: monthText(nxt), day: dueDay(nxt) } };
}

/** one month of the inflation chart: the rate, or null for a month for which MoSPI's service has no figure (left blank on the chart, never filled in) */
export interface InflationSlot {
  month: string;
  value: number | null;
}

/** the window of the inflation chart: the last `years` years, from the same month `years` years before the latest month to the latest (13 months for one year: October to October), every month in it, a month without a figure as null */
export function inflationWindow(points: InflationPoint[], years: 1 | 3 | 5 | 10): InflationSlot[] {
  if (!points.length) return [];
  const last = points[points.length - 1].month;
  const from = ym(Number(last.slice(0, 4)) - years, Number(last.slice(5, 7)));
  const have = new Map(points.map((p) => [p.month, p.value]));
  const first = points[0].month > from ? points[0].month : from;
  return monthsBetween(first, last).map((month) => ({ month, value: have.get(month) ?? null }));
}

/** the Reserve Bank of India's inflation target (4%) and the tolerance band round it (2% to 6%) */
export const RBI_TARGET = 4;
export const RBI_LOWER = 2;
export const RBI_UPPER = 6;

export interface InflationAlert {
  /** above the upper limit (the alarm), within the band, or below the lower limit */
  level: "above" | "within" | "below";
  /** the few words in bold: "Inflation is above the RBI's limit." */
  lead: string;
  /** the sentence: the latest rate, how it moved since the month before, and where it stands against the band */
  text: string;
}

const f2 = (n: number) => n.toFixed(2);

/**
 * THE STATEMENT UNDER THE INFLATION CHART, written from the saved figures (so it is always about the latest month and never out of date): the latest rate, whether it rose or eased from the month before, and where it stands
 * against the Reserve Bank's band. Above the upper limit it is the alarm, and says for how long ("for the first time since Oct 2024", or "for the 3rd month in a row"). What the market had expected is not in MoSPI's data, so it is not said.
 */
export function inflationAlert(points: InflationPoint[]): InflationAlert | null {
  if (!points.length) return null;
  const last = points[points.length - 1];
  const prevMonth = ym(Number(last.month.slice(0, 4)) - (last.month.endsWith("-01") ? 1 : 0), last.month.endsWith("-01") ? 12 : Number(last.month.slice(5, 7)) - 1);
  const prev = points.find((p) => p.month === prevMonth);
  const v = last.value;
  const move = !prev ? `was ${f2(v)}% in ${monthText(last.month)}` : v > prev.value ? `rose to ${f2(v)}% in ${monthText(last.month)} from ${f2(prev.value)}% in ${monthText(prev.month)}` : v < prev.value ? `eased to ${f2(v)}% in ${monthText(last.month)} from ${f2(prev.value)}% in ${monthText(prev.month)}` : `stayed at ${f2(v)}% in ${monthText(last.month)}, as in ${monthText(prev.month)}`;
  const head = "India's headline inflation rate";
  if (v > RBI_UPPER) {
    // how long it has been above: the run of months ending with the latest, and the last month above it before the run
    const byMonth = new Map(points.map((p) => [p.month, p.value]));
    let n = 1, m = prevMonth;
    while ((byMonth.get(m) ?? 0) > RBI_UPPER) { n++; m = ym(Number(m.slice(0, 4)) - (m.endsWith("-01") ? 1 : 0), m.endsWith("-01") ? 12 : Number(m.slice(5, 7)) - 1); }
    const start = ym(Number(m.slice(0, 4)) + (m.endsWith("-12") ? 1 : 0), m.endsWith("-12") ? 1 : Number(m.slice(5, 7)) + 1);
    const before = [...points].reverse().find((p) => p.month < last.month && p.value > RBI_UPPER && p.month < start);
    const how = n > 1 ? `, now ${n} months in a row above it (since ${monthText(start)})` : before ? ` for the first time since ${monthText(before.month)}` : ` for the first time in the record from ${monthText(points[0].month)}`;
    return { level: "above", lead: "Inflation is above the RBI's limit.", text: `${head} ${move}, above the Reserve Bank of India's upper tolerance limit of ${RBI_UPPER}%${how}.` };
  }
  if (v < RBI_LOWER) return { level: "below", lead: "Inflation is below the RBI's lower limit.", text: `${head} ${move}, below the Reserve Bank of India's lower tolerance limit of ${RBI_LOWER}%.` };
  return { level: "within", lead: "Inflation is within the RBI's band.", text: `${head} ${move}, within the Reserve Bank of India's tolerance band of ${RBI_LOWER}% to ${RBI_UPPER}% (target ${RBI_TARGET}%).` };
}
