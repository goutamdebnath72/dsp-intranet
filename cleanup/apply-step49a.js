// cleanup/apply-step49a.js
//
// Edits SEVEN existing files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 49a: a department word with more than one meaning is ASKED about, with CHECKBOXES.
//   "garage": the HR list has ONE garage department (Plant Garage, six rows); the township garage is another department with no row of its own. The bare word no longer means Plant Garage.
//   "refractory": three rows (REFRACTORY, REFRACTORY (OFFICE), COKE OVEN REFRACTORY): what the bare word means is open, so the person ticks the ones meant, each time.
//   The question comes at once (no model call): "Which department do you mean by \u201Crefractory\u201D? The HR list has three. Tick one or more, then press Continue." The options are the real rows
//   (name and code); any combination can be ticked (radio buttons could offer only a few); Select all is a shortcut, None of these and documents are separate buttons; the question that will be
//   searched for is shown and follows the ticks. It fires only when the question is about people (executives, staff ...) or is just a word or two.
//   New (in the zip): src/lib/nl2sql/departmentAsk.ts (the rules: add a word there), src/components/ClarifyChoices.tsx (the checkboxes), and their tests (47 + 13 checks)
//   aliasHints.ts (the bare "garage" nickname removed), analytics.ts and useOmniSearch.ts (the answer carries the question), omnibar.ts (asks before the model), OmnibarModal.tsx (draws it),
//   and one word of the old suite (eval/selftest.ts): its stand-in question "garage people" is now asked about, so it says "plant garage people".
// Run steps 46a and 48b first (any later step is fine).
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step49a.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/nl2sql/aliasHints.ts",
  "marker": "aliases: [\"plant garage\", \"mhemd\"",
  "old": "aliases: [\"garage\", \"plant garage\", \"mhemd\", \"mheod\", \"M.H.E.M.D.\", \"M.H.E.O.D.\"],\n",
  "new": "aliases: [\"plant garage\", \"mhemd\", \"mheod\", \"M.H.E.M.D.\", \"M.H.E.O.D.\"], // the bare word \"garage\" is NOT a nickname: the township garage is another department (step 49a asks which)\n"
 },
 {
  "file": "src/lib/nl2sql/aliasHints.ts",
  "marker": "The TOWNSHIP garage is a different department",
  "old": "all six are Plant Garage.\",",
  "new": "all six are Plant Garage. The TOWNSHIP garage is a different department and is not one of these rows.\","
 },
 {
  "file": "src/lib/employees/analytics.ts",
  "marker": "ask?: import(\"@/lib/nl2sql/departmentAsk\").DepartmentAsk;",
  "old": "  /** Set when the question had a second part that was not answered (\"Not answered: ...\"). */\n  notice?: string;\n",
  "new": "  /** Set when the question had a second part that was not answered (\"Not answered: ...\"). */\n  notice?: string;\n  /** A clarifying question about a department word with more than one meaning (step 49a): the screen draws checkboxes from it. One definition for the server and the screen. */\n  ask?: import(\"@/lib/nl2sql/departmentAsk\").DepartmentAsk;\n"
 },
 {
  "file": "src/hooks/useOmniSearch.ts",
  "marker": "ask?: import(\"@/lib/nl2sql/departmentAsk\").DepartmentAsk;",
  "old": "  /** Set when the question had a second part that was not answered. Mirrors AnalyticsPayload.notice. */\n  notice?: string;\n",
  "new": "  /** Set when the question had a second part that was not answered. Mirrors AnalyticsPayload.notice. */\n  notice?: string;\n  /** A clarifying question about a department word with more than one meaning (step 49a). The same type as AnalyticsPayload.ask. */\n  ask?: import(\"@/lib/nl2sql/departmentAsk\").DepartmentAsk;\n"
 },
 {
  "file": "src/hooks/useOmniSearch.ts",
  "marker": "opts?: { auto?: boolean; query?: string }",
  "old": "  const triggerSearch = (selectedMode: SearchMode, opts?: { auto?: boolean }) => {\n    if (!selectedMode) return;\n    setAutoRouted(!!opts?.auto && selectedMode === \"intellectual\");\n    setMode(selectedMode);\n    setRetry(null);\n    setAttempt(1);\n    if (query.trim().length >= 3) {\n      setSubmittedQuery(query.trim());\n    } else {\n      setSubmittedQuery(\"\");\n    }\n  };\n",
  "new": "  const triggerSearch = (selectedMode: SearchMode, opts?: { auto?: boolean; query?: string }) => {\n    if (!selectedMode) return;\n    setAutoRouted(!!opts?.auto && selectedMode === \"intellectual\");\n    setMode(selectedMode);\n    setRetry(null);\n    setAttempt(1);\n    // a choice made under a clarifying question (step 49a) searches for its own text and puts it in the box\n    const text = (opts?.query ?? query).trim();\n    if (opts?.query !== undefined) setQuery(opts.query);\n    if (text.length >= 3) {\n      setSubmittedQuery(text);\n    } else {\n      setSubmittedQuery(\"\");\n    }\n  };\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "from \"./departmentAsk\"",
  "old": "import { peopleHeadline } from \"./medicalCadre\";\n",
  "new": "import { peopleHeadline } from \"./medicalCadre\";\nimport { askWhichDepartment } from \"./departmentAsk\";\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "const ask = askWhichDepartment(q);",
  "old": "    if (holiday) return { ...holiday, source: \"holiday\", attempt };\n",
  "new": "    if (holiday) return { ...holiday, source: \"holiday\", attempt };\n\n    // 1b. a department word that means more than one thing (\"garage\", \"refractory\"): ASK which, with checkboxes, instead of guessing: no model call (step 49a)\n    const ask = askWhichDepartment(q);\n    if (ask) return { kind: \"clarify\", answer: ask.message, ask, source: \"nl2sql\", attempt };\n"
 },
 {
  "file": "src/lib/nl2sql/eval/selftest.ts",
  "marker": "runOmnibar(\"plant garage people\", \"T-OMNI\"",
  "old": "runOmnibar(\"garage people\", \"T-OMNI\"",
  "new": "runOmnibar(\"plant garage people\", \"T-OMNI\""
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "import { ClarifyChoices } from \"@/components/ClarifyChoices\";",
  "old": "import { PersonBadges } from \"@/components/PersonBadges\";\n",
  "new": "import { PersonBadges } from \"@/components/PersonBadges\";\nimport { ClarifyChoices } from \"@/components/ClarifyChoices\";\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "<ClarifyChoices key={analytics.answer} ask={analytics.ask}",
  "old": "                                {analytics.answer}\n                              </p>\n                            )}\n                            {analytics.notice && (\n",
  "new": "                                {analytics.answer}\n                              </p>\n                            )}\n                            {analytics.kind === \"clarify\" && analytics.ask && (\n                              <ClarifyChoices key={analytics.answer} ask={analytics.ask} onAsk={(text) => triggerSearch(\"semantic\", { query: text })} />\n                            )}\n                            {analytics.notice && (\n"
 }
];
const CHECKS = [
 {
 "marker": "A department word with two meanings (garage, refractory) is asked about with checkboxes, not guessed",
 "line": "{ grep -q \"askWhichDepartment\" src/lib/nl2sql/omnibar.ts && grep -q \"ClarifyChoices\" src/components/OmnibarModal.tsx && test -f src/lib/nl2sql/departmentAsk.ts && test -f src/components/ClarifyChoices.tsx; } 2>/dev/null; report \"A department word with two meanings (garage, refractory) is asked about with checkboxes, not guessed\" $?"
}
];
const CF = "cleanup/check-fixes.sh";

function read(p) {
  if (!fs.existsSync(p)) {
    console.error(`NOT APPLIED: ${p} not found. Run this from the project root (the folder with package.json), after unzipping the patch.`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

if (!fs.existsSync("src/lib/nl2sql/departmentAsk.ts") || !fs.existsSync("src/components/ClarifyChoices.tsx")) {
  console.error("NOT APPLIED: src/lib/nl2sql/departmentAsk.ts or src/components/ClarifyChoices.tsx is not there. Unzip patch_step49a.zip first. Nothing was changed.");
  process.exit(1);
}
if (!fs.existsSync("src/lib/nl2sql/medicalCadre.ts")) {
  console.error("NOT APPLIED: step 46a is not applied yet (src/lib/nl2sql/medicalCadre.ts is missing). Apply 46a first. Nothing was changed.");
  process.exit(1);
}

const plan = [];
const byFile = new Map();
for (const e of EDITS) byFile.set(e.file, byFile.get(e.file) ?? read(e.file));
for (const e of EDITS) {
  let text = byFile.get(e.file);
  if (text.includes(e.marker)) { console.log(`already  ${e.file}  (${e.marker.slice(0, 48).replace(/\n/g, " ")}...)`); continue; }
  const n = countOf(text, e.old);
  if (n !== 1) {
    console.error(`NOT APPLIED: ${e.file} does not contain the expected code exactly once (found ${n}: ${JSON.stringify(e.old.slice(0, 70))}). Nothing was changed. This file differs from the one the patch was made for: send it to me.`);
    process.exit(1);
  }
  text = text.replace(e.old, () => e.new);
  byFile.set(e.file, text);
  plan.push(e.file);
}

let cf = read(CF);
const ANCHOR = '\necho\nif [ "$bad" -eq 0 ]';
const missingChecks = CHECKS.filter((c) => !cf.includes(c.marker));
if (missingChecks.length) {
  const first = cf.indexOf(ANCHOR);
  if (first === -1 || cf.indexOf(ANCHOR, first + 1) !== -1) {
    console.error(`NOT APPLIED: ${CF} does not have the expected ending. Nothing was changed. Send me the last 8 lines of that file.`);
    process.exit(1);
  }
  cf = cf.slice(0, first) + "\n" + missingChecks.map((c) => c.line).join("\n") + cf.slice(first);
}

let changed = 0;
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
if (missingChecks.length) { fs.writeFileSync(CF, cf); changed++; console.log(`edited   ${CF}  (+ ${missingChecks.length} report line(s))`); }
console.log(changed ? "Applied. Restart npm run dev." : "Nothing to do: already applied.");
