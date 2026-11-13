// src/lib/live/flightFacts.ts
//
// TWO THINGS THE AIRPORT'S FLIGHT PAGE DOES NOT SAY, kept as a small HAND-REVIEWED, DATED table (nothing is fetched and nothing is guessed): on which days a flight runs, and about what a one-way economy ticket costs.
//
// DAYS OF OPERATION. The airport's page lists the flights but not their days; no free source states them reliably (booking sites contradict each other: one calls a route daily, another lists it on five days of the week).
// So a flight shows a days chip ONLY when it has a row in DAYS below, and a row is added ONLY from the airline's own timetable or the airport's (helpline on its flight page), with the date it was checked. No row, no chip.
//
// FARES. No free source gives a live fare (the booking sites that show fares turn automated readers away, and the airline's own booking page is not open to them). What is here is what PUBLIC BOOKING-SITE LISTINGS showed
// for each route on FARE_AS_OF (ixigo, MakeMyTrip, Goibibo, Momondo, Yatra, Google Flights and IndiGo's own route page: the lowest one-way economy fare each listed, IndiGo, listings of more than six months old left out). The chip shows the MIDDLE
// of the listings, rounded to a hundred rupees, with the range as its tooltip. A route with no listing found has no fare chip (every route has one now). The table is DATED and a table older than FARE_STALE_DAYS is not shown at all
// (the card then says the fare guide is out of date). Every fare comes with a disclaimer on the card: it is a rough guide, not the airline's price.
import { DateTime } from "luxon";

/** when the public listings below were read (a day at Durgapur) */
export const FARE_AS_OF = "2026-11-13";
/** a fare guide older than this many days is not shown */
export const FARE_STALE_DAYS = 45;
export const FARE_SOURCES = "ixigo, MakeMyTrip, Goibibo, Momondo, Yatra, Google Flights and IndiGo's route page";

export interface FareGuide {
  /** the lowest one-way economy fares (rupees) the listings showed, IndiGo, one number per listing */
  listings: number[];
}
/** by the other airport's IATA code (Chennai: MakeMyTrip, Google Flights, ixigo and Yatra; the listings that quoted a past August departure, and one 424 days old, were left out) */
export const FARES: Record<string, FareGuide> = {
  DEL: { listings: [6746, 6812, 6948, 7053, 7368] },
  BLR: { listings: [6103, 7452, 7669, 8027, 8290, 8552] },
  HYD: { listings: [7562] },
  BOM: { listings: [7548] },
  MAA: { listings: [5299, 6301, 6724, 8206] },
};

export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export const WEEKDAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export interface DaysRow {
  /** "daily", or the days it runs */
  days: "daily" | Weekday[];
  /** the day it was checked (YYYY-MM-DD) and where: the airline's own timetable or the airport's */
  checked: string;
  source: string;
}
/**
 * The days of each flight, by the number as the card shows it ("6E 509"). EMPTY until someone has checked them with the airline or the airport (the airport's helpline is on its flight page).
 * To add one: `"6E 509": { days: "daily", checked: "2026-11-20", source: "IndiGo timetable" }` or `days: ["Mon", "Wed", "Fri"]`.
 */
export const DAYS: Record<string, DaysRow> = {};

/** the middle of the listings (the average of the two middle ones for an even number), rounded to the nearest hundred rupees */
export function middleFare(listings: number[]): number {
  const s = [...listings].sort((a, b) => a - b), n = s.length;
  const mid = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  return Math.round(mid / 100) * 100;
}
/** "₹7,800" */
export const rupees = (v: number): string => `₹${v.toLocaleString("en-IN")}`;

export interface FareChip { text: string; title: string; listings: number }
/** the fare chip of a route: about the middle of the listings, with the range and the count in the tooltip; null when the route has no listing or the guide is out of date */
export function fareChip(iata: string, now: DateTime = DateTime.now(), table: Record<string, FareGuide> = FARES, asOf: string = FARE_AS_OF): FareChip | null {
  const g = table[iata];
  if (!g || !g.listings.length || fareGuideStale(now, asOf)) return null;
  const lo = Math.min(...g.listings), hi = Math.max(...g.listings), n = g.listings.length;
  const text = `≈ ${rupees(middleFare(g.listings))}`;
  const range = n === 1 ? `one listing showed ${rupees(lo)}` : `${n} listings showed ${rupees(lo)} to ${rupees(hi)}`;
  return { text, title: `Rough one-way economy fare, about the middle of what public booking sites listed on ${DateTime.fromISO(asOf).toFormat("d LLL yyyy")}: ${range}. Not the airline's price.`, listings: n };
}
/** is the fare guide older than FARE_STALE_DAYS at `now`? */
export function fareGuideStale(now: DateTime = DateTime.now(), asOf: string = FARE_AS_OF): boolean {
  const d = DateTime.fromISO(asOf, { zone: "Asia/Kolkata" });
  return !d.isValid || now.setZone("Asia/Kolkata").diff(d, "days").days > FARE_STALE_DAYS;
}

/** "Daily" or "Mon · Wed · Fri" ("Mon–Fri" for five weekdays in a row, "Weekdays" for Monday to Friday); null for a row that is not valid */
export function daysText(row: DaysRow | undefined): string | null {
  if (!row || !/^\d{4}-\d{2}-\d{2}$/.test(row.checked) || !row.source.trim()) return null;
  if (row.days === "daily") return "Daily";
  const set = new Set(row.days);
  if (!row.days.length || set.size !== row.days.length || row.days.some((d) => !WEEKDAYS.includes(d))) return null;
  const ordered = WEEKDAYS.filter((d) => set.has(d));
  if (ordered.length === 7) return "Daily";
  if (ordered.join() === "Mon,Tue,Wed,Thu,Fri") return "Mon–Fri";
  return ordered.join(" · ");
}
/** the days chip of a flight number as the card shows it ("6E 509"): null when no one has checked its days */
export function daysChip(number: string, table: Record<string, DaysRow> = DAYS): { text: string; title: string } | null {
  const row = table[number], text = daysText(row);
  return row && text ? { text, title: `Days of operation, from ${row.source}, checked ${DateTime.fromISO(row.checked).toFormat("d LLL yyyy")}. Schedules change: check with the airline.` } : null;
}
