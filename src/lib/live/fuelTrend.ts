// src/lib/live/fuelTrend.ts
//
// THE KOLKATA PRICE OF PETROL, DIESEL AND LPG OVER THE LAST YEAR (the chart under the fuel card).
//
//   PETROL AND DIESEL come from the Petroleum Planning & Analysis Cell (PPAC) of the Ministry of Petroleum and Natural Gas: its retail-selling-price table of the four metros is an official
//   record with ONE ROW FOR EVERY DAY since 16 June 2017 (a PDF, "Table Posted" each morning). Read with pdf-parse, each row is "12-Nov-26102.12  111.21  107.77  113.51  12-Nov-2695.20  97.83  99.55  99.82":
//   the date and the petrol prices of Delhi, Mumbai, Chennai, Kolkata, then the date and the diesel prices of the same four. Kolkata is the fourth of each.
//   LPG (domestic 14.2 kg) has no PPAC table. The only free record found is GoodReturns' monthly table for Kolkata ("Last 10 Months LPG Rate in Kolkata"), so the LPG chart is monthly and shorter
//   (ten months and today). No source read has Kolkata's LPG price for November or December 2025, and none is guessed.
//
// SELF-CHECK, so that a changed page is a loud error and never a wrong number: every row must have the same date on both sides, every day of the year must be there, every price must be plausible, the table
// must be fresh, and each LPG month's stated change must equal the difference between its price and the month before. A failure throws, and the route falls back to the copy kept with the app (marked as such).
import { DateTime } from "luxon";
import { parseLpgCity } from "./fuel";
import { carryToToday, fromYearAgo, yearAgo } from "./yearWindow";

const ZONE = "Asia/Kolkata";

export type FuelId = "petrol" | "diesel" | "lpg";

export interface FuelPoint {
  /** YYYY-MM-DD (for a month: its first day; for today's LPG price: today) */
  date: string;
  value: number;
}

export interface FuelSeries {
  id: FuelId;
  /** one point for every day, or one for every month */
  grain: "day" | "month";
  points: FuelPoint[];
  /** the series is the copy kept with the app, saved on this date, because the live source did not answer */
  savedOn?: string;
}

export interface FuelTrend {
  petrol: FuelSeries | null;
  diesel: FuelSeries | null;
  lpg: FuelSeries | null;
  /** what could not be had, and what came from the saved copy, in words for the card */
  notes: string[];
}

export class TrendError extends Error {}

const PRICE = "(\\d{2,3}\\.\\d{2})";
const DATE = "(\\d{1,2}-[A-Za-z]{3}-\\d{2})";
/** "12-Nov-26102.12 111.21 107.77 113.51 12-Nov-2695.20 97.83 99.55 99.82": pdf-parse glues a date to the price after it, the layout reader does not: both are read */
const ROW = new RegExp(`^${DATE}\\s*${PRICE}\\s+${PRICE}\\s+${PRICE}\\s+${PRICE}\\s+${DATE}\\s*${PRICE}\\s+${PRICE}\\s+${PRICE}\\s+${PRICE}\\s*$`);

const isoOf = (d: DateTime) => d.toISODate() ?? "";
const plain = (s: string) => DateTime.fromFormat(s, "d-LLL-yy", { zone: ZONE, locale: "en" });

export interface PpacKolkata {
  petrol: FuelPoint[];
  diesel: FuelPoint[];
}

/** The address of the PDF on PPAC's own page: its name carries the date and a number that changes every day, so it is found on the page, and only a PPAC address is followed. */
export function ppacPdfLink(html: string): string {
  const m = /href=["']([^"']*DailyPriceMSHSD_Metro[^"']*\.pdf)["']/i.exec(html);
  if (!m) throw new TrendError("PPAC's page has no link to the daily metro price table any more.");
  let url: URL;
  try { url = new URL(m[1], "https://ppac.gov.in/"); } catch { throw new TrendError("PPAC's link to the price table is not an address."); }
  if (url.protocol !== "https:" || url.hostname !== "ppac.gov.in") throw new TrendError("PPAC's link to the price table leads away from ppac.gov.in, so it was not followed.");
  return url.toString();
}

/** Kolkata's petrol and diesel price for every day from the same date one year before today to the latest day of the table (both ends in; the route carries the last price on to today). `now` fixes today for the tests. */
export function parsePpacKolkata(text: string, now: DateTime = DateTime.now().setZone(ZONE)): PpacKolkata {
  const petrol = new Map<string, number>(), diesel = new Map<string, number>();
  for (const line of text.split("\n")) {
    const m = ROW.exec(line);
    if (!m) continue;
    const a = plain(m[1]), b = plain(m[6]);
    if (!a.isValid || !b.isValid || a.toMillis() !== b.toMillis()) throw new TrendError("PPAC's table no longer has the same date on both of its sides.");
    petrol.set(isoOf(a), Number(m[5]));
    diesel.set(isoOf(a), Number(m[10]));
  }
  if (petrol.size < 300) throw new TrendError("PPAC's price table was not found, or has changed, so the petrol and diesel prices cannot be read.");
  const dates = [...petrol.keys()].sort();
  const latest = DateTime.fromISO(dates[dates.length - 1], { zone: ZONE });
  if (now.startOf("day").diff(latest.startOf("day"), "days").days > 7) throw new TrendError(`PPAC's price table is out of date (its latest day is ${latest.toFormat("d LLL yyyy")}).`);
  const start = DateTime.fromISO(yearAgo(now), { zone: ZONE });
  const out: PpacKolkata = { petrol: [], diesel: [] };
  for (let d = start; d <= latest; d = d.plus({ days: 1 })) {
    const iso = isoOf(d);
    const p = petrol.get(iso), g = diesel.get(iso);
    if (p === undefined || g === undefined) throw new TrendError(`PPAC's price table is missing ${d.toFormat("d LLL yyyy")}.`);
    if (p < 60 || p > 200 || g < 60 || g > 200) throw new TrendError(`PPAC's price for ${d.toFormat("d LLL yyyy")} is not a plausible figure.`);
    out.petrol.push({ date: iso, value: p });
    out.diesel.push({ date: iso, value: g });
  }
  return out;
}

/** Kolkata's domestic 14.2 kg LPG price for each month of GoodReturns' table, and today's price as the last point. */
export function parseLpgKolkata(text: string, now: DateTime = DateTime.now().setZone(ZONE)): FuelPoint[] {
  const at = text.indexOf("Last 10 Months LPG Rate in Kolkata");
  if (at < 0) throw new TrendError("The monthly LPG table of Kolkata was not found on the page.");
  const section = text.slice(at, at + 3000);
  const rows: Array<{ month: DateTime; price: number; change: number }> = [];
  const re = /([A-Z][a-z]{2,8}) (\d{4})\|\s*₹([\d,]+(?:\.\d+)?)\|\s*\(([+-]?[\d,.]+)\)\|\s*₹[\d,.]+\|\s*\([+-]?[\d,.]+\)\|/g;
  for (let m = re.exec(section); m; m = re.exec(section)) {
    const month = DateTime.fromFormat(`${m[1]} ${m[2]}`, "LLLL yyyy", { zone: ZONE, locale: "en" });
    if (!month.isValid) throw new TrendError(`"${m[1]} ${m[2]}" in the LPG table is not a month.`);
    rows.push({ month, price: Number(m[3].replace(/,/g, "")), change: Number(m[4].replace(/,/g, "")) });
  }
  if (rows.length < 6) throw new TrendError("The monthly LPG table has changed, so the Kolkata LPG prices cannot be read.");
  rows.forEach((r, i) => {
    if (r.price < 500 || r.price > 2500) throw new TrendError(`The LPG price for ${r.month.toFormat("LLLL yyyy")} is not a plausible figure.`);
    const older = rows[i + 1];
    if (!older) return;
    if (isoOf(older.month.plus({ months: 1 })) !== isoOf(r.month)) throw new TrendError("The months of the LPG table are not one after the other.");
    // each month's stated change is its price less the month before: this proves that the columns were read in their places
    if (Math.abs(r.price - older.price - r.change) > 0.011) throw new TrendError(`The LPG change stated for ${r.month.toFormat("LLLL yyyy")} does not agree with the prices.`);
  });
  const today = parseLpgCity(text, "Kolkata").dom14.price;
  const todayMonth = now.startOf("month");
  const pts: FuelPoint[] = rows.filter((r) => r.month < todayMonth).reverse().map((r) => ({ date: isoOf(r.month), value: r.price }));
  pts.push({ date: isoOf(now), value: today });
  return pts;
}

/* ---------------------------------- the copy kept with the app ---------------------------------- */

/** what is kept: the days on which a price CHANGED (petrol, diesel), and the LPG points as they are */
export interface Snapshot {
  savedOn: string;
  /** the last day of the petrol and diesel record */
  through: string;
  petrol: Array<[string, number]>;
  diesel: Array<[string, number]>;
  lpg: Array<[string, number]>;
}

/** the days on which the value changed (the first day always counts) */
export function toChanges(points: FuelPoint[]): Array<[string, number]> {
  return points.filter((p, i) => i === 0 || p.value !== points[i - 1].value).map((p) => [p.date, p.value]);
}

/** every day from the first change to `through`, each holding the price of the last change */
export function expandChanges(changes: Array<[string, number]>, through: string): FuelPoint[] {
  if (!changes.length) return [];
  const out: FuelPoint[] = [];
  let k = 0;
  const end = DateTime.fromISO(through, { zone: ZONE });
  for (let d = DateTime.fromISO(changes[0][0], { zone: ZONE }); d <= end; d = d.plus({ days: 1 })) {
    const iso = isoOf(d);
    while (k + 1 < changes.length && changes[k + 1][0] <= iso) k++;
    out.push({ date: iso, value: changes[k][1] });
  }
  return out;
}

export function seriesFromSnapshot(s: Snapshot, id: FuelId): FuelSeries {
  if (id === "lpg") return { id, grain: "month", savedOn: s.savedOn, points: s.lpg.map(([date, value]) => ({ date, value })) };
  return { id, grain: "day", savedOn: s.savedOn, points: expandChanges(id === "petrol" ? s.petrol : s.diesel, s.through) };
}

/**
 * THE ONE-YEAR WINDOW OF A DAILY SERIES (petrol, diesel): from the same date one year before today (the price in force on that day) to TODAY, the last published price carried on to today because a fuel price stays
 * until the day it is changed. Returns the series and the day the carrying began (null when the record already ends today). A monthly series (LPG) is left as it is: its source holds only ten months.
 */
export function inYearWindow(s: FuelSeries, now: DateTime = DateTime.now()): { series: FuelSeries; carriedFrom: string | null } {
  if (s.grain !== "day") return { series: s, carriedFrom: null };
  const c = carryToToday(fromYearAgo(s.points, now), now);
  return { series: { ...s, points: c.points }, carriedFrom: c.carriedFrom };
}

/** a series is usable when it has points in date order, with plausible values */
export function validSeries(s: FuelSeries | null): s is FuelSeries {
  if (!s || s.points.length < 2) return false;
  const [lo, hi] = s.id === "lpg" ? [500, 2500] : [60, 200];
  return s.points.every((p, i) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.value >= lo && p.value <= hi && (i === 0 || s.points[i - 1].date < p.date));
}
