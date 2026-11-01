// src/lib/peopleEvents/rules.ts
//
// THE DATE RULES OF THE "PEOPLE & EVENTS" WIDGET (step 65a; owner, 31 Oct 2026). PURE: no database, no React; dates are Luxon, the day is the day in INDIA (Asia/Kolkata).
//
//   Birthday          today is the day and month of the date of birth. A birthday on 29 February is kept on 28 February in a year that has none (so it is still celebrated in February).
//   Retirement        the age is 60. The farewell is the LAST DAY OF THE MONTH in which the person attains 60 (the company fixes the last date of a month as the farewell date): born 14 Oct 1966 -> 31 Oct 2026.
//                     (A person born on the 1st is treated the same way: the month of the 60th birthday. The rule that sends him one month earlier is NOT applied; ask before adding it.)
//   Silver jubilee    the 25th year of service is completed in the month in which date of joining + 25 years falls; the day shown is that anniversary.
//   Joining age       nobody joins below 18; an executive who joined DIRECTLY (a Management Trainee) not below 23: their ticket is 49xxxx (the second digit of an executive ticket never changes:
//                     9 = direct recruit, any other digit = promoted from the non-executives).
//
// A date of birth or of joining is a calendar DATE, written "YYYY-MM-DD", never a moment in time: it is read in the Indian zone so no machine's own zone can move it by a day.

import { DateTime } from "luxon";

export const ZONE = "Asia/Kolkata";
export const RETIREMENT_AGE = 60;
export const JUBILEE_YEARS = 25;
export const MIN_JOINING_AGE = 18;
export const MIN_JOINING_AGE_MT = 23;

/** Today in India, at the start of the day. */
export const todayIST = (now: DateTime = DateTime.now()): DateTime => now.setZone(ZONE).startOf("day");

/** "YYYY-MM-DD" -> that day in India (invalid when it is not a real date). */
export const parseDay = (iso: string): DateTime => DateTime.fromISO(String(iso).slice(0, 10), { zone: ZONE }).startOf("day");

export const isoDay = (d: DateTime): string => d.toISODate() as string;

/** A direct recruit (a Management Trainee): an executive whose ticket is 49xxxx. */
export const isMtTicket = (ticketNo: string, cohort: string): boolean => cohort === "executive" && /^49\d{4}$/.test(String(ticketNo).trim());
export const minJoiningAge = (ticketNo: string, cohort: string): number => (isMtTicket(ticketNo, cohort) ? MIN_JOINING_AGE_MT : MIN_JOINING_AGE);

/** Is today the birthday? 29 February is kept on 28 February in a year without one. */
export function isBirthdayOn(dob: string, today: DateTime): boolean {
  const b = parseDay(dob);
  const t = today.setZone(ZONE);
  if (!b.isValid || !t.isValid) return false;
  if (b.month === t.month && b.day === t.day) return true;
  return b.month === 2 && b.day === 29 && !t.isInLeapYear && t.month === 2 && t.day === 28;
}

/** The farewell day: the last day of the month in which the 60th birthday falls. */
export function retirementDate(dob: string): DateTime {
  return parseDay(dob).plus({ years: RETIREMENT_AGE }).endOf("month").startOf("day");
}
export function retiresInMonthOf(dob: string, today: DateTime): boolean {
  const r = retirementDate(dob);
  const t = today.setZone(ZONE);
  return r.isValid && r.year === t.year && r.month === t.month;
}

/** The day the 25th year of service is completed (29 February becomes 28 February in a year without one). */
export function jubileeDate(doj: string): DateTime {
  return parseDay(doj).plus({ years: JUBILEE_YEARS }).startOf("day");
}
export function jubileeInMonthOf(doj: string, today: DateTime): boolean {
  const j = jubileeDate(doj);
  const t = today.setZone(ZONE);
  return j.isValid && j.year === t.year && j.month === t.month;
}

/** Milliseconds from now to the next midnight in India (the lists change at 12:00 AM). */
export function msUntilNextMidnight(now: DateTime = DateTime.now()): number {
  const n = now.setZone(ZONE);
  return Math.max(1, n.plus({ days: 1 }).startOf("day").toMillis() - n.toMillis());
}

export interface DatesToCheck { dob: string | null; doj: string | null; ticketNo: string; cohort: string; today: DateTime }

/**
 * What is wrong with a pair of dates (empty list = fine). Used on the generated data and by the tests; the database enforces the two age rules itself (CHECK constraints), so this is the SECOND, independent check.
 */
export function checkDates(x: DatesToCheck): string[] {
  const out: string[] = [];
  if (!x.dob && !x.doj) return out;
  const today = x.today.setZone(ZONE).startOf("day");
  const dob = x.dob ? parseDay(x.dob) : null;
  const doj = x.doj ? parseDay(x.doj) : null;
  if (dob && !dob.isValid) out.push("date of birth is not a date");
  if (doj && !doj.isValid) out.push("date of joining is not a date");
  if (out.length) return out;
  if (dob && dob > today) out.push("born in the future");
  if (doj && doj > today) out.push("joined in the future");
  if (dob && doj) {
    const min = minJoiningAge(x.ticketNo, x.cohort);
    if (doj < dob.plus({ years: min })) out.push(`joined before the age of ${min}`);
  }
  // somebody still in service has not passed the farewell day
  if (dob && retirementDate(x.dob as string) < today) out.push("past the retirement day, yet in the list of employees");
  return out;
}
