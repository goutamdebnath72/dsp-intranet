// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/search/wordingGuard.selftest.ts
import { readFileSync } from "node:fs";
import { fixDiscretionIssuers, fixItemCount, stripUnsupportedForce, restoreTruncatedAbbreviations, restoreAllAbbreviations, normaliseIdentifiers, fixUnprintedNotApplicable } from "./wordingGuard";
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

{ const t3: SynthesisTable = { ...T, rows: [["x", "Fourth Stage", "Financial penalty (Officers: Rs.500/-) [For all subsequent violations]", "Discretion of Head of Safety"]] };
  const r = fixDiscretionIssuers(t3, SRC);
  ok("an issuer cell that itself reads 'Discretion of X' is moved out too, and the words join the condition", r.table.rows[0][3] === "Not stated in circular" && r.table.rows[0][2] === "Financial penalty (Officers: Rs.500/-) [For all subsequent violations / Discretion of Head of Safety]", JSON.stringify(r.table.rows[0])); }

// force words
{ const r = stripUnsupportedForce("In cases of violation by a Contract Worker (CW), the penalty is imposed directly on the contractor.", SRC);
  ok("'directly' is taken out when the circular does not say it", r.text === "In cases of violation by a Contract Worker (CW), the penalty is imposed on the contractor." && r.removed[0] === "directly", r.text); }
{ const r = stripUnsupportedForce("Entering the plant intoxicated stops the progression, immediately triggering Standing Order Rule 29(X).", SRC);
  ok("'immediately' goes with its comma spacing intact", r.text === "Entering the plant intoxicated stops the progression, triggering Standing Order Rule 29(X).", r.text); }
ok("a word the circular uses is left alone", stripUnsupportedForce("It applies immediately.", SRC + " with immediate effect").text === "It applies immediately.");
ok("the word 'director' is not mistaken for 'directly'", stripUnsupportedForce("The Director approves.", SRC).text === "The Director approves.");
ok("a sentence that starts with the word is left as it is", stripUnsupportedForce("Immediately after, the rule applies.", SRC).text === "Immediately after, the rule applies.");
ok("text with none of the words is untouched", stripUnsupportedForce("Consequences escalate by stage.", SRC).text === "Consequences escalate by stage.");

// item count
const AW: SynthesisTable = { title: "Motivational Award Schemes of DSP", columns: ["Name of the Scheme", "Beneficiary", "Award Amt. (Rs.)"], rows: Array.from({ length: 12 }, (_, i) => [`Scheme ${i + 1}`, "Exe", `${(i + 1) * 1000}`]), sources: [10] };
{ const r = fixItemCount("The circular outlines various schemes. **Ten distinct schemes** are compared, ranging from individual awards to group awards.", AW);
  ok("'Ten distinct schemes are compared' over 12 rows becomes Twelve, bold and capital kept", r.text === "The circular outlines various schemes. **Twelve distinct schemes** are compared, ranging from individual awards to group awards." && r.changed.length === 1, r.text); }
{ const r = fixItemCount("The table compares 10 schemes by grade.", AW);
  ok("'compares 10 schemes' becomes 12 in digits", r.text === "The table compares 12 schemes by grade.", r.text); }
ok("a count that is already right is left alone", fixItemCount("Twelve schemes are listed.", AW).changed.length === 0);
ok("a number that does not count the compared items is never touched", fixItemCount("Three schemes are for executives; ₹10,000 goes to grades E6-E7 and 10 awards are given every year.", AW).text === "Three schemes are for executives; ₹10,000 goes to grades E6-E7 and 10 awards are given every year.");
ok("a count of something other than the table's items is left alone", fixItemCount("Ten circulars are listed under sources.", AW).changed.length === 0);
ok("rows that repeat their first cell are not counted as items", fixItemCount("Ten schemes are compared.", { ...AW, rows: [...AW.rows.slice(0, 11), ["Scheme 1", "Exe", "5"]] }).changed.length === 0);
ok("no table, or one row: nothing", fixItemCount("Ten schemes are compared.", null).changed.length === 0 && fixItemCount("Ten schemes are compared.", { ...AW, rows: [AW.rows[0]] }).changed.length === 0);

const eng = readFileSync("src/lib/search/executiveSynthesis.ts", "utf8");
ok("the engine runs the count guard on the overview and the findings", /fixItemCount\(result\.overview, result\.table\)/.test(eng) && /fixItemCount\(f\.text, result\.table\)/.test(eng));
ok("the engine runs both guards after the checked table and before the 'who issues' finding", eng.indexOf("fixDiscretionIssuers(t, sourceText)") > 0 && eng.indexOf("fixDiscretionIssuers(t, sourceText)") < eng.indexOf("describeIssuers(best.result.table") && /stripUnsupportedForce\(f\.text, sourceText\)/.test(eng));
ok("the prompt carries both rules", /DISCRETION IS NOT ISSUING/.test(eng) && /SAY ONLY WHAT THE CIRCULAR SAYS/.test(eng));

// ---- 4. a cut abbreviation goes back to the circulars' own form
{ const SRC = "6.1 The rates: Type of accommodation: 1 BR | Area (sq. ft.): Upto 900 | Type 'A': 10800. Asst. Manager (Pers-NW) signed. Dr. A. Kumar attended.";
  const a = restoreTruncatedAbbreviations("Monthly rent is Rs 10,800 for 1 BR (upto 900 sq. f.) in Type A.", SRC);
  ok("'sq. f.' becomes the circular's 'sq. ft.'", a.text === "Monthly rent is Rs 10,800 for 1 BR (upto 900 sq. ft.) in Type A." && a.changed.length === 1, a.text);
  ok("a form the circulars print as written is not touched", restoreTruncatedAbbreviations("area of 900 sq. ft. and Asst. Manager", SRC).changed.length === 0);
  ok("a cut form with no longer form in the circulars is not touched", restoreTruncatedAbbreviations("the sq. m. of the plot", SRC).text === "the sq. m. of the plot");
  ok("an initial after a title the circulars print the same way is not touched", restoreTruncatedAbbreviations("Dr. A. Kumar", SRC).changed.length === 0);
  ok("two different longer forms in the circulars: not sure, not touched", restoreTruncatedAbbreviations("the sq. f. rate", SRC + " sq. ft. and sq. fe.").changed.length === 0);
  ok("capitals are kept", restoreTruncatedAbbreviations("Sq. F. of the area", SRC).text === "Sq. Ft. of the area");
  const r = restoreAllAbbreviations({ overview: "up to 900 sq. f.", headline: "H", keyFindings: [{ text: "above 900 sq. f.", sources: [1] }], table: { columns: ["Area (sq. f.)", "Rent"], rows: [["upto 900 sq. f.", "10800"]], title: "Rent by sq. f." }, charts: [{ type: "bar", title: "Rent (sq. f.)", subtitle: "per sq. f.", items: [{ label: "900 sq. f.", value: 1, detail: "sq. f." }] }], citations: [] }, SRC);
  ok("every text of the briefing is read: overview, findings, table cells and headings, chart title, subtitle and items", /sq\. ft\./.test(r.result.overview) && /sq\. ft\./.test(r.result.keyFindings[0].text) && r.result.table!.columns[0] === "Area (sq. ft.)" && r.result.table!.rows[0][0] === "upto 900 sq. ft." && r.result.table!.title === "Rent by sq. ft." && r.result.charts[0].title === "Rent (sq. ft.)" && r.result.charts[0].subtitle === "per sq. ft." && r.result.charts[0].items[0].label === "900 sq. ft." && !/sq\. f\./.test(JSON.stringify(r.result)), JSON.stringify(r.result));
  ok("the engine runs it on every candidate, and the writer is told a condition belongs to its rows only", /restoreAllAbbreviations\(result, sourceText\)/.test(eng) && /said of those rows or periods only/.test(eng)); }

// ---- 5. an identifier is written unbroken, in every text
{ const r = normaliseIdentifiers({ overview: "Pay into Account Number: 34,42,04,00,623 or A/c No. 3,083,000,100,179,875; the deposit is ₹ 10,00,000.", headline: "H", keyFindings: [{ text: "Policy Number: 0315,054,224,110 applies.", sources: [1] }], table: { columns: ["Bank", "Account Number"], rows: [["SBI", "34,42,04,00,623"], ["Rent", "Rs 13,478.00"]] }, charts: [], citations: [] });
  ok("account, policy and cheque numbers lose their separators in the overview, the findings and the cells", r.result.overview.includes("34420400623") && r.result.overview.includes("3083000100179875") && r.result.keyFindings[0].text.includes("0315054224110") && r.result.table!.rows[0][1] === "34420400623", JSON.stringify(r.result.overview));
  ok("a sum of money keeps its grouping", r.result.overview.includes("₹ 10,00,000") && r.result.table!.rows[1][1] === "Rs 13,478.00");
  ok("the engine runs it on every candidate and again after the second reading, and the writer is told", /normaliseIdentifiers\(result\)/.test(eng) && /normaliseIdentifiers\(best\.result\)/.test(eng) && /IDENTIFIERS ARE NOT AMOUNTS/.test(eng)); }

{
  const t = { title: "T", columns: ["Type", "Up to 1 year", "Above 3 years"], rows: [["In-service quota", "Not applicable", "FA + 18 months salary"], ["Other", "n/a", "x"]], sources: [3] } as unknown as SynthesisTable;
  const r = { headline: "", overview: "o", keyFindings: [], table: t, extraTable: null, charts: [], citations: [] } as never;
  const a = fixUnprintedNotApplicable(r, "Sponsorship under in-service quota: FA plus 18 Months Salary for three year course.");
  ok("a cell 'Not applicable' the circulars never say becomes 'Not stated in circular'", a.changed === 2 && a.result.table!.rows[0][1] === "Not stated in circular" && a.result.table!.rows[1][1] === "Not stated in circular" && a.result.table!.rows[0][2] === "FA + 18 months salary");
  const b = fixUnprintedNotApplicable(r, "This clause is not applicable to non-executives.");
  ok("when the circulars say 'not applicable' the cell is left alone", b.changed === 0 && b.result.table!.rows[0][1] === "Not applicable");
  const eng = readFileSync("src/lib/search/executiveSynthesis.ts", "utf8");
  ok("the engine runs it, and an unnamed two-series chart is not shown", /fixUnprintedNotApplicable\(result, sourceText\)/.test(eng) && /two series with no names of their own/.test(eng));
}

console.log(`wordingGuard selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
