// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/search/issuerFinding.selftest.ts
import { readFileSync } from "node:fs";
import { describeIssuers, issuerColumn } from "./issuerFinding";
import type { SynthesisTable } from "./executiveSynthesis";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const Q = "Under the revised Zero Tolerance Safety Rules, what consequence follows each violation at each stage, and through whom is it issued?";
const NS = "Not stated in circular";
const zt: SynthesisTable = {
  columns: ["Nature of Violation", "Violation Stage", "Revised Consequence", "Issued through"],
  rows: [
    ["No person should work/get work done on any equipment without isolation.", "First Stage", "1st) Issuing counselling letter", "concerned CGM/HOD"],
    ["No person should work/get work done on or Near running machine without guard /Cover.", "Second Stage", "2nd) Issuing warning letter", "concerned CGM/HOD"],
    ...Array.from({ length: 10 }, (_, i) => [`Rule ${i + 3}`, "Third Stage", "Financial penalty", NS]),
  ],
  sources: [29],
};
const two = ["Consequences escalate from a counselling letter at the First Stage to disciplinary action at the Fifth Stage.", "In case of a violation by a Contract Worker (CW), the penalty shall be imposed directly on the contractor."];

{ const r = describeIssuers(zt, Q, two);
  ok("the issuer column is found", issuerColumn(zt) === 3);
  ok("a finding is built from the column: who, for how many rows, and that the rest name no one", !!r && /"concerned CGM\/HOD" for 2 of the 12 rows/.test(r.text) && /For the other 10 rows the circular names no one/.test(r.text) && /Issued through/.test(r.text), r?.text);
  ok("the two rows are named by their own words", !!r && r.text.includes('"No person should work/get work done on any equipment without isolation"') && r.text.includes('guard /Cover"'), r?.text);
  ok("it carries the table's sources", JSON.stringify(r?.sources) === "[29]"); }
ok("nothing is added when the findings already name the issuer", describeIssuers(zt, Q, [...two, "The counselling and warning letters are issued through the concerned CGM/HOD."]) === null);
ok("nothing is added when the question does not ask who", describeIssuers(zt, "What consequence follows each violation at each stage?", two) === null);
ok("nothing is added when the table has no such column", describeIssuers({ ...zt, columns: ["A", "B", "C", "D"] }, Q, two) === null);
ok("no table: nothing", describeIssuers(null, Q, two) === null && describeIssuers(undefined, Q, two) === null);
{ const none: SynthesisTable = { ...zt, rows: zt.rows.map((r) => [r[0], r[1], r[2], NS]) };
  const r = describeIssuers(none, Q, two);
  ok("a column where nothing is named says so, once", !!r && /names no one in the table's "Issued through" column, for any of its 12 rows/.test(r.text), r?.text);
  ok("and is not said again if the findings already say it", describeIssuers(none, Q, [...two, "The circular names no one who issues them."]) === null); }
{ const all: SynthesisTable = { ...zt, rows: zt.rows.map((r) => [r[0], r[1], r[2], "Head of Safety"]) };
  const r = describeIssuers(all, "Who approves each item?", two);
  ok("one issuer for every row is said so", !!r && /"Head of Safety" for every row/.test(r.text) && !/names no one/.test(r.text), r?.text); }
{ const mix: SynthesisTable = { columns: ["Item", "Approved by"], rows: [["a", "Head of P&A"], ["b", "CGM"], ["c", "CGM"], ["d", "CGM"], ["e", "CGM"]], sources: [1] };
  const r = describeIssuers(mix, "Who approves each item?", []);
  ok("several issuers: each one, with its count; more than three rows are counted, not listed", !!r && /"Head of P&A" for 1 of the 5 rows \("a"\)/.test(r.text) && /"CGM" for 4 of the 5 rows;?\./.test(r.text.replace(/\.$/, ".")) && !/names no one/.test(r.text), r?.text); }

const eng = readFileSync("src/lib/search/executiveSynthesis.ts", "utf8");
ok("the engine adds it after the checked table, only with room, and the version changed so the stored briefing is made afresh", /describeIssuers\(result\.table, q, result\.keyFindings\.map/.test(eng) && /result\.keyFindings\.length < 6/.test(eng) && /EDS_ENGINE_VERSION = "74\.9"/.test(eng));

console.log(`issuerFinding selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
