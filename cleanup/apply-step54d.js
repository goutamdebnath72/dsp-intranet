#!/usr/bin/env node
// cleanup/apply-step54d.js -- Step 54d: a hospital question that asks something (which department? which unit? which doctor?) may ALSO carry a card (the soft first answer, the tables): the omnibar
// passes the card together with the question. One line of src/lib/nl2sql/omnibar.ts changes (the line that step 54a added); everything else of this patch is new or replaced files (unzip).
// ALL-OR-NOTHING and idempotent: if the line differs, it prints NOT APPLIED and changes nothing.
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const FILE = "src/lib/nl2sql/omnibar.ts";
const FROM = '      if (r.ask) return { kind: "clarify", answer: r.summary, ask: r.ask };\n';
const TO = '      if (r.ask) return { kind: "clarify", answer: r.summary, ask: r.ask, ...(r.card.status ? { hospital: r.card } : {}) };\n';
const refuse = (why) => { console.log("NOT APPLIED: " + why + "\nNothing was changed."); process.exit(1); };
for (const f of ["src/lib/hospital/engine.ts", "src/components/HospitalAnswerCard.tsx", "src/lib/nl2sql/departmentAsk.ts"]) if (!fs.existsSync(path.join(root, f))) refuse("the file " + f + " is missing (unzip the patch first)");
const p = path.join(root, FILE);
if (!fs.existsSync(p)) refuse("cannot find " + FILE + " (run this from the project root)");
const src = fs.readFileSync(p, "utf8");
if (src.includes(TO)) { console.log("Nothing to do: step 54d is already applied."); process.exit(0); }
if (src.split(FROM).length !== 2) refuse(FILE + " differs from what I expect (the line of step 54a is not there exactly once)");
fs.writeFileSync(p, src.replace(FROM, () => TO));
console.log("APPLIED: step 54d (1 line of " + FILE + " changed; the rest of the patch is new or replaced files).");
