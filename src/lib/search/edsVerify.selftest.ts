// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/search/edsVerify.selftest.ts
//
// The second reading (edsVerify.ts): the verifier's report is applied only where plain code can check it. The source text is the real wording of
// circular 009 (2022), Motivational Award Schemes, and the faults are the ones found in live answers on 11 Nov 2026 (and earlier ones, in general form).
import { readFileSync } from "node:fs";
import { applyVerdict, parseVerdict, quoteInSource, quotePieces, unusedClauses, mislabelledTimes, uncoveredLists, flatText, verifierInput, ambiguousShortForms, VERIFY_PROMPT, type Verdict } from "./edsVerify";
import { executeExecutiveSynthesis, clearExecutiveSynthesisCache, figureGuard, percentFiguresIn, structuralRepairs, type SynthesisResult } from "./executiveSynthesis";
import type { EdsRow, EdsStore } from "./edsStore";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const SRC = `Sub: Implementation of modified and new Motivational Schemes uniform to DSP & ISP. Following Motivational Award Schemes, uniform to ISP & DSP, shall be implemented in DSP w.e.f. from FY 2022-23:
Sl.: 1. | Name of the Scheme: Jawahar Award Scheme | Beneficiary: Exe (E6-E7) | Award Amt. (Rs.): 10,000 | Periodicity: Annual | Implementing/ Executing Authority: Pers (OD) | To be Awarded on: Republic Day/ SAIL Day
Sl.: 2. | Name of the Scheme: DIC's Excellence Award Scheme | Beneficiary: Exe (E1-E5) | Award Amt. (Rs.): 8,000 | Periodicity: Annual | Implementing/ Executing Authority: Pers (OD) | To be Awarded on: Republic Day/ SAIL Day
Sl.: 9. | Name of the Scheme: Kaushal Award | Beneficiary: Contract Labour | Award Amt. (Rs.): SSP gift of Rs. 500/- or equivalent | Periodicity: Monthly | Implementing/ Executing Authority: CGM
Sl.: 10. | Name of the Scheme: Dr. APJ Abdul Kalam Award | Beneficiary: Exe & Non Exe | Award Amt. (Rs.): Fully paid Holiday for three days and two nights to a nearby resort with family within 150 Kms from Durgapur as per TA eligibility | Periodicity: Half Yearly | Implementing/ Executing Authority: HRD and L&A
Executing Department for the Scheme: Safety Engineering Department. The award will be presented to selected Awardees by respective CGM/ HoD for extraordinary contribution in a month. Maximum cost per employee for lodging & transport will be Rs.20,000/- or as per SAIL TA rules whichever is lower.`;
const sources = [{ id: 10, text: SRC }];
const guard = figureGuard(SRC);
const ctx = { sources, figuresSafe: guard.figuresSafe };

const base: SynthesisResult = {
  overview: "The circular outlines various motivational award schemes at DSP. Ten distinct schemes are compared, ranging from individual awards to group recognitions.",
  keyFindings: [
    { text: "The Jawahar Award Scheme provides ₹10,000 annually to Executives (E6-E7) on Republic Day/SAIL Day, executed by Pers (OD).", sources: [10] },
    { text: "The Kaushal Award is presented directly by the CGM every month to the best contract worker.", sources: [10] },
    { text: "The Kalam Award is given automatically to every group that applies.", sources: [10] },
  ],
  table: {
    columns: ["Name of the Scheme", "Beneficiary", "Award Amt. (Rs.)", "Periodicity"],
    rows: [
      ["Jawahar Award Scheme", "Exe (E6-E7)", "10,000", "Annual"],
      ["DIC's Excellence Award Scheme", "Exe (E1-E5)", "8,000", "Monthly"],
      ["Kaushal Award", "Contract Labour", "SSP gift of Rs. 500/- or equivalent", "Monthly"],
    ],
    sources: [10],
  },
  charts: [],
  citations: [{ id: 10, headline: "Circular - Motivational Award Schemes of DSP", publishedAt: "2022-12-19" }],
};

// ---- the text tools
ok("flatText: thousands commas, case and punctuation do not matter", flatText("Rs. 10,000/- (Annual)") === "rs 10000 annual");
ok("a quote is found verbatim after flattening", quoteInSource("Award Amt. (Rs.): 10,000", flatText(SRC)) && quoteInSource("as per SAIL TA rules", flatText(SRC)));
ok("a paraphrase is not found; a tiny quote proves nothing", !quoteInSource("the Jawahar award pays ten thousand", flatText(SRC)) && !quoteInSource("Exe", flatText(SRC)));

ok("a quote may skip text with '...': every piece is verbatim, in the circular", quoteInSource("Name of the Scheme: Jawahar Award Scheme ... Periodicity: Never Ever", flatText(SRC)) === false && quoteInSource("Sl.: 1. | Name of the Scheme: Jawahar Award Scheme ... Sl.: 9. | Name of the Scheme: Kaushal Award", flatText(SRC)));
ok("a piece that is not in the circular, or a one-word piece, spoils the quote", !quoteInSource("Jawahar Award Scheme ... Nehru Award Scheme", flatText(SRC)) && !quoteInSource("Jawahar Award Scheme ... Exe", flatText(SRC)));
{ const out = applyVerdict({ ...base, headline: "Motivational Awards Unchanged" }, { sentences: [{ where: "headline", sentence: "Motivational Awards Unchanged", verdict: "contradicted", fix: "Motivational Awards", quote: "Following Motivational Award Schemes, uniform to ISP & DSP" }], cells: [], missingRows: [], missingColumns: [], unanswered: [], abbreviations: [] }, ctx);
  ok("taking a claim word ('Unchanged') out of a sentence is a change of fact, not a cosmetic one", out.result.headline === "Motivational Awards", out.result.headline); }
{ const out = applyVerdict(base, { sentences: [], cells: [], missingRows: [], missingColumns: [], unanswered: [{ part: "which schemes", status: "in_circular", fact: "The Jawahar Award Scheme and the Kaushal Award are among the schemes.", quote: "Name of the Scheme: Jawahar Award Scheme | Beneficiary ... Name of the Scheme: Kaushal Award | Beneficiary" }], abbreviations: [] }, ctx);
  ok("a fact whose quote skips text is accepted and cited to the circular holding the pieces", out.result.keyFindings.some((f) => /Kaushal Award are among/.test(f.text) && f.sources.join() === "10"), JSON.stringify(out.result.keyFindings.map((f) => f.sources))); }

{ const v = parseVerdict('{"cells":[{"row":"R","column":"C","value":"4 holidays: Republic Day ... May Day \u2026 Independence Day","quote":"a b"}],"missingColumns":[{"column":"2024","cells":[{"row":"R","value":"One ... Two","quote":"x y"}]}]}');
  ok("a value built from pieces of a list reads as a list (the skipped-text marks become commas)", v?.cells[0].value === "4 holidays: Republic Day, May Day, Independence Day" && v?.missingColumns[0].cells[0].value === "One, Two", JSON.stringify(v)); }
{ const sp = (wrong: string, right: string): Verdict => ({ sentences: [], cells: [], missingRows: [], missingColumns: [], unanswered: [], abbreviations: [], spelling: [{ wrong, right }] });
  const typo: SynthesisResult = { ...base, overview: "The scheme runs monthly, advancing to a larger award thereafer.", keyFindings: [{ text: "Thereafer the award is paid by the CGM.", sources: [10] }] };
  const a = applyVerdict(typo, sp("thereafer", "thereafter"), ctx);
  ok("a plain one-letter slip is corrected everywhere in the sentences, capital kept", /award thereafter\./.test(a.result.overview) && /^Thereafter the award/.test(a.result.keyFindings[0].text) && a.changes.some((c) => /spelling/.test(c)), a.result.overview);
  ok("a correction two letters away is refused (it may be another word)", applyVerdict({ ...typo, overview: "The award was increaced." }, sp("increaced", "decreased"), ctx).result.overview === "The award was increaced.");
  ok("a word the circular itself prints is never 'corrected'", applyVerdict({ ...typo, overview: "The Kaushal Award scheme." }, sp("Kaushal", "Kaushall"), ctx).result.overview === "The Kaushal Award scheme.");
  ok("a short word or a word not in the sentences changes nothing, and says why", applyVerdict(typo, sp("teh", "the"), ctx).ignored === 1 && applyVerdict(typo, sp("absentword", "absentwird"), ctx).ignored === 1);
  const pv = parseVerdict('{"spelling":[{"wrong":"thereafer","right":"thereafter"},{"wrong":"","right":"x"}]}');
  ok("the spelling list is read, empty entries dropped", pv?.spelling?.length === 1 && pv.spelling[0].right === "thereafter");
  ok("the verifier is told to check definitions and exceptions, ranges against every column, and spelling", /DEFINITIONS AND EXCEPTIONS/.test(VERIFY_PROMPT) && /RANGES:/.test(VERIFY_PROMPT) && /SPELLING:/.test(VERIFY_PROMPT) && /"spelling"/.test(VERIFY_PROMPT)); }
{ const circ = `[Circular id=7 | cite as: Circular 007 (2022)] 4.1 Stay in the guest house is allowed for up to 6 months for staff at the plant location, on payment of the standard charge. 5.2 Where the stay ends by dismissal or resignation before 55 years, the guest house stay will be permitted for one month only, on payment of the standard charge. 3 | P a g e [handwritten: A Kumar?] 6.1 Deposit of 5000 is refundable. | Sl.: 1. | Stay: 6 months | Charge: 100 | Date of Issue 21st December 2022 and reference number 3300 of the guest house stay`;
  const brief: SynthesisResult = { overview: "Guest house stay is allowed for up to 6 months for staff at the plant location on the standard charge.", keyFindings: [{ text: "A deposit of 5000 is refundable.", sources: [7] }], charts: [], citations: [] };
  const out = unusedClauses("How long can staff stay in the guest house at the plant location, and on what charge?", brief, circ);
  ok("the pointer names the clause with a figure the briefing does not use (55 years, one month) and not the one it already carries", out.length >= 1 && /55 years/.test(out[0]) && !out.some((c) => /^4\.1/.test(c)), JSON.stringify(out));
  ok("a table row, a page footer and a date stamp are not clauses", !out.some((c) => /P a g e|handwritten|Date of Issue|\| Sl\./.test(c)), JSON.stringify(out));
  ok("a question with no content words points at nothing", unusedClauses("?", brief, circ).length === 0);
  ok("the verifier's input carries the pointer and asks it to judge each clause", /Clauses of the circulars that share words with the question/.test(verifierInput("How long can staff stay in the guest house at the plant location, and on what charge?", brief, circ)) && !/Clauses of the circulars that share words/.test(verifierInput("?", brief, circ)));
  const six: SynthesisResult = { ...base, keyFindings: [1, 2, 3, 4, 5, 6].map((n) => ({ text: `Finding number ${n} about the awards.`, sources: [10] })) };
  const vd = (fact: string, quote: string): Verdict => ({ sentences: [], cells: [], missingRows: [], missingColumns: [], unanswered: [{ part: "the Kaushal Award cost", status: "in_circular", fact, quote }], abbreviations: [] });
  const added = applyVerdict(six, vd("Maximum cost per employee for lodging & transport will be Rs.20,000/-.", "Maximum cost per employee for lodging & transport will be Rs.20,000/-"), ctx);
  ok("an omitted fact gets a place even when the writer used all six findings", added.result.keyFindings.length === 7 && /Rs\.20,000/.test(added.result.keyFindings[6].text), String(added.result.keyFindings.length));
  const eight: SynthesisResult = { ...base, keyFindings: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ text: `Finding number ${n} about the awards.`, sources: [10] })) };
  ok("but never past eight", applyVerdict(eight, vd("Maximum cost per employee for lodging & transport will be Rs.20,000/-.", "Maximum cost per employee for lodging & transport will be Rs.20,000/-"), ctx).result.keyFindings.length === 8);
  ok("the verifier tests a condition against the rows it belongs to", /exceptional circumstances.*some rows or periods only/.test(VERIFY_PROMPT));
  ok("the verifier and the writer are told that a field a reader needs to act on is not dropped (an account number without its code)", /IFSC code/.test(VERIFY_PROMPT) && /EVERY FIELD A READER NEEDS/.test(readFileSync("src/lib/search/executiveSynthesis.ts", "utf8")));
  ok("the differences finding is added only when the columns are editions: the question compares, or the columns are years", /const columnsAreEditions =/.test(readFileSync("src/lib/search/executiveSynthesis.ts", "utf8")) && /best\.differences && columnsAreEditions/.test(readFileSync("src/lib/search/executiveSynthesis.ts", "utf8")));
  { const bank = "[Circular id=9 | cite as: Circular 009] Bank details are as under: S.N.: (i) | Bank Name & Address: State Bank of India R.K Puram, New Delhi-66 | Account Number: 34420400623 | IFSC Code: SBIN0001076 S.N.: (ii) | Bank Name & Address: Punjab National Bank Sewa Bhawan, New Delhi-66 | Account Number: 3083000100179875 | IFSC Code: PUNB0308300 Contact the office on 9831012345 or 0343-2500777 for help with the payment.";
    const brief: SynthesisResult = { overview: "Pay by RTGS or NEFT into the accounts.", keyFindings: [{ text: "Accounts: State Bank 34420400623 and Punjab National Bank 3083000100179875.", sources: [9] }], charts: [], citations: [] };
    const qq = "What are the ways to pay and the bank details?";
    const got = unusedClauses(qq, brief, bank);
    ok("a record whose account number the briefing carries but whose IFSC code it dropped is pointed, with both codes", got.some((c) => /SBIN0001076/.test(c) && /PUNB0308300/.test(c)), JSON.stringify(got));
    ok("once the codes are in the briefing the record is not pointed", !unusedClauses(qq, { ...brief, overview: brief.overview + " IFSC SBIN0001076 and PUNB0308300." }, bank).some((c) => /SBIN0001076/.test(c)));
    ok("a telephone number is not a code the briefing must carry", !unusedClauses(qq, brief, bank).some((c) => /9831012345|2500777/.test(c) && !/SBIN/.test(c))); }
  ok("the verifier is told to go through the circulars clause by clause", /clause by clause/.test(VERIFY_PROMPT)); }
{ const q = "Compare the holiday lists notified for DSP for 2022 and 2023: closed and public holidays, festival holidays for each category, restricted holidays, and what differs between the two years.";
  const un = (part: string, status: "in_circular" | "not_in_circular", fact?: string, quote?: string): Verdict => ({ sentences: [], cells: [], missingRows: [], missingColumns: [], unanswered: [{ part, status, fact, quote }], abbreviations: [] });
  const asked = applyVerdict(base, un("what differs between the two years regarding employee categorization", "not_in_circular"), { ...ctx, question: q });
  ok("a part the question never asked (words of the verifier's own) is not reported", !/None of the circulars/.test(asked.result.overview) && asked.ignoredWhy.some((w) => /not made of the question's own words/.test(w)), asked.result.overview);
  const own = applyVerdict(base, un("restricted holidays", "not_in_circular"), { ...ctx, question: q });
  ok("a part in the question's own words is still reported", /None of the circulars provided covers this part of the question: "restricted holidays"/.test(own.result.overview), own.result.overview);
  ok("without the question the check is not made (older callers)", /None of the circulars/.test(applyVerdict(base, un("what differs regarding employee categorization", "not_in_circular"), ctx).result.overview));
  ok("the verifier is told to ask for the items, not the counts, and never to add a part", /not answered by counts/.test(VERIFY_PROMPT) && /never add a part the question did not ask/.test(VERIFY_PROMPT));
  const eng2 = readFileSync("src/lib/search/executiveSynthesis.ts", "utf8");
  ok("the engine passes the question, and the writer is told ITEMS, NOT TOTALS", /question: q \}\)/.test(eng2) && /ITEMS, NOT TOTALS/.test(eng2)); }
// ---- parsing
{ const v = parseVerdict('```json\n{"sentences":[{"where":"finding 2","sentence":"x","verdict":"CONTRADICTED","fix":"y","quote":"z"}],"cells":"nonsense","abbreviations":[{"abbr":"TA","meaning":"Travelling Allowance","quote":"as per SAIL TA rules"}]}\n```');
  ok("the report is read from fenced JSON; a field of the wrong shape is an empty list", !!v && v.sentences.length === 1 && v.sentences[0].verdict === "contradicted" && v.cells.length === 0 && v.missingRows.length === 0 && v.abbreviations.length === 1);
  ok("no JSON: null", parseVerdict("I found nothing.") === null && parseVerdict("") === null); }

// ---- the repairs
const V: Verdict = {
  sentences: [
    { where: "overview", sentence: "Ten distinct schemes are compared, ranging from individual awards to group recognitions.", verdict: "contradicted", fix: "Three schemes are compared, ranging from individual awards to group recognitions.", quote: "" },
    { where: "finding 2", sentence: "The Kaushal Award is presented directly by the CGM every month to the best contract worker.", verdict: "unsupported", fix: "The Kaushal Award will be presented to selected Awardees by respective CGM/ HoD for extraordinary contribution in a month.", quote: "The award will be presented to selected Awardees by respective CGM/ HoD for extraordinary contribution in a month" },
    { where: "finding 3", sentence: "The Kalam Award is given automatically to every group that applies.", verdict: "unsupported", fix: "", quote: "" },
  ],
  cells: [
    { row: "DIC's Excellence Award Scheme", column: "Periodicity", value: "Annual", quote: "Award Amt. (Rs.): 8,000 | Periodicity: Annual" },
    { row: "Jawahar Award Scheme", column: "Award Amt. (Rs.)", value: "12,000", quote: "Award Amt. (Rs.): 10,000" }, // a figure the circular does not write: ignored
    { row: "Kaushal Award", column: "Beneficiary", value: "Not stated in circular", quote: "Beneficiary: Contract Labour" }, // never blanked on the verifier's word
  ],
  missingColumns: [],
  missingRows: [
    { label: "Dr. APJ Abdul Kalam Award", cells: ["Exe & Non Exe", "Fully paid Holiday for three days and two nights to a nearby resort with family within 150 Kms from Durgapur as per TA eligibility", "Half Yearly"], quote: "Name of the Scheme: Dr. APJ Abdul Kalam Award | Beneficiary: Exe & Non Exe" },
    { label: "Nehru Award Scheme", cells: ["Non Exe", "6,000", "Annual"], quote: "Name of the Scheme: Nehru Award Scheme" }, // not in this source text: ignored
  ],
  unanswered: [
    { part: "the maximum cost of the Kalam Award tour", status: "in_circular", fact: "Maximum cost per employee for lodging & transport will be Rs.20,000/- or as per SAIL TA rules whichever is lower.", quote: "Maximum cost per employee for lodging & transport will be Rs.20,000/-" },
    { part: "the occasion on which the Kaushal Award is given", status: "not_in_circular" },
  ],
  abbreviations: [
    { abbr: "TA", meaning: "Travelling Allowance", quote: "as per SAIL TA rules" }, // a known sense, picked by context
    { abbr: "XYZ", meaning: "Made up", quote: "not in the circular at all" },
    { abbr: "CGM", meaning: "Chief General Manager", quote: "by respective CGM/ HoD" }, // a guess: the circular never spells it out
  ],
};
{ const out = applyVerdict(base, V, ctx);
  const r = out.result;
  ok("a count the table contradicts is corrected (the fix's figure 'three' is written in the circular)", /Three schemes are compared/.test(r.overview) && !/Ten distinct/.test(r.overview), r.overview);
  ok("an unsupported sentence with a checkable fix is rewritten in the circular's words", /presented to selected Awardees by respective CGM\/ HoD/.test(r.keyFindings[1].text) && !/directly/.test(r.keyFindings[1].text), r.keyFindings[1].text);
  ok("an unsupported sentence with no fix is removed, and the empty finding with it", !r.keyFindings.some((f) => /automatically/.test(f.text)) && out.removed === 1);
  ok("a wrong cell is corrected when the quote is in the circular", r.table!.rows[1][3] === "Annual");
  ok("a 'correction' whose figure the circular never writes is ignored", r.table!.rows[0][2] === "10,000");
  ok("a cell is never blanked to 'Not stated' by the verifier", r.table!.rows[2][1] === "Contract Labour");
  ok("a missing row with its quote in the circular is added, with every cell", r.table!.rows.length === 4 && r.table!.rows[3][0] === "Dr. APJ Abdul Kalam Award" && r.table!.rows[3][3] === "Half Yearly");
  ok("a row whose quote is not in the circular is not added", !r.table!.rows.some((x) => /Nehru/.test(x[0])));
  ok("a part answerable from the circular becomes a finding, cited to the circular the quote is in", r.keyFindings.some((f) => /Rs\.20,000/.test(f.text) && f.sources.join() === "10"), JSON.stringify(r.keyFindings.map((f) => f.text)));
  ok("a part not in the circulars is said so in the overview, once, quoting the part", (r.overview.match(/None of the circulars provided covers this part of the question: "the occasion on which the Kaushal Award is given"/g) || []).length === 1, r.overview);
  ok("a short form the circular settles is recorded; one with no quote in the circular is not", r.abbreviations?.TA === "Travelling Allowance" && !r.abbreviations?.XYZ);
  ok("a meaning that is not a confirmed sense of an ambiguous short form is not shown", !r.abbreviations?.CGM && out.ignoredWhy.some((w) => /CGM.*not a confirmed sense/.test(w)), out.ignoredWhy.join(" | "));
  ok("every report left alone says why", out.ignoredWhy.length === out.ignored && out.ignoredWhy.every((w) => w.length > 10), out.ignoredWhy.join("\n"));
  ok("the unverifiable reports are counted, not applied", out.ignored >= 3, String(out.ignored));
  ok("the input briefing is not changed", base.table!.rows.length === 3 && /Ten distinct/.test(base.overview) && base.keyFindings.length === 3);
  ok("every change is logged in one line", out.changes.length >= 7 && out.changes.every((c) => typeof c === "string" && c.length > 10), out.changes.join("\n")); }
{ const head: SynthesisResult = { ...base, headline: "Motivational Awards Unchanged (2022-2025)" };
  const mk = (fix: string, quote: string): Verdict => ({ sentences: [{ where: "headline", sentence: head.headline!, verdict: "contradicted", fix, quote }], cells: [], missingRows: [], missingColumns: [], unanswered: [], abbreviations: [] });
  const good = applyVerdict(head, mk("Motivational Award Schemes Implemented From FY 2022-23", "shall be implemented in DSP w.e.f. from FY 2022-23"), ctx);
  ok("a headline the circulars contradict is rewritten when the fix is checkable", good.result.headline === "Motivational Award Schemes Implemented From FY 2022-23", good.result.headline);
  const bad = applyVerdict(head, mk("Motivational Awards Raised To Rs 99,999", "shall be implemented in DSP w.e.f. from FY 2022-23"), ctx);
  ok("a headline fix with a figure the circulars lack is refused, and the headline is never removed", bad.result.headline === head.headline && bad.ignored === 1, bad.result.headline);
  const none = applyVerdict(head, mk("", ""), ctx);
  ok("a headline with no fix stays as it was", none.result.headline === head.headline && none.ignored === 1);
  ok("the verifier is shown the headline, and told to test 'unchanged' against the circulars' own lists", /"headline":"Motivational Awards Unchanged/.test(verifierInput("q?", head, SRC)) && /WHAT CHANGED/.test(VERIFY_PROMPT) && /only in wording/i.test(VERIFY_PROMPT) && /numbered list/.test(VERIFY_PROMPT)); }
{ const sed: SynthesisResult = { ...base, keyFindings: [{ text: "The Cultural Excellence Award is executed by SED.", sources: [10] }] };
  const out = applyVerdict(sed, { sentences: [], cells: [], missingRows: [], missingColumns: [], unanswered: [], abbreviations: [{ abbr: "SED", meaning: "Safety Engineering Department", quote: "Executing Department for the Scheme: Safety Engineering Department" }] }, ctx);
  ok("even a meaning the circular spells out is left to the code that reads definitions, not taken from the verifier", !out.result.abbreviations?.SED);
}
{ const out = applyVerdict(base, { sentences: [], cells: [], missingRows: [], missingColumns: [], unanswered: [], abbreviations: [] }, ctx);
  ok("an empty report changes nothing", JSON.stringify({ ...out.result, abbreviations: undefined }) === JSON.stringify({ ...base, abbreviations: undefined, extraTable: undefined }) && out.changes.length === 0, JSON.stringify(out.result).slice(0, 200)); }
{ const out = applyVerdict(base, { ...V, sentences: [{ sentence: "Ten distinct schemes are compared, ranging from individual awards to group recognitions.", verdict: "contradicted", fix: "Three schemes are compared, ranging from individual awards to group recognitions." }], cells: [], missingRows: [], missingColumns: [], unanswered: [], abbreviations: [] }, ctx);
  ok("a sentence reported without its place is still found", /Three schemes/.test(out.result.overview)); }
{ const out = applyVerdict(base, { sentences: [{ where: "finding 1", sentence: "A sentence that is not in the briefing at all.", verdict: "unsupported", fix: "" }], cells: [], missingRows: [], missingColumns: [], unanswered: [], abbreviations: [] }, ctx);
  ok("a sentence that is not in the briefing changes nothing and is counted", out.changes.length === 0 && out.ignored === 1); }
{ const out = applyVerdict(base, { sentences: [{ where: "finding 1", sentence: base.keyFindings[0].text, verdict: "unsupported", fix: "The Jawahar Award Scheme pays a lakh of rupees to every executive of the plant each quarter.", quote: "Award Amt. (Rs.): 10,000" }], cells: [], missingRows: [], missingColumns: [], unanswered: [], abbreviations: [] }, ctx);
  ok("a fix in words the circular does not use is not taken: the sentence is removed instead", out.result.keyFindings.length === 2 && !out.result.keyFindings.some((f) => /lakh/.test(f.text))); }

// ---- two tables: a row goes to the table the verifier names, a cell too
{ const two: SynthesisResult = { ...base, extraTable: { columns: ["Festival", "Beneficiary", "Award Amt. (Rs.)", "Periodicity"], rows: [["Nehru Award Scheme", "Non Exe", "6,000", "Annual"]], sources: [10] } };
  const out = applyVerdict(two, { sentences: [], missingColumns: [], cells: [{ table: "table2", row: "Nehru Award Scheme", column: "Periodicity", value: "Monthly", quote: "Periodicity: Monthly" }], missingRows: [{ table: "table2", label: "Dr. APJ Abdul Kalam Award", cells: ["Exe & Non Exe", "Fully paid Holiday for three days and two nights to a nearby resort with family within 150 Kms from Durgapur as per TA eligibility", "Half Yearly"], quote: "Name of the Scheme: Dr. APJ Abdul Kalam Award | Beneficiary: Exe & Non Exe" }], unanswered: [], abbreviations: [{ abbr: "TA", meaning: "TRAVELLING ALLOWANCE", quote: "as per SAIL TA rules" }] }, { ...ctx, sources: [{ id: 10, text: SRC + " Salem Steel Plant" }] });
  ok("a missing row named for the second table is added there, not to the first", out.result.table!.rows.length === 3 && out.result.extraTable!.rows.length === 2 && out.result.extraTable!.rows[1][0] === "Dr. APJ Abdul Kalam Award", JSON.stringify(out.result.extraTable));
  ok("a cell named for the second table is corrected there", out.result.extraTable!.rows[0][3] === "Monthly" && out.result.table!.rows[0][3] === "Annual");
  ok("a confirmed sense given in capitals is matched and shown in title case", out.result.abbreviations?.TA === "Travelling Allowance", out.result.abbreviations?.TA); }
ok("the verifier's prompt makes it test every universal word against every row of the table", /universal word/.test(VERIFY_PROMPT) && /EVERY row/.test(VERIFY_PROMPT));
ok("the verifier's prompt says what is not a fault: format, units, short forms in full, a summary sentence, a count equal to the table's rows", /NOT A FAULT/.test(VERIFY_PROMPT) && /rupee sign/.test(VERIFY_PROMPT) && /equals the number of rows/.test(VERIFY_PROMPT));

// ---- the three false moves of the live P02 run (11 Nov 2026, 15:03)
{ const titled: SynthesisResult = { ...base, table: { ...base.table!, title: "Motivational Award Schemes of DSP" } };
  const out = applyVerdict(titled, { sentences: [
      { where: "finding 1", sentence: base.keyFindings[0].text, verdict: "unsupported", fix: "The Jawahar Award Scheme provides 10,000 annually to Exe (E6-E7) on Republic Day/ SAIL Day, executed by Pers (OD).", quote: "Award Amt. (Rs.): 10,000" },
      { where: "overview", sentence: "The circular outlines various motivational award schemes at DSP.", verdict: "unsupported", fix: "" },
      { where: "overview", sentence: "Ten distinct schemes are compared, ranging from individual awards to group recognitions.", verdict: "unsupported", fix: "" },
    ], cells: [], missingRows: [], missingColumns: [], unanswered: [], abbreviations: [
      { abbr: "IED", meaning: "Contract Labour Department", quote: "Implementing/ Executing Authority: CGM" }, // every word is somewhere in the circular, the phrase is not
      { abbr: "DIC", meaning: "Director In-charge", quote: "approval of Director In Charge" },
    ] }, { ...ctx, sources: [{ id: 10, text: SRC + " As per the study recommendations of the high-level committee, and subsequent approval of Director In Charge (ISP & DSP)." }] });
  ok("a fix that changes only format or wording (no rupee sign, 'Exe' for 'Executives') is not taken: the finding keeps its words", out.result.keyFindings[0].text === base.keyFindings[0].text && out.changes.some((c) => /changes no fact/.test(c)), out.result.keyFindings[0].text);
  ok("an overview emptied by the reading is a sentence built from the table's title, never a copy of a finding", out.result.overview === "The table below sets out the Motivational Award Schemes of DSP, in the circular's own words.", out.result.overview);
  ok("a 'meaning' that is words copied from the circular is not shown", !out.result.abbreviations?.IED && !out.result.abbreviations?.DIC); }
ok("the verifier is asked about ambiguous short forms only, and told a meaning is never a copied phrase", /MORE THAN ONE usual meaning/.test(VERIFY_PROMPT) && /never a phrase copied/.test(VERIFY_PROMPT));

// ---- a year the question names with no column: the reading supplies it, one quote per value
{ const LV = "Circular 2023: Casual Leave: 4 days per calendar year. Medical Leave: 7 days per calendar year. Circular 2024: Casual Leave: 4 days per calendar year. Medical Leave: 7 days per calendar year. Circular 2025: Casual Leave: 5 days per calendar year.";
  const one: SynthesisResult = { ...base, table: { columns: ["Leave", "2023"], rows: [["Casual Leave", "4 days"], ["Medical Leave", "7 days"]], sources: [1] } };
  const vc: Verdict = { sentences: [], cells: [], missingRows: [], unanswered: [], abbreviations: [], missingColumns: [
    { table: "table", column: "2024", cells: [{ row: "Casual Leave", value: "4 days", quote: "Circular 2024: Casual Leave: 4 days" }, { row: "Medical Leave", value: "7 days", quote: "Medical Leave: 7 days per calendar year" }] },
    { table: "table", column: "2025", cells: [{ row: "Casual Leave", value: "5 days", quote: "Circular 2025: Casual Leave: 5 days" }, { row: "Medical Leave", value: "9 days", quote: "not in the text" }] },
  ] };
  const out = applyVerdict(one, vc, { sources: [{ id: 1, text: LV }], figuresSafe: figureGuard(LV).figuresSafe });
  ok("the missing years become columns, in year order", JSON.stringify(out.result.table!.columns) === '["Leave","2023","2024","2025"]', JSON.stringify(out.result.table!.columns));
  ok("a value with its quote in the circular is taken; one without says it is not confirmed (never 'Not stated', which would claim an absence unchecked)", JSON.stringify(out.result.table!.rows[0]) === '["Casual Leave","4 days","4 days","5 days"]' && JSON.stringify(out.result.table!.rows[1]) === '["Medical Leave","7 days","7 days","Not confirmed from the circular"]', JSON.stringify(out.result.table!.rows));
  const inp = verifierInput("How did the leave entitlements change between 2023, 2024 and 2025?", one, "x");
  ok("the verifier is told which years the question names and which the table lacks", /names the years 2023, 2024, 2025; the table has no column for 2024, 2025/.test(inp), inp.slice(0, 300));
  ok("a column the verifier cannot prove for half the rows is not added", applyVerdict(one, { ...vc, missingColumns: [{ table: "table", column: "2024", cells: [{ row: "Casual Leave", value: "4 days", quote: "nowhere" }, { row: "Medical Leave", value: "7 days", quote: "nowhere" }] }] }, { sources: [{ id: 1, text: LV }], figuresSafe: figureGuard(LV).figuresSafe }).result.table!.columns.length === 2); }

// ---- the prompt and the input
ok("the verifier's prompt asks for quotes copied verbatim, lists the five checks, and reports only faults", /verbatim/.test(VERIFY_PROMPT) && /UNSUPPORTED/.test(VERIFY_PROMPT) && /CONTRADICTED/.test(VERIFY_PROMPT) && /THE TABLE/.test(VERIFY_PROMPT) && /THE QUESTION/.test(VERIFY_PROMPT) && /SHORT FORMS/.test(VERIFY_PROMPT) && /supported sentence is not listed/.test(VERIFY_PROMPT));
{ const withTA: SynthesisResult = { ...base, overview: base.overview + " The Kalam tour is as per TA eligibility." };
  const inp = verifierInput("Compare the schemes.", withTA, "[Circular id=10] ...");
  ok("the verifier sees the question, the numbered findings, the table and the same records", /Compare the schemes/.test(inp) && /"n":2/.test(inp) && /Name of the Scheme/.test(inp) && /\[Circular id=10\]/.test(inp));
  ok("the ambiguous short forms the briefing uses are found (TA in the Kalam cell), not ones it does not use", JSON.stringify(ambiguousShortForms(withTA)) === '["TA"]' && ambiguousShortForms(base).length === 0);
  ok("the verifier is told to rule on each of them, with the confirmed senses", /- TA: "Township Administration" or "Travelling Allowance"/.test(inp) && /For EACH, say/.test(inp));
  ok("with no ambiguous short form nothing is asked", !/more than one meaning\. For EACH/.test(verifierInput("q", base, "x"))); }

// ---- through the engine: the verifier's fix lands in the stored briefing; a failed verification is shown but not stored
const RAW = JSON.stringify({
  headline: "Motivational Award Schemes",
  overview: base.overview,
  keyFindings: base.keyFindings.map((f) => ({ text: f.text, sources: [10] })),
  table: { title: "Motivational Award Schemes of DSP", columns: base.table!.columns, rows: base.table!.rows, sources: [10] },
  datasets: [],
});
const records = [{ id: 10, type: "circular", headline: "Circular - Motivational Award Schemes of DSP", url: null, publishedAt: "2022-12-19", similarity: 0.9, matchPercentage: 90, chunkText: SRC }] as any;
const labels = new Map([[10, "Circular 009 (2022)"]]);
function memStore(): EdsStore & { rows: Map<string, EdsRow> } {
  const rows = new Map<string, EdsRow>();
  return {
    rows,
    fingerprint: async () => "fp1",
    get: async (key: string) => rows.get(key) ?? null,
    put: async (row: any) => { const r = { ...row, updatedAt: "now" } as EdsRow; if (!rows.has(row.key)) rows.set(row.key, r); return rows.get(row.key)!; },
  } as any;
}
(async () => {
  {
    clearExecutiveSynthesisCache();
    const store = memStore();
    let sawSystem = "", sawInput = "";
    const r = await executeExecutiveSynthesis("Compare all the motivational award schemes by amount and periodicity " + Math.random(), records, labels, {
      store, candidates: 1,
      generate: async () => RAW,
      verify: async (input, system) => { sawInput = input; sawSystem = system; return JSON.stringify(V); },
    });
    // the plain-code guards run first (the count is already "Three", "directly" and "automatically" are already out): the verifier sees the guarded text
    ok("the verifier is called with its own prompt and the briefing", sawSystem === VERIFY_PROMPT && /Three distinct schemes are compared/.test(sawInput) && /Kaushal Award is presented by the CGM/.test(sawInput), sawInput.slice(0, 600));
    ok("the verifier's checked corrections are in the briefing shown", /presented to selected Awardees by respective CGM\/ HoD/.test(r.keyFindings[1].text) && r.table!.rows[1][3] === "Annual" && r.table!.rows.length === 4 && r.abbreviations?.TA === "Travelling Allowance", JSON.stringify(r.keyFindings));
    ok("the briefing records that it was read a second time, with the changes", r.verification?.checked === true && (r.verification?.changes.length ?? 0) >= 6, JSON.stringify(r.verification));
    ok("the checked briefing is the one stored", store.rows.size === 1 && [...store.rows.values()][0].result.table!.rows.length === 4);
  }
  {
    clearExecutiveSynthesisCache();
    const store = memStore();
    const r = await executeExecutiveSynthesis("Compare all the motivational award schemes by amount and periodicity " + Math.random(), records, labels, {
      store, candidates: 1, generate: async () => RAW, verify: async () => { throw new Error("verifier down"); },
    });
    ok("when the second reading fails the briefing is shown as written, marked unchecked, and NOT stored", r.table!.rows.length === 3 && r.verification?.checked === false && store.rows.size === 0);
  }
  {
    clearExecutiveSynthesisCache();
    const store = memStore();
    const r = await executeExecutiveSynthesis("Compare all the motivational award schemes by amount and periodicity " + Math.random(), records, labels, { store, candidates: 1, generate: async () => RAW });
    ok("a test with no verifier hook runs no verification and stores as before", r.verification?.checked === false && store.rows.size === 1);
  }
  {
    // the one repair attempt: a table that lacks a year the question names is put to the writer again, named; the better answer is kept
    clearExecutiveSynthesisCache();
    const prompts: string[] = [];
    const oneYear = JSON.stringify({ headline: "H", overview: "The amounts stayed the same in 2025 and 2026.", keyFindings: [{ text: "The Jawahar Award is ₹10,000 in both years.", sources: [10] }, { text: "The DIC award is ₹8,000.", sources: [10] }, { text: "Pers (OD) executes both.", sources: [10] }], table: { title: "Awards", columns: ["Scheme", "2025"], rows: [["Jawahar Award Scheme", "10,000"], ["DIC's Excellence Award Scheme", "8,000"]], sources: [10] }, datasets: [] });
    const twoYears = JSON.stringify({ headline: "H", overview: "The amounts stayed the same in 2025 and 2026.", keyFindings: [{ text: "The Jawahar Award is ₹10,000 in both years.", sources: [10] }, { text: "The DIC award is ₹8,000.", sources: [10] }, { text: "Pers (OD) executes both.", sources: [10] }], table: { title: "Awards", columns: ["Scheme", "2025", "2026"], rows: [["Jawahar Award Scheme", "10,000", "10,000"], ["DIC's Excellence Award Scheme", "8,000", "8,000"]], sources: [10] }, datasets: [] });
    const r = await executeExecutiveSynthesis("Compare the award amounts of 2025 and 2026 " + Math.random(), records, labels, { store: null, candidates: 2, repair: true, generate: async (prompt, _s, i) => { prompts.push(prompt); return i < 2 ? oneYear : twoYears; } });
    ok("the repair attempt is made once, naming the missing year", prompts.length === 3 && /A previous answer to this inquiry had these faults/.test(prompts[2]) && /missing now: 2026/.test(prompts[2]) && !/faults/.test(prompts[0]), prompts[2]?.slice(-400));
    ok("and the repaired answer, with the fault gone, is the one kept", r.table?.columns.length === 3 && r.table?.columns[2] === "2026", JSON.stringify(r.table?.columns));
    ok("the engine keeps a repaired answer whose faults are gone even at a slightly lower score", /faultsGone && again\.score\.total >= best\.score\.total - 5/.test(readFileSync("src/lib/search/executiveSynthesis.ts", "utf8")));
    ok("structuralRepairs turns only the structural notes into instructions", structuralRepairs(["year(s) asked but missing from the tables: 2024, 2025", "comparison asked but no table", "overview too short"]).length === 2 && structuralRepairs(["2 finding(s)"]).length === 0);
  }
  const eng = readFileSync("src/lib/search/executiveSynthesis.ts", "utf8");
  {
    const AF = "All the contributions towards the AFFDF are exempted from income tax. Payment of Rs. 100 is due. Interest is 7.5 per cent a year and a 25% rebate applies.";
    const g = figureGuard(AF);
    ok("a percentage must be printed as a percentage: 'all are exempt' is not '100% exempt' even when a bare 100 stands elsewhere", !g.figuresSafe("The contributions are 100% exempt from income tax.") && !g.percentsSafe("100% exempt"));
    ok("a percentage the circulars print (25%, 7.5 per cent) is accepted in either spelling", g.figuresSafe("A 25% rebate and 7.5% interest apply.") && g.figuresSafe("Interest is 7.5 per cent.") && percentFiguresIn("25 % and 7.5 percent and 10 per cent").size === 3);
    ok("text without a percentage is untouched by the rule", g.percentsSafe("Payment of Rs. 100 is due."));
  }
  {
    const WALK = "3. Time: a) Arrival and address of Chief Guest – 07:45 AM b) Oath taking ceremony – 07:50 AM c) Flag Off – 08:00 AM d) Prize Distribution and Refreshment – 09:00 AM to 09:30 AM. 2.3 Registration for participation shall be done till 15th January, 2026, 6 PM. 2.4 On 24th January 2026 everyone is requested to assemble in front of the Main Entrance Gate so that the RULES can be explained and the walk can be conducted in a smooth manner.";
    const base: SynthesisResult = { headline: "H", overview: "The walk is on 24th January 2026.", keyFindings: [{ text: "Register by 15th January, 2026 (6:00 PM) for the walk that starts at 8:00 AM.", sources: [1] }], table: { title: "T", columns: ["Event", "Timing"], rows: [["5 Km Walk / Run", "Assembly: 7:45 AM; Flag-off: 8:00 AM"]], sources: [1] }, extraTable: null, charts: [], citations: [] } as unknown as SynthesisResult;
    const hits = mislabelledTimes(base, WALK);
    ok("a time given to another event than the circular's is pointed out with the circular's own name for it", hits.length === 1 && /Assembly: 7:45 AM/.test(hits[0]) && /Arrival and address of Chief Guest/.test(hits[0]), JSON.stringify(hits));
    ok("a time whose name the circular prints beside it (Flag-off, registration) is not pointed out", !hits.some((h) => /8:00|6:00/.test(h)));
    ok("the pointer reaches the verifier's input", /Times of the briefing whose name does not stand beside/.test(verifierInput("When does the walk start?", base, WALK)) && !/Times of the briefing whose name/.test(verifierInput("x", { ...base, table: null }, WALK)));
  }
  {
    const CL = "4.5 The executive shall serve as the Company requires in every case of leave granted to him by the Company under this scheme. 4.6 Sponsorship with full financial assistance on individual initiative may be allowed to an executive only once in career. However there shall be no restriction on sponsoring executive without financial assistance.";
    const rr = { headline: "", overview: "Sponsorship with financial assistance for an executive is allowed.", keyFindings: [], table: null, extraTable: null, charts: [], citations: [] } as unknown as SynthesisResult;
    const u = unusedClauses("what financial assistance sponsorship applies to an executive", rr, CL);
    ok("a clause with no figure that LIMITS the answer ('only once in career') is pointed out", u.some((c) => /only once in career/.test(c)), JSON.stringify(u));
    const used = { ...rr, overview: "Sponsorship with financial assistance is allowed to an executive only once in career." } as SynthesisResult;
    ok("and not when the briefing already says it", !unusedClauses("what financial assistance sponsorship applies to an executive", used, CL).some((c) => /only once in career/.test(c)));
    ok("the verifier and the writer are both told that a footnote stays with its own item", /QUALIFIERS: a footnote/.test(VERIFY_PROMPT) && /QUALIFIERS STAY WHERE THE CIRCULAR PUTS THEM/.test(readFileSync("src/lib/search/executiveSynthesis.ts", "utf8")));
  }
  {
    const HOL = "1. CLOSED/ PUBLIC HOLIDAYS: Following closed /public holidays are admissible to all categories: SL. NO.: 1 | HOLIDAYS: SAIL Foundation Day | DATE: 24th January | DAY OF WEEK: Monday SL. NO.: 2 | HOLIDAYS: Republic Day | DATE: 26th January | DAY OF WEEK: Wednesday SL. NO.: 3 | HOLIDAYS: May Day | DATE: 1st May | DAY OF WEEK: Sunday SL. NO.: 4 | HOLIDAYS: Independence Day | DATE: 15th August | DAY OF WEEK: Monday SL. NO.: 5 | HOLIDAYS: Mahatma Gandhi's Birthday | DATE: 2nd October | DAY OF WEEK: Sunday 2. FESTIVAL HOLIDAYS : Festival Holidays are admissible to Category A and B.";
    const q = "Compare the closed and public holidays of the two years";
    const named = { headline: "", overview: "Five closed and public holidays are common: SAIL Foundation Day, Republic Day, May Day, Independence Day and Mahatma Gandhi's Birthday.", keyFindings: [], table: null, extraTable: null, charts: [], citations: [] } as unknown as SynthesisResult;
    const L = uncoveredLists(q, named, HOL);
    ok("a short list the question names, whose entries the briefing names but never dates, is handed to the verifier with its entries", L.length === 1 && /5 dated entries/.test(L[0]) && /SAIL Foundation Day · 24th January · Monday/.test(L[0]) && /Gandhi's Birthday · 2nd October · Sunday$/.test(L[0]), JSON.stringify(L));
    ok("not when the briefing gives the dates", uncoveredLists(q, { ...named, overview: named.overview + " On 24th January, 26th January, 1st May, 15th August and 2nd October." } as SynthesisResult, HOL).length === 0);
    ok("not when the list's heading is not the question's", uncoveredLists("What is the bond period for study leave?", named, HOL).length === 0);
    ok("and the pointer reaches the verifier's input", /Short lists of the circulars named by the question/.test(verifierInput(q, named, HOL)));
    ok("a category the rule leaves out is not 'Not stated' (prompt)", /LEFT OUT BY THE RULE/.test(VERIFY_PROMPT));
  }
  ok("a briefing made by a fallback model is shown but never kept", /noteModel\(reply\.model\)/.test(eng) && /verifyState !== "failed" && !weakerModel\)/.test(eng));
  ok("the engine verifies the BEST candidate, then adds its code-built findings, re-scores, and the version changed", eng.indexOf("applyVerdict(best.result") > 0 && eng.indexOf("applyVerdict(best.result") < eng.indexOf("describeIssuers(best.result.table") && /best\.score = scoreBriefing\(best\.result, best\.scoreCtx\)/.test(eng) && /EDS_ENGINE_VERSION = "77\.7"/.test(eng));
  ok("the kill switch EDS_VERIFY=off exists and a failed reading is never stored", /EDS_VERIFY/.test(eng) && /verifyState !== "failed"/.test(eng));
  console.log(`edsVerify selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
