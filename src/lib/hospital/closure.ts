// src/lib/hospital/closure.ts
// Is the OPD open on a date? Sundays; the fixed-date closures the owner listed (24 Oct 2026); the plant's closed holidays (CH) and the puja holidays from the holiday data of that year.
// A plant holiday that is NOT in the OPD closure list is reported as "not known", never guessed either way. The list is not complete and grows with the data file.

import type { DateTime } from "luxon";
import { SCHEDULE, WEEKDAY_BY_ISO } from "./opdData";

export interface HolidayHit { name: string; type: "CH" | "FH" | "RH"; categories: string | null }
/** The holidays on one date (ISO yyyy-LL-dd), and whether that year is loaded at all. Production: holidaysOn.ts (the database); the tests use the curated JSON files. */
export type HolidaysOn = (iso: string) => Promise<{ yearLoaded: boolean; hits: HolidayHit[] }>;

export interface Closure {
  state: "open" | "closed" | "unknown";
  reasons: string[];
  unknown: HolidayHit[];
  yearLoaded: boolean;
}

export async function opdClosure(date: DateTime, holidaysOn: HolidaysOn): Promise<Closure> {
  const rules = SCHEDULE.closure;
  const reasons: string[] = [];
  if (rules.weekly.includes(WEEKDAY_BY_ISO[date.weekday - 1])) reasons.push(WEEKDAY_BY_ISO[date.weekday - 1] === "SUN" ? "Sunday" : "weekly closure");
  const fixed = rules.fixed.filter((f) => f.month === date.month && f.day === date.day);
  for (const f of fixed) reasons.push(f.name);

  const { yearLoaded, hits } = await holidaysOn(date.toISODate() ?? "").catch(() => ({ yearLoaded: false, hits: [] as HolidayHit[] }));
  const unknown: HolidayHit[] = [];
  // a fixed closure on this date already explains the day: the holiday data adds nothing then (no duplicate reasons)
  if (fixed.length === 0) {
    for (const h of hits) {
      if (h.type === "RH") continue; // a restricted holiday is an optional leave: it does not close the OPD
      if (rules.holidayTypes.includes(h.type)) reasons.push(h.name);
      else if (h.type === "FH" && rules.holidayNameContains.some((w) => h.name.toLowerCase().includes(w))) reasons.push(`${h.name} (puja holiday)`);
      else unknown.push(h); // a festival holiday of the plant that is not in the OPD closure list: not known either way
    }
  }
  const state = reasons.length ? "closed" : unknown.length ? "unknown" : "open";
  return { state, reasons: [...new Set(reasons)], unknown, yearLoaded };
}
