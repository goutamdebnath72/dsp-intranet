// src/lib/peopleEvents/query.ts
//
// WHO IS IN THE LISTS TODAY (step 65a). One read of the roster (public.employee_roster) for the three lists of the widget: birthdays today, retirements this month, silver jubilees this month.
// The day is the day in India. The rules are in rules.ts; the SQL below is the same rules, and the tests check the two against each other on thousands of rows.
// WHAT LEAVES THIS FILE: the name, the designation, the department, the photo address, and for a retirement the farewell day, for a jubilee the anniversary day. NEVER a date of birth or a date of joining.
// The reader is the application's own connection (never the AI search's read-only role).

import { DateTime } from "luxon";
import type { QueryFn } from "@/lib/pax/store";
import { formatDepartmentDisplay } from "@/lib/employees/sailDepartments";
import { isoDay, jubileeDate, JUBILEE_YEARS, retirementDate, RETIREMENT_AGE, todayIST } from "./rules";

export interface PersonEvent {
  id: number;
  name: string;
  designation: string;
  department: string;
  /** The photo (the person's `image` in the user table), or null: the card then draws the initials. */
  imageUrl: string | null;
  /** For a retirement: the farewell day (the last day of the month). For a silver jubilee: the day the 25th year is completed. Empty for a birthday. "YYYY-MM-DD". */
  on: string | null;
}

export interface PeopleEvents {
  /** Today in India, "YYYY-MM-DD". */
  today: string;
  monthLabel: string;
  monthEnd: string;
  birthdays: PersonEvent[];
  retirements: PersonEvent[];
  jubilee: PersonEvent[];
}

/** Only an address that is a web address or a path of this site is a photo; anything else (a script, a data address) is not trusted. */
export const safeImageUrl = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^https?:\/\/[^\s]+$/i.test(s) || /^\/[^\s/][^\s]*$/.test(s) ? s : null;
};

/** The one read of the roster (parameters: month, day, leap-day flag, retirement age, today, jubilee years). Exported so the test can time it and look at its plan. */
export const PEOPLE_EVENTS_SQL = `SELECT x.* FROM (
       SELECT er.id, er.name, dg.title AS designation, sd.name AS department, u.image, er.dates_source,
              er.date_of_birth::text AS dob, er.date_of_joining::text AS doj, er.global_seniority_rank,
              (er.date_of_birth IS NOT NULL AND (
                 (EXTRACT(MONTH FROM er.date_of_birth) = $1 AND EXTRACT(DAY FROM er.date_of_birth) = $2)
                 OR ($3::boolean AND EXTRACT(MONTH FROM er.date_of_birth) = 2 AND EXTRACT(DAY FROM er.date_of_birth) = 29)
              )) AS is_birthday,
              (er.date_of_birth IS NOT NULL
                 AND date_trunc('month', (er.date_of_birth + make_interval(years => $4))::timestamp) = date_trunc('month', $5::date::timestamp)) AS is_retiring,
              (er.date_of_joining IS NOT NULL
                 AND date_trunc('month', (er.date_of_joining + make_interval(years => $6))::timestamp) = date_trunc('month', $5::date::timestamp)) AS is_jubilee
         FROM public.employee_roster er
         JOIN public.designation_grade dg ON dg.id = er.designation_grade_id
         LEFT JOIN public.sail_department sd ON sd.id = er.sail_department_id
         LEFT JOIN public."user" u ON u.id = er.user_id
     ) x
     WHERE x.is_birthday OR x.is_retiring OR x.is_jubilee
     ORDER BY x.global_seniority_rank, x.name`;

export async function fetchPeopleEvents(query: QueryFn, now: DateTime = DateTime.now()): Promise<PeopleEvents> {
  const today = todayIST(now);
  const leapDayBirthdaysToday = today.month === 2 && today.day === 28 && !today.isInLeapYear;
  const rows = await query(
    PEOPLE_EVENTS_SQL,
    [today.month, today.day, leapDayBirthdaysToday, RETIREMENT_AGE, isoDay(today), JUBILEE_YEARS],
  );
  const card = (r: Record<string, unknown>, on: string | null): PersonEvent => ({
    id: Number(r.id),
    name: String(r.name ?? "").trim(),
    designation: String(r.designation ?? "").trim(),
    department: formatDepartmentDisplay(String(r.department ?? "").trim()) ?? "",
    imageUrl: safeImageUrl(r.image),
    on,
  });
  const out: PeopleEvents = { today: isoDay(today), monthLabel: today.toFormat("LLL"), monthEnd: isoDay(today.endOf("month").startOf("day")), birthdays: [], retirements: [], jubilee: [] };
  for (const r of rows) {
    if (r.is_birthday === true) out.birthdays.push(card(r, null));
    if (r.is_retiring === true && r.dob) out.retirements.push(card(r, isoDay(retirementDate(String(r.dob)))));
    if (r.is_jubilee === true && r.doj) out.jubilee.push(card(r, isoDay(jubileeDate(String(r.doj)))));
  }
  return out;
}
