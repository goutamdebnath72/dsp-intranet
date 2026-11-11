// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/search/edsEngine.selftest.ts
//
// The consistency engine of the Executive Deep Synthesis: score, pick the best of several candidates, store the winner, serve it ever after.
// The model is replaced by one that answers DIFFERENTLY at every call (as the real one does), so what is proved is the engine, not luck.
// The source text is the real wording of Circular 2022/46 (rules for retention of company accommodation), paragraph 5.1.

import { definedAbbreviations, usedDefinitions } from "./abbreviations";
import {
  executeExecutiveSynthesis,
  clearExecutiveSynthesisCache,
  decideChartType,
  buildResult,
  canonicalCell,
  firstDateIn,
  chronologicalOrder,
  amendmentsAmong,
  isRangeLabel,
  edsKeyFor,
  type SynthesisResult,
} from "./executiveSynthesis";
import { DateTime } from "luxon";
import { scoreBriefing, pickBest, wantsEvolution, subjectQualifiers, ACCEPT_SCORE, STORE_MIN_SCORE } from "./edsQuality";
import type { EdsRow, EdsStore } from "./edsStore";
import { readFileSync } from "node:fs";

const ENGINE_SRC = readFileSync("src/lib/search/executiveSynthesis.ts", "utf8");

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${name} ${extra}`);
  }
};

const SOURCE = `Circular Sl. No.: 2022/ 46 Sub: Rules for Retention of Company Accommodation by Ex-employees at City locations
5.1 Subject to the availability, the period of retention of Company Accommodation will be as under: I. Type 'A' City Locations (Delhi-NCR, Mumbai, Kolkata, Chennai, Hyderabad and Bangalore)
Period of retention (from the date of separation): Upto two (2) months | Advance Rent (per month): Standard HRR | Competent Authority: Head of Administration at the respective location.
Period of retention: For 3rd & 4th month* | Advance Rent (per month): Four times of the Standard HRR | Competent Authority: Head of P&A at the respective location.
Period of retention: From 5th & 6th month | Advance Rent (per month): 1.2 times the Monthly Rent at the respective location. | Competent Authority: Concerned Functional Director as per respective location.
* For Mumbai, retention will be permissible for upto 4th month only.
II. Type 'B' City Locations (i.e. all locations other than type 'A' cities)
Period of retention #: Upto two (2) months | Advance Rent (per month): Standard HRR | Competent Authority: Head of Administration at the respective location.
Period of retention #: For 3rd & 4th month | Advance Rent (per month): Twice of the Standard HRR | Competent Authority: Head of P&A at the respective location.
Period of retention #: For 5th & 6th month | Advance Rent (per month): Monthly Rent at the respective location. | Competent Authority: Head of P&A at the respective location.
Period of retention #: From 7th month to 12th month* | Advance Rent (per month): 1.2 times the Monthly Rent at the respective location. | Competent Authority: Concerned Functional Director/ Chief Executive as per respective location.
* Under exceptional circumstances, provided no employee is in waiting for allotment of Company accommodation in that category at that location.`;

const Q =
  "Synthesize the company accommodation retention rules for ex-employees at Type A city locations compared to Type B locations under Circular 46 of 2022. Detail the allowable retention periods, rental escalation multipliers, and the competent sanctioning authorities.";

const records: any[] = [{ id: 6, type: "circular", headline: "Circular - Rules for Retention of Company Accomodation by Ex-employees at City Locations", url: null, publishedAt: "2022-12-26", similarity: 0.92, matchPercentage: 92, chunkText: SOURCE }];
const labels = new Map([[6, "Circular 046 (2022)"]]);

// ---- the candidate briefings the fake model can write ----
const table = {
  columns: ["Retention Period", "Type A City Locations", "Type B City Locations"],
  rows: [
    ["Up to 2 months", "Standard HRR (Head of Administration)", "Standard HRR (Head of Administration)"],
    ["3rd & 4th month", "4x Standard HRR (Head of P&A)", "2x Standard HRR (Head of P&A)"],
    ["5th & 6th month", "1.2x Monthly Rent (Functional Director)", "Monthly Rent (Head of P&A)"],
    ["7th to 12th month", "Not applicable", "1.2x Monthly Rent (Functional Director/Chief Executive)"],
  ],
};
const GOOD = {
  headline: "Accommodation Retention: Type A vs B Cities",
  overview: "Ex-employees in **Type A** cities pay **4x Standard HRR** from the 3rd month and may stay at most **6 months** (**4 months** for Mumbai). **Type B** locations pay **2x Standard HRR** and may stay up to **12 months** in exceptional circumstances.",
  keyFindings: [
    { text: "Retention periods: Type A cities allow up to 6 months (4 months for Mumbai); Type B cities allow up to 12 months under exceptional circumstances.", sources: [6] },
    { text: "Rent escalation: 3rd and 4th month is 4x Standard HRR in Type A against 2x Standard HRR in Type B; from the 5th month it moves to Monthly Rent (1.2x in Type A).", sources: [6] },
    { text: "Sanctioning authorities: Head of Administration for the first 2 months, Head of P&A for the 3rd and 4th, the Functional Director from the 5th month in Type A.", sources: [6] },
  ],
  table,
  datasets: [
    {
      intent: "comparison",
      title: "Initial Rent Escalation Multipliers",
      subtitle: "Multiples of Standard HRR for the initial 4 months; later months move to Monthly Rent per the table.",
      unit: "Multiples of Standard HRR",
      entityLabels: ["Type A Locations", "Type B Locations"],
      items: [
        { label: "Up to 2 months", value: 1, secondaryValue: 1 },
        { label: "3rd & 4th month", value: 4, secondaryValue: 2 },
      ],
    },
  ],
};
// the SAME numbers drawn as a pie, no table: what one of the morning runs looked like
const PIE_NO_TABLE = {
  headline: "Retention rules",
  overview: "Type A cities escalate faster than Type B cities in retention rent for ex-employees under the circular.",
  keyFindings: [{ text: "Type A pays 4x Standard HRR and Type B 2x Standard HRR in the 3rd and 4th month.", sources: [6] }],
  datasets: [{ intent: "breakdown", title: "Multipliers", subtitle: "x", unit: "Multiples of Standard HRR", items: [{ label: "Type A", value: 4 }, { label: "Type B", value: 2 }] }],
};
const MADE_UP = {
  ...GOOD,
  overview: "Ex-employees in Type A cities pay 9x Standard HRR.",
  keyFindings: [{ text: "Type A pays 9x Standard HRR after 14 months (Rs. 45,000).", sources: [6] }, ...GOOD.keyFindings.slice(0, 2)],
  table: { columns: table.columns, rows: [["3rd & 4th month", "9x Standard HRR", "7x Standard HRR"], ...table.rows.slice(0, 2)] },
};

const run = async () => {
  // ================= 1. the score ranks, and ranks the right way =================
  const build = async (payload: unknown) => {
    const raw = JSON.stringify(payload);
    clearExecutiveSynthesisCache();
    const result: SynthesisResult = await executeExecutiveSynthesis(Q + Math.random(), records, labels, { store: null, candidates: 1, generate: async () => raw });
    return result;
  };
  const rGood = await build(GOOD);
  const rPie = await build(PIE_NO_TABLE);
  const rMade = await build(MADE_UP);
  const ctx = { query: Q, sourceText: SOURCE };
  const sGood = scoreBriefing(rGood, ctx);
  const sPie = scoreBriefing(rPie, ctx);
  const sMade = scoreBriefing(rMade, { ...ctx, droppedFigures: 3 });
  console.log("good briefing score:", JSON.stringify(sGood));
  ok("a complete, grounded comparison briefing is a GOOD one", sGood.total >= ACCEPT_SCORE, JSON.stringify(sGood));
  ok("a briefing with no table for a 'compared' question scores clearly lower", sPie.total < sGood.total - 10, `${sPie.total} vs ${sGood.total}`);
  ok("a briefing with made-up figures scores lower than the good one", sMade.total < sGood.total - 10, `${sMade.total} vs ${sGood.total}`);
  ok("an empty / failed briefing scores 0", scoreBriefing({ overview: "No synthesis could be derived.", keyFindings: [], charts: [], citations: [], table: null }, ctx).total === 0);
  ok("the pie of multipliers became columns (a rule of the data, not the model's word)", rPie.charts.length === 1 && rPie.charts[0].type === "bar", JSON.stringify(rPie.charts.map((c) => c.type)));
  ok("the made-up figures were removed before scoring (no 9x, no 7x on screen)", !JSON.stringify(rMade).includes("9x") && !JSON.stringify(rMade).includes("7x"));
  ok("each finding's chip can show the circular's own label", rGood.citations.length === 1 && rGood.citations[0].label === "Circular 046 (2022)");
  ok("the tie rule is stable: the same two candidates in either order give the same winner", (() => {
    const a = { result: rGood, score: sGood };
    const b = { result: rGood, score: { ...sGood } };
    return JSON.stringify(pickBest([a, b])?.result) === JSON.stringify(pickBest([b, a])?.result);
  })());
  ok("the best of three is the highest scorer", pickBest([{ result: rPie, score: sPie }, { result: rGood, score: sGood }, { result: rMade, score: sMade }])?.result === rGood);

  // ================= 2. the chart type is a rule of the data =================
  ok("a 'breakdown' of multipliers is columns", decideChartType("breakdown", "Multiples of Standard HRR", [{}, {}]) === "bar");
  ok("a 'breakdown' of months is columns", decideChartType("breakdown", "Months", [{}, {}, {}]) === "bar");
  ok("a 'breakdown' of rupee components stays a pie", decideChartType("breakdown", "₹ per day", [{}, {}, {}]) === "pie");
  ok("a 'breakdown' of percentages stays a pie", decideChartType("breakdown", "%", [{}, {}]) === "pie");
  ok("a 'breakdown' with two series is columns", decideChartType("breakdown", "₹", [{ secondaryValue: 1 }, { secondaryValue: 2 }]) === "bar");
  ok("a 'comparison' is columns, a 'trend' a line", decideChartType("comparison", "₹", [{}, {}]) === "bar" && decideChartType("trend", "₹", [{}, {}, {}]) === "line");

  ok("a 'breakdown' of per-level maxima is columns, not a pie (Pragya 2400 and Parangat 10000 are not parts of one total)", decideChartType("breakdown", "₹", [{}, {}], "Hindi Scheme Top Incentives Maximum cash prize for scoring 70% or more") === "bar");
  ok("a 'breakdown' described as the parts of a wage stays a pie", decideChartType("breakdown", "₹", [{}, {}, {}], "Wage components Basic, VDA and HRA that make up the monthly wage") === "pie");
  ok("the prompt keeps every case with its condition, and says when the asked year is not in the circulars", /EVERY CASE, WITH ITS CONDITION/.test(ENGINE_SRC) && /ASKED, BUT NOT IN THE CIRCULARS/.test(ENGINE_SRC));

  {
    const src = "2.2 The scheme shall cover study leave with/without financial assistance (FA) for pursuing a course. Sponsored by the Head of Function (HoF). A loose RFID Card Biometric (RFID) text.";
    const d = definedAbbreviations(src);
    ok("a circular's own definition is read: financial assistance (FA) -> Financial Assistance", d.FA === "Financial Assistance", JSON.stringify(d));
    ok("a definition whose initials do not spell the abbreviation is refused (RFID Card Biometric)", !d.RFID, JSON.stringify(d));
    ok("only the abbreviations the reply uses are kept", JSON.stringify(usedDefinitions(d, "Bond: FA + 12 months")) === JSON.stringify({ FA: "Financial Assistance" }) && Object.keys(usedDefinitions(d, "nothing here")).length === 0);
    ok("the prompt bans derived figures and self-made short forms, and asks for the circular's definitions", /NO FIGURES OF YOUR OWN/.test(ENGINE_SRC) && /NO SHORT FORMS OF YOUR OWN/.test(ENGINE_SRC) && /NAMES AS THE CIRCULAR SPELLS THEM/.test(ENGINE_SRC) && /ROW AND COLUMN LABELS ARE PLAIN/.test(ENGINE_SRC) && /DEFINITIONS OF TERMS/.test(ENGINE_SRC));
  }
  {
    const raw = (title: string) => JSON.stringify({ overview: "Overview of the maxima.", headline: "H", keyFindings: [{ text: "A finding.", sources: [1] }], datasets: [{ intent: "comparison", title, subtitle: "Prizes", unit: "₹", entityLabels: ["Pragya", "Parangat"], items: [{ label: "70% or more", value: 2400, secondaryValue: 10000 }] }] });
    const types = (title: string) => buildResult(raw(title), [{ id: 1, headline: "Prizes", publishedAt: null } as any], new Set([1]), "Pragya 2400 Parangat 10000 70%", undefined).charts.map((c) => c.type).join(",");
    ok("one category with two values is a pie ONLY when it is parts of a whole, never for maxima", types("Maximum cash prize by level") === "bar" && types("Split of the prize") === "pie", `${types("Maximum cash prize by level")} / ${types("Split of the prize")}`);
  }
  {
    ok("an empty condition '[]' in a cell is removed", canonicalCell("8:30 AM []") === "8:30 AM" && canonicalCell("31.08.2026 [ ]") === "31.08.2026" && canonicalCell("4x Rent [Mumbai: first 4 months]") === "4x Rent [Mumbai: first 4 months]");
    ok("a date in a label is read in every written form", firstDateIn("31.10.2023") === DateTime.utc(2023, 10, 31).toMillis() && firstDateIn("28.12.2023 to 30.12.2023") === DateTime.utc(2023, 12, 28).toMillis() && firstDateIn("5th December, 2024") === DateTime.utc(2024, 12, 5).toMillis() && firstDateIn("Dec 2024") === DateTime.utc(2024, 12, 1).toMillis() && firstDateIn("2024-12-05") === DateTime.utc(2024, 12, 5).toMillis() && firstDateIn("Phase 1") === null);
    const tl = [{ label: "01.11.2023" }, { label: "31.10.2023" }, { label: "01.01.2024" }, { label: "06.12.2024" }];
    ok("a timeline whose points all name dates is put in the order of time", chronologicalOrder(tl).map((x) => x.label).join(",") === "31.10.2023,01.11.2023,01.01.2024,06.12.2024");
    const mixed = [{ label: "Phase 2" }, { label: "01.11.2023" }];
    ok("a timeline with a point that names no date keeps the order given", chronologicalOrder(mixed) === mixed);
    const src = [
      { id: 51, headline: "Circular - Online option for Gift Card Rs. 15000 to employees", chunkText: "Gift Card of Rs.15,000/- to the interested employees, online option through ESS" },
      { id: 49, headline: "Circular - Gift card corrigendum", chunkText: "Corrigendum Ref: Earlier circular regarding Online option for Gift Card to employees; the amount Rs.15,000/- may please be read as Rs.14,999/-" },
      { id: 46, headline: "Circular -, Merit Award Scheme,26 (Amendment), Contract Workers (Eng.)", chunkText: "Amendment: the last date is extended to 31 August 2026" },
      { id: 45, headline: "Circular -, Merit Award Scheme,26 (Amendment), Contract Workers (Hindi)", chunkText: "Amendment: the last date is extended" },
      { id: 10, headline: "Circular - Motivational Award Schemes of DSP", chunkText: "Award schemes" },
    ];
    const am = amendmentsAmong(src);
    ok("a corrigendum is seen as amending the circular it corrects", am.some((x) => x.id === 49 && x.amends.includes(51)), JSON.stringify(am));
    ok("the same notice in another language is not an amendment of itself", !am.some((x) => (x.id === 45 && x.amends.includes(46)) || (x.id === 46 && x.amends.includes(45))), JSON.stringify(am));
  }
  {
    const base = (over: Partial<SynthesisResult>): SynthesisResult => ({
      overview: "Overview that is certainly long enough to count as a real overview of the briefing.", headline: "H",
      keyFindings: [{ text: "Finding one.", sources: [51] }, { text: "Finding two.", sources: [51] }, { text: "Finding three.", sources: [51] }],
      table: { columns: ["Parameter", "2024", "2025"], rows: [["A", "1", "2"], ["B", "3", "4"], ["C", "5", "6"]], sources: [51] },
      charts: [], citations: [], ...over,
    } as SynthesisResult);
    const ctx = { query: "Compare the rules in 2024 and 2025 and 2026", sourceText: "rules" };
    const withYears = scoreBriefing(base({}), { ...ctx, query: "Compare the rules in 2024 and 2025" }).total;
    const noYears = scoreBriefing(base({ table: { columns: ["Parameter", "Works", "Projects"], rows: [["A", "1", "2"], ["B", "3", "4"], ["C", "5", "6"]], sources: [51] } as any }), { ...ctx, query: "Compare the rules in 2024 and 2025" }).total;
    ok("a table that carries the years the question names scores higher than one that does not", withYears > noYears, `${withYears} vs ${noYears}`);
    const absentSaid = scoreBriefing(base({ overview: "Overview that is certainly long enough; the circulars provided hold none for 2025 in the archive." , table: { columns: ["Parameter", "2024"], rows: [["A", "1"], ["B", "2"], ["C", "3"]], sources: [51] } as any }), { ...ctx, query: "Compare the rules in 2024 and 2025" });
    ok("a year the briefing says is not in the circulars is not held against it", !absentSaid.notes.some((n) => /missing from the tables/.test(n)), absentSaid.notes.join("; "));
    const amendments = [{ id: 49, amends: [51] }];
    const cited = scoreBriefing(base({ keyFindings: [{ text: "F1.", sources: [51, 49] }, { text: "F2.", sources: [51] }, { text: "F3.", sources: [51] }] }), { ...ctx, query: "Describe the gift card", amendments }).total;
    const uncited = scoreBriefing(base({}), { ...ctx, query: "Describe the gift card", amendments }).total;
    ok("a briefing that cites the corrigendum of a circular it cites scores higher than one that does not", cited > uncited, `${cited} vs ${uncited}`);
    ok("the prompt carries the rules found by the new panel of questions", ["WHAT DIFFERS", "THE NEWEST WORD WINS", "WHO IS COVERED", "NO FIGURE FROM", "UNIVERSAL WORDS", "ALTERNATIVES STAY ALTERNATIVES", "NOT STATED MEANS", "SAME MEANS SAME", "search that edition's whole text", "NOTHING TO ANSWER"].every((k) => ENGINE_SRC.includes(k)));
  }
  ok("a range label is a range, a month is not", isRangeLabel("MAR-25 TO AUG-25") && isRangeLabel("Jan - Mar") && isRangeLabel("2022 \u2013 2024") && !isRangeLabel("JAN-25") && !isRangeLabel("FEB-25") && !isRangeLabel("2022-23"));
  ok("a 'trend' with a range among its points is columns, not a line", decideChartType("trend", "₹", [{ label: "JAN-25" }, { label: "FEB-25" }, { label: "MAR-25 TO AUG-25" }]) === "bar");
  ok("a 'trend' of single moments stays a line", decideChartType("trend", "₹", [{ label: "2023" }, { label: "2024" }, { label: "2025" }]) === "line");
  ok("the scope / meaning / completeness rules are in the prompt", /CONTEXT COLUMNS/.test(ENGINE_SRC) && /STRUCTURE \/ BREAKDOWN \/ CALCULATION/.test(ENGINE_SRC) && /WHAT A SCHEDULE OF AMOUNTS MEANS/.test(ENGINE_SRC) && /ELIGIBILITY \/ CRITERIA asked/.test(ENGINE_SRC));

  // the record header carries the circular's own name for the situation, and the prompt tells the model to use it
  let sawPrompt = "";
  clearExecutiveSynthesisCache();
  await executeExecutiveSynthesis(Q + "tag", [{ ...records[0], chunkText: "Sub: Revised of GPAIS amount (Mid-term inclusion) for contract workers. " + SOURCE }] as any, labels, { store: null, candidates: 1, generate: async (userPrompt) => { sawPrompt = userPrompt; return JSON.stringify(GOOD); } });
  ok("the record header handed to the model carries 'situation: Mid-term inclusion'", /\| situation: Mid-term inclusion\]/.test(sawPrompt), sawPrompt.slice(0, 200));
  ok("a circular with no bracketed qualifier gets no situation tag", await (async () => { let p2 = ""; clearExecutiveSynthesisCache(); await executeExecutiveSynthesis(Q + "tag2", records as any, labels, { store: null, candidates: 1, generate: async (up) => { p2 = up; return JSON.stringify(GOOD); } }); return !/situation:/.test(p2); })());
  ok("the SITUATION TAG rule is in the prompt", /SITUATION TAG/.test(ENGINE_SRC));

  // ================= 2e. the circular's own name for the situation =================
  const subj = "Notice Sub: Revised of GPAIS amount (Mid-term inclusion) for contract workers/employees engaged by Contractors. Sub: Wages w.e.f. (01.01.2024) (WORKS). Sub: Notice (Ref: HR-CLC) (ISP & DSP) (dsp.com)";
  ok("a subject line's bracketed qualifier is read; dates, numbers and abbreviations are not", JSON.stringify(subjectQualifiers(subj)) === JSON.stringify(["Mid-term inclusion"]), JSON.stringify(subjectQualifiers(subj)));
  const withQ = await build({ ...GOOD, overview: GOOD.overview + " The amounts are for mid-term inclusion of workers.", keyFindings: GOOD.keyFindings.map((f, i) => (i === 0 ? { ...f, text: f.text + " (mid-term inclusion)" } : f)) });
  const qCtx = { query: Q, sourceText: SOURCE, qualifiersBySource: { 6: ["Mid-term inclusion"] } as Record<number, string[]> };
  ok("a briefing that carries the circular's own name for the situation scores above one that lost it", scoreBriefing(withQ, qCtx).parts.coverage > scoreBriefing(rGood, qCtx).parts.coverage, `${scoreBriefing(withQ, qCtx).parts.coverage} vs ${scoreBriefing(rGood, qCtx).parts.coverage}`);
  ok("a qualifier of a circular the briefing does NOT cite is not asked for", scoreBriefing(rGood, { ...qCtx, qualifiersBySource: { 999: ["Mid-term inclusion"] } }).parts.coverage === scoreBriefing(rGood, { ...ctx }).parts.coverage);
  const six = await build({ ...GOOD, keyFindings: [...GOOD.keyFindings, ...GOOD.keyFindings, ...GOOD.keyFindings].slice(0, 7) });
  ok("up to 6 findings are kept (the 7th is not)", six.keyFindings.length === 6, String(six.keyFindings.length));

  // ================= 2d. a second table =================
  const wageTable = { title: "Works area wage, w.e.f. 01.01.2024", columns: ["Component", "Amount"], rows: [["Basic", "Rs 3350.00"], ["VDA", "Rs 13478.00"]], sources: [6] };
  const WAGE_SRC = SOURCE + " Basic 3350.00 VDA 13478.00";
  const twoRec = [{ ...records[0], chunkText: WAGE_SRC }];
  const buildTwo = async (payload: unknown) => {
    clearExecutiveSynthesisCache();
    return executeExecutiveSynthesis(Q + Math.random(), twoRec as any, labels, { store: null, candidates: 1, generate: async () => JSON.stringify(payload) });
  };
  const two = await buildTwo({ ...GOOD, table: { ...GOOD.table, title: "Rule by period" }, table2: wageTable });
  ok("a second, different table is kept, with both captions", !!two.extraTable && two.extraTable.title === "Works area wage, w.e.f. 01.01.2024" && two.table?.title === "Rule by period" && two.extraTable.rows.length === 2, JSON.stringify(two.extraTable));
  ok("a second table that copies the first is dropped", !(await buildTwo({ ...GOOD, table2: GOOD.table })).extraTable);
  ok("a second table with no first table is dropped", !(await buildTwo({ ...GOOD, table: null, table2: wageTable })).extraTable);
  ok("a second table with made-up figures loses those rows", (await buildTwo({ ...GOOD, table2: { ...wageTable, rows: [["Basic", "Rs 3350.00"], ["VDA", "Rs 98765.00"]] } })).extraTable?.rows.length === 1);
  ok("the prompt allows two tables, requires units and says not to invent 'monthly'", /TWO TABLES/.test(ENGINE_SRC) && /AMOUNTS CARRY THEIR UNIT/.test(ENGINE_SRC) && /DO NOT STATE WHAT THE CIRCULAR DOES NOT/.test(ENGINE_SRC) && /LIMITED SPACE FOR FINDINGS/.test(ENGINE_SRC));

  // ================= 2b. one written form for a table cell =================
  ok("'Four times of the Standard HRR (Auth: ...) [note]' -> '4x Standard HRR (...) [note]'", canonicalCell("Four times of the Standard HRR (Auth: Head of P&A) [Mumbai: retention permissible for upto 4th month only]") === "4x Standard HRR (Head of P&A) [Mumbai: retention permissible for upto 4th month only]");
  ok("'Twice of the Standard HRR' -> '2x Standard HRR'", canonicalCell("Twice of the Standard HRR (Auth: Head of P&A)") === "2x Standard HRR (Head of P&A)");
  ok("'1.2 times the Monthly Rent' -> '1.2x Monthly Rent'", canonicalCell("1.2 times the Monthly Rent (Authority: Concerned Functional Director)") === "1.2x Monthly Rent (Concerned Functional Director)");
  ok("a cell already in the form is untouched", canonicalCell("4x Standard HRR (Head of P&A)") === "4x Standard HRR (Head of P&A)" && canonicalCell("Not applicable") === "Not applicable" && canonicalCell("Standard HRR (Head of Administration)") === "Standard HRR (Head of Administration)");
  ok("the generic '(Competent Authority)' is dropped, a named approver stays", canonicalCell("01.01.2024 (Competent Authority)") === "01.01.2024" && canonicalCell("15 minutes (Authority)") === "15 minutes" && canonicalCell("Not stated in circular (Competent Authority)") === "Not stated in circular" && canonicalCell("4x Standard HRR (Head of P&A)") === "4x Standard HRR (Head of P&A)" && canonicalCell("1.2x Monthly Rent (Concerned Functional Director)") === "1.2x Monthly Rent (Concerned Functional Director)");
  ok("a condition written before the authority is moved after it", canonicalCell("4x HRR [Mumbai only] (Head of P&A)") === "4x HRR (Head of P&A) [Mumbai only]");
  const wordy = { ...GOOD, table: { columns: table.columns, rows: [["Upto two (2) months", "Standard HRR (Auth: Head of Administration)", "Standard HRR (Auth: Head of Administration)"], ["For 3rd & 4th month", "Four times of the Standard HRR (Auth: Head of P&A)", "Twice of the Standard HRR (Auth: Head of P&A)"], ["From 5th & 6th month", "1.2 times the Monthly Rent (Auth: Concerned Functional Director)", "Monthly Rent (Auth: Head of P&A)"]] } };
  const rWordy = await build(wordy);
  ok("the table that reaches the screen is in that form whatever words the model used", rWordy.table?.rows[1][1] === "4x Standard HRR (Head of P&A)" && rWordy.table?.rows[1][2] === "2x Standard HRR (Head of P&A)" && rWordy.table?.rows[2][1] === "1.2x Monthly Rent (Concerned Functional Director)" && rWordy.table?.rows[1][0] === "For 3rd & 4th month", JSON.stringify(rWordy.table?.rows));

  // ================= 2c. sources of charts and tables; evolution questions =================
  const withSrc = { ...GOOD, table: { ...GOOD.table, sources: [6, 999] }, datasets: [{ ...GOOD.datasets[0], sources: [6, 999, 6] }], keyFindings: [] as any[] };
  const rSrc = await build(withSrc);
  ok("a table and a chart carry the circular they were read from (unknown ids dropped, no duplicates)", JSON.stringify(rSrc.table?.sources) === "[6]" && JSON.stringify(rSrc.charts[0]?.sources) === "[6]", JSON.stringify([rSrc.table?.sources, rSrc.charts[0]?.sources]));
  ok("a circular cited only by its table or chart still appears among the sources", rSrc.citations.length === 1 && rSrc.citations[0].id === 6);
  ok("a question that says 'trace the evolution' is an evolution question", wantsEvolution("Trace the evolution of DSP's attendance policies") && wantsEvolution("the phased implementation") && !wantsEvolution("What is the HRA rate?"));
  const EQ = "Trace the evolution of the attendance policy from 2023 to 2024 and contrast executives with contract workers.";
  const timelineDs = { intent: "timeline", title: "Attendance milestones", subtitle: "Dated steps from the trial to the phased roll-out.", unit: "Date", sources: [6], items: [{ label: "01.11.2023", detail: "Trial starts" }, { label: "01.01.2024", detail: "Mandatory" }] };
  const withTl = await build({ ...GOOD, datasets: [timelineDs, ...GOOD.datasets] });
  const noTl = await build(GOOD);
  const sTl = scoreBriefing(withTl, { query: EQ, sourceText: SOURCE });
  const sNoTl = scoreBriefing(noTl, { query: EQ, sourceText: SOURCE });
  ok("for an evolution question a briefing WITH a milestone timeline outscores one without", sTl.total > sNoTl.total && sNoTl.notes.some((n) => /timeline/.test(n)), `${sTl.total} vs ${sNoTl.total}`);
  ok("the evolution rule is in the prompt (earliest step, trial/pilot, one timeline)", /EVOLUTION \/ TRACE \/ HISTORY/.test(ENGINE_SRC) && /trial or pilot starts/.test(ENGINE_SRC));

  // ================= 3. the engine: one briefing per question, whatever the model does =================
  // a model that answers differently every time: the good briefing, the pie one, a made-up one, in random order
  const variants = [GOOD, PIE_NO_TABLE, MADE_UP];
  let calls = 0;
  let seed = 20261108; // a fixed pseudo-random sequence: the model's draws vary, the test does not
  const draw = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const randomModel = async () => {
    calls++;
    return JSON.stringify(variants[Math.floor(draw() * variants.length)]);
  };

  // CONTROL: with no store, and servers that do not share memory, the same question gives different briefings (the reported problem)
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    clearExecutiveSynthesisCache(); // a new server / a cold start
    seen.add(JSON.stringify(await executeExecutiveSynthesis(Q, records, labels, { store: null, candidates: 1, generate: randomModel })));
  }
  ok("CONTROL: without the store a random model gives several different briefings for one question", seen.size > 1, `distinct=${seen.size}`);

  // THE FIX: 100 asks on 100 'servers' (memory cleared each time) share ONE stored briefing
  const rows = new Map<string, EdsRow>();
  let puts = 0;
  let fp = "57.86.abc.465.1751";
  const fakeStore: EdsStore = {
    fingerprint: async () => fp,
    get: async (k) => rows.get(k) ?? null,
    put: async (r) => {
      puts++;
      const have = rows.get(r.key);
      if (have && have.fingerprint === r.fingerprint) return have; // the first stands
      const row: EdsRow = { key: r.key, fingerprint: r.fingerprint, result: r.result, score: r.score };
      rows.set(r.key, row);
      return row;
    },
  };
  calls = 0;
  const served = new Set<string>();
  for (let i = 0; i < 100; i++) {
    clearExecutiveSynthesisCache();
    served.add(JSON.stringify(await executeExecutiveSynthesis(Q, records, labels, { store: fakeStore, candidates: 2, generate: randomModel })));
  }
  ok("100 asks of one question show ONE briefing", served.size === 1, `distinct=${served.size}`);
  ok("the model was used for the first ask only (2 candidates), not 100 times", calls === 2, `calls=${calls}`);
  ok("it was stored exactly once", puts === 1 && rows.size === 1, `puts=${puts}`);
  const stored = [...rows.values()][0];
  ok("what was stored is the best the model gave: good enough, no made-up figure, no pie of multipliers", !!stored && stored.score >= STORE_MIN_SCORE && !JSON.stringify(stored.result).includes("9x") && !stored.result.charts.some((c) => c.type === "pie"), `score=${stored?.score}`);
  ok("the same question typed with other capitals, spaces and punctuation is the same question", edsKeyFor("Type A  vs Type B?") === edsKeyFor("type a vs type b") && edsKeyFor("type a vs type b") !== edsKeyFor("type a versus type b rules"));

  // best of several: the good one wins whichever candidate it is
  for (const order of [[PIE_NO_TABLE, GOOD], [GOOD, PIE_NO_TABLE], [MADE_UP, GOOD], [GOOD, MADE_UP]]) {
    clearExecutiveSynthesisCache();
    rows.clear();
    const r = await executeExecutiveSynthesis(Q, records, labels, { store: fakeStore, candidates: 2, generate: async (_p, _s, i) => JSON.stringify(order[i]) });
    ok("the better of two candidates is the one shown", r.table?.rows.length === 4, `order ${order.map((o) => o.headline).join(" / ")}`);
  }

  // a poor briefing is shown but NOT stored: the next ask tries again
  rows.clear();
  puts = 0;
  clearExecutiveSynthesisCache();
  const poor = { overview: "Retention is allowed.", keyFindings: [], datasets: [] };
  let poorCalls = 0;
  const r1 = await executeExecutiveSynthesis(Q, records, labels, { store: fakeStore, candidates: 1, generate: async () => (poorCalls++, JSON.stringify(poor)) });
  clearExecutiveSynthesisCache();
  await executeExecutiveSynthesis(Q, records, labels, { store: fakeStore, candidates: 1, generate: async () => (poorCalls++, JSON.stringify(poor)) });
  ok("a poor briefing is still shown", !!r1.overview);
  ok("a poor briefing is not stored, so the next ask tries again", puts === 0 && poorCalls === 2, `puts=${puts} calls=${poorCalls}`);

  // the archive changes (a circular added / re-read): the briefing is made afresh, once
  rows.clear();
  clearExecutiveSynthesisCache();
  await executeExecutiveSynthesis(Q, records, labels, { store: fakeStore, candidates: 1, generate: async () => JSON.stringify(GOOD) });
  fp = "58.87.def.470.1760";
  let afresh = 0;
  clearExecutiveSynthesisCache();
  await executeExecutiveSynthesis(Q, records, labels, { store: fakeStore, candidates: 1, generate: async () => (afresh++, JSON.stringify(GOOD)) });
  clearExecutiveSynthesisCache();
  await executeExecutiveSynthesis(Q, records, labels, { store: fakeStore, candidates: 1, generate: async () => (afresh++, JSON.stringify(GOOD)) });
  ok("a changed archive makes the briefing afresh, and only once", afresh === 1, `afresh=${afresh}`);

  // the model cannot be reached (no credit): a briefing stored for the older archive is shown, not an error
  fp = "59.88.ghi.480.1770";
  clearExecutiveSynthesisCache();
  const outage = await executeExecutiveSynthesis(Q, records, labels, { store: fakeStore, candidates: 2, generate: async () => { throw new Error("HTTP 402"); } });
  ok("with the model down, the older stored briefing is shown", outage.table?.rows.length === 4 && !outage.error);
  rows.clear();
  clearExecutiveSynthesisCache();
  const nothing = await executeExecutiveSynthesis(Q, records, labels, { store: fakeStore, candidates: 2, generate: async () => { throw new Error("HTTP 402"); } });
  ok("with the model down and nothing stored, a plain message is shown (no raw error)", !!nothing.error && !/402/.test(nothing.overview), nothing.overview);
  ok("...and it is not stored", rows.size === 0);

  // two asks at once on one server make it once
  rows.clear();
  clearExecutiveSynthesisCache();
  let concurrent = 0;
  await Promise.all([1, 2, 3].map(() => executeExecutiveSynthesis(Q, records, labels, { store: fakeStore, candidates: 2, generate: async () => (concurrent++, JSON.stringify(GOOD)) })));
  ok("three simultaneous asks use the model for ONE making (2 candidates)", concurrent === 2, `calls=${concurrent}`);

  // another server stored first: the row that stands is shown, not ours
  rows.clear();
  clearExecutiveSynthesisCache();
  const other = { ...GOOD, headline: "STORED FIRST ELSEWHERE" };
  const racingStore: EdsStore = { ...fakeStore, put: async (r) => ({ key: r.key, fingerprint: r.fingerprint, score: 90, result: { ...(r.result as SynthesisResult), headline: other.headline } }) };
  const raced = await executeExecutiveSynthesis(Q, records, labels, { store: racingStore, candidates: 1, generate: async () => JSON.stringify(GOOD) });
  ok("when another server stored first, its briefing is the one shown", raced.headline === "STORED FIRST ELSEWHERE");

  // a store that fails must never break the answer
  clearExecutiveSynthesisCache();
  const brokenStore: EdsStore = { fingerprint: async () => { throw new Error("db down"); }, get: async () => { throw new Error("db down"); }, put: async () => { throw new Error("db down"); } };
  const withBroken = await executeExecutiveSynthesis(Q, records, labels, { store: brokenStore, candidates: 1, generate: async () => JSON.stringify(GOOD) });
  ok("a broken store does not break the answer", withBroken.table?.rows.length === 4);
  const flakyPut: EdsStore = { ...fakeStore, put: async () => { throw new Error("write failed"); } };
  clearExecutiveSynthesisCache();
  rows.clear();
  const withFlaky = await executeExecutiveSynthesis(Q, records, labels, { store: flakyPut, candidates: 1, generate: async () => JSON.stringify(GOOD) });
  ok("a failed write does not break the answer", withFlaky.table?.rows.length === 4);

  console.log(`EDS engine selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};
run().catch((e) => {
  console.error("EDS engine selftest crashed:", e);
  process.exit(1);
});
