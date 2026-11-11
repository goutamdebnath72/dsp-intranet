// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/search/wordingGuard.selftest.ts
import { readFileSync } from "node:fs";
import { fixDiscretionIssuers, stripUnsupportedForce } from "./wordingGuard";
import { describeIssuers } from "./issuerFinding";
import type { SynthesisTable } from "./executiveSynthesis";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

// the words of circular 29 (2024), as stored
const SRC = `SL.NO: 1 | Nature of Violation: No person should work/get work done on any equipment without isolation. | Violation Stage: First Stage | Revised Consequence for Violation: 1st) Issuing counselling letter through concerned CGM/HOD
SL.NO: 4 | Nature of Violation: confined space | Violation Stage: Fourth Stage | Revised Consequence for Violation: 4th) Financial penalty (Officers: Rs.500/- and Employees / CW - Rs.200/-), For all subsequent violations/ Discretion of Head of Safety
SL.NO: In case of violation by Contract Worker (CW), Penalty shall be imposed on the contractor`;
const T: SynthesisTable = {
  columns: ["Violation", "Stage", "Revised Consequence", "Issued Through"],
  rows: [
    ["Equipment without isolation", "First Stage", "Issuing counselling letter", "concerned CGM/HOD"],
    ["Confined space", "Fourth Stage", "Financial penalty (Officers: ₹ 500/- and Employees / CW: ₹ 200/-) [For all subsequent violations]", "Head of Safety"],
    ["Mobile phone", "Fifth Stage", "Disciplinary action", "Not stated in circular"],
  ],
  sources: [29],
};

{ const r = fixDiscretionIssuers(T, SRC);
  ok("an authority named only as a discretion holder leaves the issuer column", r.fixes.length === 1 && r.table.rows[1][3] === "Not stated in circular", JSON.stringify(r.table.rows[1]));
  ok("the words go back into the consequence cell, inside its own condition bracket", r.table.rows[1][2] === "Financial penalty (Officers: ₹ 500/- and Employees / CW: ₹ 200/-) [For all subsequent violations / Discretion of Head of Safety]", r.table.rows[1][2]);
  ok("a real issuer (the circular says 'through concerned CGM/HOD') is left alone", r.table.rows[0][3] === "concerned CGM/HOD" && r.table.rows[2][3] === "Not stated in circular");
  ok("the original table is not changed", T.rows[1][3] === "Head of Safety"); }
{ const t2: SynthesisTable = { ...T, rows: [["x", "y", "Penalty", "Head of Safety"]] };
  const r = fixDiscretionIssuers(t2, SRC);
  ok("a consequence cell with no condition gets the words as a condition", r.table.rows[0][2] === "Penalty [Discretion of Head of Safety]", r.table.rows[0][2]); }
{ const r = fixDiscretionIssuers(T, SRC + " The penalty is issued by the Head of Safety.");
  ok("an authority the circular names elsewhere as the one who issues is kept", r.fixes.length === 0 && r.table.rows[1][3] === "Head of Safety"); }
{ const r = fixDiscretionIssuers(T, "nothing about it here");
  ok("an authority not found in the circulars at all is not this guard's business", r.fixes.length === 0); }
ok("a table with no issuer column is left alone", fixDiscretionIssuers({ ...T, columns: ["A", "B", "C", "D"] }, SRC).fixes.length === 0);
{ const r = fixDiscretionIssuers(T, SRC);
  const f = describeIssuers(r.table, "Under the revised Zero Tolerance Safety Rules, what consequence follows each violation at each stage, and through whom is it issued?", []);
  ok("after the guard, the 'who issues' finding no longer names the discretion holder as an issuer", !!f && !/Head of Safety/.test(f.text) && /"concerned CGM\/HOD" for 1 of the 3 rows/.test(f.text), f?.text); }

// force words
{ const r = stripUnsupportedForce("In cases of violation by a Contract Worker (CW), the penalty is imposed directly on the contractor.", SRC);
  ok("'directly' is taken out when the circular does not say it", r.text === "In cases of violation by a Contract Worker (CW), the penalty is imposed on the contractor." && r.removed[0] === "directly", r.text); }
{ const r = stripUnsupportedForce("Entering the plant intoxicated stops the progression, immediately triggering Standing Order Rule 29(X).", SRC);
  ok("'immediately' goes with its comma spacing intact", r.text === "Entering the plant intoxicated stops the progression, triggering Standing Order Rule 29(X).", r.text); }
ok("a word the circular uses is left alone", stripUnsupportedForce("It applies immediately.", SRC + " with immediate effect").text === "It applies immediately.");
ok("the word 'director' is not mistaken for 'directly'", stripUnsupportedForce("The Director approves.", SRC).text === "The Director approves.");
ok("a sentence that starts with the word is left as it is", stripUnsupportedForce("Immediately after, the rule applies.", SRC).text === "Immediately after, the rule applies.");
ok("text with none of the words is untouched", stripUnsupportedForce("Consequences escalate by stage.", SRC).text === "Consequences escalate by stage.");

const eng = readFileSync("src/lib/search/executiveSynthesis.ts", "utf8");
ok("the engine runs both guards after the checked table and before the 'who issues' finding", eng.indexOf("fixDiscretionIssuers(t, sourceText)") > 0 && eng.indexOf("fixDiscretionIssuers(t, sourceText)") < eng.indexOf("describeIssuers(result.table") && /stripUnsupportedForce\(f\.text, sourceText\)/.test(eng));
ok("the prompt carries both rules", /DISCRETION IS NOT ISSUING/.test(eng) && /SAY ONLY WHAT THE CIRCULAR SAYS/.test(eng));

console.log(`wordingGuard selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
