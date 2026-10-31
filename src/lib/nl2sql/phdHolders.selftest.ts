// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/phdHolders.selftest.ts
// Step 56b: "who are the PhD holders" is answered from the list kept by hand (DR_TICKETS), not from a circular. 26 Oct 2026: "name of the employee who is phd holder" answered "Dr. Partha Mukhopadhyay" from
// the circular "List of Nodal Officers ... for SIR": a nodal officer's column read as a qualification, the designation of December 2025, nobody else possible.

import { DR_TICKETS } from "../employees/honorific";
import { guardSql } from "./guard";
import { PHD_NONE, PHD_UNDERSTOOD, answerPhd, isPhdQuestion, phdNote, phdSql } from "./phdHolders";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

// ---- the three questions of the owner, and the way people ask
const taken = [
  "list the name of employees who are phd holder with their department", "name of the employee who is phd holder", "name of the employee with his department who is phd holder",
  "who are the phd holders", "how many phd holders are there", "list of employees with PhD", "list the Ph.D holders", "which employees have a doctorate", "show phd holders in the plant",
  "number of phd holders in dsp", "list of phd holders", "names of the employees having phd",
];
for (const q of taken) ok(`taken: ${q}`, isPhdQuestion(q));
// ---- what must NOT be taken: a rule, a paper, a department, a different subject
const left = [
  "phd sponsorship policy for employees", "circular about phd leave", "phd holders in electrical department", "list of phd holders in the stores department", "scholarship for phd for employees",
  "how to apply for phd study leave", "who is the nodal officer for phd holders", "list of employees", "phd", "phd holders of mechanical dept", "phd holders from c&it", "list of DNB doctors", "who are the doctors",
];
for (const q of left) ok(`left alone: ${q}`, !isPhdQuestion(q));
ok("an empty or missing question is left alone", !isPhdQuestion("") && !isPhdQuestion(undefined as never));

// ---- the SQL: by ticket, six digits, once each, through the guard
ok("the list of the owner is 440480 (Partha Mukhopadhyay, 24 Oct 2026) and 497823 (Gautam Kumar Mandal, IED, 27 Oct 2026)", DR_TICKETS.length >= 2 && DR_TICKETS.includes("440480") && DR_TICKETS.includes("497823"));
const sql = phdSql(["440480", "440480", " 123456 ", "12345", "ABCDEF", "4404801"]) as string;
ok("only six-digit tickets, each once, in order", sql.includes("IN ('440480', '123456')") && !sql.includes("12345'") && !sql.includes("ABCDEF") && !sql.includes("4404801"), sql);
ok("no ticket, no SQL", phdSql([]) === null && phdSql(["x", "12"]) === null);
ok("the SQL passes the same guard as every model SQL (one read-only SELECT on nlq.employees)", guardSql(sql).ok === true && guardSql(phdSql(DR_TICKETS) as string).ok === true);
ok("it gives the directory's designation and department (as they are today), in seniority order", /SELECT e\.ticket_no, e\.name, e\.designation, e\.department_code, e\.department FROM nlq\.employees e/.test(sql) && /ORDER BY e\.global_seniority_rank$/.test(sql));

// ---- the words
ok("the note says: not in the directory, kept by hand, how many, may be incomplete, who to ask", phdNote(1) === "PhD holders are not recorded in the employee directory (it holds no qualifications): this list is kept by hand, with 1 person so far, so it may be incomplete. Ask the intranet team to add a ticket number." && phdNote(3).includes("with 3 people so far"), phdNote(1));
ok("what was understood says that the list is kept by hand", PHD_UNDERSTOOD.includes("kept by hand") && PHD_NONE.includes("kept by hand is empty"));

(async () => {
  const noDb = { withClient: async () => { throw new Error("the database must not be touched"); } } as never;
  ok("not a PhD question: null, no database", (await answerPhd("how many executives are there in c&it", noDb)) === null);
  ok("an empty list: the plain statement, no database", JSON.stringify(await answerPhd("who are the phd holders", noDb, [])) === JSON.stringify({ kind: "none", text: PHD_NONE }));
  ok("a list with no valid ticket: the same", (await answerPhd("who are the phd holders", noDb, ["x"]))?.kind === "none");
  console.log(`phdHolders selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
