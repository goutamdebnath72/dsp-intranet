// cleanup/apply-step44b.js
//
// Edits TWO existing files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 44b: PROMOTEE officers (JO) and DIRECT RECRUITS from the ticket.
// An executive ticket is 4 + a second digit + four more digits; the second digit never changes in a whole service life: 9 = joined as an executive on day 1 (a direct recruit), any other digit
// = promoted from the non-executives (a promotee, called JO for the first 18 months, a DGM or AGM later). So the promotees can always be found, whatever the designation is today.
//   src/lib/nl2sql/display.ts   the filter box of a list: "jo", "promotee", "promoted officers" show the promotees, "direct", "direct recruit", "day 1", "d1" the direct recruits (when the list shows a
//                               ticket column); they combine with a designation or a word: "jo agm", "direct gm", "jo roy". The designationFilter.ts of step 44a is replaced (it comes in the zip): the
//                               "jo = Junior Officer" designation shortcut is gone, there is no such designation.
//   src/lib/nl2sql/prompt.ts    the rule for the search model, added to the prompt ONLY for a question about promotees or direct recruits (the prompt has a size limit): promotee = cohort executive
//                               AND substr(ticket_no, 2, 1) <> '9'; direct recruit = substr(ticket_no, 2, 1) = '9'; JO is not a designation; with one worked example
// Run step 44a first. If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step44b.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/nl2sql/display.ts",
  "marker": "isTicketColumn, originOfTicket",
  "old": "import { alternativeMatches, canonicalTitle, compileAlternative, isDesignationColumn, splitAlternatives, squash } from \"./designationFilter\";",
  "new": "import { alternativeMatches, canonicalTitle, compileAlternative, isDesignationColumn, isTicketColumn, originOfTicket, splitAlternatives, squash } from \"./designationFilter\";"
 },
 {
  "file": "src/lib/nl2sql/display.ts",
  "marker": "const ticketColumn = columns.find(isTicketColumn);",
  "old": "  const designationColumn = columns.find(isDesignationColumn);\n",
  "new": "  const designationColumn = columns.find(isDesignationColumn);\n  const ticketColumn = columns.find(isTicketColumn);\n"
 },
 {
  "file": "src/lib/nl2sql/display.ts",
  "marker": "origin: ticketColumn ?",
  "old": "      title: designationColumn ? canonicalTitle(formatCell(r[designationColumn.key], designationColumn.kind)) : \"\",\n    };",
  "new": "      title: designationColumn ? canonicalTitle(formatCell(r[designationColumn.key], designationColumn.kind)) : \"\",\n      origin: ticketColumn ? originOfTicket(formatCell(r[ticketColumn.key], ticketColumn.kind)) : (\"\" as const),\n    };"
 },
 {
  "file": "src/lib/nl2sql/display.ts",
  "marker": "{ designations: designationColumn !== undefined, origins: ticketColumn !== undefined }",
  "old": "compileAlternative(a, known, designationColumn !== undefined)",
  "new": "compileAlternative(a, known, { designations: designationColumn !== undefined, origins: ticketColumn !== undefined })"
 },
 {
  "file": "src/lib/nl2sql/prompt.ts",
  "marker": "const ORIGIN_DOC = `PROMOTEES AND DIRECT RECRUITS",
  "old": "export function buildPrompt(input: PromptInput): string {",
  "new": "/** Added to the prompt ONLY when the question is about promotees or direct recruits (it costs the other questions nothing: the prompt has a size limit). */\nconst ORIGIN_DOC = `PROMOTEES AND DIRECT RECRUITS -- read from nlq.employees.ticket_no; true for a whole service life, whatever the designation is today. An executive ticket is 4 + a second digit + four more digits.\n  Second digit 9 = joined as an executive on day 1 (a DIRECT RECRUIT; \"day 1\", \"day-one\", \"direct\"). Any other second digit = PROMOTED from the non-executives (a PROMOTEE; \"promotee\", \"promoted officer(s)\", \"promoty\", \"JO\", \"JOs\"; they are called JO for the first 18 months and later hold the normal designation, even DGM or AGM).\n  promotees: cohort = 'executive' AND substr(ticket_no, 2, 1) <> '9'      direct recruits: cohort = 'executive' AND substr(ticket_no, 2, 1) = '9'\n  JO is NOT a designation: never look for 'JO' or 'Junior Officer' in the designation column. A designation the question also names is a second, separate condition (\"promotee DGMs\" = promotee AND designation 'Dy. General Manager'). Non-executives are neither.\n  Example -- \"how many promotee officers are there in each department\": SELECT department_code, department, count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND substr(ticket_no, 2, 1) <> '9' GROUP BY department_id, department_code, department ORDER BY count DESC, department_code\n`;\nexport const isOriginQuestion = (q: string): boolean => /\\b(promotee|promotees|promoty|promoted|jo|jos|direct recruits?|day[ -]?(1|one)|d1)\\b/i.test(q || \"\");\n\nexport function buildPrompt(input: PromptInput): string {"
 },
 {
  "file": "src/lib/nl2sql/prompt.ts",
  "marker": "if (isOriginQuestion(input.question)) parts.push(ORIGIN_DOC);",
  "old": "  const parts: string[] = [rules];\n",
  "new": "  const parts: string[] = [rules];\n  if (isOriginQuestion(input.question)) parts.push(ORIGIN_DOC);\n"
 }
];
const CHECKS = [
 {
 "marker": "The people filter and the search model know promotees (JO) and direct recruits from the ticket",
 "line": "{ grep -q \"originOfTicket\" src/lib/nl2sql/display.ts && grep -q \"isOriginQuestion\" src/lib/nl2sql/prompt.ts; } 2>/dev/null; report \"The people filter and the search model know promotees (JO) and direct recruits from the ticket\" $?"
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

if (!read("src/lib/nl2sql/designationFilter.ts").includes("originOfTicket")) {
  console.error("NOT APPLIED: src/lib/nl2sql/designationFilter.ts is not the new one (and step 44a must be applied first). Unzip patch_step44b.zip first. Nothing was changed.");
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
