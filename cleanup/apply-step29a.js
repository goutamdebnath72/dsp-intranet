// cleanup/apply-step29a.js
//
// Edits ONE existing source file IN PLACE (plus .env.example and cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
// ANSWER FIRST: when the search finds documents, the answer they prove is shown ABOVE them, with the source and the exact words.
// Off unless NEXT_PUBLIC_FRONT_PATH_ANSWER_FIRST=true: with the switch off NOTHING changes on screen.
//
//   src/components/OmnibarModal.tsx   three small insertions: the import, the hook call, the answer card above the list
//   .env.example, cleanup/check-fixes.sh   the switch is documented; one report line
// New files come in the zip: circularAnswer.ts (+ self-test), api/ai-search/answer/route.ts, useCircularAnswer.ts, CircularAnswerCard.tsx.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step29a.js

const fs = require("fs");

const EDITS = [
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "import { CircularAnswerCard } from \"@/components/CircularAnswerCard\";",
  "old": "import { HolidayCompareCard } from \"@/components/HolidayCompareCard\";\n",
  "new": "import { HolidayCompareCard } from \"@/components/HolidayCompareCard\";\nimport { CircularAnswerCard } from \"@/components/CircularAnswerCard\";\nimport { answerFirstEnabled, useCircularAnswer } from \"@/hooks/useCircularAnswer\";\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "const circularAnswer = useCircularAnswer(",
  "old": "  const textareaRef = useRef<HTMLTextAreaElement>(null);\n  const { status: authStatus } = useVerifiedSession();\n",
  "new": "  const textareaRef = useRef<HTMLTextAreaElement>(null);\n  const { status: authStatus } = useVerifiedSession();\n  // Answer first (step 29a, off unless NEXT_PUBLIC_FRONT_PATH_ANSWER_FIRST=true): once the search has found documents, the answer they\n  // prove is written above them, with the source and the exact words. Nothing appears if the text does not prove an answer.\n  const circularAnswer = useCircularAnswer({ enabled: answerFirstEnabled(), query: submittedQuery, results: isLoading ? [] : results, mode });\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "<CircularAnswerCard",
  "old": "                        {mode === \"intellectual\" && synthesis && (\n                          <ExecutiveBriefing\n                            data={synthesis}\n                            onOpenCircular={setSelectedCircularId}\n                          />\n                        )}\n",
  "new": "                        {mode === \"intellectual\" && synthesis && (\n                          <ExecutiveBriefing\n                            data={synthesis}\n                            onOpenCircular={setSelectedCircularId}\n                          />\n                        )}\n\n                        {mode === \"semantic\" && (\n                          <CircularAnswerCard\n                            state={circularAnswer}\n                            onOpenSource={(id) => {\n                              setBannerDismissed(false);\n                              setSelectedCircularId(id);\n                            }}\n                          />\n                        )}\n"
 }
];
const CHECKS = [
 {
  "marker": "an answer found in the documents is shown first, with its source and exact words",
  "line": "{ test -f src/lib/search/circularAnswer.ts && test -f src/app/api/ai-search/answer/route.ts && grep -q \"CircularAnswerCard\" src/components/OmnibarModal.tsx; } 2>/dev/null; report \"an answer found in the documents is shown first, with its source and exact words (off unless NEXT_PUBLIC_FRONT_PATH_ANSWER_FIRST=true)\" $?"
 }
];
const CF = "cleanup/check-fixes.sh";
const ENV = ".env.example";
const ENV_BLOCK = "\n# Answer first (step 29a): when the search finds documents, write the answer they prove ABOVE them, with the source and the exact words\n# (checked word for word by the program; nothing is shown if the text does not prove it). Uses about 2,000 to 3,000 model tokens per question.\n# OFF unless this is exactly: true. NEXT_PUBLIC_ because the browser reads it: restart `npm run dev` after changing it.\nNEXT_PUBLIC_FRONT_PATH_ANSWER_FIRST=\n";
const NEW_FILES = [
  "src/lib/search/circularAnswer.ts",
  "src/app/api/ai-search/answer/route.ts",
  "src/hooks/useCircularAnswer.ts",
  "src/components/CircularAnswerCard.tsx",
];

function read(p) {
  if (!fs.existsSync(p)) {
    console.error(`NOT APPLIED: ${p} not found. Run this from the project root (the folder with package.json), after unzipping the patch.`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

for (const f of NEW_FILES) read(f);
if (!read("src/components/OmnibarModal.tsx").includes("HolidayCompareCard")) {
  console.error("NOT APPLIED: OmnibarModal.tsx is missing an earlier step (the year-comparison card, step 22a).");
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
    console.error(`NOT APPLIED: ${CF} does not have the expected ending (a bare "echo" line followed by the "if [ \\"$bad\\" ..." line, exactly once). Nothing was changed. Send me the last 8 lines of that file.`);
    process.exit(1);
  }
  cf = cf.slice(0, first) + "\n" + missingChecks.map((c) => c.line).join("\n") + cf.slice(first);
}

let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : null;
const envNeeds = env !== null && !env.includes("NEXT_PUBLIC_FRONT_PATH_ANSWER_FIRST");
if (envNeeds) env = env.replace(/\s*$/, "\n") + ENV_BLOCK;

let changed = 0;
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
if (envNeeds) { fs.writeFileSync(ENV, env); changed++; console.log(`edited   ${ENV}  (+ NEXT_PUBLIC_FRONT_PATH_ANSWER_FIRST)`); }
if (missingChecks.length) { fs.writeFileSync(CF, cf); changed++; console.log(`edited   ${CF}  (+ ${missingChecks.length} report line(s))`); }
console.log(changed ? "Applied. Answer-first stays OFF until you set NEXT_PUBLIC_FRONT_PATH_ANSWER_FIRST=true in .env.local and restart npm run dev." : "Nothing to do: already applied.");
