// cleanup/apply-step68c.js
//
// Step 68c: the PAX EDITOR runs on the shared kit (authorisations, history, lock and "who is acting" from src/lib/facility/* and the shared tables of sql/17): with 68b, BOTH tools now use one module.
// It needs step 68b applied first. The zip brings src/lib/pax/admin/store.ts and api.ts and the tests; this script checks that 68b is there and that the zip's files are in place, and writes the row of this step in STATUS.md.
// BEFORE installing, run src/lib/nl2sql/sql/17_facility_kit.sql ONCE MORE in the Supabase SQL editor (safe to repeat): it copies what the PAX old tables received since 68a. Nothing changes on screen.
// Run from the project root:  node cleanup/apply-step68c.js        Safe to run twice.

const fs = require("fs");
const path = require("path");

const ROW_68C = "| 68c | **Piece 1, step C: the PAX EDITOR now runs on the shared kit too: BOTH tools use ONE module.** Its authorisations, its history, its global write lock and its \"who is acting\" check come from `src/lib/facility/*` and the shared tables of sql/17 (tool `pax`); the PAX store's own copies are gone (`store.ts` keeps every export other files use, each now a one-line call into the kit; the kit's one `Forbidden` is thrown and caught by both tools). The old tables `pax_delegate` and `pax_directory_audit` are no longer read or written (kept, not dropped). The \"tables missing\" message of the PAX `api.ts` now names sql/17. The model's schema guard also forbids the shared tables. NO CHANGE ON SCREEN and none in any rule or word. RUN FIRST: sql/17 once more (repeatable) so that anything written to the PAX old tables since 68a is copied; its closing counts must still match. WHAT IS NOW SHARED BY THE EMPLOYEE MANAGER AND THE PAX EDITOR: who may act (HOD or delegate, per tool), authorising and withdrawing, the global write lock, the history lines and the last change of a record. Still written twice (next steps): the guarded save (lock the row, compare the version), the screen parts, the search-bar commands. PROOF (sandbox, NOT live): the PAX store test 109 (all 104 earlier checks now on the shared tables, plus 5: sql/17 twice, the old tables stay empty, a row in the shared table makes a delegate at once and its withdrawal at once, only the PAX tool counts, the source guard), the PAX click-through 66 and the employee one 86 unchanged, the shared-kit test 45 (both tools take their lock and authority from the kit), and the switch deliberately broken 3 ways (the HOD-only gate, the line's id in the history, the wrong tool's authorisations), each caught. NOT VERIFIED on the live database. | owner to run sql/17 again and install |";
const MARKER = "| 68c | **Piece 1, step C";
const ANCHOR = "| 68b | **Piece 1, step B";

function main() {
  const root = process.cwd();
  const emp = path.join(root, "src/lib/employees/admin/store.ts");
  const pax = path.join(root, "src/lib/pax/admin/store.ts");
  const st = path.join(root, "STATUS.md");
  if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(path.join(root, "src/lib/facility/authority.ts")) || !fs.existsSync(emp) || !fs.readFileSync(emp, "utf8").includes('sharedBegin(q, "employee"')) {
    console.error("This patch needs step 68b (patch_step68b.zip) to be applied first. Install that one (unzip, then node cleanup/apply-step68b.js), then unzip this one again and run this script.");
    process.exit(1);
  }
  if (!fs.existsSync(pax) || !fs.readFileSync(pax, "utf8").includes('sharedBegin(q, "pax"')) {
    console.error("The files of this patch are not in place: unzip patch_step68c.zip into the project (over the existing files) first, then run this script.");
    process.exit(1);
  }
  if (!fs.existsSync(st)) { console.error("STATUS.md: the file is missing"); process.exit(1); }
  const cur = fs.readFileSync(st, "utf8");
  if (cur.includes(MARKER)) { console.log("already there   STATUS.md\n\nNothing to do: step 68c is already applied."); return; }
  if (cur.split(ANCHOR).length - 1 !== 1) { console.error("NOTHING WAS WRITTEN. STATUS.md: the place for the new row (above the row of step 68b) was not found exactly once."); process.exit(1); }
  fs.writeFileSync(st, cur.replace(ANCHOR, () => ROW_68C + "\n" + ANCHOR));
  console.log("will change     STATUS.md\n\nDone: 1 change.");
}
main();
