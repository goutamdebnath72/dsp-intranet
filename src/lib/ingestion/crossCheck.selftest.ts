/**
 * Self-test of the Hindi/English cross-check. Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/crossCheck.selftest.ts
 * The main cases are REAL: the pipeline's readings of the GPAIS pair and of the mediclaim Hindi page (pilot fixtures), with the mediclaim English page as
 * printed on the circular.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crossCheck, dominantScript, findTwins, majorNumbers, renderReport, summarize, type CircularFindings } from "./crossCheck";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const pilot: { id: string; pipeline: string }[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "pilot-readings.json"), "utf8"));
const P = (id: string) => (pilot.find((x) => x.id === id) as { pipeline: string }).pipeline;
const MEDI_EN = "STEEL AUTHORITY OF INDIA LIMITED DURGAPUR STEEL PLANT No: DSP/PERS-NW/MEDICLAIM_EXTN/2026/1617 Dated: 11-08-2026 CIRCULAR Circular Sl. No: 2026/52 Communication has been received from Corporate Office, SAIL, New Delhi, regarding the extension of renewal under the SAIL Mediclaim Scheme for the year 2026-2027. The renewal facility will remain available up to 20-08-2026, including for gap cases. It is being circulated for information of all concerned. [Authority No: HR/ITB & Med./SMS (2026-27)/Ext. dated 10-08-2026] Distribution: Standard";

// ---- scripts and important numbers
ok("the GPAIS Hindi page is Indic and its English page Latin", dominantScript(P("gpais-hindi")) === "indic" && dominantScript(P("gpais-english")) === "latin");
ok("a page with too little text has no script", dominantScript("Notice 1500") === "none" && dominantScript("") === "none");
ok("a page of both scripts, neither dominant, is mixed", dominantScript("स्टील अथॉरिटी ऑफ इंडिया लिमिटेड दुर्गापुर इस्पात संयंत्र " + "Steel Authority of India Limited Durgapur Steel Plant ".repeat(3)) === "mixed");
ok("important numbers are those with 4 digits or a point, in one canonical form", [...majorNumbers("Dated 11-08-2026, Rs 150.00, 15 days, ref 2026/52, 7")].sort().join() === "11.08.2026,150.00,2026.52");

// ---- the real GPAIS pair: nothing wrong
{
  const pages = [{ page: 1, text: P("gpais-hindi") }, { page: 2, text: P("gpais-english") }];
  const twins = findTwins(pages);
  ok("REAL: the GPAIS Hindi page and English page are found as twins (17 numbers in common)", twins.length === 1 && twins[0].indicPage === 1 && twins[0].latinPage === 2 && twins[0].shared === 17 && twins[0].overlap >= 0.9, JSON.stringify(twins));
  const f = crossCheck(pages)[0];
  ok("REAL: nothing is flagged on the GPAIS pair (the year written 2025 on one page and JAN-25 on the other is not a disagreement)", f.disputes.length === 0 && f.onlyIndic.length === 0 && f.onlyLatin.length === 0, JSON.stringify([f.disputes, f.onlyIndic, f.onlyLatin]));
}

// ---- the real mediclaim pair: the known misread, found without any service
{
  const pages = [{ page: 1, text: P("mediclaim-hindi") }, { page: 2, text: MEDI_EN }];
  const f = crossCheck(pages)[0];
  ok("REAL: the mediclaim pair is found", !!f && f.indicPage === 1 && f.latinPage === 2, JSON.stringify(f && [f.indicPage, f.latinPage, f.shared]));
  ok("REAL: the deadline misread on the Hindi page (20.0802) is paired with the date on the English page (20.08.2026)", f.disputes.length === 1 && f.disputes[0].pipeline === "20.0802" && f.disputes[0].second === "20.08.2026", JSON.stringify(f.disputes));
  ok("REAL: the circular number 2026/52, missing from the Hindi page's reading, is listed as standing on the English page only, with its words", f.onlyLatin.join() === "2026.52" && /Sl\. No/.test(f.context["latin:2026.52"] ?? ""), JSON.stringify([f.onlyLatin, f.context]));
  ok("REAL: the dispute carries the words around the number on each page", /20-0802|20\.0802|200802/.test(f.context["indic:20.0802"] ?? "") && /20-08-2026/.test(f.disputes[0].context), JSON.stringify([f.context["indic:20.0802"], f.disputes[0].context]));
}

// ---- when there is no twin
{
  const en1 = "Notice dated 11-08-2026 about Rs 150.00 and policy 0315054224 with reference 2026/52 for the contractor workers of the plant";
  const en2 = "Another notice dated 11-08-2026 about Rs 150.00 and policy 0315054224 with reference 2026/52 for the contractor workers of the plant";
  ok("two English pages are not twins", findTwins([{ page: 1, text: en1 }, { page: 2, text: en2 }]).length === 0);
  ok("two Hindi pages are not twins", findTwins([{ page: 1, text: P("gpais-hindi") }, { page: 2, text: P("gift-card-hindi") }]).length === 0);
  ok("a single page has no twin", findTwins([{ page: 1, text: P("gpais-hindi") }]).length === 0 && crossCheck([]).length === 0);
  ok("a Hindi page and an English page about different things (different numbers) are not twins", findTwins([{ page: 1, text: P("gpais-hindi") }, { page: 2, text: MEDI_EN }]).length === 0);
}

// ---- two circulars' worth of pages in one list: each page joins one pair
{
  const hindiA = P("gpais-hindi"), engA = P("gpais-english"), hindiB = P("mediclaim-hindi");
  const twins = findTwins([{ page: 1, text: hindiA }, { page: 2, text: engA }, { page: 3, text: hindiB }, { page: 4, text: MEDI_EN }]);
  ok("four pages make two pairs, each page used once", twins.length === 2 && new Set(twins.map((t) => t.indicPage)).size === 2 && new Set(twins.map((t) => t.latinPage)).size === 2 && twins.some((t) => t.indicPage === 1 && t.latinPage === 2) && twins.some((t) => t.indicPage === 3 && t.latinPage === 4), JSON.stringify(twins));
}

// ---- a number with no neighbour on the other page is reported as one-sided, not as a misread
{
  const hindi = "स्टील अथॉरिटी ऑफ इंडिया लिमिटेड दुर्गापुर इस्पात संयंत्र सूचना ठेकेदारों के लिए राशि 150.00 131.25 112.50 दिनांक 20.08.2024 01.01.2025 कुल 7391.75 ".repeat(2);
  const english = "Steel Authority of India Limited Durgapur Steel Plant Notice for the contractors amount 150.00 131.25 112.50 dated 20.08.2024 01.01.2025 ".repeat(2);
  const f = crossCheck([{ page: 1, text: hindi }, { page: 2, text: english }])[0];
  ok("an amount only on the Hindi page, with nothing near it on the English page, is one-sided and not a dispute", !!f && f.disputes.length === 0 && f.onlyIndic.join() === "7391.75" && f.onlyLatin.length === 0, JSON.stringify(f));
}

// ---- the report
{
  const medi = crossCheck([{ page: 1, text: P("mediclaim-hindi") }, { page: 2, text: MEDI_EN }]);
  const gp = crossCheck([{ page: 1, text: P("gpais-hindi") }, { page: 2, text: P("gpais-english") }]);
  const items: CircularFindings[] = [
    { id: 85, serial: 13, headline: "Circular- Extension of SAIL Mediclaim policy (2026-2027)", pages: 2, findings: medi },
    { id: 21, serial: 7, headline: "Notice for Contractor Workers - Revised GPAIS Premium Amount", pages: 2, findings: gp },
    { id: 5, serial: 1, headline: "A one-page notice", pages: 1, findings: [] },
  ];
  const s = summarize(items);
  ok("the summary counts the circulars, the pairs, the clean ones and the disputed ones", s.circulars === 3 && s.withTwoPages === 2 && s.pairs === 2 && s.clean === 1 && s.disputed.length === 1 && s.oneSided.length === 0, JSON.stringify({ ...s, disputed: s.disputed.length, oneSided: s.oneSided.length }));
  const md = renderReport(items);
  ok("the report opens with the counts and names the circular with the misread", /Circulars read: 3 \| with two or more pages: 2 \| twin pairs found/.test(md) && /every important number on both pages: 1/.test(md) && /### Circular 85 \(serial 13\)/.test(md), md.slice(0, 400));
  ok("the report shows the two readings of the date and the number found on one page only", /`20\.0802`/.test(md) && /`20\.08\.2026`/.test(md) && /only on the Latin page: `2026\.52`/.test(md), md.slice(0, 900));
  ok("the clean circular is not listed in the details", !/### Circular 21/.test(md));
  ok("an empty archive gives a readable report", /Circulars read: 0/.test(renderReport([])));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
