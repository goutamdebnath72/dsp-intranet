// cleanup/apply-step68b.js
//
// Step 68b: the EMPLOYEE MANAGER runs on the shared kit (authorisations, history, lock and "who is acting" from src/lib/facility/* and the shared tables of sql/17). It needs step 68a applied first.
// The zip brings src/lib/employees/admin/store.ts and api.ts and the tests; this script checks that 68a is there and that the zip's files are in place, and writes the row of this step in STATUS.md.
// BEFORE installing, run src/lib/nl2sql/sql/17_facility_kit.sql ONCE MORE in the Supabase SQL editor (safe to repeat): it copies what the old tables received since 68a. Nothing changes on screen.
// Run from the project root:  node cleanup/apply-step68b.js        Safe to run twice.

const fs = require("fs");
const path = require("path");

const ROW_68B = "| 68b | **Piece 1, step B: the EMPLOYEE MANAGER now runs on the shared kit.** Its authorisations, its history, its global write lock and its \"who is acting\" check come from `src/lib/facility/*` and the shared tables of sql/17 (`facility_delegate`, `facility_audit`, tool `employee`); the employee store's own copies of that code are gone: `store.ts` keeps every export other files use (`authorityOf`, `Forbidden`, `listDelegates`, `grantDelegate`, `revokeDelegate`, `recentAudit`, `DelegateResult`), each now a one-line call into the kit; one `Forbidden` class for every tool. The old tables `employee_admin_delegate` and `employee_admin_audit` are no longer read or written (kept, not dropped). The \"tables missing\" message of `api.ts` now names sql/17. NO CHANGE ON SCREEN and none in any rule or word. RUN FIRST: sql/17 again (it is repeatable) so that anything written to the old tables since 68a is copied; its closing counts must still match. KEPT ON PURPOSE: deleting an employee who is a delegate withdraws only his employee-manager authority (as before); whether he should lose the authority of EVERY tool is a decision for later. PROOF (sandbox, NOT live): the employee store test 138 (all 131 earlier checks unchanged in meaning but now on the shared tables, plus 7: sql/17 twice, the old tables stay empty, a row in the shared table makes a delegate at once and its withdrawal at once, only the employee tool counts, the source guard, delete withdraws one tool only), the employee click-through 86 unchanged on the shared tables, the shared-kit test 44, and the switch deliberately broken 3 ways (the HOD-only gate, the record's id in the history, withdrawal in every tool), each caught. NOT VERIFIED on the live database. | owner to run sql/17 again and install |";
const MARKER = "| 68b | **Piece 1, step B";
const ANCHOR = "| 68a | **Piece 1, step A";

function main() {
  const root = process.cwd();
  const store = path.join(root, "src/lib/employees/admin/store.ts");
  const st = path.join(root, "STATUS.md");
  if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(path.join(root, "src/lib/facility/authority.ts")) || !fs.existsSync(path.join(root, "src/lib/nl2sql/sql/17_facility_kit.sql"))) {
    console.error("This patch needs step 68a (patch_step68a.zip) to be applied first. Install that one (unzip, then node cleanup/apply-step68a.js), then unzip this one again and run this script.");
    process.exit(1);
  }
  if (!fs.existsSync(store) || !fs.readFileSync(store, "utf8").includes('sharedBegin(q, "employee"')) {
    console.error("The files of this patch are not in place: unzip patch_step68b.zip into the project (over the existing files) first, then run this script.");
    process.exit(1);
  }
  if (!fs.existsSync(st)) { console.error("STATUS.md: the file is missing"); process.exit(1); }
  const cur = fs.readFileSync(st, "utf8");
  if (cur.includes(MARKER)) { console.log("already there   STATUS.md\n\nNothing to do: step 68b is already applied."); return; }
  if (cur.split(ANCHOR).length - 1 !== 1) { console.error("NOTHING WAS WRITTEN. STATUS.md: the place for the new row (above the row of step 68a) was not found exactly once."); process.exit(1); }
  fs.writeFileSync(st, cur.replace(ANCHOR, () => ROW_68B + "\n" + ANCHOR));
  console.log("will change     STATUS.md\n\nDone: 1 change.");
}
main();
