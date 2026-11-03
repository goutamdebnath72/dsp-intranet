// cleanup/apply-step69c.js
//
// Step 69c: authorising a NON-EXECUTIVE (the red question with a tick and a cross; amber rows; the kit's `confirmNonExecutive`; sql/18). It needs step 69b applied first.
// BEFORE using it, run src/lib/nl2sql/sql/18_facility_nonexecutive.sql ONCE in the Supabase SQL editor (the whole file; safe to run again). The zip brings the files; this script checks that 69b is there and that the zip's
// files are in place, and writes the row of this step in STATUS.md.
// Run from the project root:  node cleanup/apply-step69c.js        Safe to run twice.

const fs = require("fs");
const path = require("path");

const ROW_69C = "| 69c | **Authorising a NON-EXECUTIVE (owner, 2 Nov 2026): the HOD can give the employee manager or the PAX editor to a non-executive, after confirming.** IN THE SCREEN (both tools, the same parts, `src/components/facility/NonExecutive.tsx`): by an exact six-digit TICKET the HOD finds anybody; a non-executive appears MARKED (amber row, \"Non-executive\" chip); \"Authorise\" then asks in RED \"Are you sure you want to authorise a non-executive?\" with a tick (Yes, authorise) and a cross (No); only the tick authorises. A ticket nobody has gets the red sentence \"No employee has this ticket number.\". By NAME only executives are offered (a name search never offers thousands of non-executives by accident). In the list of authorised people a non-executive's row is amber with the chip. IN THE KIT (`src/lib/facility`): `grantDelegate` takes `confirmNonExecutive`; without it a non-executive's grant answers `needs-confirmation` and writes nothing (a person who is not the HOD still gets `forbidden` first); the history line says \"non-executive, confirmed\" (in both histories); the registry has `allowNonExecutive` per tool (true for both; the Contact Access Log, not built yet, will say false and the kit then refuses it); the list view carries `nonExecutive`; one shared `resolveGrantTarget` replaces the grant code both handlers had twice; both handlers use `findPeopleToAuthorise` (renamed from `findExecutives`). A missing step in the database is named (\"run sql/18\"). SQL (run ONCE, BEFORE using it): `src/lib/nl2sql/sql/18_facility_nonexecutive.sql` widens the rule of `facility_delegate.ticket_no` from an executive's ticket (6 digits starting with 4) to any employee's (6 digits not starting with 0); rows stay. A non-executive delegate is a delegate like the others (he may add and modify, never delete, authorise or see dates; the HOD's requests give him 403); deleting him as an employee withdraws his authority everywhere (68d). PROOF (sandbox, NOT live): the kit test 58, employee store test 149, PAX store test 122, the new shared-parts test 12, both panel tests, the employee click-through 94 and the PAX one 78 (the question, the cross, the tick, the amber row, the unknown ticket, the withdrawal), the scale guard 42, and the rules deliberately broken 6 ways (no confirmation asked; the tool's flag ignored; the server takes the confirmation as given; a name search offers non-executives; the row not amber; the panel authorising without the question), each caught. NOT VERIFIED on the live database or in a real browser. | owner to run sql/18 and install |";
const MARKER = "| 69c | **Authorising a NON-EXECUTIVE";
const ANCHOR = "| 69b | **More small edits asked by the owner";

function main() {
  const root = process.cwd();
  const st = path.join(root, "STATUS.md");
  const has = (f, w) => fs.existsSync(path.join(root, f)) && fs.readFileSync(path.join(root, f), "utf8").includes(w);
  if (!fs.existsSync(path.join(root, "package.json")) || !has("src/lib/employees/admin/validate.ts", "mobileTyped") || !has("src/components/EmployeeAdminUi.tsx", "setUpper")) {
    console.error("This patch needs step 69b (patch_step69b.zip) to be applied first. Install that one (unzip, then node cleanup/apply-step69b.js), then unzip this one again and run this script.");
    process.exit(1);
  }
  const need = [["src/lib/nl2sql/sql/18_facility_nonexecutive.sql", "facility_delegate_ticket_no_check"], ["src/lib/facility/authority.ts", "confirmNonExecutive"], ["src/lib/facility/authorise.ts", "resolveGrantTarget"], ["src/components/facility/NonExecutive.tsx", "NonExecutiveAsk"], ["src/lib/pax/admin/api.ts", "findPeopleToAuthorise"], ["src/lib/employees/admin/api.ts", "findPeopleToAuthorise"], ["src/components/EmployeeAdminPanel.tsx", "NonExecutiveAsk"], ["src/components/PaxAdminPanel.tsx", "NonExecutiveAsk"]];
  const missing = need.filter(([f, w]) => !has(f, w)).map(([f]) => f);
  if (missing.length) {
    console.error("The files of this patch are not in place: unzip patch_step69c.zip into the project (over the existing files) first, then run this script. Not right yet: " + missing.join(", "));
    process.exit(1);
  }
  if (!fs.existsSync(st)) { console.error("STATUS.md: the file is missing"); process.exit(1); }
  const cur = fs.readFileSync(st, "utf8");
  if (cur.includes(MARKER)) { console.log("already there   STATUS.md\n\nNothing to do: step 69c is already applied."); return; }
  if (cur.split(ANCHOR).length - 1 !== 1) { console.error("NOTHING WAS WRITTEN. STATUS.md: the place for the new row (above the row of step 69b) was not found exactly once."); process.exit(1); }
  fs.writeFileSync(st, cur.replace(ANCHOR, () => ROW_69C + "\n" + ANCHOR));
  console.log("will change     STATUS.md\n\nDone: 1 change. If you have not yet, run src/lib/nl2sql/sql/18_facility_nonexecutive.sql once in the Supabase SQL editor.");
}
main();
