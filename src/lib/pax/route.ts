// src/lib/pax/route.ts
//
// THE PAX / CONTACT ROUTE (steps 63a and 63b). "pax number", "phone number" and "contact number" are ONE keyword; the SUBJECT decides what number is meant (owner, 31 Oct 2026):
//   1. a department or place of the PAX directory (a full match)           -> its PAX number                         (answer.ts: the card, the number as the big headline)
//   2. a PERSON who is an executive (ticket 4xxxxx), by name or by ticket   -> his or her CUG mobile number, masked, with the existing Reveal button   (people.ts)
//   3. a department or place with a spelling slip                           -> its PAX number, the correction said
//   4. anything else                                                        -> not ours (a bare "contact number of ..." goes on to the other routes as before); with the word "pax" an honest "Not found"
// The department is tried BEFORE the person: a subject that is a directory entry is never a person's name by accident, and the directory read is already in memory.
// A non-executive person is not answered here (no rule was given): the question goes on unchanged.
//
// SECURITY: this file reads with the application's OWN connection (getDb()), never with the language model's read-only client (withDefaultClient is the nlq_reader role when NL2SQL_DATABASE_URL is set, and the PAX table
// is closed to that role on purpose). The people lookups are the existing ones (employeeSearch.ts); the CUG number stays masked, the Reveal button keeps its login check and audit row.

import type { AnalyticsPayload } from "@/lib/employees/analytics";
import type { EmployeeResult } from "@/lib/search/employeeSearch";
import { answerPax, type PaxAnswer } from "./answer";
import { matchByName, planPaxQuery, type PaxRow } from "./matcher";
import { buildPeopleAnswer, isExecutiveTicket, MAX_NAME_WORDS, namedPeople, subjectWords, type PeopleAnswer } from "./people";

export interface ContactDeps {
  loadPax: () => Promise<PaxRow[]>;
  findByName: (name: string) => Promise<EmployeeResult[]>;
  findByTicket: (ticket: string) => Promise<EmployeeResult[]>;
}

const paxPayload = (a: PaxAnswer | null): AnalyticsPayload | null => (a ? { kind: "count", answer: a.summary, hospital: a.card, interpretation: a.interpretation } : null);

const peoplePayload = (a: PeopleAnswer): AnalyticsPayload => ({
  kind: "count",
  count: a.total,
  answer: a.summary,
  headline: a.headline,
  people: a.people,
  interpretation: a.interpretation,
  listTruncated: a.truncated,
});

export async function answerContact(typed: string, deps: ContactDeps): Promise<AnalyticsPayload | null> {
  const plan = planPaxQuery(typed);
  if (!plan) return null;

  // the subject is a person, by ticket
  if (plan.kind === "person") {
    if (!isExecutiveTicket(plan.ticket)) return null;
    const found = await deps.findByTicket(plan.ticket).catch(() => [] as EmployeeResult[]);
    const a = buildPeopleAnswer(`ticket ${plan.ticket}`, found.filter((p) => String(p.ticketNo).trim() === plan.ticket));
    return a ? peoplePayload(a) : null;
  }

  // a question that can only be about the directory (a list, a count, an area, a fault, a number) never looks for a person
  const words = plan.kind === "name" ? subjectWords(plan.tokens) : [];
  const mayBeAPerson = plan.kind === "name" && !plan.fault && !plan.count && plan.area === null && words.length > 0 && words.length <= MAX_NAME_WORDS;
  if (!mayBeAPerson || plan.kind !== "name") return paxPayload(await answerPax(typed, deps.loadPax));

  // 1. a department or place that matches in full
  let rows: PaxRow[] | null = null;
  try {
    rows = await deps.loadPax();
  } catch {
    rows = null;
  }
  if (rows && matchByName(rows, plan.tokens, true).rows.length > 0) return paxPayload(await answerPax(typed, async () => rows as PaxRow[]));

  // 2. an executive named in full
  const subject = words.join(" ");
  const found = await deps.findByName(subject).catch(() => [] as EmployeeResult[]);
  const people = buildPeopleAnswer(subject, namedPeople(plan.tokens, found));
  if (people) return peoplePayload(people);

  // 3 and 4. a spelling slip in a department's name, an honest "Not found" (the word pax), or not ours
  return paxPayload(await answerPax(typed, rows ? async () => rows as PaxRow[] : deps.loadPax));
}

/** The entry point the omnibar calls: the real database, the existing people searches. */
export async function answerPaxRoute(typed: string): Promise<AnalyticsPayload | null> {
  const { getDb } = await import("@/lib/db");
  const { loadPaxRows } = await import("./store");
  const { searchEmployeesById, searchEmployeesByName } = await import("@/lib/search/employeeSearch");
  return answerContact(typed, {
    loadPax: () => loadPaxRows(async (sql, params) => (await getDb()).query(sql, params)),
    findByName: async (name) => searchEmployeesByName(await getDb(), name),
    findByTicket: async (ticket) => searchEmployeesById(await getDb(), { kind: "ticket", value: ticket }),
  });
}
