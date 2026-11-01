// src/lib/peopleEvents/datesLookup.ts
//
// THE DATE OF BIRTH AND THE DATE OF JOINING, BY THE SEARCH BAR, FOR THE HOD OF C&IT ONLY (step 65b; owner, 1 Nov 2026).
//   - a sentence that asks for one of those facts about a person who IS an employee (datesIntent.ts reads it; the people directory confirms the person) is answered ONLY when the person asking is the HOD of C&IT
//     (SUPERADMIN_TICKETS, by the LOGIN's ticket; an authorised executive of the PAX editor is not the HOD and is refused like everybody else);
//   - everybody else, logged in or not, gets one plain sentence, and the database is not even asked for the dates;
//   - a sentence that is not about an employee (a circular about retirement benefits, an age limit) is not ours: null, and the other routes answer as before.
// This is one of the TWO files that read the date columns (the other is query.ts, the lists); a test fails if any other file ever does.
// The reader is the application's own connection (never the AI search's read-only role, which cannot see these columns anyway).

import { DateTime } from "luxon";
import type { AnalyticsPayload } from "@/lib/employees/analytics";
import type { EmployeeResult } from "@/lib/search/employeeSearch";
import type { HospitalAnswer } from "@/lib/hospital/types";
import { namedPeople } from "@/lib/pax/people";
import type { QueryFn } from "@/lib/pax/store";
import { detectDatesQuery, type DateField } from "./datesIntent";
import { isoDay, parseDay, retirementDate, todayIST } from "./rules";

export const REFUSAL = "Dates of birth and dates of joining can be looked up only by the HOD of C&IT.";
const MAX_PEOPLE = 8;

export interface DatesRow { ticket: string; dob: string | null; doj: string | null }

/** The two dates of some employees, by ticket number. */
export async function readDates(query: QueryFn, tickets: string[]): Promise<DatesRow[]> {
  const rows = await query(`SELECT er.ticket_no, er.date_of_birth::text AS dob, er.date_of_joining::text AS doj FROM public.employee_roster er WHERE er.ticket_no = ANY($1::text[])`, [tickets]);
  return rows.map((r) => ({ ticket: String(r.ticket_no).trim(), dob: r.dob ? String(r.dob) : null, doj: r.doj ? String(r.doj) : null }));
}

export interface DatesDeps {
  /** The HOD of C&IT, by the ticket of the LOGIN (SUPERADMIN_TICKETS). */
  isHod: (ticket: string | null) => boolean;
  findByName: (name: string) => Promise<EmployeeResult[]>;
  findByTicket: (ticket: string) => Promise<EmployeeResult[]>;
  datesOf: (tickets: string[]) => Promise<DatesRow[]>;
  now?: DateTime;
}

const message = (headline: string, tone: "unknown" | "no", text: string): AnalyticsPayload => {
  const card: HospitalAnswer = { title: "Dates of an employee", headline: { text: headline, tone }, status: { tone: tone === "no" ? "closed" : "unknown", text } };
  return { kind: "count", answer: text, hospital: card };
};

const day = (iso: string | null): string => (iso ? parseDay(iso).toFormat("dd LLL yyyy") : "Not on record");
const span = (from: DateTime, to: DateTime): string => {
  const d = to.diff(from, ["years", "months"]);
  const y = Math.floor(d.years), m = Math.floor(d.months);
  return `${y} year${y === 1 ? "" : "s"} ${m} month${m === 1 ? "" : "s"}`;
};

const COLUMN: Record<DateField, string | null> = { dob: null, doj: null, age: "Age", retirement: "Retires on", service: "Service" };

export async function answerDates(typed: string, ticket: string | null, deps: DatesDeps): Promise<AnalyticsPayload | null> {
  const q = detectDatesQuery(typed);
  if (!q) return null;
  const hod = deps.isHod(ticket);

  // who is meant (the directory confirms that the person exists; a sentence about nobody here is not ours)
  let people: EmployeeResult[];
  try {
    people = q.ticket
      ? (await deps.findByTicket(q.ticket)).filter((p) => String(p.ticketNo).trim() === q.ticket)
      : namedPeople(q.words, await deps.findByName(q.words.join(" ")));
  } catch {
    return null;
  }
  if (people.length === 0) return null;

  if (!hod) return message("Not allowed", "no", REFUSAL);

  const shown = people.slice(0, MAX_PEOPLE);
  let dates: DatesRow[];
  try {
    dates = await deps.datesOf(shown.map((p) => String(p.ticketNo).trim()));
  } catch {
    return message("Not available", "unknown", "The dates could not be read just now. Please try again.");
  }
  const today = todayIST(deps.now);
  const by = new Map(dates.map((d) => [d.ticket, d]));
  const extra = q.fields.filter((f) => COLUMN[f]);
  const rowOf = (p: EmployeeResult) => {
    const d = by.get(String(p.ticketNo).trim());
    const dob = d?.dob ?? null, doj = d?.doj ?? null;
    const cells = [p.name, String(p.ticketNo), day(dob), day(doj)];
    for (const f of extra) {
      cells.push(f === "age" ? (dob ? span(parseDay(dob), today) : "Not on record") : f === "retirement" ? (dob ? day(isoDay(retirementDate(dob))) : "Not on record") : doj ? span(parseDay(doj), today) : "Not on record");
    }
    return { cells, dob, doj };
  };
  const rows = shown.map(rowOf);
  const first = q.fields[0];
  const one = shown.length === 1 ? rows[0] : null;
  const asked = !one ? `${shown.length} people` : first === "dob" ? day(one.dob) : first === "doj" ? day(one.doj) : one.cells[4 + extra.indexOf(first)];
  const label = q.fields.map((f) => ({ dob: "date of birth", doj: "date of joining", age: "age", retirement: "retirement date", service: "length of service" })[f]).join(" and ");
  const name = one ? shown[0].name : q.words.join(" ") || q.ticket || "";
  const card: HospitalAnswer = {
    title: `${label[0].toUpperCase()}${label.slice(1)}: ${name}`,
    headline: { text: asked, tone: asked === "Not on record" ? "unknown" : "info" },
    status: { tone: "info", text: one ? `${one.cells[0]} (${one.cells[1]}): date of birth ${one.cells[2]}, date of joining ${one.cells[3]}.` : `${shown.length} employees match.` },
    table: { columns: ["Name", "Ticket", "Date of birth", "Date of joining", ...extra.map((f) => COLUMN[f] as string)], rows: rows.map((r) => r.cells) },
  };
  return { kind: "count", answer: card.status?.text ?? "", hospital: card, interpretation: `${label[0].toUpperCase()}${label.slice(1)} of ${name} (shown to the HOD of C&IT only)` };
}
