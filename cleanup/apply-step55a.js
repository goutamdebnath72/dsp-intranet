#!/usr/bin/env node
// cleanup/apply-step55a.js -- Step 55a: the words "refractory" and "garage" are RESOLVED, not asked about (owner's decisions of 26 Oct 2026).
//   "refractory" = all three Refractory rows (as in the old intranet), "garage" = the Plant Garage (six rows), "township garage" = a closed department (no employees).
// Four existing files change in place (the rest of the patch is new or replaced files):
//   src/lib/nl2sql/omnibar.ts               the question is resolved at step 1b (no question to the person; the closed answer needs no model call); a note travels with the answer
//   src/lib/nl2sql/clientTypes.ts           the answer's extras get a field `departmentNote`
//   src/components/Nl2SqlAnswerExtras.tsx   the note is drawn under "Departments covered"
//   src/lib/nl2sql/eval/selftest.ts         ten end-to-end checks of this flow are added to the big suite (K. The omnibar path)
// ALL-OR-NOTHING and idempotent: if a place differs from what is expected, it prints NOT APPLIED and changes nothing.
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const EDITS = {
 "src/lib/nl2sql/omnibar.ts": [
  [
   "import { askWhichDepartment } from \"./departmentAsk\";\n",
   "import { COKE_OVEN_REFRACTORY_CODE, finishDepartmentNote, resolveDepartmentWords, type DepartmentWordResult } from \"./departmentWords\";\n"
  ],
  [
   "export async function runOmnibar(q: string, userKey: string | null, deps: OmnibarDeps, retry: RetryInfo | null = null): Promise<OmnibarPayload | null> {\n  const attempt = retry ? retry.attempt + 1 : 1;\n",
   "/** The note under an answer whose department word was resolved (step 55a). The number of Coke Oven Refractory people is counted from the directory; if that fails, no number is said. */\nasync function noteFor(words: DepartmentWordResult | null, deps: OmnibarDeps): Promise<string | undefined> {\n  if (!words?.note) return undefined;\n  let people: number | null = null;\n  if (words.cokeOven) {\n    people = await deps\n      .withClient(async (c) => Number((await c.query(`SELECT count(*)::int AS n FROM nlq.employees WHERE department_code = ${COKE_OVEN_REFRACTORY_CODE}`)).rows[0]?.n))\n      .catch(() => null);\n  }\n  return finishDepartmentNote(words.note, people !== null && Number.isFinite(people) ? people : null);\n}\n\nexport async function runOmnibar(typed: string, userKey: string | null, deps: OmnibarDeps, retry: RetryInfo | null = null): Promise<OmnibarPayload | null> {\n  let q = typed; // the question as searched: a department word may be replaced by the rows it means (step 55a)\n  let departmentWords: DepartmentWordResult | null = null;\n  const attempt = retry ? retry.attempt + 1 : 1;\n"
  ],
  [
   "    // 1b. a department word that means more than one thing (\"garage\", \"refractory\"): ASK which, with checkboxes, instead of guessing: no model call (step 49a)\n    const ask = askWhichDepartment(q);\n    if (ask) return { kind: \"clarify\", answer: ask.message, ask, source: \"nl2sql\", attempt };\n",
   "    // 1b. a department word with more than one meaning is RESOLVED, not asked (step 55a): \"refractory\" = its three rows, \"garage\" = the Plant Garage, the township garage is closed\n    const words = resolveDepartmentWords(q);\n    if (words?.closed) return { kind: \"count\", count: 0, answer: words.closed, source: \"nl2sql\", attempt };\n    if (words?.question) q = words.question;\n    departmentWords = words;\n"
  ],
  [
   "  if (deps.skipModel && !retry) return null;\n\n",
   "  if (deps.skipModel && !retry) return null;\n\n  // a RETRY searches the original question again: its department words are resolved the same way (step 55a)\n  if (retry) {\n    const again = resolveDepartmentWords(q);\n    if (again?.closed) return { kind: \"count\", count: 0, answer: again.closed, source: \"nl2sql\", attempt };\n    if (again?.question) q = again.question;\n    departmentWords = again;\n  }\n\n"
  ],
  [
   "if (verified) return okToPayload(verified, userKey, deps, attempt);",
   "if (verified) return okToPayload(verified, userKey, deps, attempt, await noteFor(departmentWords, deps));"
  ],
  [
   "if (res.ok) return okToPayload(res, userKey, deps, attempt);",
   "if (res.ok) return okToPayload(res, userKey, deps, attempt, await noteFor(departmentWords, deps));"
  ],
  [
   "async function okToPayload(res: Ok, userKey: string | null, deps: OmnibarDeps, attempt: number): Promise<OmnibarPayload> {",
   "async function okToPayload(res: Ok, userKey: string | null, deps: OmnibarDeps, attempt: number, departmentNote?: string): Promise<OmnibarPayload> {"
  ],
  [
   "  return payload;\n}\n",
   "  if (departmentNote && payload.nl2sql) payload.nl2sql.departmentNote = departmentNote;\n  return payload;\n}\n"
  ]
 ],
 "src/lib/nl2sql/clientTypes.ts": [
  [
   "  sourceNote?: string;\n}",
   "  sourceNote?: string;\n  /** What a department word in the question was taken to mean (\"Refractory\" = all three Refractory departments ...), shown under \"Departments covered\" (step 55a). */\n  departmentNote?: string;\n}"
  ]
 ],
 "src/components/Nl2SqlAnswerExtras.tsx": [
  [
   "      {nl2sql.verifiedBy ? (\n",
   "      {nl2sql.departmentNote ? (\n        <p className=\"mt-1 text-xs leading-snug text-blue-800\" data-department-note=\"true\">\n          {nl2sql.departmentNote}\n        </p>\n      ) : null}\n      {nl2sql.verifiedBy ? (\n"
  ]
 ],
 "src/lib/nl2sql/eval/selftest.ts": [
  [
   "  let o: any = await runOmnibar(\"list five senior executives\", \"T-OMNI\", mkDeps(model(PEOPLE5, \"Five most senior executives.\")));\n",
   "  // ---- step 55a: a department word is RESOLVED before the model is called (\"refractory\" = its three rows, \"garage\" = the Plant Garage, the township garage is closed)\n  {\n    const seen: string[] = [];\n    const spy = (sql: string): LlmFn => async (p) => { seen.push(p); return json({ sql, understood_as: \"the reading\", confidence: \"high\" }); };\n    const ANY = `SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive'`;\n    const cokeCount = (n: number | \"fails\"): OmnibarDeps[\"withClient\"] => ((fn: (c: any) => Promise<unknown>) => withClient((c: any) => fn({ query: (sql: string, params?: unknown[]) => (/department_code = 86600/.test(String(sql)) ? (n === \"fails\" ? Promise.reject(new Error(\"no count\")) : Promise.resolve({ rows: [{ n }], rowCount: 1 })) : c.query(sql, params)) }))) as never;\n    const CLOSED = \"Township Garage has no employees: it is a closed department.\";\n    const closed: any = await runOmnibar(\"how many executives work in township garage\", \"T-DW\", mkDeps(spy(ANY)));\n    check(\"55a: the township garage is answered at once: a closed department, 0, no model call\", !!closed && closed.kind === \"count\" && closed.count === 0 && closed.answer === CLOSED && seen.length === 0, JSON.stringify(closed));\n    const closedRetry: any = await runOmnibar(\"executives in town garage\", \"T-DW\", mkDeps(spy(ANY)), { logId: null, reason: \"other\", note: \"\", attempt: 1 } as never);\n    check(\"55a: ...also when the question is asked again after a No (attempt 2), still no model call\", !!closedRetry && closedRetry.answer === CLOSED && closedRetry.attempt === 2 && seen.length === 0);\n    const holiday: any = await runOmnibar(\"how many executives are there in garage\", \"T-DW\", mkDeps(spy(ANY), { holiday: async () => ({ kind: \"count\", answer: \"holiday answer\" }) as never }));\n    check(\"55a: a holiday answer still comes first (the parser keeps its place)\", holiday?.answer === \"holiday answer\" && seen.length === 0);\n    const gar: any = await runOmnibar(\"how many executives are there in garage\", \"T-DW\", mkDeps(spy(ANY)));\n    check(\"55a: 'garage' is searched as 'plant garage': the model is given the clear name, not the bare word\", seen.length >= 1 && seen[0].includes(\"how many executives are there in plant garage\") && !seen[0].includes(\"there in garage\"), seen[0]?.slice(-200));\n    check(\"55a: ...no question is asked (no clarify, no checkboxes) and the answer carries the note\", !!gar && gar.kind !== \"clarify\" && !gar.ask && /Plant Garage \\(all its six sections\\)/.test(gar?.nl2sql?.departmentNote ?? \"\") && /closed department/.test(gar?.nl2sql?.departmentNote ?? \"\"), JSON.stringify(gar && { kind: gar.kind, note: gar.nl2sql?.departmentNote }));\n    seen.length = 0;\n    const ref: any = await runOmnibar(\"how many executives are there in refractory\", \"T-DW\", mkDeps(spy(ANY), { withClient: cokeCount(5) }));\n    check(\"55a: 'refractory' is searched as its three rows, named by name and code\", seen.length >= 1 && seen[0].includes(\"REFRACTORY (code 86000), REFRACTORY (OFFICE) (code 86030) and COKE OVEN REFRACTORY (code 86600)\"), seen[0]?.slice(-260));\n    check(\"55a: ...no question is asked, and the note says all three, the old intranet, CO & CC, and the number counted from the directory (5)\", !!ref && !ref.ask && ref.kind !== \"clarify\" && /all three Refractory departments, as in the old intranet/.test(ref?.nl2sql?.departmentNote ?? \"\") && /its 5 people are counted in both\\./.test(ref?.nl2sql?.departmentNote ?? \"\"), ref?.nl2sql?.departmentNote);\n    const refFail: any = await runOmnibar(\"how many executives are there in refractory\", \"T-DW\", mkDeps(spy(ANY), { withClient: cokeCount(\"fails\") }));\n    check(\"55a: if the people cannot be counted the note still comes, with no number and no placeholder\", !!refFail && /its people are counted in both\\./.test(refFail?.nl2sql?.departmentNote ?? \"\") && !/\\{\\{/.test(refFail?.nl2sql?.departmentNote ?? \"\"), refFail?.nl2sql?.departmentNote);\n    const plain: any = await runOmnibar(\"list five senior executives\", \"T-DW\", mkDeps(model(PEOPLE5, \"Five most senior executives.\")));\n    check(\"55a: an ordinary question has no department note\", !!plain && !plain?.nl2sql?.departmentNote);\n    seen.length = 0;\n    const named: any = await runOmnibar(\"how many executives are there in coke oven refractory\", \"T-DW\", mkDeps(spy(ANY)));\n    check(\"55a: a question that already names its department is searched as typed, with no note\", seen.length >= 1 && seen[0].includes(\"how many executives are there in coke oven refractory\") && !named?.nl2sql?.departmentNote);\n  }\n\n  let o: any = await runOmnibar(\"list five senior executives\", \"T-OMNI\", mkDeps(model(PEOPLE5, \"Five most senior executives.\")));\n"
  ]
 ]
};
const refuse = (why) => { console.log("NOT APPLIED: " + why + "\nNothing was changed."); process.exit(1); };
for (const f of ["src/lib/nl2sql/departmentWords.ts", "src/lib/nl2sql/departmentAsk.ts"]) if (!fs.existsSync(path.join(root, f))) refuse("the file " + f + " is missing (unzip the patch first)");
const sources = {};
let alreadyDone = true;
for (const [file, edits] of Object.entries(EDITS)) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) refuse("cannot find " + file + " (run this from the project root)");
  sources[file] = fs.readFileSync(p, "utf8");
  if (!edits.every(([, to]) => sources[file].includes(to))) alreadyDone = false;
}
if (alreadyDone) { console.log("Nothing to do: step 55a is already applied."); process.exit(0); }
for (const [file, edits] of Object.entries(EDITS)) {
  for (const [from] of edits) if (sources[file].split(from).length !== 2) refuse(file + " differs from what I expect (a place to change is not there exactly once)");
}
for (const [file, edits] of Object.entries(EDITS)) {
  let s = sources[file];
  for (const [from, to] of edits) s = s.replace(from, () => to);
  fs.writeFileSync(path.join(root, file), s);
}
console.log("APPLIED: step 55a (omnibar.ts 8 places, clientTypes.ts 1, Nl2SqlAnswerExtras.tsx 1, the big suite 1).");
