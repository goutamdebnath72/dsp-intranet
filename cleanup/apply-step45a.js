// cleanup/apply-step45a.js
//
// Edits TWO existing files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 45a: ONE FILE for the nicknames and groupings of the departments.
//   New (in the zip): src/lib/nl2sql/departmentAliases.ts   pure data: a group = aliases + the name starts of its rows; to teach a nickname, edit ONE line
//                     src/lib/nl2sql/__fixtures__/departments.real.json   a saved copy of the 300 real department rows, for the test only
//                     src/lib/nl2sql/departmentAliases.selftest.ts        checks the file against the real rows (176 checks): no entry matches nothing, no alias in two groups, the row counts, the questions named by the owner
//                     src/lib/nl2sql/departmentFamilies.selftest.ts       (replaced: CCP now means the CCP rows only)
//   aliasHints.ts   DEPARTMENT_FAMILIES now comes from that file; three short forms removed (CHRD INDUSTRIAL 2 and MANAGEMENT TRAINEE point to no real row; "plant medical" pointed to IPU and now
//                   belongs to the MAIN HOSPITAL group with PMU)
//   context.ts      departmentFamilies: besides the written groups, every OTHER department named by its own name (the part before the bracket) means all the rows that start with it
//                   (ACVS and ACVS - OFFICE, L & D with L & D IND and L & D OFFICE, FOUNDRY with its 12 sections ...); C & IT and Plant Garage (listed by code in every prompt) are not repeated;
//                   a family of more than 20 rows lists only its ids
// Run step 44d first.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step45a.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/nl2sql/aliasHints.ts",
  "marker": "from \"./departmentAliases\"",
  "old": "// src/lib/nl2sql/aliasHints.ts\n",
  "new": "import { DEPARTMENT_GROUPS, type DepartmentGroup } from \"./departmentAliases\";\n// src/lib/nl2sql/aliasHints.ts\n"
 },
 {
  "file": "src/lib/nl2sql/aliasHints.ts",
  "marker": "export const DEPARTMENT_FAMILIES: DepartmentGroup[] = DEPARTMENT_GROUPS;",
  "old": "/**\n * Large departments made of sub-departments, each with one or more sections. The people sit in the SECTION rows (\"CO & CC (BATTERY)\"), so a question that names the department\n * means ALL of its rows. They are found in the live list by the START of the normalised row name (context.ts departmentFamilies), never by exact name. CCP (Continuous Casting Plant)\n * is part of SMS even when its row has its own name. Plant Garage (with M.H.E.M.D. and M.H.E.O.D.) and C & IT are listed by code in MULTI_ROW_DEPARTMENTS above.\n */\nexport const DEPARTMENT_FAMILIES: { name: string; aliases: string[]; prefixes: string[]; stems?: string[] }[] = [\n  { name: \"CO & CC\", aliases: [\"cocc\", \"co&cc\", \"co & cc\", \"co and cc\", \"coke oven and coal chemical\"], prefixes: [\"co and cc\"] },\n  { name: \"BLAST FURNACE (BF)\", aliases: [\"bf\", \"blast furnace\", \"blast furnaces\"], prefixes: [\"bf\", \"b f\", \"blast furnace\"] },\n  { name: \"SMS (STEEL MELTING SHOP, with CCP)\", aliases: [\"sms\", \"s m s\", \"steel melting shop\", \"ccp\", \"continuous casting plant\", \"continuous casting\"], prefixes: [\"sms\", \"s m s\", \"ccp\", \"continuous casting\"] },\n  { name: \"WHEEL & AXLE (W&A)\", aliases: [\"w&a\", \"w & a\", \"w and a\", \"wheel and axle\", \"wheel & axle\", \"wheel axle\"], prefixes: [\"w and a\", \"wheel\"] },\n  { name: \"MERCHANT MILL\", aliases: [\"merchant mill\"], prefixes: [\"merchant mill\"] },\n  { name: \"SECTION MILL\", aliases: [\"section mill\", \"sec mill\"], prefixes: [\"section mill\", \"sec mill\"] },\n  // Heavy Maintenance (HM): the row names are NOT yet checked against the live list (a stem also matches \"heavy maintenance\" and \"heavy maint.\"); no row matches = no family, nothing is lost.\n  { name: \"HEAVY MAINTENANCE (HM)\", aliases: [\"hm\", \"hmd\", \"heavy maintenance\", \"heavy maint\"], prefixes: [\"hm\", \"h m\", \"hmd\"], stems: [\"heavy maint\"] },\n];\n",
  "new": "/** The nicknames and groupings of the large departments now live in ONE file, departmentAliases.ts (step 45a); this name stays for the code that reads it. */\nexport const DEPARTMENT_FAMILIES: DepartmentGroup[] = DEPARTMENT_GROUPS;\n"
 },
 {
  "file": "src/lib/nl2sql/aliasHints.ts",
  "marker": "step 45a: \"CHRD INDUSTRIAL 2\" removed",
  "old": "  [\"CHRD INDUSTRIAL 2\", [\"training institute\"]],\n",
  "new": "  // step 45a: \"CHRD INDUSTRIAL 2\" removed (no such row in the real list; CHRD is to be mapped to its real row)\n"
 },
 {
  "file": "src/lib/nl2sql/aliasHints.ts",
  "marker": "step 45a: \"MANAGEMENT TRAINEE\" removed",
  "old": "  [\"MANAGEMENT TRAINEE\", [\"mt\"]],\n",
  "new": "  // step 45a: \"MANAGEMENT TRAINEE\" removed (no such department; it is a designation)\n"
 },
 {
  "file": "src/lib/nl2sql/aliasHints.ts",
  "marker": "step 45a: \"plant medical\" no longer points to IPU",
  "old": "  [\"IPU\", [\"plant medical\"]],\n",
  "new": "  // step 45a: \"plant medical\" no longer points to IPU: Plant Medical (PMU) is in the MAIN HOSPITAL group of departmentAliases.ts\n"
 },
 {
  "file": "src/lib/nl2sql/context.ts",
  "marker": "const NO_AUTO_FAMILY = new Set",
  "old": "/** The large departments (DEPARTMENT_FAMILIES) a question names, each with ALL its rows in the live list. */\nexport function departmentFamilies(question: string, all: DepartmentRow[]): { name: string; rows: DepartmentRow[] }[] {\n  const qNorm = \" \" + normText(question) + \" \";\n  const out: { name: string; rows: DepartmentRow[] }[] = [];\n  for (const f of DEPARTMENT_FAMILIES) {\n    if (!f.aliases.some((a) => qNorm.includes(\" \" + normText(a) + \" \"))) continue;\n    const rows = all.filter((d) => {\n      const n = normText(d.name);\n      return f.prefixes.some((p) => n === p || n.startsWith(p + \" \")) || (f.stems ?? []).some((s) => n.startsWith(s));\n    });\n    if (rows.length) out.push({ name: f.name, rows });\n  }\n  return out;\n}\n\n",
  "new": "/** Departments whose own name must NOT start a family of their own: \"ed\" is also the designation Executive Director. */\nconst NO_AUTO_FAMILY = new Set([\"ed\"]);\n\n/**\n * The departments a question names, each with ALL its rows in the live list (the people sit in the section rows):\n *   1. the groups written in departmentAliases.ts: nicknames and groupings that the names cannot tell (cocc, W&A, hydraulic lab, main hospital ...);\n *   2. every other department named by its OWN name (the part before the bracket): all the rows that start with it (ACVS and ACVS - OFFICE, L & D with L & D IND and L & D OFFICE ...).\n */\nexport function departmentFamilies(question: string, all: DepartmentRow[]): { name: string; rows: DepartmentRow[] }[] {\n  const qNorm = \" \" + normText(question) + \" \";\n  const startsWith = (d: DepartmentRow, p: string) => {\n    const n = normText(d.name);\n    return n === p || n.startsWith(p + \" \");\n  };\n  const out: { name: string; rows: DepartmentRow[] }[] = [];\n  for (const f of DEPARTMENT_FAMILIES) {\n    if (!f.aliases.some((a) => qNorm.includes(\" \" + normText(a) + \" \"))) continue;\n    const rows = all.filter((d) => f.prefixes.some((p) => startsWith(d, p)) || (f.stems ?? []).some((s) => normText(d.name).startsWith(s)));\n    if (rows.length) out.push({ name: f.name, rows });\n  }\n  // C & IT and Plant Garage are listed by code in EVERY prompt already (MULTI_ROW_DEPARTMENTS): they are not repeated here\n  const byCode = new Set(MULTI_ROW_DEPARTMENTS.flatMap((m) => m.codes));\n  const covered = new Set([...out.flatMap((f) => f.rows.map((r) => r.id)), ...all.filter((d) => byCode.has(d.code)).map((d) => d.id)]);\n  const seen = new Set<string>();\n  const auto: { name: string; rows: DepartmentRow[] }[] = [];\n  for (const d of all) {\n    const base = d.name.replace(/\\s*\\(.*$/, \"\").trim();\n    const m = normText(base);\n    if (m.length < 2 || NO_AUTO_FAMILY.has(m) || seen.has(m) || !qNorm.includes(\" \" + m + \" \")) continue;\n    seen.add(m);\n    const rows = all.filter((r) => startsWith(r, m));\n    if (rows.length < 2 || rows.every((r) => covered.has(r.id))) continue;\n    auto.push({ name: base, rows });\n  }\n  auto.sort((x, y) => y.rows.length - x.rows.length);\n  const kept: { name: string; rows: DepartmentRow[] }[] = [];\n  for (const f of auto) if (!kept.some((k) => f.rows.every((r) => k.rows.some((x) => x.id === r.id)))) kept.push(f);\n  return [...out, ...kept];\n}\n\n"
 },
 {
  "file": "src/lib/nl2sql/context.ts",
  "marker": "f.rows.length <= 20",
  "old": "f.rows.length <= 40",
  "new": "f.rows.length <= 20"
 }
];
const CHECKS = [
 {
 "marker": "One alias file for the departments, automatic groups by name, no dead short forms",
 "line": "{ grep -q \"DEPARTMENT_GROUPS\" src/lib/nl2sql/aliasHints.ts && grep -q \"NO_AUTO_FAMILY\" src/lib/nl2sql/context.ts && test -f src/lib/nl2sql/departmentAliases.ts; } 2>/dev/null; report \"One alias file for the departments, automatic groups by name, no dead short forms\" $?"
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

if (!fs.existsSync("src/lib/nl2sql/departmentAliases.ts") || !read("src/lib/nl2sql/departmentAliases.ts").includes("DEPARTMENT_GROUPS")) {
  console.error("NOT APPLIED: src/lib/nl2sql/departmentAliases.ts is not there. Unzip patch_step45a.zip first. Nothing was changed.");
  process.exit(1);
}
{
  const hints = read("src/lib/nl2sql/aliasHints.ts");
  if (!hints.includes("HEAVY MAINTENANCE (HM)") && !hints.includes('from "./departmentAliases"')) {
    console.error("NOT APPLIED: step 44d is not applied yet (aliasHints.ts has no Heavy Maintenance entry). Run   node cleanup/apply-step44d.js   first, then this one. Nothing was changed.");
    process.exit(1);
  }
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
