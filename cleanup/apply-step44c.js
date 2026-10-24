// cleanup/apply-step44c.js
//
// Edits SIX existing files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 44c, from the owner's screenshots and answers:
//   1. JO is a DESIGNATION again (the first 18 months of a promotee, then Asst. Manager; there may be none now), found by its title like any other; "promotee" stays a CLASS read from the ticket.
//      The model was reading "list all JOs" as direct recruits. src/lib/nl2sql/prompt.ts (the conditional documentation), the filter (designationFilter.ts, in the zip)
//   2. "executives in cocc" found 0 rows: the short form brought no department row (the name has no word of 3 letters), and the people sit in the SECTION rows. A large department (CO & CC, BF, SMS with
//      CCP, W&A, Merchant Mill, Section Mill) now means ALL of its rows, found by the start of the row name; Plant Garage also answers to MHEMD and MHEOD.
//        src/lib/nl2sql/aliasHints.ts, context.ts, prompt.ts
//   3. a list of people no longer carries the model's column that repeats the total on every row ("Total count 16"): not on the cards, not in the table.    src/lib/nl2sql/seniorityDisplay.ts
//      The person card shows the department (name and code) on every card, also under a department heading.                                               src/components/OmnibarModal.tsx
//   4. the OPTIONAL ticket colours (switch "Ticket colours", off for everybody until a person turns it on, kept in that browser): direct recruit indigo with a hollow dot, promotee amber with a filled dot.
//        src/components/AnswerResult.tsx, OmnibarModal.tsx; new src/components/OriginSwitch.tsx, src/lib/ui/originTint.ts (in the zip)
// Run step 44b first. If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step44c.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/nl2sql/aliasHints.ts",
  "marker": "export const DEPARTMENT_FAMILIES",
  "old": "/** Words that department names abbreviate",
  "new": "/**\n * Large departments made of sub-departments, each with one or more sections. The people sit in the SECTION rows (\"CO & CC (BATTERY)\"), so a question that names the department\n * means ALL of its rows. They are found in the live list by the START of the normalised row name (context.ts departmentFamilies), never by exact name. CCP (Continuous Casting Plant)\n * is part of SMS even when its row has its own name. Plant Garage (with M.H.E.M.D. and M.H.E.O.D.) and C & IT are listed by code in MULTI_ROW_DEPARTMENTS above.\n */\nexport const DEPARTMENT_FAMILIES: { name: string; aliases: string[]; prefixes: string[] }[] = [\n  { name: \"CO & CC\", aliases: [\"cocc\", \"co&cc\", \"co & cc\", \"co and cc\", \"coke oven and coal chemical\"], prefixes: [\"co and cc\"] },\n  { name: \"BLAST FURNACE (BF)\", aliases: [\"bf\", \"blast furnace\", \"blast furnaces\"], prefixes: [\"bf\", \"b f\", \"blast furnace\"] },\n  { name: \"SMS (STEEL MELTING SHOP, with CCP)\", aliases: [\"sms\", \"s m s\", \"steel melting shop\", \"ccp\", \"continuous casting plant\", \"continuous casting\"], prefixes: [\"sms\", \"s m s\", \"ccp\", \"continuous casting\"] },\n  { name: \"WHEEL & AXLE (W&A)\", aliases: [\"w&a\", \"w & a\", \"w and a\", \"wheel and axle\", \"wheel & axle\", \"wheel axle\"], prefixes: [\"w and a\", \"wheel\"] },\n  { name: \"MERCHANT MILL\", aliases: [\"merchant mill\"], prefixes: [\"merchant mill\"] },\n  { name: \"SECTION MILL\", aliases: [\"section mill\", \"sec mill\"], prefixes: [\"section mill\", \"sec mill\"] },\n];\n\n/** Words that department names abbreviate"
 },
 {
  "file": "src/lib/nl2sql/aliasHints.ts",
  "marker": "aliases: [\"garage\", \"plant garage\", \"mhemd\"",
  "old": "    aliases: [\"garage\", \"plant garage\"],",
  "new": "    aliases: [\"garage\", \"plant garage\", \"mhemd\", \"mheod\", \"M.H.E.M.D.\", \"M.H.E.O.D.\"],"
 },
 {
  "file": "src/lib/nl2sql/context.ts",
  "marker": "DEPARTMENT_FAMILIES, DEPARTMENT_SHORT_FORMS",
  "old": "import { DEPARTMENT_SHORT_FORMS, DEPARTMENT_WORD_ABBREVIATIONS, DESIGNATION_SHORT_FORMS, MULTI_ROW_DEPARTMENTS } from \"./aliasHints\";",
  "new": "import { DEPARTMENT_FAMILIES, DEPARTMENT_SHORT_FORMS, DEPARTMENT_WORD_ABBREVIATIONS, DESIGNATION_SHORT_FORMS, MULTI_ROW_DEPARTMENTS } from \"./aliasHints\";"
 },
 {
  "file": "src/lib/nl2sql/context.ts",
  "marker": "const stems: string[] = [];",
  "old": "  for (const [name, aliases] of DEPARTMENT_SHORT_FORMS) {\n    if (aliases.some((a) => qNorm.includes(\" \" + normText(a) + \" \"))) meaningfulWords(name).forEach((w) => qWords.add(w));\n  }\n  if (!qWords.size) return [];\n  const scored = all\n    .map((d) => {\n      const dWords = meaningfulWords(d.name);\n      let score = 0;\n",
  "new": "  const stems: string[] = []; // a short form named in the question: the rows whose name STARTS with its full name (\"cocc\" -> \"CO & CC (BATTERY)\")\n  for (const [name, aliases] of DEPARTMENT_SHORT_FORMS) {\n    if (aliases.some((a) => qNorm.includes(\" \" + normText(a) + \" \"))) {\n      meaningfulWords(name).forEach((w) => qWords.add(w));\n      stems.push(normText(name));\n    }\n  }\n  if (!qWords.size && !stems.length) return [];\n  const scored = all\n    .map((d) => {\n      const dWords = meaningfulWords(d.name);\n      const dNorm = normText(d.name);\n      let score = stems.some((s) => dNorm === s || dNorm.startsWith(s + \" \")) ? 10 : 0;\n"
 },
 {
  "file": "src/lib/nl2sql/context.ts",
  "marker": "export function departmentFamilies",
  "old": "export function formatDepartments(",
  "new": "/** The large departments (DEPARTMENT_FAMILIES) a question names, each with ALL its rows in the live list. */\nexport function departmentFamilies(question: string, all: DepartmentRow[]): { name: string; rows: DepartmentRow[] }[] {\n  const qNorm = \" \" + normText(question) + \" \";\n  const out: { name: string; rows: DepartmentRow[] }[] = [];\n  for (const f of DEPARTMENT_FAMILIES) {\n    if (!f.aliases.some((a) => qNorm.includes(\" \" + normText(a) + \" \"))) continue;\n    const rows = all.filter((d) => {\n      const n = normText(d.name);\n      return f.prefixes.some((p) => n === p || n.startsWith(p + \" \"));\n    });\n    if (rows.length) out.push({ name: f.name, rows });\n  }\n  return out;\n}\n\n/** What the model is told about them (empty when the question names none, so the prompt does not grow). */\nexport function formatFamilies(families: { name: string; rows: DepartmentRow[] }[]): string {\n  if (!families.length) return \"\";\n  return (\n    \"DEPARTMENTS THE QUESTION NAMES THAT HAVE SECTIONS -- the people sit in the section rows, so a department named in the question means ALL of its rows: filter with department_id IN (the ids below) and say so in understood_as. Only when the person names one section is that single row meant.\\n\" +\n    families\n      .map((f) => `${f.name} (${f.rows.length} rows): department_id IN (${f.rows.map((r) => r.id).join(\", \")})` + (f.rows.length <= 40 ? `  -- ${f.rows.map((r) => `${r.code} ${r.name}`).join(\"; \")}` : \"\"))\n      .join(\"\\n\") +\n    \"\\n\\n\"\n  );\n}\n\nexport function formatDepartments("
 },
 {
  "file": "src/lib/nl2sql/prompt.ts",
  "marker": "departmentFamilies, formatDepartments",
  "old": "import { formatDepartments, formatDesignations, selectRelevantDepartments, type DynamicContext } from \"./context\";",
  "new": "import { departmentFamilies, formatDepartments, formatDesignations, formatFamilies, selectRelevantDepartments, type DynamicContext } from \"./context\";"
 },
 {
  "file": "src/lib/nl2sql/prompt.ts",
  "marker": "formatFamilies(departmentFamilies(input.question",
  "old": "  parts.push(\"DEPARTMENTS (live):\\n\" + formatDepartments(shown, input.context.departments.length));",
  "new": "  parts.push(\"DEPARTMENTS (live):\\n\" + formatFamilies(departmentFamilies(input.question, input.context.departments)) + formatDepartments(shown, input.context.departments.length));"
 },
 {
  "file": "src/lib/nl2sql/prompt.ts",
  "marker": "PROMOTEES, DIRECT RECRUITS AND JOs",
  "old": "const ORIGIN_DOC = `PROMOTEES AND DIRECT RECRUITS -- read from nlq.employees.ticket_no; true for a whole service life, whatever the designation is today. An executive ticket is 4 + a second digit + four more digits.\n  Second digit 9 = joined as an executive on day 1 (a DIRECT RECRUIT; \"day 1\", \"day-one\", \"direct\"). Any other second digit = PROMOTED from the non-executives (a PROMOTEE; \"promotee\", \"promoted officer(s)\", \"promoty\", \"JO\", \"JOs\"; they are called JO for the first 18 months and later hold the normal designation, even DGM or AGM).\n  promotees: cohort = 'executive' AND substr(ticket_no, 2, 1) <> '9'      direct recruits: cohort = 'executive' AND substr(ticket_no, 2, 1) = '9'\n  JO is NOT a designation: never look for 'JO' or 'Junior Officer' in the designation column. A designation the question also names is a second, separate condition (\"promotee DGMs\" = promotee AND designation 'Dy. General Manager'). Non-executives are neither.\n  Example -- \"how many promotee officers are there in each department\": SELECT department_code, department, count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND substr(ticket_no, 2, 1) <> '9' GROUP BY department_id, department_code, department ORDER BY count DESC, department_code\n`;\n",
  "new": "const ORIGIN_DOC = `PROMOTEES, DIRECT RECRUITS AND JOs -- \"promotee\" and \"direct recruit\" are CLASSES read from nlq.employees.ticket_no; they hold for a whole service life, whatever the designation is today. An executive ticket is 4 + a second digit + four more digits.\n  Second digit 9 = joined as an executive on day 1 (a DIRECT RECRUIT; \"day 1\", \"day-one\", \"direct\"). Any other second digit = PROMOTED from the non-executives (a PROMOTEE; \"promotee\", \"promoted officer(s)\", \"promoty\").\n  promotees: cohort = 'executive' AND substr(ticket_no, 2, 1) <> '9'      direct recruits: cohort = 'executive' AND substr(ticket_no, 2, 1) = '9'\n  \"JO\" / \"JOs\" / \"Junior Officer\" is a DESIGNATION, not a class: a promotee is called JO for the first 18 months, then becomes Asst. Manager. Filter it by title: lower(designation) LIKE 'junior officer%'. There may be none now (no promotion for over two years): then the honest answer is 0 rows; never answer a JO question with promotees or direct recruits.\n  A designation the question also names is a second, separate condition (\"promotee DGMs\" = promotee AND designation 'Dy. General Manager'). Non-executives are neither.\n  Example -- \"how many promotee officers are there in each department\": SELECT department_code, department, count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND substr(ticket_no, 2, 1) <> '9' GROUP BY department_id, department_code, department ORDER BY count DESC, department_code\n`;\n"
 },
 {
  "file": "src/lib/nl2sql/seniorityDisplay.ts",
  "marker": "export function dropRepeatedTotals",
  "old": "/** Everything a list of people needs before it is shown or exported: no internal rank, and a cohort column. */",
  "new": "/** A column that REPEATS the grand total on every row of a list of people (\"Total count 16\"): it is noise on a card and on a table row (the headline says it), so it is removed.\n *  Only a list with a ticket column, at least two rows, a name like total / count / cnt / ..._count and ONE value in every row; a count that differs per row is never touched. */\nconst TOTAL_COLUMN = /^(total|grand)|(^|_)(count|cnt)$/i;\nexport function dropRepeatedTotals(columns: string[], rows: Array<Record<string, any>>): { columns: string[]; rows: Array<Record<string, any>> } {\n  if (rows.length < 2 || !columns.includes(\"ticket_no\")) return { columns, rows };\n  const drop = new Set(columns.filter((c) => TOTAL_COLUMN.test(c) && rows.every((r) => String(r[c]) === String(rows[0][c]))));\n  if (drop.size === 0) return { columns, rows };\n  return {\n    columns: columns.filter((c) => !drop.has(c)),\n    rows: rows.map((r) => {\n      const o = { ...r };\n      for (const c of drop) delete o[c];\n      return o;\n    }),\n  };\n}\n\n/** Everything a list of people needs before it is shown or exported: no internal rank, and a cohort column. */"
 },
 {
  "file": "src/lib/nl2sql/seniorityDisplay.ts",
  "marker": "const c = addCohortColumn(a.columns, a.rows, people);",
  "old": "  const a = humanizeSeniority(columns, rows, people);\n  return addCohortColumn(a.columns, a.rows, people);\n",
  "new": "  const a = humanizeSeniority(columns, rows, people);\n  const c = addCohortColumn(a.columns, a.rows, people);\n  return dropRepeatedTotals(c.columns, c.rows);\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "from \"@/components/OriginSwitch\"",
  "old": "import { tidyDesignation } from \"@/lib/nl2sql/designationFilter\";\n",
  "new": "import { tidyDesignation } from \"@/lib/nl2sql/designationFilter\";\nimport { TicketText } from \"@/components/OriginSwitch\";\nimport { useOriginTint } from \"@/lib/ui/originTint\";\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "  onCopy,\n}: {",
  "old": "  onCopy,\n  hideDepartment = false,\n}: {",
  "new": "  onCopy,\n}: {"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "const [tint] = useOriginTint();",
  "old": "  /** Inside a department heading the department is not repeated on every card. */\n  hideDepartment?: boolean;\n}) {\n  return (\n",
  "new": "  /** Kept for the callers; the department (name and code) is now shown on every card, also under a department heading. */\n  hideDepartment?: boolean;\n}) {\n  const [tint] = useOriginTint();\n  return (\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "<TicketText ticket={emp.ticketNo} tint={tint} />",
  "old": "        <p className=\"text-xs text-neutral-500 truncate\">\n          {[\n            emp.ticketNo,\n            emp.sailPNo,\n            emp.designation ? `${tidyDesignation(emp.designation)}${emp.designationCode ? ` (${emp.designationCode})` : \"\"}` : null,\n            !hideDepartment && emp.department ? `${emp.department}${emp.departmentCode ? ` (${emp.departmentCode})` : \"\"}` : null,\n          ]\n            .filter(Boolean)\n            .join(\"  \\u00b7  \")}\n        </p>",
  "new": "        <p className=\"text-xs text-neutral-500 truncate\">\n          <TicketText ticket={emp.ticketNo} tint={tint} />\n          {[\n            emp.sailPNo,\n            emp.designation ? `${tidyDesignation(emp.designation)}${emp.designationCode ? ` (${emp.designationCode})` : \"\"}` : null,\n            emp.department ? `${emp.department}${emp.departmentCode ? ` (${emp.departmentCode})` : \"\"}` : null,\n          ]\n            .filter(Boolean)\n            .map((part, i) => `${emp.ticketNo || i > 0 ? \"  \\u00b7  \" : \"\"}${part}`)\n            .join(\"\")}\n        </p>"
 },
 {
  "file": "src/components/AnswerResult.tsx",
  "marker": "import { OriginSwitch, TicketText } from \"@/components/OriginSwitch\";",
  "old": "import { isDesignationColumn, tidyDesignation } from \"@/lib/nl2sql/designationFilter\";\n",
  "new": "import { isDesignationColumn, isTicketColumn, tidyDesignation } from \"@/lib/nl2sql/designationFilter\";\nimport { OriginSwitch, TicketText } from \"@/components/OriginSwitch\";\nimport { useOriginTint } from \"@/lib/ui/originTint\";\n"
 },
 {
  "file": "src/components/AnswerResult.tsx",
  "marker": "tint = false }: { value: unknown; col: DisplayColumn; tint?: boolean }",
  "old": "function Cell({ value, col }: { value: unknown; col: DisplayColumn }) {",
  "new": "function Cell({ value, col, tint = false }: { value: unknown; col: DisplayColumn; tint?: boolean }) {"
 },
 {
  "file": "src/components/AnswerResult.tsx",
  "marker": "{isTicketColumn(col) ? <TicketText",
  "old": "    return <span className=\"rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700\">{String(value)}</span>;",
  "new": "    return (\n      <span className=\"rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700\">\n        {isTicketColumn(col) ? <TicketText ticket={String(value)} tint={tint} /> : String(value)}\n      </span>\n    );"
 },
 {
  "file": "src/components/AnswerResult.tsx",
  "marker": "const [tint] = useOriginTint();",
  "old": "  const [query, setQuery] = useState(\"\");\n",
  "new": "  const [query, setQuery] = useState(\"\");\n  const [tint] = useOriginTint();\n"
 },
 {
  "file": "src/components/AnswerResult.tsx",
  "marker": "col={c} tint={tint} />",
  "old": "<Cell value={r[c.key]} col={c} />",
  "new": "<Cell value={r[c.key]} col={c} tint={tint} />"
 },
 {
  "file": "src/components/AnswerResult.tsx",
  "marker": "const hasTickets = Boolean(",
  "old": "  const current = available.includes(view) ? view : available[0];\n",
  "new": "  const current = available.includes(view) ? view : available[0];\n  const hasTickets = Boolean(display?.columns.some(isTicketColumn));\n"
 },
 {
  "file": "src/components/AnswerResult.tsx",
  "marker": "{hasTickets && <OriginSwitch />}",
  "old": "            </div>\n          )}\n        </div>\n      )}\n      {current === \"table\" && onOpenCircular",
  "new": "            </div>\n          )}\n          {hasTickets && <OriginSwitch />}\n        </div>\n      )}\n      {current === \"table\" && onOpenCircular"
 }
];
const CHECKS = [
 {
 "marker": "JO is a designation again, large departments mean all their sections, the repeated Total count is gone, ticket colours are an opt-in switch",
 "line": "{ grep -q \"DEPARTMENT_FAMILIES\" src/lib/nl2sql/aliasHints.ts && grep -q \"dropRepeatedTotals\" src/lib/nl2sql/seniorityDisplay.ts && grep -q \"OriginSwitch\" src/components/AnswerResult.tsx; } 2>/dev/null; report \"JO is a designation again, large departments mean all their sections, the repeated Total count is gone, ticket colours are an opt-in switch\" $?"
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

if (!read("src/lib/ui/originTint.ts").includes("useOriginTint") || !read("src/lib/nl2sql/designationFilter.ts").includes("originOfTicket")) {
  console.error("NOT APPLIED: the new files are not there (step 44b must be applied first). Unzip patch_step44c.zip first. Nothing was changed.");
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
