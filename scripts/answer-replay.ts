// scripts/answer-replay.ts
//
// Replays the log of answer attempts through the CURRENT verification rules. No model call, no network, no database: it costs nothing and can be
// run after every change. The log is written by the app when ANSWER_LOG_FILE is set (put  ANSWER_LOG_FILE=reread-reports/answers.jsonl  in .env.local,
// restart the app, and browse: every answer attempt is kept with the model's own reply and the exact passages it was shown).
//
//   npx tsx --tsconfig tsconfig.json scripts/answer-replay.ts                     every logged attempt, then a summary
//   npx tsx --tsconfig tsconfig.json scripts/answer-replay.ts --refused           only the attempts that are refused NOW
//   npx tsx --tsconfig tsconfig.json scripts/answer-replay.ts --changed           only those whose verdict differs from the one logged
//   npx tsx --tsconfig tsconfig.json scripts/answer-replay.ts --file other.jsonl  another file (default: reread-reports/answers.jsonl)
//
// "acceptedThenRefused" must stay 0 unless a rule was tightened on purpose: it is the regression check for every change to the rules.

import { existsSync, readFileSync } from "node:fs";
import { parseJsonl, replay } from "../src/lib/search/answerReplay";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const fileArg = args.indexOf("--file");
const file = fileArg >= 0 ? args[fileArg + 1] : "reread-reports/answers.jsonl";

if (!existsSync(file)) {
  console.error(`No log at ${file}. Add  ANSWER_LOG_FILE=reread-reports/answers.jsonl  to .env.local, restart the app (npm run dev) and ask some questions.`);
  process.exit(1);
}
const attempts = parseJsonl(readFileSync(file, "utf8"));
const { rows, summary } = replay(attempts);
const shown = rows.filter((r) => (flag("refused") ? !r.nowOk : flag("changed") ? r.before !== r.now : true));
for (const r of shown) {
  console.log(`${r.nowOk ? "ACCEPTED" : "REFUSED "} ${r.question.slice(0, 90)}`);
  if (!r.nowOk) console.log(`          now: ${r.now.slice(0, 200)}`);
  if (r.nowOk && r.looseRows) console.log(`          ${r.looseRows} row(s) shown as the assistant's own wording`);
  if (r.nowOk && r.modelNote && !r.note) console.log(`          the model's note was dropped (the document does not state it): ${r.modelNote.slice(0, 160)}`);
  else if (r.nowOk && r.note) console.log(`          note shown (the document's sentence): ${r.note.slice(0, 200)}${r.modelNote && r.modelNote !== r.note ? `\n          the model wrote: ${r.modelNote.slice(0, 160)}` : ""}`);
  if (r.before !== r.now) console.log(`          logged: ${r.before.slice(0, 200)}`);
}
console.log(`\n${summary.total} attempt(s) in ${file}: accepted now ${summary.nowAccepted}, refused now ${summary.nowRefused} | refused when logged and accepted now: ${summary.refusedThenAccepted} | ACCEPTED WHEN LOGGED AND REFUSED NOW: ${summary.acceptedThenRefused}`);
if (summary.acceptedThenRefused) console.log("The line above in capitals is a regression unless a rule was tightened on purpose: look at the REFUSED lines.");
const reasons = new Map<string, number>();
for (const r of rows.filter((x) => !x.nowOk)) { const k = r.now.replace(/"[^"]*"/g, '"..."').replace(/\(.*\)$/, "").slice(0, 110); reasons.set(k, (reasons.get(k) ?? 0) + 1); }
if (reasons.size) { console.log("\nWhy the refused ones are refused:"); for (const [k, n] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${n}x ${k}`); }
