#!/usr/bin/env node
// cleanup/apply-step56b.js -- Step 56b: the PhD question is answered from the list kept by hand; "Loading Summary" is centred; the text of the query modal keeps its old proportion to the width.
// Six existing files change in place (CircularAnswerCard.tsx and its test, OmnibarModal.tsx, HospitalAnswerCard.tsx, omnibar.ts, eval/selftest.ts); everything else of the patch is a replaced or new file (unzip).
// Each change is checked on its own (already there: skipped; missing: made; place not recognised: nothing is written). Safe to run again.
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const NEEDS = ["src/components/omniScale.css", "src/lib/ui/omniScale.ts", "src/lib/nl2sql/phdHolders.ts"];
const EDITS = {
 "src/components/CircularAnswerCard.tsx": [
  [
   "className=\"flex items-center gap-2 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-blue-700 shadow-sm\"",
   "className=\"flex items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-blue-700 shadow-sm\"",
   "flex items-center justify-center gap-2 rounded-2xl border border-blue-100"
  ]
 ],
 "src/components/CircularAnswerCard.loading.selftest.tsx": [
  [
   "ok(\"nothing is shown when idle\"",
   "ok(\"the loading card is centred horizontally (icon and words together in the middle of their box), not stuck at the left end\", /<section[^>]*class=\"[^\"]*\\bjustify-center\\b[^\"]*\"/.test(loading) && /<section[^>]*class=\"[^\"]*\\bitems-center\\b[^\"]*\"/.test(loading) && !/\\bjustify-start\\b|\\btext-left\\b/.test(loading), loading);\nok(\"nothing is shown when idle\"",
   "the loading card is centred horizontally"
  ]
 ],
 "src/components/OmnibarModal.tsx": [
  [
   "import { HolidayCompareCard } from \"@/components/HolidayCompareCard\";\n",
   "import { HolidayCompareCard } from \"@/components/HolidayCompareCard\";\nimport \"./omniScale.css\";\nimport { omniScaleFor } from \"@/lib/ui/omniScale\";\n",
   "import { omniScaleFor } from \"@/lib/ui/omniScale\";"
  ],
  [
   "  const textareaRef = useRef<HTMLTextAreaElement>(null);\n",
   "  const textareaRef = useRef<HTMLTextAreaElement>(null);\n  // Step 56b: the modal is wider than it was (step 54i) but its text was not: the text grows with the width, so that it keeps the proportion it had at the old 52rem (omniScale.css).\n  // The doctors' unit tables opt out (omni-noscale): they keep their size and the room the extra width gave them.\n  const modalRef = useRef<HTMLDivElement>(null);\n  const [omniK, setOmniK] = useState(1);\n  useEffect(() => {\n    const el = modalRef.current;\n    if (!el || typeof ResizeObserver === \"undefined\") return;\n    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;\n    const measure = () => setOmniK(omniScaleFor(el.offsetWidth, BASE_MODAL_WIDTH_REM * rootPx));\n    measure();\n    const ro = new ResizeObserver(measure);\n    ro.observe(el);\n    return () => ro.disconnect();\n  }, [isOpen]);\n",
   "const modalRef = useRef<HTMLDivElement>(null);"
  ],
  [
   "              className=\"relative w-full bg-white rounded-xl shadow-2xl overflow-hidden border border-neutral-200 flex flex-col max-h-[calc(100vh-5.5rem)]\"\n            >",
   "              ref={modalRef}\n              style={{ \"--omni-k\": omniK } as React.CSSProperties}\n              className=\"omni-scale relative w-full bg-white rounded-xl shadow-2xl overflow-hidden border border-neutral-200 flex flex-col max-h-[calc(100vh-5.5rem)]\"\n            >",
   "className=\"omni-scale relative w-full bg-white"
  ]
 ],
 "src/components/HospitalAnswerCard.tsx": [
  [
   "<div className=\"overflow-x-auto rounded-lg border border-neutral-200 bg-white\">",
   "<div className=\"omni-noscale overflow-x-auto rounded-lg border border-neutral-200 bg-white\">",
   "omni-noscale overflow-x-auto"
  ]
 ],
 "src/lib/nl2sql/omnibar.ts": [
  [
   "import { COKE_OVEN_REFRACTORY_CODE, finishDepartmentNote, resolveDepartmentWords, type DepartmentWordResult } from \"./departmentWords\";\n",
   "import { COKE_OVEN_REFRACTORY_CODE, finishDepartmentNote, resolveDepartmentWords, type DepartmentWordResult } from \"./departmentWords\";\nimport { answerPhd } from \"./phdHolders\";\n",
   "import { answerPhd } from \"./phdHolders\";"
  ],
  [
   "  skipModel?: boolean;\n}\n",
   "  skipModel?: boolean;\n  /** The tickets of the PhD holders (employees/honorific.ts DR_TICKETS when absent); the tests give their own (step 56b). */\n  phdTickets?: readonly string[];\n}\n",
   "phdTickets?: readonly string[];"
  ],
  [
   "    if (hospital) return { ...hospital, source: \"holiday\", attempt };\n",
   "    if (hospital) return { ...hospital, source: \"holiday\", attempt };\n\n    // 0b. \"who are the PhD holders\": answered from the list of PhD holders kept by hand (employees/honorific.ts), no model call, never in the words of a circular (step 56b)\n    const phd = await answerPhd(q, { withClient: deps.withClient, exec: { rowLimit: PAGE_SIZE } }, deps.phdTickets).catch(() => null);\n    if (phd?.kind === \"none\") return { kind: \"count\", count: 0, answer: phd.text, source: \"nl2sql\", attempt };\n    if (phd?.kind === \"people\") return okToPayload(phd.res, userKey, deps, attempt, phd.note);\n",
   "const phd = await answerPhd(q,"
  ]
 ],
 "src/lib/nl2sql/eval/selftest.ts": [
  [
   "  let o: any = await runOmnibar(\"list five senior executives\", \"T-OMNI\", mkDeps(model(PEOPLE5, \"Five most senior executives.\")));\n",
   "  // ---- step 56b: \"who are the PhD holders\" is answered from the list kept by hand (DR_TICKETS), by ticket from the directory, no model call: not from a circular's table of nodal officers\n  {\n    const seenP: string[] = [];\n    const llmP: LlmFn = async (p) => { seenP.push(p); return json({ sql: \"SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive'\", understood_as: \"the reading\", confidence: \"high\" }); };\n    const withTickets = (tickets: string[]) => mkDeps(llmP, { phdTickets: tickets });\n    for (const q of [\"list the name of employees who are phd holder with their department\", \"name of the employee who is phd holder\", \"name of the employee with his department who is phd holder\", \"who are the phd holders\", \"how many phd holders are there\"]) {\n      seenP.length = 0;\n      const r: any = await runOmnibar(q, \"T-PHD\", withTickets([\"490030\"]));\n      check(`56b: \"${q}\": the one PhD holder of the list, from the directory, no model call`, !!r && r.kind === \"count\" && r.count === 1 && r.people?.length === 1 && /GOSWAMI/.test(r.people[0].name) && seenP.length === 0, JSON.stringify(r && { kind: r.kind, count: r.count, n: r.people?.length, model: seenP.length }));\n    }\n    const r1: any = await runOmnibar(\"who are the phd holders\", \"T-PHD\", withTickets([\"490030\"]));\n    check(\"56b: the answer says the list is kept by hand, how many it has, and that it may be incomplete\", /kept by hand/.test(r1?.nl2sql?.departmentNote ?? \"\") && /with 1 person so far/.test(r1?.nl2sql?.departmentNote ?? \"\") && /may be incomplete/.test(r1?.nl2sql?.departmentNote ?? \"\"), r1?.nl2sql?.departmentNote);\n    check(\"56b: ...and what it understood: the employees recorded as PhD holders on the list kept by hand\", JSON.stringify(r1).includes(\"recorded as PhD holders on the list kept by hand\"));\n    for (const q of [\"phd sponsorship policy for employees\", \"circular about phd leave\", \"phd holders in electrical department\", \"list of employees\"]) {\n      seenP.length = 0;\n      const r: any = await runOmnibar(q, \"T-PHD\", withTickets([\"490030\"]));\n      check(`56b: not taken, goes on as before: \"${q}\"`, !(r?.nl2sql?.departmentNote ?? \"\").includes(\"kept by hand\") && seenP.length >= 1, JSON.stringify({ model: seenP.length, note: r?.nl2sql?.departmentNote }));\n    }\n    for (const [label, tickets] of [[\"an empty list\", [] as string[]], [\"a ticket that is not in the directory\", [\"999999\"]]] as [string, string[]][]) {\n      seenP.length = 0;\n      const r: any = await runOmnibar(\"who are the phd holders\", \"T-PHD\", withTickets(tickets));\n      check(`56b: ${label}: the plain statement, 0, no model call`, !!r && r.kind === \"count\" && r.count === 0 && /No PhD holder is recorded yet/.test(r.answer ?? \"\") && seenP.length === 0, JSON.stringify(r));\n    }\n    seenP.length = 0;\n    const again: any = await runOmnibar(\"who are the phd holders\", \"T-PHD\", withTickets([\"490030\"]), { logId: null, reason: \"other\", note: \"\", attempt: 1 } as never);\n    check(\"56b: after a No (attempt 2) the question is searched in a DIFFERENT way: the model, not the list again\", seenP.length >= 1 && !(again?.nl2sql?.departmentNote ?? \"\").includes(\"kept by hand\"), JSON.stringify({ model: seenP.length }));\n  }\n\n  let o: any = await runOmnibar(\"list five senior executives\", \"T-OMNI\", mkDeps(model(PEOPLE5, \"Five most senior executives.\")));\n",
   "56b: \"who are the PhD holders\" is answered from the list kept by hand"
  ]
 ]
};
const refuse = (why) => { console.log("NOT APPLIED: " + why + "\nNothing was changed."); process.exit(1); };
for (const f of NEEDS) if (!fs.existsSync(path.join(root, f))) refuse("the file " + f + " is missing (unzip the patch first)");
const plan = [];
let todo = 0;
for (const [file, edits] of Object.entries(EDITS)) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) refuse("cannot find " + file + " (run this from the project root)");
  const src = fs.readFileSync(p, "utf8");
  const make = [];
  for (const [from, to, marker, optional] of edits) {
    if (src.includes(marker)) continue; // already there
    if (src.split(from).length === 2) { make.push([from, to]); continue; }
    if (optional) continue; // a place that only exists in some trees
    refuse(file + " differs from what I expect (a place to change is not there exactly once: " + JSON.stringify(from.slice(0, 70)) + ")");
  }
  todo += make.length;
  plan.push([p, src, make]);
}
if (!todo) { console.log("Nothing to do: step 56b is already applied."); process.exit(0); }
let files = 0;
for (const [p, src, make] of plan) {
  if (!make.length) continue;
  let s = src;
  for (const [from, to] of make) s = s.replace(from, () => to);
  fs.writeFileSync(p, s);
  files++;
}
console.log("APPLIED: step 56b (" + todo + " changes in " + files + " files).");
