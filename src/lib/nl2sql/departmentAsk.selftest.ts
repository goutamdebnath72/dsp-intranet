// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/departmentAsk.selftest.ts
// A department word with more than one meaning is asked about, never guessed; the question is clear; EVERY combination of ticks gives a question that is not asked about again.

import real from "./__fixtures__/departments.real.json";
import { askWhichDepartment, isAboutPeopleOrBare, queryFor, type DepartmentAsk } from "./departmentAsk";
import { runOmnibar } from "./omnibar";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const rows = real as { id: number; code: number; name: string }[];

// ---- garage
const g = askWhichDepartment("how many executives are there in garage")!;
ok("garage about people: the question names the word, says what the list holds, tells what to do", /^Which department do you mean by \u201Cgarage\u201D\?/.test(g.message) && /Plant Garage \(six sections\)/.test(g.message) && /Tick the one you mean, then press Continue\.$/.test(g.message), g.message);
ok("...one option: Plant Garage, and ticking it searches the SAME question with the clear name", g.options.length === 1 && g.options[0].label === "Plant Garage (all its sections)" && queryFor(g, ["plant"]) === "how many executives are there in plant garage");
ok("...nothing ticked: nothing to search", queryFor(g, []) === "");
ok("...None of these shows a reply that says the township garage has no row, and asks for the full name", /township garage/.test(g.none.reply) && /full name/.test(g.none.reply));
ok("a question about people has no documents option", g.documents === undefined);
const gb = askWhichDepartment("garage")!;
ok("a bare word is asked too, with a documents option", !!gb.documents && gb.documents.query === "circular about garage" && /documents \(circulars\) about \u201Cgarage\u201D instead/.test(gb.documents.label));
ok("...also with one more word: garage staff", !!askWhichDepartment("Garage staff"));
for (const q of ["how many executives are there in plant garage", "executives in township garage", "list the staff of town garage", "executives in M.H.E.M.D.", "people in mhemd", "executives in m h e o d"]) ok(`already clear: ${q}`, askWhichDepartment(q) === null);
ok("a question about documents is not asked (no people word, more than two words)", askWhichDepartment("what is the tender for the new garage building") === null);

// ---- refractory
const r = askWhichDepartment("how many executives are there in refractory, list them?")!;
ok("refractory about people: the question names the word and the number of rows and tells what to do", /^Which department do you mean by \u201Crefractory\u201D\?/.test(r.message) && /The HR list has three\./.test(r.message) && /Tick one or more, then press Continue\.$/.test(r.message), r.message);
ok("...three options, each a REAL row of the list: the same name and code as in the 300 rows", r.options.length === 3 && r.options.every((o) => rows.some((d) => o.label === `${d.name} (code ${d.code})`)), JSON.stringify(r.options.map((o) => o.label)));
ok("...and they are all the refractory rows of the list (no other row has the word)", rows.filter((d) => /refractory/i.test(d.name)).length === 3);
ok("one ticked: the question names it by name and code", queryFor(r, ["coke"]) === "how many executives are there in COKE OVEN REFRACTORY (code 86600), list them?");
ok("two ticked: joined with 'and'", queryFor(r, ["refractory", "coke"]) === "how many executives are there in REFRACTORY (code 86000) and COKE OVEN REFRACTORY (code 86600), list them?");
ok("all three ticked: a comma and an 'and', in the order of the list whatever the order of the ticks", queryFor(r, ["coke", "office", "refractory"]) === "how many executives are there in REFRACTORY (code 86000), REFRACTORY (OFFICE) (code 86030) and COKE OVEN REFRACTORY (code 86600), list them?");
const rb = askWhichDepartment("refractory")!;
ok("a bare word is asked too, with a documents option", !!rb.documents && rb.documents.query === "circular about refractory");
for (const q of ["how many executives are there in coke oven refractory", "executives in refractory office", "executives in refractory (office)", "staff of Coke Oven Refractory", "executives in REFRACTORY (code 86000)"]) ok(`already clear: ${q}`, askWhichDepartment(q) === null);
ok("refractories (the material, plural) is not the department word", askWhichDepartment("executives who buy refractories") === null);

// ---- no loop: EVERY non-empty combination of ticks, and the documents option, gives a question that is not asked about again
const subsets = (ids: string[]): string[][] => ids.reduce<string[][]>((acc, id) => acc.concat(acc.map((s) => [...s, id])), [[]]).filter((s) => s.length > 0);
for (const q of ["how many executives are there in garage", "garage", "how many executives are there in refractory, list them?", "refractory", "list the staff in refractory", "Refractory"]) {
  const a = askWhichDepartment(q) as DepartmentAsk;
  const all = subsets(a.options.map((o) => o.id));
  ok(`no loop: "${q}": all ${all.length} combinations`, all.every((s) => askWhichDepartment(queryFor(a, s)) === null), all.map((s) => queryFor(a, s)).find((x) => askWhichDepartment(x) !== null));
  if (a.documents) ok(`no loop: "${q}": the documents option`, askWhichDepartment(a.documents.query) === null);
}
ok("refractory has 7 combinations of ticks, and every one is possible (radio buttons could offer 3)", subsets(r.options.map((o) => o.id)).length === 7);

// ---- other questions are never touched
for (const q of ["how many executives are there in main hospital", "how many executives work in each section of C&IT", "who is more senior, Mohd Anwar Ullah or Rana Saha", "list the employees whose name has kumar as a word", "restricted holidays in March 2026", "how many executives are there in heavy maintenance, list them?"]) ok(`untouched: ${q}`, askWhichDepartment(q) === null);
ok("the people-or-bare test", isAboutPeopleOrBare("executives in x") && isAboutPeopleOrBare("garage") && !isAboutPeopleOrBare("what is the tender for the new garage"));

// ---- the real flow: asked at once, with the model never called
async function flow() {
  let modelCalls = 0;
  const deps = { enabled: true, holiday: async () => null, legacy: async () => null, llm: async () => { modelCalls++; throw new Error("the model must not be called"); }, withClient: async () => { throw new Error("no database needed"); }, verifiedMin: 1, skipModel: false } as never;
  const res = (await runOmnibar("how many executives are there in garage", "T1", deps)) as { kind?: string; answer?: string; ask?: DepartmentAsk } | null;
  ok("runOmnibar asks the garage question at once, and carries the whole question", !!res && res.kind === "clarify" && /Which department do you mean by/.test(res.answer ?? "") && res.ask?.options.length === 1 && res.ask.question === "how many executives are there in garage", JSON.stringify(res)?.slice(0, 200));
  ok("...and the model was never called", modelCalls === 0);
  const holiday = (await runOmnibar("how many executives are there in garage", "T1", { ...(deps as object), holiday: async () => ({ kind: "count", answer: "holiday answer" }) } as never)) as { answer?: string } | null;
  ok("a holiday answer still comes first (the parser keeps its place)", holiday?.answer === "holiday answer");
}
flow().then(() => { console.log(`departmentAsk selftest: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }).catch((e) => { console.log("FAIL flow crashed:", e instanceof Error ? e.message : e); console.log(`departmentAsk selftest: ${pass} passed, ${fail + 1} failed`); process.exit(1); });
