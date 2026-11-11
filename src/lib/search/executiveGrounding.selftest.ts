// src/lib/search/executiveGrounding.selftest.ts
// Run with: npx tsx src/lib/search/executiveGrounding.selftest.ts
//
// Every figure the executive sees must exist in the circular text: findings, tables, charts AND (since the 7 Nov 2026 review)
// the overview paragraph.
import { buildResult, datesWritten, withoutKnownDates } from "./executiveSynthesis";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${name} ${extra}`);
  }
};

const SOURCE = "Daily wage of contract workers is Rs 808.00 and total monthly wage Rs 20,995.30 w.e.f. 01.01.2024. GPAIS premium is Rs 193.00 for January 2025.";
const citations = [{ id: 7, headline: "Wages", publishedAt: null }];
const valid = new Set([7]);
const run = (payload: object) => buildResult(JSON.stringify(payload), citations as any, valid, SOURCE);

// a clean answer passes untouched
const good = run({
  overview: "The daily wage is **Rs 808.00**. The total monthly wage is **Rs 20,995.30**.",
  keyFindings: [{ text: "Total monthly wage is Rs 20,995.30.", sources: [7] }],
});
ok("a grounded overview is kept whole", good.overview.includes("808.00") && good.overview.includes("20,995.30"), good.overview);
ok("a grounded finding is kept", good.keyFindings.length === 1);

// an invented figure in the overview is removed, the true sentence stays
const mixed = run({
  overview: "The daily wage is Rs 808.00. The festival bonus is Rs 77,777.00 per worker.",
  keyFindings: [{ text: "Total monthly wage is Rs 20,995.30.", sources: [7] }],
});
ok("the sentence with an INVENTED figure is dropped", !mixed.overview.includes("77,777"), mixed.overview);
ok("the sentence with a true figure stays", mixed.overview.includes("808.00"), mixed.overview);

// nothing safe in the overview: the first verified finding stands in
const allBad = run({
  overview: "The bonus is Rs 55,555.00.",
  keyFindings: [{ text: "GPAIS premium is Rs 193.00 for January 2025.", sources: [7] }],
});
ok("an overview with only invented figures is replaced by the first verified finding", allBad.overview === "GPAIS premium is Rs 193.00 for January 2025.", allBad.overview);

// findings with invented figures are still dropped
const badFinding = run({
  overview: "Wages were revised.",
  keyFindings: [
    { text: "Total monthly wage is Rs 20,995.30.", sources: [7] },
    { text: "Overtime is Rs 99,999.00 an hour.", sources: [7] },
  ],
});
ok("a finding with an invented figure is dropped", badFinding.keyFindings.length === 1 && !JSON.stringify(badFinding).includes("99,999"));
ok("an overview with no figures is untouched", badFinding.overview === "Wages were revised.");
ok("0, 1 and 2 are free (Standard HRR is 1x, 'two sides')", run({ overview: "It applies to 2 groups in 1 round.", keyFindings: [] }).overview.includes("2 groups"));
ok("a small number the circular never writes is NOT shown (a made-up '9x', '3 stages')", !run({ overview: "Applies in 3 stages.", keyFindings: [{ text: "Applies in 3 stages.", sources: [7] }] }).overview.includes("3 stages"));
const WORDS = "Rent is Four times of the Standard HRR in the 3rd & 4th month and Twice of the Standard HRR for Type B. Retention up to the sixth month.";
const wordRun = (payload: object) => buildResult(JSON.stringify(payload), citations as any, valid, WORDS);
ok("a small number the circular writes as a word is kept ('Four times' = 4, 'Twice' = 2, 'sixth' = 6)", wordRun({ overview: "Type A pays 4x and Type B 2x, for up to 6 months.", keyFindings: [{ text: "4x in the 3rd and 4th month; 6 months at most.", sources: [7] }] }).keyFindings.length === 1);
ok("...but a number that is in neither form is still dropped from the same circular", wordRun({ overview: "x", keyFindings: [{ text: "Type A pays 9x.", sources: [7] }] }).keyFindings.length === 0);

// ---- dates are grounded by WHAT date they are, not by how they are written
const GP = "the current Pink colored out passes which is valid till 31st December'2023 will become invalid from 1st January'2024. Blue colored Out Passes from 1st January'2024, to 31st March'2024. Executives w.e.f. 01.01.2024 and trial from 01.11.2023. Enrolment 06.12.2024 to 07.12.2024.";
const gp = (payload: object) => buildResult(JSON.stringify(payload), citations as any, valid, GP);
const sd = datesWritten(GP);
ok("dates are read in every written form: '31st December'2023', '1st January'2024', '01.01.2024', 'December 31, 2023'", sd.has("2023-12-31") && sd.has("2024-1-1") && sd.has("2024-3-31") && sd.has("2023-11-1") && datesWritten("on December 31, 2023").has("2023-12-31") && datesWritten("31 Dec 2023").has("2023-12-31"));
ok("a numeric date the circular writes in WORDS is not thrown away ('31.12.2023' = '31st December'2023')", gp({ overview: "x", keyFindings: [{ text: "Pink was valid until 31.12.2023 and Blue from 01.01.2024 to 31.03.2024.", sources: [7] }] }).keyFindings.length === 1);
ok("a date the circular does NOT contain is still dropped ('31.12.2022')", gp({ overview: "x", keyFindings: [{ text: "Pink was valid until 31.12.2022.", sources: [7] }] }).keyFindings.length === 0);
ok("a table cell holding such a date is kept; one holding a wrong date is not", gp({ overview: "x", keyFindings: [], table: { columns: ["P", "A", "B"], rows: [["End", "31.12.2023", "06.12.2024"], ["Bad", "17.05.2031", "x"]] } }).table?.rows.length === 1);
ok("withoutKnownDates removes only the dates the circulars contain", withoutKnownDates("from 31.12.2023 and 31.12.2022", sd).includes("31.12.2022") && !withoutKnownDates("from 31.12.2023", sd).includes("31.12.2023"));

console.log(`executiveGrounding selftest: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
