// cleanup/apply-step69b.js
//
// Step 69b: more small edits asked by the owner after testing 69a: the executive's CUG mobile is OPTIONAL, the review shows what was typed in full, the tab is "Modify", the name is typed in capitals.
// It needs step 69a applied first. The zip brings the files; this script checks that 69a is there and that the zip's files are in place, and writes the row of this step in STATUS.md. NO SQL.
// Run from the project root:  node cleanup/apply-step69b.js        Safe to run twice.

const fs = require("fs");
const path = require("path");

const ROW_69B = "| 69b | **More small edits asked by the owner after testing 69a (2 Nov 2026): the executive's CUG mobile is OPTIONAL, the review shows what was typed, the tab is \"Modify\", the name is typed in capitals.** (1) An executive's CUG mobile is OPTIONAL when he is added and in every change (it arrives with some delay; added later in Modify): the field says \"Optional: the CUG number, 10 digits, 94347 and then 9 (or 2, 3). It can be added later.\", the card \"at a glance\" says \"The CUG mobile is optional: it can be added later in Modify.\", the button no longer waits for it and a change of another field is never blocked by a missing mobile (the `hasMobile` option is gone). What is typed must still be right: a CUG number for an executive, 10 digits for anybody else; something typed that holds no digit (\"abc\") is now REFUSED instead of being silently dropped. His login account is made with no number. (2) THE REVIEW (Add and Modify) shows what the person TYPED in full (mobile, NIC mail, web-mail, e-mail) so that he can check it; \"Back to the form\" still edits. The STORED value (the \"from\" of a change) stays masked, so no stored contact is shown without the logged reveal; the history never shows a contact value (unchanged). (3) The tab and the list button are \"Modify\" instead of \"Change\", in the employee manager AND the PAX editor. (4) The NAME is typed in CAPITALS at once (Add and Modify), the caret stays where it was. UNCHANGED, decided by the owner: the joining age is 18 for everybody and 23 for a direct recruit (49xxxx) only, because a promoted executive keeps his original joining date. The plan is renumbered: 69c = authorising a non-executive, 69d = photos. NO SQL. PROOF (sandbox, NOT live): validator 59, form model 34, employee panel test 102, PAX panel test 112, employee store test 142 (an executive added with no mobile, his login without a number, a change not blocked, the mobile added later, letters-only refused), the employee click-through 88 and the PAX one 72 on the new rules, the scale-sheet guard 42, and the rules deliberately broken 5 ways (the mobile required again; the review masked again; the old tab name; the name box not uppercasing; letters-only ignored again), each caught. NOT VERIFIED on the live database or in a real browser (the caret after a capital was proved only as code). | owner to install and test |";
const MARKER = "| 69b | **More small edits asked by the owner";
const ANCHOR = "| 69a | **Small edits asked by the owner";

function main() {
  const root = process.cwd();
  const st = path.join(root, "STATUS.md");
  const has = (f, w) => fs.existsSync(path.join(root, f)) && fs.readFileSync(path.join(root, f), "utf8").includes(w);
  if (!fs.existsSync(path.join(root, "package.json")) || !has("src/components/facility/TypedConfirm.tsx", "export function TypedConfirm") || !has("src/lib/pax/admin/store.ts", "confirmNumber")) {
    console.error("This patch needs step 69a (patch_step69a.zip) to be applied first. Install that one (unzip, then node cleanup/apply-step69a.js), then unzip this one again and run this script.");
    process.exit(1);
  }
  const need = [["src/lib/employees/admin/contact.ts", "CUG_RULE"], ["src/lib/employees/admin/validate.ts", "mobileTyped"], ["src/components/EmployeeAdminUi.tsx", "setUpper"], ["src/components/employeeFormModel.ts", "the NEW value is shown as typed"], ["src/components/PaxAdminPanel.tsx", 'label: "Modify"']];
  const missing = need.filter(([f, w]) => !has(f, w)).map(([f]) => f);
  if (missing.length) {
    console.error("The files of this patch are not in place: unzip patch_step69b.zip into the project (over the existing files) first, then run this script. Not right yet: " + missing.join(", "));
    process.exit(1);
  }
  if (!fs.existsSync(st)) { console.error("STATUS.md: the file is missing"); process.exit(1); }
  const cur = fs.readFileSync(st, "utf8");
  if (cur.includes(MARKER)) { console.log("already there   STATUS.md\n\nNothing to do: step 69b is already applied."); return; }
  if (cur.split(ANCHOR).length - 1 !== 1) { console.error("NOTHING WAS WRITTEN. STATUS.md: the place for the new row (above the row of step 69a) was not found exactly once."); process.exit(1); }
  fs.writeFileSync(st, cur.replace(ANCHOR, () => ROW_69B + "\n" + ANCHOR));
  console.log("will change     STATUS.md\n\nDone: 1 change.");
}
main();
