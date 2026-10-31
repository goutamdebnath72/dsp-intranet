// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/originPrompt.selftest.ts
// A question about promotees (JO) or direct recruits gets the ticket rule in its prompt; every other question's prompt is untouched (the prompt has a size limit).

import { buildPrompt, isOriginQuestion } from "./prompt";
import { guardSql } from "./guard";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

for (const q of ["how many promotee officers are there in each department", "list all JOs in C&IT", "show promoted officers who are DGM", "how many direct recruits are there", "list MT executives", "management trainee executives in BF", "promoty officers in the plant garage", "list the MTs", "how many MTs are there", "how many jo are there", "Direct Recruit GMs"]) {
  ok(`a question about origin is recognised: ${q}`, isOriginQuestion(q));
}
for (const q of ["how many executives work in each section of C&IT", "list the GMs of the plant", "who is more senior, Mohd Anwar Ullah or Rana Saha", "which designation has the most executives", "show the directors", "how many people have a health check-up on 5 January 2026", "everyone whose surname is Joshi", "list employees whose name starts with joy"]) {
  ok(`an ordinary question is not: ${q}`, !isOriginQuestion(q));
}

const context = { designations: [], departments: [] } as never;
const withDoc = buildPrompt({ question: "how many promotee officers are in each department", context, examples: [] });
const without = buildPrompt({ question: "how many executives are in each department", context, examples: [] });
ok("the prompt of a promotee question holds the ticket rule", withDoc.includes("substr(ticket_no, 2, 1) <> '9'") && withDoc.includes("substr(ticket_no, 2, 1) = '9'"), withDoc.slice(0, 80));
ok("...and says that JO is a DESIGNATION (Junior Officer), not a class", /JO.{0,40}Junior Officer.{0,20}is a DESIGNATION/s.test(withDoc) && /lower\(designation\) LIKE 'junior officer%'/.test(withDoc), withDoc.slice(0, 80));
ok("an ordinary question's prompt does not hold it (no cost)", !without.includes("substr(ticket_no") && !without.includes("PROMOTEES AND DIRECT RECRUITS"));
ok("the extra text is modest (under 2200 characters), only for those questions", withDoc.length - without.length > 400 && withDoc.length - without.length < 2200, `${withDoc.length - without.length}`);

// the SQL the rule teaches passes the real guard
for (const sql of [
  "SELECT department_code, department, count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND substr(ticket_no, 2, 1) <> '9' GROUP BY department_id, department_code, department ORDER BY count DESC, department_code",
  "SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE cohort = 'executive' AND substr(ticket_no, 2, 1) = '9' AND designation = 'Dy. General Manager' ORDER BY global_seniority_rank",
  "SELECT CASE WHEN substr(ticket_no, 2, 1) = '9' THEN 'Direct recruits' ELSE 'Promotees' END AS origin, count(*) AS count FROM nlq.employees WHERE cohort = 'executive' GROUP BY 1",
  "SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE cohort = 'executive' AND lower(designation) LIKE 'junior officer%' ORDER BY global_seniority_rank",
]) {
  const g = guardSql(sql);
  ok(`the guard accepts the promotee SQL: ${sql.slice(0, 60)}...`, g.ok === true, JSON.stringify(g).slice(0, 160));
}

console.log(`originPrompt selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
