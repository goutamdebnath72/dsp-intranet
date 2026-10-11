// src/lib/search/synthesisRules.selftest.ts
// Run:  npx tsx src/lib/search/synthesisRules.selftest.ts      (no network, no database)
//
// The synthesis model is steered by rules written in its prompt; nothing else stops it from attaching a date from a NEIGHBOURING row to a
// person in a roster (the number exists in the text, so the figure check passes). This keeps those rules from being deleted by accident.
import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
};
const src = readFileSync(join(__dirname, "executiveSynthesis.ts"), "utf8");

check("roster rule: a date belongs only to the person's own row, never to a neighbouring row or group", /ROSTER \/ SCHEDULE TABLES/.test(src) && /NEVER give a person a date taken from another row or group/.test(src));
check("roster rule: if the row has no date, say so and give what the row does show", /say the date is not shown against that row/.test(src));
check("figures rule: only numbers that literally appear in the text", /FIGURES MUST EXIST IN THE TEXT/.test(src));
check("id rule: never write a circular's id, use its 'cite as' label or title", /NEVER write a circular's id number/.test(src) && /cite as/.test(src));

console.log(`\nsynthesisRules selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
