// cleanup/apply-step67d.js
//
// Step 67d: faster saves (the table layout and the code lists are remembered for five minutes, per database connection). It needs step 67c applied first. The zip brings src/lib/employees/admin/store.ts and access.ts
// and the test; this script checks that 67c is there and that the zip's files are in place, and writes the row of this step in STATUS.md. NO SQL. Run from the project root:  node cleanup/apply-step67d.js     Safe to run twice.

const fs = require("fs");
const path = require("path");

const ROW_67D = "| 67d | **Faster saves: the table layout and the code lists are remembered for five minutes (owner, 1 Nov 2026).** Every search, add, change and delete first asked the database what columns the tables have (`discover`) and, for add and change, for the whole list of designations and departments (`loadLookups`): three round trips to Supabase on EVERY save. NOW: remembered for 5 minutes, SEPARATELY (the layout; the lists), on the DATABASE CONNECTION (`db.cacheKey`; the employee manager's own wrapper `typeormEmpDb` in `access.ts` carries the shared connection as its key; a wrapper without a key remembers nothing, as in the tests), never in a global, and only the layout and the codes and titles: nothing about a person. WHY IT CANNOT MAKE A SAVE WRONG: (1) when a panel opens (the `lookups` request) the layout and the lists are read FRESH and remembered, so the screen is never staler than the moment it was opened; (2) a save refused only because a designation or department is not in the REMEMBERED list reads the real list and checks again before giving up (a designation added by a script a minute ago works at once; one that exists nowhere is still refused); (3) a designation or department REMOVED since it was remembered is refused by the database (foreign key): that becomes the message 'The list of designations or departments has just changed: please open the form again and choose once more', the memory is cleared and nothing is half written. MEASURED (queries sent to the database by one save, counted by a wrapper): a CHANGE 11 -> 8, an ADD 18 -> 15; a search and a read lose one. On a machine where a query costs about half a second that is about 1.2 to 1.5 seconds per save: real, but the other 8 to 15 queries remain (the locks, the row, the login account, the history, the name tables). The PAX editor has no layout or code lists to remember (its lines must be read fresh each time, for the clash check), so it is unchanged. PROOF (sandbox, NOT live): the employee store test 131 (18 new: the counts above; the second save reads neither; a wrapper without a key remembers nothing; per database; expiry after 5 minutes and re-remembering; clear; a panel opening reads fresh; a designation added behind its back is accepted; one that exists nowhere is refused; one removed behind its back gives the message and writes nothing; the production wrapper's key) and the memory deliberately broken 5 ways (healing, the foreign-key message, the expiry, the fresh read, the key), each caught. NOT VERIFIED on the live database. | owner to install and test |";
const MARKER = "| 67d | **Faster saves";
const ANCHOR = "| 67c | **Adding an employee on the LIVE roster";

function main() {
  const root = process.cwd();
  const store = path.join(root, "src/lib/employees/admin/store.ts");
  const access = path.join(root, "src/lib/employees/admin/access.ts");
  const st = path.join(root, "STATUS.md");
  if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(store) || !fs.readFileSync(store, "utf8").includes('cols.notNullNoDefault.has("id")')) {
    console.error("This patch needs step 67c (patch_step67c.zip) to be applied first. Install that one (unzip, then node cleanup/apply-step67c.js), then unzip this one again and run this script.");
    process.exit(1);
  }
  if (!fs.readFileSync(store, "utf8").includes("SCHEMA_MEMORY_MS") || !fs.existsSync(access) || !fs.readFileSync(access, "utf8").includes("cacheKey: ds")) {
    console.error("The files of this patch are not in place: unzip patch_step67d.zip into the project (over the existing files) first, then run this script.");
    process.exit(1);
  }
  if (!fs.existsSync(st)) { console.error("STATUS.md: the file is missing"); process.exit(1); }
  const cur = fs.readFileSync(st, "utf8");
  if (cur.includes(MARKER)) { console.log("already there   STATUS.md\n\nNothing to do: step 67d is already applied."); return; }
  if (cur.split(ANCHOR).length - 1 !== 1) { console.error("NOTHING WAS WRITTEN. STATUS.md: the place for the new row (above the row of step 67c) was not found exactly once."); process.exit(1); }
  fs.writeFileSync(st, cur.replace(ANCHOR, () => ROW_67D + "\n" + ANCHOR));
  console.log("will change     STATUS.md\n\nDone: 1 change.");
}
main();
