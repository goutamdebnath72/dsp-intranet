// src/lib/live/aicpi.ts
//
// THE ALL-INDIA CONSUMER PRICE INDEX FOR INDUSTRIAL WORKERS (AICPI-IW, base 2016 = 100) AND THE DEARNESS ALLOWANCE OF SAIL EMPLOYEES WORKED OUT FROM IT (the CPSE "IDA pattern" of the 2017 pay scales, revised every quarter).
//
// THE INDEX comes from the Labour Bureau (Ministry of Labour and Employment, labourbureau.gov.in), which publishes each month's all-India figure on the last day of the next month. Two of its pages are read:
//   * the CPI-IW page, whose chart holds the last twelve months (its script lists the months and the figures);
//   * the home page, whose box holds the latest two months (so the newest month is there before the chart page is updated).
// Both are merged, the months must be one after the other, the figures plausible, and the two pages must agree on a month they share. A page that no longer has these things is an error, never a guess.
//
// THE DA (IDA, 2017 pay scales). From the orders of the Department of Public Enterprises (DPE), read for this:
//   * OM No. W-02/0028/2017-DPE(WC)-GL-XIII/17 of 3 Aug 2017, para 7: "100% DA neutralization ... DA as on 01.01.2017 will become zero with link point of AICPI 2001=100, which is 277.33 (average of AICPI for the months of
//     September, October & November, 2016) ... The periodicity of adjustment will be once in three months."
//   * OM F.No. W-02/0039/2017-DPE(WC)-GL-V/20 of 3 Apr 2020: for 1 April 2020 the average of December, January and February is 329.33, the increase over the link point 52, "DA rate 18.7% [52 / 277.33) x 100]".
//   So:  IDA % = ( average index of the three months  -  277.33 ) / 277.33 x 100,  to one decimal place, on the 2001-base index; the quarters are 1 January (September to November), 1 April (December to February),
//   1 July (March to May) and 1 October (June to August).
//   The Labour Bureau's index is now on base 2016, and it is linked to the 2001 base by the factor 2.88; the orders do not print that factor. IT WAS CHECKED AGAINST THE ORDERS: with the 2016-base figures the formula gives 53.42%
//   for 1 January 2026 (the rate in the DPE order circulated by Coal India: 53.4%) and 59.06% for 1 October 2026 (DPE OM No. W-02/0037/2025-DPE(WC)/FTS-14505 of 27 Oct 2026: 59.1%, which also shows that the figure is rounded to
//   the nearest tenth, not cut). Two further quarters, 54.1% (April 2026) and 55.7% (July 2026), agree with rates reported by third parties (not orders). See aicpi.selftest.ts.
// WHAT IS NOT ESTABLISHED: that SAIL pays exactly this for its employees is from the DPE guidelines SAIL's executives are under, SAIL's agreement of 22 Oct 2021 (reported as giving executives and non-executives the same DA
//   on the same link point) and the figures above; SAIL's own pages could not be read (sail.co.in fails its certificate, the exchange filings refuse access), so SAIL's own circular is the authority. Nothing was found that makes SAIL's
//   rule different (no extra factor); none is invented.
import { DateTime } from "luxon";

export const ZONE = "Asia/Kolkata";
export const CPI_PAGE = "https://labourbureau.gov.in/consumer-price-index-numbers-for-industrial-workers";
export const CPI_HOME = "https://labourbureau.gov.in/";
export const DPE_SITE = "https://dpe.gov.in/";

/** the constants of the formula, see above: the factor from base 2016 to base 2001, and the link point (the 2001-base average of September to November 2016) */
export const LINKING_FACTOR = 2.88;
export const LINK_POINT = 277.33;

export interface IndexPoint {
  /** YYYY-MM */
  month: string;
  value: number;
}

export interface Aicpi {
  /** the months from the same month a year before the latest to the latest, oldest first (13 points when the source holds them) */
  points: IndexPoint[];
}

export class AicpiError extends Error {}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthNo = (m: string): number => MONTHS.findIndex((x) => x.toLowerCase() === m.slice(0, 3).toLowerCase()) + 1;
const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const nextMonth = (a: string): string => { const y = Number(a.slice(0, 4)), m = Number(a.slice(5, 7)); return m === 12 ? ym(y + 1, 1) : ym(y, m + 1); };

/** the twelve months of the chart on the CPI-IW page: its script lists the labels ('Sep -25', 'Feb - 26') and the figures */
export function parseChart(html: string): IndexPoint[] {
  const labels = /labels:\s*\[([^\]]*)\]/.exec(html)?.[1];
  const data = /label:\s*'Index',\s*data:\s*\[([^\]]*)\]/.exec(html)?.[1];
  if (!labels || !data) throw new AicpiError("The Labour Bureau's CPI-IW page no longer has the chart of the last twelve months.");
  const months = [...labels.matchAll(/'\s*([A-Za-z]{3})\s*-\s*(\d{2})\s*'/g)].map((m) => ym(2000 + Number(m[2]), monthNo(m[1])));
  const values = data.split(",").map((x) => Number(x.trim())).filter((x) => x === x);
  if (months.length < 12 || months.length !== values.length) throw new AicpiError("The chart of the CPI-IW page does not hold twelve months with a figure each.");
  return months.map((month, i) => ({ month, value: values[i] }));
}

/** the latest months in the box of the Labour Bureau's home page ("Aug-2026" 154.4, "Sep-2026" 155.5) */
export function parseHome(html: string): IndexPoint[] {
  const at = html.indexOf("General Index (Base Year 2016 = 100)");
  if (at < 0) return [];
  const box = html.slice(at, at + 3000);
  const out: IndexPoint[] = [];
  for (const m of box.matchAll(/>\s*([A-Z][a-z]{2})-(\d{4})\s*<\/div>\s*<div[^>]*>\s*([\d.]+)\s*<\/div>/g)) out.push({ month: ym(Number(m[2]), monthNo(m[1])), value: Number(m[3]) });
  return out;
}

const plausible = (v: number) => Number.isFinite(v) && v > 100 && v < 400;

/**
 * The index of the year that ends on the latest published month, from the chart and (when it has them) the home page's newer months. `now` fixes today for the tests.
 */
export function buildAicpi(chartHtml: string, homeHtml: string | null, now: DateTime = DateTime.now().setZone(ZONE)): Aicpi {
  const chart = parseChart(chartHtml);
  const home = homeHtml ? parseHome(homeHtml) : [];
  const byMonth = new Map<string, number>();
  for (const p of chart) byMonth.set(p.month, p.value);
  // the two pages must agree on a month they share, or one of them is not what it was
  for (const p of home) {
    const had = byMonth.get(p.month);
    if (had !== undefined && had !== p.value) throw new AicpiError(`The Labour Bureau's pages disagree on the index of ${p.month} (${had} and ${p.value}).`);
    byMonth.set(p.month, p.value);
  }
  const months = [...byMonth.keys()].sort();
  for (let i = 0; i < months.length; i++) {
    if (!plausible(byMonth.get(months[i]) as number)) throw new AicpiError(`The index of ${months[i]} is not a plausible figure.`);
    if (i > 0 && nextMonth(months[i - 1]) !== months[i]) throw new AicpiError(`The months of the CPI-IW record are not one after the other (${months[i - 1]}, then ${months[i]}).`);
  }
  const latest = months[months.length - 1];
  // the index of a month is out four to five weeks after it ends: a record whose latest month is more than three months old is out of date
  const age = now.startOf("month").diff(DateTime.fromISO(`${latest}-01`, { zone: ZONE }), "months").months;
  if (age > 3) throw new AicpiError(`The CPI-IW record is out of date (its latest month is ${latest}).`);
  // THE SAME SPAN AS THE OTHER ONE-YEAR CHARTS: from the same month a year before the latest month to the latest (13 months, both ends in)
  const start = ym(Number(latest.slice(0, 4)) - 1, Number(latest.slice(5, 7)));
  const year = months.filter((m) => m >= start);
  // thirteen months when the source holds them; twelve (the chart page alone, before the home page has the newest month) is still a full year of readings; fewer is not
  if (year.length < 12) throw new AicpiError("The CPI-IW record does not reach back a full year.");
  return { points: year.map((month) => ({ month, value: byMonth.get(month) as number })) };
}

export function validAicpi(a: Aicpi | null | undefined): a is Aicpi {
  return !!a && Array.isArray(a.points) && a.points.length >= 12 && a.points.every((p, i) => /^\d{4}-\d{2}$/.test(p.month) && plausible(p.value) && (i === 0 || nextMonth(a.points[i - 1].month) === p.month));
}

/* ---------------------------------------- the dearness allowance (IDA) ---------------------------------------- */

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10 + 1e-9) / 10;

const addMonths = (m: string, n: number): string => {
  const t = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) + n;
  return ym(Math.floor(t / 12), (t % 12) + 1);
};

/** the three months a quarter's DA is worked out from: those that end two months before the quarter begins (1 October: June, July, August; 1 January: September, October, November) */
export function monthsOfQuarter(startsOn: string): [string, string, string] {
  const m = startsOn.slice(0, 7);
  return [addMonths(m, -4), addMonths(m, -3), addMonths(m, -2)];
}

export interface IdaWork {
  /** the day the quarter's DA is payable from, YYYY-MM-DD, and the three months it is worked out from */
  startsOn: string;
  months: [string, string, string];
  /** the average of the three figures (base 2016), that average on the 2001 base, its increase over the link point */
  average: number;
  linked: number;
  increase: number;
  /** the percentage to the hundredth, and the DA: the same to one decimal place, as the orders print it */
  exact: number;
  rate: number;
  /** how many of the three months are published (the rest taken at the latest figure in a projection) */
  known: number;
}

/** the DA that an average of three months' index (base 2016) gives, with every step of the work */
export function idaFromAverage(average: number): { linked: number; increase: number; exact: number; rate: number } {
  const linked = average * LINKING_FACTOR;
  const increase = linked - LINK_POINT;
  const exact = (increase / LINK_POINT) * 100;
  return { linked: r2(linked), increase: r2(increase), exact: r2(exact), rate: r1(exact) };
}

/** the DA of the quarter that begins on `startsOn`, from a record that holds its three months; null when it does not */
export function idaForQuarter(points: IndexPoint[], startsOn: string): IdaWork | null {
  const months = monthsOfQuarter(startsOn);
  const have = new Map(points.map((p) => [p.month, p.value]));
  const vals = months.map((m) => have.get(m));
  if (vals.some((v) => v === undefined)) return null;
  const average = (vals as number[]).reduce((a, b) => a + b, 0) / 3;
  return { startsOn, months, average: r2(average), ...idaFromAverage(average), known: 3 };
}

/** a quarter whose months are not all published yet, worked out as if those not yet published stand at the latest figure (a projection, said so on the card); null when even its first month is not published */
export function idaProjected(points: IndexPoint[], startsOn: string): IdaWork | null {
  if (!points.length) return null;
  const last = points[points.length - 1];
  const months = monthsOfQuarter(startsOn);
  const have = new Map(points.map((p) => [p.month, p.value]));
  let known = 0;
  const vals = months.map((m) => { const v = have.get(m); if (v !== undefined) { known++; return v; } return m > last.month ? last.value : NaN; });
  if (vals.some((v) => Number.isNaN(v)) || known === 0) return null;
  const average = vals.reduce((a, b) => a + b, 0) / 3;
  return { startsOn, months, average: r2(average), ...idaFromAverage(average), known };
}

/** the first day of the quarter (1 Jan, 1 Apr, 1 Jul, 1 Oct) that a date is in, and the quarter after it */
export function quarterOf(today: DateTime): { startsOn: string; next: string } {
  const t = today.setZone(ZONE);
  const m = Math.floor((t.month - 1) / 3) * 3 + 1;
  const start = DateTime.fromObject({ year: t.year, month: m, day: 1 }, { zone: ZONE });
  return { startsOn: start.toISODate() as string, next: start.plus({ months: 3 }).toISODate() as string };
}

/** the quarters of the record, oldest first, from the first whose three months are published to the one after the latest (the last may be a projection) */
export function quartersOf(points: IndexPoint[], today: DateTime): IdaWork[] {
  const out: IdaWork[] = [];
  if (!points.length) return out;
  const { next } = quarterOf(today);
  for (let q = DateTime.fromISO(`${points[0].month}-01`, { zone: ZONE }).startOf("month"); (q.toISODate() as string) <= next; q = q.plus({ months: 1 })) {
    const iso = q.toISODate() as string;
    if (![1, 4, 7, 10].includes(q.month)) continue;
    const w = idaForQuarter(points, iso) ?? (iso === next ? idaProjected(points, iso) : null);
    if (w) out.push(w);
  }
  return out;
}

/** the rupees of DA on a basic pay at a rate, to the nearest rupee (the pay slip is the authority on how SAIL rounds it) */
export function idaAmount(basicPay: number, rate: number): number {
  return Math.floor((basicPay * rate) / 100 + 0.5 + 1e-9);
}

/** how much DA one more point of the AICPI-IW (base 2016) adds to the percentage: 2.88 / 277.33 x 100 */
export const PERCENT_PER_POINT = r2((LINKING_FACTOR / LINK_POINT) * 100);

/** the quarterly rates the Department of Public Enterprises has announced for the 2017 pay scales, read from its orders (a copy of the order of 27 October 2026 and the circular that quotes the January order) */
export const IDA_ANNOUNCED = [
  { from: "2026-01-01", rate: 53.4, order: "DPE OM No. W-02/0037/2025-DPE(WC)/FTS-14505, as circulated by Coal India Limited on 6 March 2026" },
  { from: "2026-10-01", rate: 59.1, order: "DPE OM No. W-02/0037/2025-DPE(WC)/FTS-14505 dated 27 October 2026" },
] as const;
/** when the list above was last compared with what has been issued */
export const IDA_ANNOUNCED_CHECKED = "2026-11-13";

/** the announced rate for a quarter, when the list has it */
export function announcedFor(startsOn: string): (typeof IDA_ANNOUNCED)[number] | null {
  return IDA_ANNOUNCED.find((a) => a.from === startsOn) ?? null;
}
