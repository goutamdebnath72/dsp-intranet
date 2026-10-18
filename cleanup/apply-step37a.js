// cleanup/apply-step37a.js
//
// Edits TWO existing source files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
//   src/app/api/ai-search/answer/route.ts    one line after the model call: logAnswer(...). It writes NOTHING unless ANSWER_LOG_FILE is set in .env.local.
//   src/components/CircularAnswerCard.tsx    a short amber caveat under the table when a row's label is the assistant's own wording (linked === false)
//   cleanup/check-fixes.sh                   one report line
// New files come in the zip: answerLog.ts, answerReplay.ts (+ self-tests), the replay file of real replies, scripts/answer-replay.ts.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step37a.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/app/api/ai-search/answer/route.ts",
  "marker": "logAnswer }",
  "old": "import { loadPageChecks } from \"@/lib/search/pageChecks\";\n",
  "new": "import { loadPageChecks } from \"@/lib/search/pageChecks\";\nimport { logAnswer } from \"@/lib/search/answerLog\";\n"
 },
 {
  "file": "src/app/api/ai-search/answer/route.ts",
  "marker": "logAnswer(q, passages, result)",
  "old": "    endModel();\n    return NextResponse.json(result.ok ? { answer: result.value } : { answer: null, reason: result.reason });\n",
  "new": "    endModel();\n    logAnswer(q, passages, result); // only when ANSWER_LOG_FILE is set: the attempt, the model's reply and the passages, for scripts/answer-replay.ts\n    return NextResponse.json(result.ok ? { answer: result.value } : { answer: null, reason: result.reason });\n"
 },
 {
  "file": "src/components/CircularAnswerCard.tsx",
  "marker": "the assistant&apos;s own wording",
  "old": "          <span>{a.note}</span>\n        </p>\n      ) : null}\n",
  "new": "          <span>{a.note}</span>\n        </p>\n      ) : null}\n\n      {a.rows.some((r) => r.linked === false) ? (\n        <p className=\"mx-4 mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-amber-700\">\n          <Info size={14} className=\"mt-0.5 flex-shrink-0 text-amber-500\" aria-hidden />\n          <span>The row names are the assistant&apos;s own wording. The exact words below are the document&apos;s: please check them.</span>\n        </p>\n      ) : null}\n"
 }
];
const CHECKS = [
 {
  "marker": "answer attempts can be logged and replayed",
  "line": "{ test -f src/lib/search/answerLog.ts && grep -q \"logAnswer\" src/app/api/ai-search/answer/route.ts && grep -q \"linked === false\" src/components/CircularAnswerCard.tsx; } 2>/dev/null; report \"answer attempts can be logged and replayed; rows the assistant worded are marked on the card\" $?"
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

read("src/lib/search/answerLog.ts");

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
console.log(changed ? "Applied. Add ANSWER_LOG_FILE=reread-reports/answers.jsonl to .env.local, then restart npm run dev." : "Nothing to do: already applied.");
