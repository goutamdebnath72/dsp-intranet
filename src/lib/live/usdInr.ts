// src/lib/live/usdInr.ts
//
// THE US DOLLAR IN RUPEES OVER THE LAST YEAR (the chart under the currency converter, shown when the converter is on USD and INR).
//
// The source is Frankfurter, which publishes the European Central Bank's reference rates: ONE RATE FOR EVERY WORKING DAY (the ECB does not publish on weekends and its holidays), the same table the
// converter's own rate comes from, so the last point of the chart is the rate the converter shows. A reference rate is the ECB's daily fixing, not the rate of a bank or a money changer, and not the RBI's.
//
// SELF-CHECK, so that a changed answer is a loud error and never a wrong number: the dates must be real and in order, every rate must be plausible, the record must reach back to one year before its last
// day, and it must be fresh. A failure throws, and the route then returns the last good answer (marked as such) or a plain failure; nothing is guessed.
import { DateTime } from "luxon";
import { fromYearAgo, yearAgo } from "./yearWindow";

const ZONE = "Asia/Kolkata";

export interface RatePoint {
  /** YYYY-MM-DD */
  date: string;
  /** rupees for one US dollar */
  value: number;
  /** set on the first point when the ECB published no rate on that exact day (a weekend or a holiday): the day of the rate it really is (the last working day before) */
  carried?: string;
}

export interface UsdInrTrend {
  points: RatePoint[];
}

export class RateTrendError extends Error {}

/** where the year starts: a few days before the anniversary, so that the working day on or after it is always inside the answer */
export function rangeStart(now: DateTime = DateTime.now().setZone(ZONE)): string {
  return now.startOf("day").minus({ years: 1, days: 6 }).toISODate() ?? "";
}

/**
 * Reads Frankfurter's answer for a range ({"rates":{"2025-11-10":{"INR":88.68}, ...}}) into the working days of the year that ends on its last day (the day a year before it, or the working day after it, to the last).
 * `now` fixes today for the tests.
 */
export function parseUsdInr(json: unknown, now: DateTime = DateTime.now().setZone(ZONE)): RatePoint[] {
  const table = (json as { rates?: unknown } | null)?.rates;
  if (!table || typeof table !== "object") throw new RateTrendError("The exchange-rate history did not come in the form expected.");
  const all: RatePoint[] = [];
  for (const [date, row] of Object.entries(table as Record<string, unknown>)) {
    const v = (row as { INR?: unknown } | null)?.INR;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !DateTime.fromISO(date, { zone: ZONE }).isValid) throw new RateTrendError(`"${date}" in the exchange-rate history is not a date.`);
    if (typeof v !== "number" || !Number.isFinite(v) || v < 30 || v > 200) throw new RateTrendError(`The rate for ${date} is not a plausible figure.`);
    all.push({ date, value: v });
  }
  all.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (all.length < 200) throw new RateTrendError("The exchange-rate history is shorter than a year, so no chart can be drawn.");
  const latest = DateTime.fromISO(all[all.length - 1].date, { zone: ZONE });
  if (now.startOf("day").diff(latest.startOf("day"), "days").days > 7) throw new RateTrendError(`The exchange-rate history is out of date (its latest day is ${latest.toFormat("d LLL yyyy")}).`);
  // THE YEAR RUNS FROM THE SAME DATE A YEAR BACK TO TODAY (the latest working day the ECB has published): the first point is that very date, holding the rate in force on it
  const from = yearAgo(now);
  const before = all.filter((p) => p.date <= from);
  if (!before.length) throw new RateTrendError("The exchange-rate history does not reach back a full year.");
  // the record must have a rate within a few days before the anniversary (a weekend or a holiday), or it does not cover the year
  if (DateTime.fromISO(from, { zone: ZONE }).diff(DateTime.fromISO(before[before.length - 1].date, { zone: ZONE }), "days").days > 5) throw new RateTrendError("The exchange-rate history does not reach back a full year.");
  const year = fromYearAgo(all, now);
  // a gap of more than a week in the middle is a hole in the record
  for (let i = 1; i < year.length; i++) {
    if (DateTime.fromISO(year[i].date, { zone: ZONE }).diff(DateTime.fromISO(year[i - 1].date, { zone: ZONE }), "days").days > 7) throw new RateTrendError(`The exchange-rate history has a gap after ${year[i - 1].date}.`);
  }
  return year;
}

export function validUsdInr(t: UsdInrTrend | null | undefined): t is UsdInrTrend {
  return !!t && Array.isArray(t.points) && t.points.length >= 200 && t.points.every((p, i) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.value >= 30 && p.value <= 200 && (i === 0 || t.points[i - 1].date < p.date));
}
