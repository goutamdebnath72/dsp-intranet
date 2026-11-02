// cleanup/apply-step68a.js
//
// Step 68a: the shared kit, part A (one table for "who may use which tool", one for "what was done"; the shared code in src/lib/facility/). It needs step 67d applied first.
// The zip brings the new files (sql/17_facility_kit.sql, src/lib/facility/*); this script checks that 67d is there and that the zip's files are in place, and writes the row of this step in STATUS.md.
// Nothing of yours is changed and nothing changes on screen. BEFORE or AFTER installing, run src/lib/nl2sql/sql/17_facility_kit.sql ONCE in the Supabase SQL editor (the whole file; it is safe to run again).
// Run from the project root:  node cleanup/apply-step68a.js        Safe to run twice.

const fs = require("fs");
const path = require("path");

const ROW_68A = "| 68a | **Piece 1, step A of the shared kit: ONE table for \"who may use which tool\" and ONE for \"what was done\" (owner, 2 Nov 2026: make the employee manager and the PAX editor use one common module, then build the other tools on it).** NEW: `sql/17_facility_kit.sql` (the owner runs it once in Supabase): `public.facility_delegate` (tool, executive, who authorised, when, withdrawn or not; one ACTIVE authorisation per person and tool) and `public.facility_audit` (append only, like the two old history tables), both with row level security and no privilege for the public API roles, and a REPEATABLE copy of everything the four old tables hold (`employee_admin_delegate`, `employee_admin_audit`, `pax_delegate`, `pax_directory_audit`; each old row copied once, marked in `legacy_ref`; the file ends with a check of old and new counts, which must match). NEW CODE `src/lib/facility/`: `registry.ts` (the tools; a new tool is one line; the global write lock words are EXACTLY those the two tools already use), `types.ts`, `authority.ts` (`authorityOf`, `begin` = lock + who is acting, `listDelegates`, `grantDelegate`, `revokeDelegate`: same rules and same words as the two old copies), `audit.ts` (`writeAudit`, `recentAuditRows`, `lastChangeOf`). NOTHING CHANGES ON SCREEN: the employee manager and the PAX editor still use their own tables until 68b (employee) and 68c (PAX) move them onto this; the old tables are kept (never dropped here). PROOF (sandbox, NOT live): the new test 43 (the copy once and repeatable, order and dates kept, who is HOD / delegate / nobody per tool, authorising and withdrawing with the old words, two people at the same moment, the tables' rules, the history cannot be altered, the lock really held and only that tool's) and the code deliberately broken 5 ways, each caught. ALSO in this patch: two more PAX race tests (two people changing two lines to the same number at once; an add against a change), tests only. NOT VERIFIED on the live database (sql/17 is the one step to run there). | owner to run sql/17 and install |";
const MARKER = "| 68a | **Piece 1, step A";
const ANCHOR = "| 67d | **Faster saves";

function main() {
  const root = process.cwd();
  const store = path.join(root, "src/lib/employees/admin/store.ts");
  const st = path.join(root, "STATUS.md");
  if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(store) || !fs.readFileSync(store, "utf8").includes("SCHEMA_MEMORY_MS")) {
    console.error("This patch needs step 67d (patch_step67d.zip) to be applied first. Install that one (unzip, then node cleanup/apply-step67d.js), then unzip this one again and run this script.");
    process.exit(1);
  }
  const need = ["src/lib/nl2sql/sql/17_facility_kit.sql", "src/lib/facility/registry.ts", "src/lib/facility/types.ts", "src/lib/facility/authority.ts", "src/lib/facility/audit.ts"];
  const missing = need.filter((f) => !fs.existsSync(path.join(root, f)));
  if (missing.length) {
    console.error("The files of this patch are not in place: unzip patch_step68a.zip into the project first, then run this script. Missing: " + missing.join(", "));
    process.exit(1);
  }
  if (!fs.existsSync(st)) { console.error("STATUS.md: the file is missing"); process.exit(1); }
  const cur = fs.readFileSync(st, "utf8");
  if (cur.includes(MARKER)) { console.log("already there   STATUS.md\n\nNothing to do: step 68a is already applied."); return; }
  if (cur.split(ANCHOR).length - 1 !== 1) { console.error("NOTHING WAS WRITTEN. STATUS.md: the place for the new row (above the row of step 67d) was not found exactly once."); process.exit(1); }
  fs.writeFileSync(st, cur.replace(ANCHOR, () => ROW_68A + "\n" + ANCHOR));
  console.log("will change     STATUS.md\n\nDone: 1 change. Now run src/lib/nl2sql/sql/17_facility_kit.sql once in the Supabase SQL editor.");
}
main();
