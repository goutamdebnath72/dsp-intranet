// cleanup/apply-step28b.js
//
// Edits three existing source files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
// ENGINE FIX for two wrong answers found by the baseline run on the real data (13 Oct):
//   "show the five most senior executives in each plant garage section"  -> 5 people in all (should be up to 5 per section)
//   "which departments have more than 20 non-executives of grade S-9 or above, and how many" -> "0 rows" (45 or more departments qualify)
// The model's instructions had a rule for "the N most senior people" over everyone but none for "in EACH section", and nothing about which
// way rank_order runs ("grade X or above" = a SMALLER or equal rank_order). Two rules and two worked examples (different departments and
// numbers than the questions above, so it teaches the pattern, not the test).
//
//   src/lib/nl2sql/prompt.ts           the two rules
//   src/lib/nl2sql/examples.ts         the two worked examples (checked by the self-test: guard + real execution)
//   src/lib/nl2sql/eval/selftest.ts    proves the meaning of both patterns on real rows; the prompt size limit goes from 19000 to 19600
//   cleanup/check-fixes.sh             one report line
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step28b.js

const fs = require("fs");

const EDITS = [
 {
  "file": "src/lib/nl2sql/prompt.ts",
  "marker": "IN EACH department/section/designation",
  "old": "- \"who is senior to X\": rows with a smaller global_seniority_rank than X's.",
  "new": "- \"N most senior ... IN EACH department/section/designation\" (top N PER GROUP): a plain LIMIT N gives N people in all. Use a sub-query with row_number() OVER (PARTITION BY department_id ORDER BY global_seniority_rank) AS r, then WHERE r <= N; ORDER BY department_code, global_seniority_rank.\n- Grades: rank_order 1 = MOST senior. \"grade X or above\" = rank_order <= (SELECT max(rank_order) FROM nlq.designations WHERE title = 'X'); \"X or below\" = rank_order >=. Never compare the number inside a title (S-9 is above S-5). Non-executive grades: S-1 lowest .. S-11 highest.\n- \"who is senior to X\": rows with a smaller global_seniority_rank than X's."
 },
 {
  "file": "src/lib/nl2sql/examples.ts",
  "marker": "show the three most senior executives in each blast furnace section",
  "old": "  {\n    question: 'find names which contain \"nath\" but not at the end, as a whole word or as part of a word',",
  "new": "  {\n    question: \"show the three most senior executives in each blast furnace section\",\n    sql: `SELECT ticket_no, name, designation, department_code, department FROM (SELECT ticket_no, name, designation, department_code, department, global_seniority_rank, row_number() OVER (PARTITION BY department_id ORDER BY global_seniority_rank) AS r FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (SELECT id FROM nlq.departments WHERE nlq.norm(name) LIKE '%blast furnace%')) t WHERE r <= 3 ORDER BY department_code, global_seniority_rank`,\n    understood_as: \"In EACH department whose name contains BLAST FURNACE, its three most senior executives: up to three people per section, not three in all.\",\n    source: \"seed\",\n  },\n  {\n    question: \"which departments have more than 15 non-executives of grade S-5 or above, and how many\",\n    sql: `SELECT department_code, department, count(*) AS count FROM nlq.employees WHERE cohort = 'nonexecutive' AND rank_order <= (SELECT max(rank_order) FROM nlq.designations WHERE title = 'S-5') GROUP BY department_id, department_code, department HAVING count(*) > 15 ORDER BY count DESC, department_code`,\n    understood_as: \"Non-executives of grade S-5 or above (S-5 up to S-11; rank_order 1 is the most senior), counted per department; only departments with more than 15 are listed.\",\n    source: \"seed\",\n  },\n  {\n    question: 'find names which contain \"nath\" but not at the end, as a whole word or as part of a word',"
 },
 {
  "file": "src/lib/nl2sql/eval/selftest.ts",
  "marker": "Step 28b: \"N most senior IN EACH department\"",
  "old": "  // ==========================================================================\n  // Leave the scratch database as it was found:",
  "new": "  // ==========================================================================\n  // Step 28b: \"N most senior IN EACH department\" and \"grade X or above\". Two gaps found on the real data (13 Oct): the model answered\n  // \"5 people\" (5 in all) for the five most senior executives of EACH plant garage section, and \"0 rows\" for the departments with more than 20\n  // non-executives of grade S-9 or above, where 45 or more qualify. Fixture removed again afterwards.\n  await pg.query(`INSERT INTO public.sail_department (id, code, name, cohort_scope) VALUES (29101, 970101, 'ZQ GROUPA', 'shared'), (29102, 970102, 'ZQ GROUPB', 'shared')`);\n  try {\n    const EXG = `(SELECT id FROM public.designation_grade WHERE track <> 'nonexec' ORDER BY id LIMIT 1)`;\n    const G = (title: string) => `(SELECT id FROM public.designation_grade WHERE title = '${title}' LIMIT 1)`;\n    await pg.query(`INSERT INTO public.employee_roster (ticket_no,name,designation_grade_id,sail_department_id,cohort,within_grade_position,global_seniority_rank) VALUES\n      ('981001','ZQ A ONE',${EXG},29101,'executive',98101,981001), ('981002','ZQ A TWO',${EXG},29101,'executive',98102,981002),\n      ('981003','ZQ A THREE',${EXG},29101,'executive',98103,981003), ('981004','ZQ A FOUR',${EXG},29101,'executive',98104,981004),\n      ('981011','ZQ B ONE',${EXG},29102,'executive',98111,981011), ('981012','ZQ B TWO',${EXG},29102,'executive',98112,981012),\n      ('981013','ZQ B THREE',${EXG},29102,'executive',98113,981013), ('981014','ZQ B FOUR',${EXG},29102,'executive',98114,981014),\n      ('981101','ZQ S FOUR',${G(\"S-4\")},29101,'nonexecutive',98201,981101), ('981102','ZQ S FIVE',${G(\"S-5\")},29101,'nonexecutive',98202,981102),\n      ('981103','ZQ S NINE',${G(\"S-9\")},29101,'nonexecutive',98203,981103), ('981111','ZQ S ELEVEN',${G(\"S-11\")},29102,'nonexecutive',98211,981111),\n      ('981112','ZQ S FOUR B',${G(\"S-4\")},29102,'nonexecutive',98212,981112)`);\n    const FXB = `SELECT id FROM nlq.departments WHERE code IN (970101, 970102)`;\n    const perGroup = await pg.query(\n      `SELECT ticket_no FROM (SELECT ticket_no, department_code, global_seniority_rank, row_number() OVER (PARTITION BY department_id ORDER BY global_seniority_rank) AS r FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (${FXB})) t WHERE r <= 3 ORDER BY department_code, global_seniority_rank`,\n    );\n    check(\"per-group top 3: three people in EACH of the two departments (6 in all), the most senior ones, not 3 in all\", perGroup.rows.map((r: any) => r.ticket_no).join(\",\") === \"981001,981002,981003,981011,981012,981013\", perGroup.rows.map((r: any) => r.ticket_no).join(\",\"));\n    const above = await pg.query(`SELECT ticket_no FROM nlq.employees WHERE cohort = 'nonexecutive' AND rank_order <= (SELECT max(rank_order) FROM nlq.designations WHERE title = 'S-5') AND department_id IN (${FXB}) ORDER BY ticket_no`);\n    check(\"grade S-5 or above = S-5, S-9 and S-11, and NOT S-4\", above.rows.map((r: any) => r.ticket_no).join(\",\") === \"981102,981103,981111\", above.rows.map((r: any) => r.ticket_no).join(\",\"));\n    const below = await pg.query(`SELECT ticket_no FROM nlq.employees WHERE cohort = 'nonexecutive' AND rank_order >= (SELECT max(rank_order) FROM nlq.designations WHERE title = 'S-5') AND department_id IN (${FXB}) ORDER BY ticket_no`);\n    check(\"the opposite comparison answers 'S-5 or BELOW' (the trap the rule warns about)\", below.rows.map((r: any) => r.ticket_no).join(\",\") === \"981101,981102,981112\", below.rows.map((r: any) => r.ticket_no).join(\",\"));\n    const pr28 = buildPrompt({ question: \"show the five most senior executives in each section\", context: ctx, examples: [] });\n    check(\"the instructions say how to take the top N PER GROUP\", /PARTITION BY department_id/.test(pr28) && /IN EACH department/.test(pr28));\n    check(\"the instructions say which way rank_order runs for 'grade X or above'\", /rank_order 1 = MOST senior/.test(pr28) && /grade X or above/.test(pr28));\n    check(\"both worked examples are in the seed set\", SEED_EXAMPLES.some((e) => /three most senior executives in each blast furnace section/.test(e.question)) && SEED_EXAMPLES.some((e) => /non-executives of grade S-5 or above/.test(e.question)));\n  } finally {\n    await pg.query(`DELETE FROM public.employee_roster WHERE ticket_no LIKE '9810%' OR ticket_no LIKE '9811%'`);\n    await pg.query(`DELETE FROM public.sail_department WHERE id IN (29101, 29102)`);\n  }\n\n  // ==========================================================================\n  // Leave the scratch database as it was found:"
 },
 {
  "file": "src/lib/nl2sql/eval/selftest.ts",
  "marker": "worst-case prompt: ${ppBig.length} of 19600 characters",
  "old": "worst-case prompt: ${ppBig.length} of 19000 characters",
  "new": "worst-case prompt: ${ppBig.length} of 19600 characters"
 },
 {
  "file": "src/lib/nl2sql/eval/selftest.ts",
  "marker": "ppBig.length < 19600",
  "old": "ppBig.length < 19000",
  "new": "ppBig.length < 19600"
 },
 {
  "file": "src/lib/nl2sql/eval/selftest.ts",
  "marker": "padded }, examples: [] }).length < 19600);",
  "old": "padded }, examples: [] }).length < 19000);",
  "new": "padded }, examples: [] }).length < 19600);"
 },
 {
  "file": "src/lib/nl2sql/eval/selftest.ts",
  "marker": "worst-case HEALTH prompt: ${hBig.length} of 19600 characters",
  "old": "worst-case HEALTH prompt: ${hBig.length} of 19000 characters",
  "new": "worst-case HEALTH prompt: ${hBig.length} of 19600 characters"
 },
 {
  "file": "src/lib/nl2sql/eval/selftest.ts",
  "marker": "pp.length < 18500, ",
  "old": "pp.length < 18000, ",
  "new": "pp.length < 18500, "
 },
 {
  "file": "src/lib/nl2sql/eval/selftest.ts",
  "marker": "hBig.length < 19600, ",
  "old": "hBig.length < 19000, ",
  "new": "hBig.length < 19600, "
 }
];
const CHECKS = [
 {
  "marker": "the model is told how to take the top N per department and which way grades run",
  "line": "{ grep -q \"PARTITION BY department_id\" src/lib/nl2sql/prompt.ts && grep -q \"rank_order 1 = MOST senior\" src/lib/nl2sql/prompt.ts; } 2>/dev/null; report \"the model is told how to take the top N per department and which way grades run\" $?"
 }
];
const CF = "cleanup/check-fixes.sh";

function read(p) {
  if (!fs.existsSync(p)) {
    console.error(`NOT APPLIED: ${p} not found. Run this from the project root (the folder with package.json).`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

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

let changed = 0;
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
if (missingChecks.length) { fs.writeFileSync(CF, cf); changed++; console.log(`edited   ${CF}  (+ ${missingChecks.length} report line(s))`); }
console.log(changed ? "Applied. Restart npm run dev, then type the two questions again." : "Nothing to do: already applied.");
