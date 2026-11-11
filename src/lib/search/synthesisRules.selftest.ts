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
check("scale rule: never mix different financial bases on same axis", /HOMOGENEOUS AXIS SCALE REQUIREMENT/.test(src) && /NEVER combine different underlying financial or measurement baselines on the same numeric axis/.test(src));
check("scale guard: one axis has one unit: a unit offering \"X or Y\", or items on two different bases, give no chart", /Scale coherence guard: ONE axis has ONE unit/.test(src) && /bases\.size > 1/.test(src) && !/hrr/i.test(src.slice(src.indexOf("Scale coherence guard"), src.indexOf("Scale coherence guard") + 700)));
check("stored briefings: the key carries a signature of the prompt, so a changed prompt can never serve a briefing made with the old one", /const ENGINE_SIG = `\$\{EDS_ENGINE_VERSION\}\.\$\{PROMPT_SIG\}`/.test(src) && /createHash\("sha256"\)\.update\(SYSTEM_PROMPT\)/.test(src));
check("chart rule: the type is decided by the data (decideChartType), a pie of multipliers is columns", /export function decideChartType/.test(src) && /isMagnitudeNotShare\(unit\)/.test(src));

// the rules added after the first live runs of the EDS test list (10 Nov 2026): a ladder question must name its items, an issuer needs its own column, a rule's NAME is not a request to compare, no sentence twice in a row
check("prompt rule: the items asked about stay in the table (a table of stages alone is incomplete)", /THE ITEMS ASKED ABOUT STAY IN THE TABLE/.test(src) && /one row per item/.test(src));
check("prompt rule: who issues / approves has a column of its own, and 'Not stated in circular' where nobody is named", /WHO ISSUES, APPROVES OR SANCTIONS/.test(src) && /column of its own/.test(src));
check("prompt rule: 'revised' / 'amended' inside a NAME is not a request to compare editions", /A NAME IS NOT A REQUEST TO COMPARE/.test(src) && /WHAT DIFFERS applies only when the question asks/.test(src));
check("prompt rule: one sentence printed under several headings is written once, the rest of the row gets a dash", /NO SENTENCE TWICE IN A ROW/.test(src));

console.log(`\nsynthesisRules selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
