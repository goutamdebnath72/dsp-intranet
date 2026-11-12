// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/search/conditionFinding.selftest.ts
// A condition the table gives to a row is said in the sentences too (conditionFinding.ts). The first fixtures are query 1's answers of 11 Nov 2026 (the retention rules).
import { readFileSync } from "node:fs";
import { tableConditions, conditionFindings, withConditionFindings } from "./conditionFinding";
import type { SynthesisResult, SynthesisTable } from "./executiveSynthesis";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const table: SynthesisTable = {
  title: "Retention period, advance rent, and competent authority by city type",
  columns: ["Period of retention", "Type 'A' City Locations", "Type 'B' City Locations"],
  rows: [
    ["Upto 2 months", "Standard HRR (Head of Administration at respective location)", "Standard HRR (Head of Administration at respective location)"],
    ["3rd & 4th month", "4x Standard HRR (Head of P&A at respective location) [for Mumbai, permissible upto 4th month only]", "2x Standard HRR (Head of P&A at respective location)"],
    ["5th & 6th month", "1.2x Monthly Rent (Concerned Functional Director)", "1.0x Monthly Rent (Head of P&A at respective location)"],
    ["7th to 12th month", "Not applicable", "1.2x Monthly Rent (Concerned Functional Director / Chief Executive) [under exceptional circumstances, provided no employee is waiting]"],
  ],
  sources: [6],
};
const run4: SynthesisResult = {
  overview: "Ex-employees up to E-9 grade may retain accommodation for up to 6 months in Type A cities (4 months for Mumbai) and up to 12 months in Type B cities. Approvals scale from local Head of Administration to Functional Director / Chief Executive as the duration increases.",
  keyFindings: [
    { text: "Retention duration in Type A cities is permissible up to 6 months (capped at 4 months for Mumbai); Type B cities permit retention up to 12 months, capped at 6 months in case of cessation due to death in service.", sources: [6] },
    { text: "In Type B cities, rent is Standard HRR for months 1-2, 2x Standard HRR for months 3-4, 1.0x Monthly Rent for months 5-6, and 1.2x Monthly Rent for months 7-12.", sources: [6] },
  ],
  table, charts: [], citations: [],
};
{ const c = tableConditions(table);
  ok("the notes of the table are read: both bracketed conditions, with their row and column", c.length === 2 && c[1].row === "7th to 12th month" && c[1].column === "Type 'B' City Locations" && /exceptional circumstances/.test(c[1].note), JSON.stringify(c)); }
{ const f = conditionFindings(run4);
  ok("the condition the sentences leave out becomes one finding, in the table's own words and with the table's source", f.length === 1 && f[0].text === "7th to 12th month, Type 'B' City Locations: Under exceptional circumstances, provided no employee is waiting." && f[0].sources.join() === "6", JSON.stringify(f));
  ok("the Mumbai note is not repeated: the sentences already say it", !f.some((x) => /Mumbai/.test(x.text))); }
{ const said: SynthesisResult = { ...run4, keyFindings: [...run4.keyFindings, { text: "Type B retention up to 12 months needs exceptional circumstances with no employee on the waitlist.", sources: [6] }] };
  ok("a condition the sentences already carry adds nothing", conditionFindings(said).length === 0); }
{ const w = withConditionFindings(run4);
  ok("the finding is added after the others, and the input is not changed", w.keyFindings.length === 3 && /^7th to 12th month/.test(w.keyFindings[2].text) && run4.keyFindings.length === 2); }
ok("no room, no finding (eight at most)", withConditionFindings({ ...run4, keyFindings: Array.from({ length: 8 }, (_, i) => ({ text: `Finding ${i}`, sources: [6] })) }).keyFindings.length === 8);
ok("a bracket that is an approver, not a condition, is no note", tableConditions({ columns: ["P", "A"], rows: [["x", "4x Standard HRR (Head of P&A at respective location)"]] }).length === 0);
ok("a bracket that begins like a condition is a note", tableConditions({ columns: ["P", "A"], rows: [["x", "Allowed (subject to availability of quarters)"]] }).length === 1);
ok("a tag, a category or a pay scale in brackets is no condition", tableConditions({ columns: ["H", "Date"], rows: [["Doljatra", "7th March [Category A & B]"], ["Basic", "Rs 70000 [70000-3%-200000]"], ["Fee", "Rs 5 [w.e.f.]"]] }).length === 0);
ok("no table, no findings", conditionFindings({ ...run4, table: null, extraTable: null }).length === 0);
{ const src = readFileSync("src/lib/search/executiveSynthesis.ts", "utf8");
  ok("the engine adds them after the verification, before the cards and the score", src.indexOf("withConditionFindings(best.result)") > src.indexOf("applyVerdict(best.result") && src.indexOf("withConditionFindings(best.result)") < src.indexOf("withKpiCards(best.result)")); }

console.log(`conditionFinding selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
