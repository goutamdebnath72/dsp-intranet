// cleanup/apply-step21a.js
//
// Edits four existing source files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
//
//   src/lib/holidays/terms.ts        a year with no data loaded still has recognisable holiday names
//                                    (so "when is Diwali in 2019?" is answered at once, not sent to the model)
//   src/lib/holidays/analytics.ts    year comparison: the totals count each real day once
//   src/lib/employees/analytics.ts   "how many holidays in 2024?" counts each real day once (40, not 54), like the
//                                    Holiday List; the comparison explains why the types add up to more
//   cleanup/check-fixes.sh           two report lines
//
// Run from the project root:   node cleanup/apply-step21a.js

const fs = require("fs");

const EDITS = [
 {
  "file": "src/lib/holidays/terms.ts",
  "marker": "A year with no data loaded has no names of its own",
  "old": "    const rows: Array<{ name: string; aliases: string[] | null }> = year\n      ? await d.query(\n          `SELECT DISTINCT hm.name, hm.aliases\n             FROM holidaymaster hm\n             JOIN holidayyear hy ON hy.\"holidayMasterId\" = hm.id\n            WHERE hy.year = $1`,\n          [year],\n        )\n      : await d.query(`SELECT DISTINCT name, aliases FROM holidaymaster`);\n",
  "new": "    let rows: Array<{ name: string; aliases: string[] | null }> = year\n      ? await d.query(\n          `SELECT DISTINCT hm.name, hm.aliases\n             FROM holidaymaster hm\n             JOIN holidayyear hy ON hy.\"holidayMasterId\" = hm.id\n            WHERE hy.year = $1`,\n          [year],\n        )\n      : await d.query(`SELECT DISTINCT name, aliases FROM holidaymaster`);\n    // A year with no data loaded has no names of its own. Fall back to every known name, so that\n    // \"when is Diwali in 2019?\" is still recognised as a holiday question and is answered at once with\n    // \"I don't have holiday data loaded for 2019 yet\" (which the answer code already produces), instead of\n    // being passed to the language model, which cost about 5,000 tokens and 5 to 12 seconds to say nothing useful.\n    if (year && rows.length === 0) {\n      rows = await d.query(`SELECT DISTINCT name, aliases FROM holidaymaster`);\n    }\n"
 },
 {
  "file": "src/lib/holidays/analytics.ts",
  "marker": "ONE holiday (the same rule as the Holiday List)",
  "old": "    const totalA = byType.reduce((s, r) => s + r.a, 0);\n    const totalB = byType.reduce((s, r) => s + r.b, 0);\n",
  "new": "    // The headline totals count each real day once: a day that is both a Festival and a Restricted holiday has\n    // two rows (the per-type counts above) but is ONE holiday (the same rule as the Holiday List).\n    const occasions: Array<{ year: number; n: number }> = await d.query(\n      `SELECT year, count(*)::int AS n\n         FROM (SELECT DISTINCT year, date, \"holidayMasterId\" FROM holidayyear WHERE year = ANY($1::int[])) s\n        GROUP BY year`,\n      [[yearA, yearB]],\n    );\n    const totalA = occasions.find((r) => r.year === yearA)?.n ?? 0;\n    const totalB = occasions.find((r) => r.year === yearB)?.n ?? 0;\n"
 },
 {
  "file": "src/lib/employees/analytics.ts",
  "marker": "Count each real day once",
  "old": "      const res = await queryHolidays({\n        op: \"count\",\n        filters: { year: intent.year, type: intent.type, category: intent.category },\n      });\n      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);\n      const label = intent.type ? `${HOLIDAY_TYPE_LABEL[intent.type]} holiday` : \"holiday\";\n      const noun = res.count === 1 ? label : `${label}s`;\n      const forCategory = intent.category ? ` for Category ${intent.category}` : \"\";\n      return {\n        kind: \"count\",\n        count: res.count,\n        answer: `There ${res.count === 1 ? \"is\" : \"are\"} ${res.count.toLocaleString()} ${noun} in ${intent.year}${forCategory}.`,\n      };\n",
  "new": "      const res = await queryHolidays({\n        op: \"list\",\n        filters: { year: intent.year, type: intent.type, category: intent.category },\n      });\n      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);\n      // Count each real day once. A day that is both a Festival and a Restricted holiday has two rows but is ONE\n      // holiday; the Holiday List counts it the same way (key: date + name), so the two numbers cannot disagree.\n      const entries = res.holidays ?? [];\n      const occasions = new Set(entries.map((r) => `${r.date}|${r.name}`)).size;\n      const sharedDays = entries.length - occasions;\n      const label = intent.type ? `${HOLIDAY_TYPE_LABEL[intent.type]} holiday` : \"holiday\";\n      const noun = occasions === 1 ? label : `${label}s`;\n      const forCategory = intent.category ? ` for Category ${intent.category}` : \"\";\n      const alsoCounted =\n        sharedDays > 0 ? ` (${entries.length} entries in all: ${sharedDays} ${sharedDays === 1 ? \"day is\" : \"days are\"} counted under two types)` : \"\";\n      return {\n        kind: \"count\",\n        count: occasions,\n        answer: `There ${occasions === 1 ? \"is\" : \"are\"} ${occasions.toLocaleString()} ${noun} in ${intent.year}${forCategory}${alsoCounted}.`,\n      };\n"
 },
 {
  "file": "src/lib/employees/analytics.ts",
  "marker": "so the types add up to more",
  "old": "      const parts = c.byType.map((t) => `${t.label} ${c.yearA}: ${t.a} vs ${c.yearB}: ${t.b}`);\n      return {\n        kind: \"count\",\n        count: c.totalA,\n        answer: compareTotalSentence(c.yearA, c.totalA, c.yearB, c.totalB, DateTime.now().year, parts.join(\"; \")),\n      };\n",
  "new": "      const parts = c.byType.map((t) => `${t.label} ${c.yearA}: ${t.a} vs ${c.yearB}: ${t.b}`);\n      // The totals count each real day once, the per-type numbers count every entry: say why the types add up to more.\n      const typeSum = c.byType.reduce((s, t) => s + t.a + t.b, 0);\n      const dualNote =\n        typeSum > c.totalA + c.totalB\n          ? \" (a day that is both a Festival and a Restricted holiday is counted once in the totals, so the types add up to more)\"\n          : \"\";\n      return {\n        kind: \"count\",\n        count: c.totalA,\n        answer: compareTotalSentence(c.yearA, c.totalA, c.yearB, c.totalB, DateTime.now().year, parts.join(\"; \") + dualNote),\n      };\n"
 }
];
const CHECKS = [
 {
  "marker": "a year with no data is still recognised as a holiday question",
  "line": "{ grep -q \"A year with no data loaded has no names of its own\" src/lib/holidays/terms.ts; } 2>/dev/null; report \"a year with no data is still recognised as a holiday question (answered at once, no model call)\" $?"
 },
 {
  "marker": "holiday counts and year comparisons count each real day once",
  "line": "{ grep -q \"Count each real day once\" src/lib/employees/analytics.ts && grep -q \"ONE holiday (the same rule as the Holiday List)\" src/lib/holidays/analytics.ts; } 2>/dev/null; report \"holiday counts and year comparisons count each real day once\" $?"
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

// ---- 1. verify EVERY anchor before writing anything
const plan = []; // { file, text }
const byFile = new Map();
for (const e of EDITS) byFile.set(e.file, byFile.get(e.file) ?? read(e.file));

for (const e of EDITS) {
  let text = byFile.get(e.file);
  if (text.includes(e.marker)) { console.log(`already  ${e.file}  (${e.marker.slice(0, 48)}...)`); continue; }
  const n = countOf(text, e.old);
  if (n !== 1) {
    console.error(`NOT APPLIED: ${e.file} does not contain the expected code exactly once (found ${n}). Nothing was changed. This file differs from the one the patch was made for: send it to me.`);
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
  const lines = missingChecks.map((c) => c.line).join("\n");
  cf = cf.slice(0, first) + "\n" + lines + cf.slice(first);
}

// ---- 2. write (every anchor was verified above)
let changed = 0;
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
if (missingChecks.length) { fs.writeFileSync(CF, cf); changed++; console.log(`edited   ${CF}  (+ ${missingChecks.length} report line(s))`); }
console.log(changed ? "Applied." : "Nothing to do: already applied.");
