// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/healthPayload.selftest.ts
// Step 61a: the REAL payload builder (toPayload) gives a health check-up lookup of one person its clean answer first: the date asked for, or the department asked for.

import { toPayload } from "./omnibar";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const columns = ["ticket_no", "name", "department_code", "department", "checkup_date", "circular"];
const row = (t: string, n: string, dep: string, d: string) => ({ ticket_no: t, name: n, department_code: "32000", department: dep, checkup_date: d, circular: "Circular 010 (2025)" });
const person = (t: string, n: string, dep: string): any => ({ id: t, ticketNo: t, name: n, designation: "Sr. Operator", departmentCode: "32000", department: dep, cohort: "nonexecutive" });
const result = (question: string, rows: any[]): any => ({ ok: true, question, sql: "SELECT ...", logId: 1, confidence: "high", attempts: 1, elapsedMs: 5, source: "nl2sql", understoodAs: "The health check-up of one ticket.", scope: null, display: null, data: { columns, rows, total: rows.length, truncated: false, pageable: false } });
const pay = (q: string, rows: any[], people: any[]): any => toPayload(result(q, rows), people, "T", 1);

const one = [row("266288", "BIPAD TARAN KUNDU", "SMS-BOF (OPRN)", "2026-01-05")];
const p1 = [person("266288", "BIPAD TARAN KUNDU", "SMS-BOF (OPRN)")];
ok("'when is the health check-up of ticket 266288?': the headline is the date (HC-5)", pay("when is the health check-up of ticket 266288?", one, p1).headline?.text === "05 Jan 2026");
ok("...the person and the row are still there under it", pay("when is the health check-up of ticket 266288?", one, p1).people?.length === 1);
ok("'which department is ticket 266288 in for the health check-up?': the department", pay("which department is ticket 266288 in for the health check-up?", one, p1).headline?.text === "SMS-BOF (OPRN)");
ok("'show the health check-up of ticket 266288': no headline (it asks neither when nor which department)", pay("show the health check-up of ticket 266288", one, p1).headline === undefined);
const three = ["1", "2", "3"].map((t) => row(t, "P" + t, "D", "2026-01-05"));
ok("'who has the health check-up on 5 January 2026?': a list keeps its count, no headline", (() => { const p = pay("who has the health check-up on 5 January 2026?", three, three.map((r) => person(r.ticket_no, r.name, "D"))); return p.headline === undefined && p.count === 3; })());
const twice = [row("205840", "SUBHASISH GOSWAMI", "SMS-CCP (OPRN)", "2024-12-23"), row("205840", "SUBHASISH GOSWAMI", "SMS-CCP (OPRN)", "2024-12-26")];
ok("a ticket on the list twice: both dates (the verified answer for ticket 205840)", pay("when is the health check-up of ticket 205840?", twice, [person("205840", "SUBHASISH GOSWAMI", "SMS-CCP (OPRN)")]).headline?.text === "23 Dec 2024 and 26 Dec 2024");
ok("a payload that is not a health check-up answer never gets one", pay("list the employees of chrd", one, p1).headline === undefined);
console.log(`healthPayload selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
