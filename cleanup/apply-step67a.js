// cleanup/apply-step67a.js
//
// Step 67a: the PAX directory editor REDESIGNED (teal family, underline tabs, a three-node rail, the telephone-line plate, a sticky action bar, rose confirmations), with ALL its logic untouched. It needs step 66e
// (the employee manager redesign) to be applied first. The zip brings the files: PaxAdminUi.tsx (new: only the look), PaxAdminPanel.tsx and its test (replaced). This script checks that 66e is there and writes
// the row of this step in STATUS.md. Run from the project root:  node cleanup/apply-step67a.js        Safe to run twice.

const fs = require("fs");
const path = require("path");

const ROW_67A = "| 67a | **The PAX directory editor redesigned (owner, 1 Nov 2026: \"implement it, keeping all the logic intact\").** THE LOOK, in the same family as the employee manager and with its own character: a TEAL frame (teal, cyan, sky) instead of indigo; UNDERLINE tabs with a teal bar; ONE 'line' card with a compact THREE-NODE RAIL (Department, Location (optional), PAX number: done / current / waiting) because PAX has three fields; icon-led, rounder, softly filled inputs with a live teal tick or red alert inside the box and a large monospace PAX number box; a TELEPHONE-LINE PLATE that fills in as the person types (department, location, the number, a dial-pad motif; 'New line' or 'Editing') with a row 'How it will read in the directory' (an empty location reads Office, the table's own word); a sticky action bar with the teal gradient button and, when it is off, the reason in words; the question asked when an entry clashes is now a card ABOVE the action bar (one Edit button per saved line, as before); the delete and withdraw confirmations are rose cards (the line that goes is shown with its number struck through); people have avatars; the history keeps its six columns with a coloured dot for the kind of action and the number as a chip. THE LOGIC IS UNTOUCHED: the file is split in two, `PaxAdminUi.tsx` (only the look: it keeps no state, makes no request, and asks the same `validateEntry` as the panel and the server for the ticks; it has no rule of its own) and `PaxAdminPanel.tsx`, whose 237-line logic section (every state, request, rule and handler) is BYTE-FOR-BYTE the one it had before (checked with diff); the panel re-exports what it always exported. The employee manager is not touched. The one thing that moved: the clash question is drawn above the action bar, as agreed. The Search button of the Change and Delete tabs stays. PROOF (sandbox, NOT live): the ORIGINAL 51-step PAX click-through, not modified at all, passes against the new look (add, clash questions, change, delete, authorise, withdraw, history, StrictMode, a real handler and database); the panel test 86 (62 old, two old checks adapted to the new markup: the error colour and the history cells, now read as cells; 24 new); the scale sheet's test 42 and it sees the new file; the REAL components were rendered with the data of the approved pictures and compared with them: four screens are pixel-identical, one differs by 0.14% (the wording of the 'Changing' line), three differ only by the Search button and by the clash card moving above the bar. NOT VERIFIED: the look in the owner's browser and in the real modal. | owner to install and test |";
const MARKER = "| 67a | **The PAX directory editor redesigned";
const ANCHOR = "| 66e | **The employee manager redesigned";

function main() {
  const root = process.cwd();
  const need = ["package.json", "src/components/EmployeeAdminUi.tsx", "src/components/employeeFormModel.ts", "src/components/PaxAdminPanel.tsx", "src/components/PaxAdminUi.tsx"];
  const missing = need.filter((f) => !fs.existsSync(path.join(root, f)));
  if (missing.length) {
    console.error("This patch needs step 66e (patch_step66e.zip) to be applied first, and its own files unzipped here. Missing: " + missing.join(", ") + "\nInstall patch_step66e.zip first (unzip, then node cleanup/apply-step66e.js), then unzip this one again and run this script.");
    process.exit(1);
  }
  const st = path.join(root, "STATUS.md");
  if (!fs.existsSync(st)) { console.error("STATUS.md: the file is missing"); process.exit(1); }
  const cur = fs.readFileSync(st, "utf8");
  if (cur.includes(MARKER)) { console.log("already there   STATUS.md\n\nNothing to do: step 67a is already applied."); return; }
  if (cur.split(ANCHOR).length - 1 !== 1) { console.error("NOTHING WAS WRITTEN. STATUS.md: the place for the new row (above the row of step 66e) was not found exactly once."); process.exit(1); }
  fs.writeFileSync(st, cur.replace(ANCHOR, () => ROW_67A + "\n" + ANCHOR));
  console.log("will change     STATUS.md\n\nDone: 1 change.");
}
main();
