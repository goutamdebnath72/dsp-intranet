// cleanup/apply-step66e.js
//
// Step 66e: the employee manager REDESIGNED (progress rail, step cards, ID card, one arrow for both dropdowns, light date placeholders, sections that open from top to bottom). It needs step 66d (the cumulative patch
// of 66b + 66c) to be applied first. The zip brings the files: employeeFormModel.ts, EmployeeAdminUi.tsx (new), EmployeeAdminPanel.tsx and its test (replaced), employeeFormModel.selftest.ts (new). This script only checks that
// 66d is there and writes the row of this step in STATUS.md. Run from the project root:  node cleanup/apply-step66e.js        Safe to run twice.

const fs = require("fs");
const path = require("path");

const ROW_66E = "| 66e | **The employee manager redesigned (owner, 1 Nov 2026: \"not modern, not eye catching, very traditional: rethink the whole design\").** THE LOOK: a progress rail of four steps (locked, glowing, ticked); step cards that are LOCKED (dimmed, dashed), ACTIVE (glowing) or DONE (green); icon-led inputs with a live green tick or red alert inside the box; a live ID card (gradient, initials, ticket in monospace, kind of employee) and an 'at a glance' guide; a sticky action bar with a gradient button and, when it is off, the first thing missing in words; a switch for the doctor flag; a review step with the old value struck through and the new one in green; coloured avatars in the lists and coloured dots in the history. THE ARROWS: the designation list and the department list draw ONE identical chevron at the same place (the thin native arrow and the heavy black triangle are switched off; the datalist's own indicator is kept only as an invisible click area). The empty 'dd/mm/yyyy' of a date is light. THE ORDER: the sections open FROM TOP TO BOTTOM and each keeps everything below it inactive: Posting opens when the Identity is complete and right (ticket of 6 digits not starting with 0, SAIL P.No. for a new employee, name); the Service dates when Posting is complete (a designation code and a department code that fit the ticket); Contact when BOTH dates are valid (for anybody but the HOD there are no dates: Contact opens with Posting). The button also waits for the last section, and its reason names the FIRST thing missing in the order of the form (an empty date is not an error, so 'Fill in both service dates to continue.' comes before any contact error). Consequence for the HOD: both dates are now needed to add or change somebody's contact; an authorised executive is not asked for dates. HOW IT IS BUILT: the file is split in three. `employeeFormModel.ts` (pure rules: values, codes to ids, what changed, `unlockedSections`, `reasonFor`), `EmployeeAdminUi.tsx` (ONLY the look: it decides nothing), `EmployeeAdminPanel.tsx` (the state and the requests; it re-exports what it always exported). The frame clips its glows with `overflow-clip` (overflow-hidden would stop the action bar from sticking). Every text size is one the modal's scale sheet knows (its test crawls the new file). PROOF (sandbox, NOT live; the form was RENDERED in Chromium with the project's Tailwind and Poppins and looked at, state by state): model 22, panel 73, scale sheet 42, and a click-through of the REAL panel against the real handler and a database (64 steps, HOD and delegate). NOT VERIFIED: the look in the owner's browser and in the real modal, Safari's datalist, Firefox's date boxes. | owner to install and test |";
const MARKER = "| 66e | **The employee manager redesigned";
const ANCHOR = "| 66c | **The designation list put right";

function main() {
  const root = process.cwd();
  const need = ["package.json", "src/lib/employees/admin/contact.ts", "src/lib/employees/admin/store.ts", "src/lib/nl2sql/sql/16_designations.sql"];
  const missing = need.filter((f) => !fs.existsSync(path.join(root, f)));
  if (missing.length) {
    console.error("This patch needs step 66d (patch_step66d_CUMULATIVE.zip) to be applied first. Missing: " + missing.join(", ") + "\nInstall that one (unzip, then node cleanup/apply-step66d.js), and then this one again.");
    process.exit(1);
  }
  const st = path.join(root, "STATUS.md");
  if (!fs.existsSync(st)) { console.error("STATUS.md: the file is missing"); process.exit(1); }
  const cur = fs.readFileSync(st, "utf8");
  if (cur.includes(MARKER)) { console.log("already there   STATUS.md\n\nNothing to do: step 66e is already applied."); return; }
  if (cur.split(ANCHOR).length - 1 !== 1) { console.error("NOTHING WAS WRITTEN. STATUS.md: the place for the new row (above the row of step 66c) was not found exactly once."); process.exit(1); }
  fs.writeFileSync(st, cur.replace(ANCHOR, () => ROW_66E + "\n" + ANCHOR));
  console.log("will change     STATUS.md\n\nDone: 1 change.");
}
main();
