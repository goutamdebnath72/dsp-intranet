// src/lib/nl2sql/phdHolders.ts
//
// "Who are the PhD holders?" (step 56b).
// The employee directory holds no qualification. The system knows its PhD holders from ONE source: the list the owner keeps by hand, DR_TICKETS in employees/honorific.ts (a non-medical employee
// with a PhD who writes "Dr." before the name). Before this step such a question went to the circulars: on 26 Oct 2026 "name of the employee who is phd holder" answered "Dr. Partha Mukhopadhyay" from
// the circular "List of Nodal Officers ... for SIR", labelled "PhD holder" only because the name carries "Dr." and with the designation of December 2025 (Jr. Mgr.): the right person by accident, a
// nodal officer's column read as a qualification, and no way to know of anybody else. Now the question is answered from the list itself, by ticket, from the directory (designation and department
// as they are today), with the plain statement that the list is kept by hand and may be incomplete. No model call: nothing can be misread.
//
// Only a question that asks WHO the PhD holders are. A question about a policy, a scholarship, leave, a circular ..., or one that names a department ("PhD holders in electrical"), is not taken (a
// department filter would need the department of each person, and the list must not answer another department's question with the one person it has).

import { DR_TICKETS } from "../employees/honorific";
import { guardSql } from "./guard";
import { runReadOnly, type ExecOptions } from "./executor";
import type { PipelineResult, SqlClient } from "./types";

const PHD_WORD = /\b(ph\.?\s?d\.?|doctorates?|doctoral)\b/i;
const ASKS_WHO = /\b(who|whom|names?|list|lists|employees?|persons?|people|staff|officers?|executives?|holders?|how many|number of|show|which)\b/i;
/** A question about a rule, a scheme, a paper: for the circulars, not for the list of people. */
const ABOUT_A_DOCUMENT = /\b(policy|policies|scheme|schemes|rules?|leave|sponsor\w*|scholarship\w*|fellowship\w*|incentive\w*|allowances?|permission|circulars?|notices?|apply|applying|application\w*|guidelines?|forms?|eligib\w*|study|course|courses|registration|fees?|advance|increments?|nodal|sir)\b/i;
/** "in electrical", "of the stores department": a department is named. "of employees", "of the employee", "in the plant", "in dsp" are not departments. */
const NAMES_A_DEPARTMENT = /\b(?:in|from|under|at|within|of)\s+(?:the\s+)?(?!(?:employees?|persons?|people|staff|executives?|non|all|dsp|plant|company|sail|steel|this|our|us|them|those|whom|who|their|his|her|its|a|an|the|any|each|every|ph\.?\s?d|doctorates?|doctoral|holders?)\b)[a-z]/i;

/** Is this a question that asks who the PhD holders are? */
export function isPhdQuestion(q: string): boolean {
  const s = String(q ?? "");
  return PHD_WORD.test(s) && ASKS_WHO.test(s) && !ABOUT_A_DOCUMENT.test(s) && !NAMES_A_DEPARTMENT.test(s);
}

/** The SELECT for the listed tickets (six digits each, once each), or null when there are none. The directory gives the designation and the department as they are today. */
export function phdSql(tickets: readonly string[]): string | null {
  const t = [...new Set(tickets.map((x) => String(x).trim()).filter((x) => /^\d{6}$/.test(x)))];
  if (!t.length) return null;
  return `SELECT e.ticket_no, e.name, e.designation, e.department_code, e.department FROM nlq.employees e WHERE e.ticket_no IN (${t.map((x) => `'${x}'`).join(", ")}) ORDER BY e.global_seniority_rank`;
}

export const PHD_UNDERSTOOD = "The employees recorded as PhD holders on the list kept by hand, with ticket number, name, designation and department.";
export const phdNote = (n: number): string =>
  `PhD holders are not recorded in the employee directory (it holds no qualifications): this list is kept by hand, with ${n} ${n === 1 ? "person" : "people"} so far, so it may be incomplete. Ask the intranet team to add a ticket number.`;
export const PHD_NONE = "No PhD holder is recorded yet: the employee directory holds no qualifications, and the list of PhD holders kept by hand is empty or names nobody in the directory.";

export type PhdAnswer = { kind: "people"; res: Extract<PipelineResult, { ok: true }>; note: string } | { kind: "none"; text: string };

/** The answer to a question that asks who the PhD holders are, or null when the question is not one. */
export async function answerPhd(
  q: string,
  deps: { withClient: <T>(fn: (c: SqlClient) => Promise<T>) => Promise<T>; exec?: ExecOptions },
  tickets: readonly string[] = DR_TICKETS,
): Promise<PhdAnswer | null> {
  if (!isPhdQuestion(q)) return null;
  const sql = phdSql(tickets);
  if (!sql) return { kind: "none", text: PHD_NONE };
  const g = guardSql(sql);
  if (!g.ok) return null;
  const data = await deps.withClient((c) => runReadOnly(c, g.sql, deps.exec));
  if (data.total === 0) return { kind: "none", text: PHD_NONE };
  return {
    kind: "people",
    note: phdNote(data.total),
    res: { ok: true, question: q, sql: g.sql, understoodAs: PHD_UNDERSTOOD, confidence: "high", data, scope: null, display: { view: "cards", title: "PhD holders" }, source: "nl2sql", attempts: 0, elapsedMs: 0, logId: null } as Extract<PipelineResult, { ok: true }>,
  };
}
