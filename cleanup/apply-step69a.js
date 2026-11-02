// cleanup/apply-step69a.js
//
// Step 69a: small edits asked by the owner: the typed confirmation of a deletion (the card prints no number, pasting is switched off; employee manager and PAX editor, one shared component, the PAX server checks the typed number too),
// no E-mail field on an executive's Contact card, and the reason of a withdrawal in the PAX history. It needs step 68d applied first.
// The zip brings the files; this script checks that 68d is there and that the zip's files are in place, and writes the row of this step in STATUS.md. NO SQL.
// Run from the project root:  node cleanup/apply-step69a.js        Safe to run twice.

const fs = require("fs");
const path = require("path");

const ROW_69A = "| 69a | **Small edits asked by the owner (2 Nov 2026): the typed confirmation of a deletion (employee manager AND PAX editor), the executive's Contact card, the reason in the PAX history.** (1) DELETE: the confirmation card no longer prints the number to type: the employee card's title is only the name and its label \"Type his ticket number to confirm\"; the PAX card's title is only the place, the line plate shows dots, and its label is \"Type the PAX number to confirm\". Pasting, dropping and dragging into the box are switched off (\"Type it from memory\"), so the person has to know the number and type it. One shared component for both: `src/components/facility/TypedConfirm.tsx`. The PAX delete NEW needs the number typed and the SERVER checks it as the employee delete does: `deleteEntry(db, actor, id, { confirmNumber, version })` answers `invalid` (\"The PAX number typed does not match this line.\") for a wrong, empty or missing number; a stale version is still answered first (he looks again). What was typed belongs to one line as it stood: another line, or the same line changed by somebody, starts with an empty box. (2) CONTACT CARD: an executive's card no longer has the greyed \"E-mail - Not used for an executive\" field (only NIC mail and web-mail); a non-executive still has only E-mail. (3) PAX HISTORY: a withdrawal shows its reason like the employee manager's (\"Withdrew the authority of X (412991) (deleted with the employee)\", and under the name in the table). NO SQL. PROOF (sandbox, NOT live): the PAX store test 115 (6 new: wrong, empty, blank and missing number refused with the line still there; spaces around the right number fine; a stranger is forbidden and a stale version is stale before the number is judged; the reason in the sentence and under the name; a withdrawal by hand unchanged), the new TypedConfirm test 9, the employee panel test 98 and the PAX panel test 111 (the cards print no number, the shared box, the button waits, what was typed belongs to one line, the executive's card has no E-mail field), the PAX click-through 72 (6 new: the card prints no number, the box is empty, paste and drop cancelled, a wrong number keeps the button off, the right one switches it on, the box is empty again after a stale answer) and the employee click-through 88 (2 new), the scale-sheet guard 42, and the rules deliberately broken 5 ways (the PAX server stops checking; the box accepts a paste; the PAX title prints the number; the employee title prints the ticket; the history loses the reason), each caught. NOT VERIFIED on the live database or in a real browser (the paste block was proved with the events of the test, not with a real Cmd+V). | owner to install and test |";
const MARKER = "| 69a | **Small edits asked by the owner";
const ANCHOR = "| 68d | **Piece 1, step D";

function main() {
  const root = process.cwd();
  const auth = path.join(root, "src/lib/facility/authority.ts");
  const st = path.join(root, "STATUS.md");
  if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(auth) || !fs.readFileSync(auth, "utf8").includes("export async function revokeEverywhere")) {
    console.error("This patch needs step 68d (patch_step68d.zip) to be applied first. Install that one (unzip, then node cleanup/apply-step68d.js), then unzip this one again and run this script.");
    process.exit(1);
  }
  const need = [["src/components/facility/TypedConfirm.tsx", "export function TypedConfirm"], ["src/components/PaxAdminPanel.tsx", "TypedConfirm"], ["src/components/EmployeeAdminPanel.tsx", "TypedConfirm"], ["src/lib/pax/admin/store.ts", "confirmNumber"], ["src/lib/pax/admin/api.ts", "confirmNumber"]];
  const missing = need.filter(([f, w]) => !fs.existsSync(path.join(root, f)) || !fs.readFileSync(path.join(root, f), "utf8").includes(w)).map(([f]) => f);
  if (missing.length) {
    console.error("The files of this patch are not in place: unzip patch_step69a.zip into the project (over the existing files) first, then run this script. Not right yet: " + missing.join(", "));
    process.exit(1);
  }
  if (!fs.existsSync(st)) { console.error("STATUS.md: the file is missing"); process.exit(1); }
  const cur = fs.readFileSync(st, "utf8");
  if (cur.includes(MARKER)) { console.log("already there   STATUS.md\n\nNothing to do: step 69a is already applied."); return; }
  if (cur.split(ANCHOR).length - 1 !== 1) { console.error("NOTHING WAS WRITTEN. STATUS.md: the place for the new row (above the row of step 68d) was not found exactly once."); process.exit(1); }
  fs.writeFileSync(st, cur.replace(ANCHOR, () => ROW_69A + "\n" + ANCHOR));
  console.log("will change     STATUS.md\n\nDone: 1 change.");
}
main();
