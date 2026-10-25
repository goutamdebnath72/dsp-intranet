// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/departmentAsk.selftest.ts
// The clarifying question's machinery (still used by the hospital route and kept for any future word that really has to be asked about): the question that is searched for is the person's OWN
// question with the ticked options named, for EVERY combination of ticks. (The words "garage" and "refractory" are no longer asked about: departmentWords.selftest.ts.)

import real from "./__fixtures__/departments.real.json";
import { garageAsk, refractoryAsk } from "./__fixtures__/askExamples";
import { HAS_CODE, isAboutPeopleOrBare, queryFor, type DepartmentAsk } from "./departmentAsk";
import { resolveDepartmentWords } from "./departmentWords";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const rows = real as { id: number; code: number; name: string }[];

// ---- the single-option question
const g = garageAsk("how many executives are there in garage");
ok("one option ticked: the question names it, the rest of the question is untouched", queryFor(g, ["plant"]) === "how many executives are there in plant garage");
ok("nothing ticked: nothing to search", queryFor(g, []) === "" && queryFor(g, ["nothing-like-this"]) === "");
ok("a question about people has no documents option; a bare word has one", g.documents === undefined && garageAsk("garage", true).documents?.query === "circular about garage");

// ---- the three-option question: every option is a REAL row of the list
const r = refractoryAsk("how many executives are there in refractory, list them?");
ok("three options, each a REAL row of the list: the same name and code as in the 300 rows", r.options.length === 3 && r.options.every((o) => rows.some((d) => o.label === `${d.name} (code ${d.code})`)), JSON.stringify(r.options.map((o) => o.label)));
ok("...and they are all the refractory rows of the list (no other row has the word)", rows.filter((d) => /refractory/i.test(d.name)).length === 3);
ok("one ticked: the question names it by name and code", queryFor(r, ["coke"]) === "how many executives are there in COKE OVEN REFRACTORY (code 86600), list them?");
ok("two ticked: joined with 'and'", queryFor(r, ["refractory", "coke"]) === "how many executives are there in REFRACTORY (code 86000) and COKE OVEN REFRACTORY (code 86600), list them?");
ok("all three ticked: a comma and an 'and', in the order of the list whatever the order of the ticks", queryFor(r, ["coke", "office", "refractory"]) === "how many executives are there in REFRACTORY (code 86000), REFRACTORY (OFFICE) (code 86030) and COKE OVEN REFRACTORY (code 86600), list them?");
const subsets = (ids: string[]): string[][] => ids.reduce<string[][]>((acc, id) => acc.concat(acc.map((s) => [...s, id])), [[]]).filter((s) => s.length > 0);
ok("three options have 7 combinations of ticks, and every one is possible (radio buttons could offer 3)", subsets(r.options.map((o) => o.id)).length === 7);

// ---- a question that names a department by name AND code is never changed or asked about again
ok("a code marker is recognised", HAS_CODE.test("executives in REFRACTORY (code 86000)") && HAS_CODE.test("staff in X (code 103)") && !HAS_CODE.test("executives in refractory"));
for (const s of subsets(r.options.map((o) => o.id))) {
  const q = queryFor(r, s);
  ok(`no loop: ticks [${s}] -> "${q.slice(0, 60)}..." is left alone by the department words`, resolveDepartmentWords(q) === null);
}
ok("no loop for the garage question either", resolveDepartmentWords(queryFor(g, ["plant"])) === null);

// ---- the rewriting by a pattern (used by the doctor and the unit questions) and by a plain word
const withPattern: DepartmentAsk = { message: "m", word: "opd", question: "is opd open on monday?", options: [{ id: "m", label: "Medicine", phrase: "Medicine OPD" }], none: { label: "n", reply: "r" }, pattern: "\\bopd\\b" };
ok("a pattern finds the words to replace", queryFor(withPattern, ["m"]) === "is Medicine OPD open on monday?");
ok("if the words are not found, the phrase is added at the end", queryFor({ ...withPattern, pattern: undefined, word: "zzz" }, ["m"]) === "is opd open on monday? Medicine OPD");

// ---- the people-or-bare test
ok("the people-or-bare test", isAboutPeopleOrBare("executives in x") && isAboutPeopleOrBare("garage") && isAboutPeopleOrBare("garage staff") && !isAboutPeopleOrBare("what is the tender for the new garage"));

console.log(`departmentAsk selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
