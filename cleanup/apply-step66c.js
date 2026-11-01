// cleanup/apply-step66c.js
//
// Step 66c: the designation list put right. For a tree where step 66b is applied. The zip brings sql/16_designations.sql (run it ONCE in the Supabase SQL editor: read its header; it runs in one transaction),
// its test, and the changed sample-date generator (sql/14) and its test. This script changes the one place of YOUR code that spells the old title:
//   src/lib/nl2sql/aliasHints.ts   the hint for "AGM": the title is now spelled "Asst. General Manager" (as it will be stored)
//   STATUS.md                      the row of this step
// Run from the project root:  node cleanup/apply-step66c.js        ALL-OR-NOTHING; safe to run twice.

const fs = require("fs");
const path = require("path");

const OLD = '  ["Asst.General Manager", ["AGM", "assistant general manager", "Asst GM"]],';
const NEW = '  ["Asst. General Manager", ["AGM", "assistant general manager", "Asst GM"]],';
const ROW_66C = "| 66c | **The designation list put right (owner, 1 Nov 2026), `sql/16_designations.sql`.** Found in the owner's own table (30 rows, 6484 people): 'Asst. Manager' was two rows (code 204 with 149 people, code 201 with 95) and 'Junior Manager' (code 201, 1 person) is not a designation; only `employee_roster` refers to `designation_grade`. Nobody is in training today, so the 96 people at code 201 are Asst. Managers: they MOVE to the code-204 row, in their relative order, after the 149 who are there (positions 150 to 245, rank = 12 x 10000 + position), and the two old rows are removed (only when nobody holds them). The spelling 'Asst.General Manager' becomes 'Asst. General Manager' in the list and in the login accounts (the search code already treats the two as one title; the one AI hint that spelled it the old way, in aliasHints.ts, is corrected). ADDED, EMPTY: Management Trainee and Junior Officer (code 201, rank 13), DNB Doctor (medical, code 201, rank 13), SOT, JOT, TA (non-executives, codes 400, 399, 398, ranks 25, 26, 27: below S-1 = 401). THE CODES OF DNB DOCTOR, SOT, JOT AND TA ARE PLACEHOLDERS chosen to fit the pattern (a higher code is a higher grade); when the right ones are known: `UPDATE public.designation_grade SET code = ... WHERE title = 'SOT' AND track = 'nonexec'` (and so on); nothing else changes, the employee manager reads this table. One transaction, safe to run twice, explicit ids (the id sequence of a table loaded with fixed ids is behind), the new rows numbered in a fixed order. The sample-date generator (`sql/14`) now treats SOT, JOT and TA like Management Trainee (joined within the last 12 months). PROOF (sandbox, NOT live): the fix run on a copy of the owner's exact 30 rows and head-counts with the live foreign key and a lagging id sequence (20 checks: exactly the 96 moved, nobody else touched, order kept, formula holds, second run changes nothing, a failure keeps nothing; the rank formula, the order and the move each mutated and the test fails); the sample-date test 85. NOT VERIFIED: the script on the live table (it fails and keeps nothing if that table has a NOT NULL column the script does not know). | owner to install and test |";
const STATUS_MARKER = "| 66c | **The designation list put right";
const STATUS_ANCHOR = "| 66b | **The employee manager, second round";

function main() {
  const root = process.cwd();
  if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(path.join(root, "src", "lib", "employees", "admin", "contact.ts"))) {
    console.error("Run this from the project root, in a tree where step 66b is applied.");
    process.exit(1);
  }
  const problems = [], report = [];
  const hf = path.join(root, "src/lib/nl2sql/aliasHints.ts");
  let hint = null;
  if (!fs.existsSync(hf)) problems.push("src/lib/nl2sql/aliasHints.ts: the file is missing");
  else {
    const t = fs.readFileSync(hf, "utf8");
    if (t.includes(NEW)) report.push("already there   src/lib/nl2sql/aliasHints.ts");
    else if (t.split(OLD).length - 1 === 1) { hint = t.replace(OLD, () => NEW); report.push("will change     src/lib/nl2sql/aliasHints.ts"); }
    else problems.push("src/lib/nl2sql/aliasHints.ts: the line of the hint was not found exactly once (it has been edited): send the file");
  }
  const st = path.join(root, "STATUS.md");
  let stNew = null;
  if (!fs.existsSync(st)) problems.push("STATUS.md: the file is missing");
  else {
    const cur = fs.readFileSync(st, "utf8");
    if (cur.includes(STATUS_MARKER)) report.push("already there   STATUS.md");
    else if (cur.split(STATUS_ANCHOR).length - 1 === 1) { stNew = cur.replace(STATUS_ANCHOR, () => ROW_66C + "\n" + STATUS_ANCHOR); report.push("will change     STATUS.md"); }
    else problems.push("STATUS.md: the place for the new row (above the row of step 66b) was not found exactly once");
  }
  if (problems.length) { console.error("NOTHING WAS WRITTEN. Problems:\n  " + problems.join("\n  ")); process.exit(1); }
  if (hint !== null) fs.writeFileSync(hf, hint);
  if (stNew !== null) fs.writeFileSync(st, stNew);
  console.log(report.join("\n"));
  const n = (hint !== null ? 1 : 0) + (stNew !== null ? 1 : 0);
  console.log(n ? `\nDone: ${n} file(s) changed.` : "\nNothing to do: step 66c is already applied.");
}
main();
