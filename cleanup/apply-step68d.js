// cleanup/apply-step68d.js
//
// Step 68d: an employee who is DELETED loses the authority of EVERY tool (the kit's `revokeEverywhere`, called by the employee delete in the same transaction; one history line in each tool's history).
// It needs step 68c applied first. The zip brings src/lib/facility/authority.ts, src/lib/employees/admin/store.ts and the tests; this script checks that 68c is there and that the zip's files are in place, and writes the row of this step in STATUS.md.
// NO SQL. Nothing changes on screen. Run from the project root:  node cleanup/apply-step68d.js        Safe to run twice.

const fs = require("fs");
const path = require("path");

const ROW_68D = "| 68d | **Piece 1, step D: an employee who is DELETED loses the authority of EVERY tool (owner's decision, 2 Nov 2026: \"without a second thought a big YES\").** Until now the employee manager withdrew only its OWN tool's authority from a deleted employee who was a delegate (kept identical on purpose in 68b). NOW the kit has `revokeEverywhere` (`src/lib/facility/authority.ts`): in the SAME transaction as the deletion it withdraws every active authorisation of that person in every tool (the employee manager, the PAX editor, and any tool added later) and writes one history line in EACH tool's own history (action `revoke`, reason \"deleted with the employee\", who did it as HOD); both happen or neither. Other people's authorisations and earlier withdrawals are left alone; a person with none: nothing happens and nothing is written. The employee delete calls it instead of its own one-tool UPDATE; the history lines come in the same order as before (the deletion, then the withdrawals). NO SQL, NO CHANGE of any screen or word. PROOF (sandbox, NOT live): the shared-kit test 50 (5 new: every tool at once, even a tool the registry does not know yet; one history line per tool in that tool's own history with who, role, whom and why; other people untouched and nothing written the second time; earlier withdrawals untouched; rolled back with the caller's transaction), the employee store test 139 (the delete test now proves the PAX authority goes too, with a line in each tool's history, and that someone else's authorisations stay), the employee click-through 86 unchanged, and the rule deliberately broken 4 ways (only the employee tool; no history lines in the other tools; the delete forgets to call it; it also withdraws other people), each caught. NOT VERIFIED on the live database. | owner to install and test |";
const MARKER = "| 68d | **Piece 1, step D";
const ANCHOR = "| 68c | **Piece 1, step C";

function main() {
  const root = process.cwd();
  const pax = path.join(root, "src/lib/pax/admin/store.ts");
  const auth = path.join(root, "src/lib/facility/authority.ts");
  const emp = path.join(root, "src/lib/employees/admin/store.ts");
  const st = path.join(root, "STATUS.md");
  if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(auth) || !fs.existsSync(pax) || !fs.readFileSync(pax, "utf8").includes('sharedBegin(q, "pax"')) {
    console.error("This patch needs step 68c (patch_step68c.zip) to be applied first. Install that one (unzip, then node cleanup/apply-step68c.js), then unzip this one again and run this script.");
    process.exit(1);
  }
  if (!fs.readFileSync(auth, "utf8").includes("export async function revokeEverywhere") || !fs.existsSync(emp) || !fs.readFileSync(emp, "utf8").includes("revokeEverywhere(q, actor, role, cur.ticketNo")) {
    console.error("The files of this patch are not in place: unzip patch_step68d.zip into the project (over the existing files) first, then run this script.");
    process.exit(1);
  }
  if (!fs.existsSync(st)) { console.error("STATUS.md: the file is missing"); process.exit(1); }
  const cur = fs.readFileSync(st, "utf8");
  if (cur.includes(MARKER)) { console.log("already there   STATUS.md\n\nNothing to do: step 68d is already applied."); return; }
  if (cur.split(ANCHOR).length - 1 !== 1) { console.error("NOTHING WAS WRITTEN. STATUS.md: the place for the new row (above the row of step 68c) was not found exactly once."); process.exit(1); }
  fs.writeFileSync(st, cur.replace(ANCHOR, () => ROW_68D + "\n" + ANCHOR));
  console.log("will change     STATUS.md\n\nDone: 1 change.");
}
main();
