// cleanup/apply-step67c.js
//
// Step 67c: adding an employee on the LIVE roster (its id has no automatic numbering). It needs step 67b applied first. The zip brings src/lib/employees/admin/store.ts (the add takes the next id itself, with the table locked)
// and its test; this script checks that 67b is there and writes the row of this step in STATUS.md. NO SQL. Run from the project root:  node cleanup/apply-step67c.js        Safe to run twice.

const fs = require("fs");
const path = require("path");

const ROW_67C = "| 67c | **Adding an employee on the LIVE roster (owner's log, 1 Nov 2026).** Saving a new employee failed with `null value in column \"id\" of relation \"employee_roster\" violates not-null constraint`: the live roster's `id` has NO automatic numbering (its rows were loaded with fixed ids) and the insert never gave one (the test tables had automatic ids, so nothing caught it; the same trap as the designation list in 66c). FIX: when the column is NOT NULL without a default (the store already detects that kind of column), the add takes the NEXT id (highest plus one) itself, with the table LOCKED against every writer (`LOCK TABLE ... SHARE ROW EXCLUSIVE`): two adds at once get two different ids, and a SQL script inserting at the same moment makes the add wait and then take the next id after it, so two inserts can never take the same number. A table that numbers its own ids is left alone (no lock, no hand-made id). PROOF (sandbox, NOT live): the employee store test now 113 (5 new, with the table's id default DROPPED, as live: a plain add, two adds at once, an uncommitted script row, the login linked, the default restored); the fix removed makes the run crash with the same error, the lock removed makes the script-collision check fail. NOT VERIFIED on the live table: the add also creates the login account in `public.\"user\"`; if that table has a required column the manager does not fill, the next error will say which (the owner's query for NOT NULL columns without a default shows it beforehand). | owner to install and test |";
const MARKER = "| 67c | **Adding an employee on the LIVE roster";
const ANCHOR = "| 67b | **Two people at once";

function main() {
  const root = process.cwd();
  const store = path.join(root, "src/lib/employees/admin/store.ts");
  const ok67b = fs.existsSync(path.join(root, "package.json")) && fs.existsSync(path.join(root, "src/lib/concurrency/version.ts")) && fs.existsSync(store) && fs.readFileSync(store, "utf8").includes("async function lockRow");
  if (!ok67b) {
    console.error("This patch needs step 67b (patch_step67b.zip) to be applied first. Install that one (unzip, then node cleanup/apply-step67b.js), then unzip this one again and run this script.");
    process.exit(1);
  }
  if (!fs.readFileSync(store, "utf8").includes('cols.notNullNoDefault.has("id")')) {
    console.error("src/lib/employees/admin/store.ts of this patch is not in place: unzip patch_step67c.zip into the project (over the existing files) first, then run this script.");
    process.exit(1);
  }
  const st = path.join(root, "STATUS.md");
  if (!fs.existsSync(st)) { console.error("STATUS.md: the file is missing"); process.exit(1); }
  const cur = fs.readFileSync(st, "utf8");
  if (cur.includes(MARKER)) { console.log("already there   STATUS.md\n\nNothing to do: step 67c is already applied."); return; }
  if (cur.split(ANCHOR).length - 1 !== 1) { console.error("NOTHING WAS WRITTEN. STATUS.md: the place for the new row (above the row of step 67b) was not found exactly once."); process.exit(1); }
  fs.writeFileSync(st, cur.replace(ANCHOR, () => ROW_67C + "\n" + ANCHOR));
  console.log("will change     STATUS.md\n\nDone: 1 change.");
}
main();
