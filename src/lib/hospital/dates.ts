// src/lib/hospital/dates.ts
// Dates in a question: "today", "tomorrow", "yesterday", "sunday", "next friday", "25 december", "25 dec 2026", "25/12/2026", "2026-12-25".
// A date written without a year is the CURRENT year (the same decision as the holiday questions). A date that cannot exist ("31 february") is reported, never guessed.

import { DateTime } from "luxon";
import { WEEKDAY_BY_ISO, type Weekday } from "./opdData";

export type DateRef = { kind: "relative" | "weekday" | "explicit"; date: DateTime; text: string } | { kind: "invalid"; text: string };

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

const DAY_WORDS: Record<string, Weekday> = {
  monday: "MON", mon: "MON", tuesday: "TUE", tue: "TUE", tues: "TUE", wednesday: "WED", wed: "WED", thursday: "THU", thu: "THU", thur: "THU", thurs: "THU",
  friday: "FRI", fri: "FRI", saturday: "SAT", sat: "SAT", sunday: "SUN", sun: "SUN",
};
const DAY_RE = Object.keys(DAY_WORDS).sort((a, b) => b.length - a.length).join("|");

/** Lower-case, "1st" -> "1", punctuation (except / - :) to spaces. */
export function plain(s: string): string {
  return s.toLowerCase().replace(/&/g, " and ").replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/[^a-z0-9/:\- ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The weekdays named in a question, in the order of the week ("on monday and thursday"). */
export function weekdaysIn(q: string): Weekday[] {
  const found = new Set<Weekday>();
  for (const m of plain(q).matchAll(new RegExp(`\\b(${DAY_RE})\\b`, "g"))) found.add(DAY_WORDS[m[1]]);
  return WEEKDAY_BY_ISO.filter((d) => found.has(d));
}

const mk = (now: DateTime, y: number, m: number, d: number): DateTime | null => {
  const dt = DateTime.fromObject({ year: y, month: m, day: d }, { zone: now.zoneName ?? "Asia/Kolkata" });
  return dt.isValid ? dt : null;
};

/** The one date a question is about, or null when it names none. */
export function parseDateRef(q: string, now: DateTime): DateRef | null {
  const n = plain(q);
  const today = now.startOf("day");
  const year = today.year;

  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(n);
  if (m) { const d = mk(today, +m[1], +m[2], +m[3]); return d ? { kind: "explicit", date: d, text: m[0] } : { kind: "invalid", text: m[0] }; }
  m = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/.exec(n);
  if (m) { const d = mk(today, +m[3], +m[2], +m[1]); return d ? { kind: "explicit", date: d, text: m[0] } : { kind: "invalid", text: m[0] }; }
  m = new RegExp(`\\b(\\d{1,2})\\s*(${MONTH_RE})\\b(?:\\s*,?\\s*(\\d{4}))?`).exec(n);
  if (m) { const d = mk(today, m[3] ? +m[3] : year, MONTHS[m[2]], +m[1]); return d ? { kind: "explicit", date: d, text: m[0].trim() } : { kind: "invalid", text: m[0].trim() }; }
  m = new RegExp(`\\b(${MONTH_RE})\\s*(\\d{1,2})\\b(?:\\s*,?\\s*(\\d{4}))?`).exec(n);
  if (m) { const d = mk(today, m[3] ? +m[3] : year, MONTHS[m[1]], +m[2]); return d ? { kind: "explicit", date: d, text: m[0].trim() } : { kind: "invalid", text: m[0].trim() }; }

  if (/\bday after tomorrow\b/.test(n)) return { kind: "relative", date: today.plus({ days: 2 }), text: "the day after tomorrow" };
  if (/\btomorrow\b/.test(n)) return { kind: "relative", date: today.plus({ days: 1 }), text: "tomorrow" };
  if (/\byesterday\b/.test(n)) return { kind: "relative", date: today.minus({ days: 1 }), text: "yesterday" };
  if (/\b(today|tonight|right now|now)\b/.test(n)) return { kind: "relative", date: today, text: "today" };

  const w = new RegExp(`\\b(next|this|coming)?\\s*(${DAY_RE})\\b`).exec(n);
  if (w) {
    const target = WEEKDAY_BY_ISO.indexOf(DAY_WORDS[w[2]]) + 1; // 1..7
    let ahead = (target - today.weekday + 7) % 7;
    if (w[1] === "next" && ahead === 0) ahead = 7;
    return { kind: "weekday", date: today.plus({ days: ahead }), text: w[0].trim() };
  }
  return null;
}
