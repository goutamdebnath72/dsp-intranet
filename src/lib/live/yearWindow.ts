// src/lib/live/yearWindow.ts
//
// THE ONE-YEAR WINDOW OF EVERY ONE-YEAR CHART (gold and silver, petrol and diesel, the dollar in rupees): it STARTS on the same date one year before today (today 13 November 2026: 13 November 2025) and ENDS today
// (or on the latest day the source has published, said so on the chart). People ask "what was the price on this day last year?", so the first point of the chart is exactly that day.
// If the source has no figure for that exact day (a weekend, a holiday: gold, silver and the exchange rate are not published then) the first point holds the figure in force on that day, the last one published before it,
// and says so (`carried` is the date of the figure it really is). Nothing is invented: the value is a real published one, and the chart says which day it was published.
// 29 February has no anniversary in most years: the window then starts on 28 February (Luxon's rule for "one year before").
import { DateTime } from "luxon";

export const ZONE = "Asia/Kolkata";

/** today in India */
export const todayIn = (now: DateTime = DateTime.now()): DateTime => now.setZone(ZONE).startOf("day");

/** the date one year before today, YYYY-MM-DD */
export function yearAgo(now: DateTime = DateTime.now()): string {
  return todayIn(now).minus({ years: 1 }).toISODate() ?? "";
}

export interface Dated { date: string }

/**
 * The points of a record from one year before today to its end. The first point is dated exactly one year back: the record's own point of that day, or a copy of the last point before it with that date and
 * `carried` set to the day the figure really belongs to. A record that has no point on or before that day does not reach back a year: it is returned as it is (the caller decides what to say).
 */
export function fromYearAgo<T extends Dated>(points: T[], now: DateTime = DateTime.now()): Array<T & { carried?: string }> {
  const start = yearAgo(now);
  let k = -1;
  for (let i = 0; i < points.length; i++) if (points[i].date <= start) k = i; else break;
  if (k < 0) return points;
  if (points[k].date === start) return points.slice(k);
  return [{ ...points[k], date: start, carried: points[k].date }, ...points.slice(k + 1)];
}

/** does the record reach back to the anniversary (a point on or before it)? */
export function reachesYearAgo(points: Dated[], now: DateTime = DateTime.now()): boolean {
  return points.length > 0 && points[0].date <= yearAgo(now);
}

/**
 * For a price that stays as it is until the day it is changed (fuel): the record carried forward to today with its last price, so the chart ends today. Returns the days added (0 when it already ends today).
 * Only for such prices: a figure that is published each day (gold, the exchange rate) is never carried to a day it was not published.
 */
export function carryToToday<T extends Dated>(points: T[], now: DateTime = DateTime.now()): { points: T[]; carriedFrom: string | null } {
  const today = todayIn(now).toISODate() ?? "";
  const last = points[points.length - 1];
  if (!last || last.date >= today) return { points, carriedFrom: null };
  return { points: [...points, { ...last, date: today }], carriedFrom: last.date };
}
