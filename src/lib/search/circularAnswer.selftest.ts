// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/search/circularAnswer.selftest.ts
// No database, no network, no model: the model is a fake function.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPageUnits, planChunks } from "../ingestion/chunking";
import {
  answerFromPassages, buildAnswerPrompt, buildPassages, clearAnswerCache, normalizeForQuote, numbersIn, parseModelAnswer, percentOf, pickAnswerItems, piecesInOneRow, quoteMissReport, sentenceWordsAround, verifyAnswer,
  type DocInput, type ModelAnswer, type Passage, type RowIn,
} from "./circularAnswer";

let pass = 0, fail = 0;
// the answer module prints why it refused; the tests make it refuse on purpose, so the messages are collected, not shown
let sink: string[] | null = null;
console.info = (...a: unknown[]) => { if (sink) sink.push(a.join(" ")); };
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const eq = (name: string, got: unknown, want: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

// ---------------------------------------------------------------- fixtures
// 1. WHAT THE APP'S OWN TABLE READER PRODUCES for the wage notice (run on the real page on 17 Oct): every cell carries its column label.
const ROW_W = "Area: 1} WORKS | BASIC: 3350.00 | VDA: 13478.00 | CONSTITUENT FDA: 375.00 | OF MONTHLY HRA: 1720.30 | WAGES REF: 52.00 | INC: 270.00 | AWA: 1750.00 | TOTAL: 20995.30 | Wages Per Day: 808";
const ROW_P = "Area: 2|PROJECTS | BASIC: 3350.00 | VDA: 13478.00 | CONSTITUENT FDA: 375.00 | OF MONTHLY HRA: 1720.30 | WAGES REF: 52.00 | INC: 270.00 | AWA: 0.00 | TOTAL: 19245.30 | Wages Per Day: 740";
const ROW_T = "Area: 3} TOWN | BASIC: 3250.00 | VDA: 13450.00 | CONSTITUENT FDA: 375.00 | OF MONTHLY HRA: 1707.50 | WAGES REF: 52.00 | INC: 455.90 | AWA: 1750.00 | TOTAL: 21040.40 | Wages Per Day: 809";
const WAGE_GOOD = `Steel Authority of India Limited NOTICE for CONTRACT WORKERS Minimum Rate of Wages w.e.f. 01.01.2024\n[TABLE]\n${ROW_W}\n${ROW_P}\n${ROW_T}\n[/TABLE]\nNon-works area:- Will be published on availability of Govt Gazette in this regard.`;
// 2. WHAT WAS ACTUALLY STORED in the live database (copied from the screenshot of 17 Oct): the daily-wage column is gone, a number is garbled.
const G_W = "WORKS 3350.00] 13478.00 375.00 1720.30 52.00 270.00 1750.00 20995.30";
const G_P = "PROJECTS 3350.00] 13478.00 375.00 1720.30 52.00 27000] 000] 1924530";
const WAGE_DAMAGED = `Steel Authority of India Limited NOTICE for CONTRACT WORKERS Minimum Rate of Wages w.e.f. 01.01.2024 Daily Wages (Rs. Per Day of duty)\n${G_W}\n${G_P}\nTOWN 3250.00 13450.00 375.00 1707.50 52.00 455.90 1750.00 21040.40`;
const LEAVE_TEXT = "II. Casual Leave & Medical Leave: Four (04) days Casual Leave and Seven (07) days Medical Leave for a calendar year. IV. Earned Leave: One (01) day per 20 days of actual work in Works, Projects & TS (Elec.) & One (01) day per 25 days of actual work on TS (Civil), Education & Ispat Bhawan.";
const FOOTBALL = "For that a selection trial shall be held for finalizing the Football team on 5th December, 2024 at ASP Stadium at 10 00 AM sharp. The selection of the players will be done by selected coach.";
const FOOTBALL_BAD_OCR = "For that a selection trial shall be held for finalizing the Football team on 5th December, 2024 at ASP Stadium at 70 00 AM sharp.";

const mk = (n: number, id: number, title: string, date: string | null, text: string, page = 1): Passage => ({ n, type: "circular", id, title, date, page, text, parts: [{ page, text }] });
const P_WAGE = mk(1, 82, "Notice for Contract Workers - Daily Rate of Wages w.e.f 01.01.2024 (excluding Non-Works)", "2023-12-16", WAGE_GOOD);
const P_DAMAGED = mk(1, 82, "Notice for Contract Workers - Daily Rate of Wages w.e.f 01.01.2024 (excluding Non-Works)", "2023-12-16", WAGE_DAMAGED);
const P_LEAVE = mk(2, 22, "Circular - Holidays and leaves for contractor workers in DSP -2025", "2024-12-27", LEAVE_TEXT, 2);
const P_FOOT = mk(3, 31, "Circular- Selection Trial for Inter Steel Football Championship-2024-25", "2024-12-03", FOOTBALL);
const P_FOOT_BAD = mk(3, 31, "Circular- Selection Trial for Inter Steel Football Championship-2024-25", "2024-12-03", FOOTBALL_BAD_OCR);

const row = (label: string, column: string, value: string, source: number, quote: string): RowIn => ({ label, column, value, source, quote });
const WAGE_ROWS = [row("Works", "Wages Per Day", "808", 1, ROW_W), row("Projects", "Wages Per Day", "740", 1, ROW_P), row("Town Serv (Elect)", "Wages Per Day", "809", 1, ROW_T)];
const GOOD: ModelAnswer = { answerable: true, title: "Daily wage rates, effective 01.01.2024", rows: WAGE_ROWS, note: "Non-works areas will be published later." };
const reason = (r: ReturnType<typeof verifyAnswer>) => (r.ok ? "OK" : r.reason);
const bad = (name: string, a: ModelAnswer, expect: RegExp, ps: Passage[] = [P_WAGE, P_LEAVE, P_FOOT]) => {
  const x = verifyAnswer(a, ps);
  ok(name, !x.ok && expect.test(x.reason), `got ${reason(x)}`);
};

// ---------------------------------------------------------------- numbers and quotes
eq("numbers: commas and decimals", numbersIn("Rs. 15,000/- and 1720.30 and 9049.00"), [15000, 1720.3, 9049]);
eq("numbers: a date is split into its parts", numbersIn("w.e.f 01.01.2024 dated 16.12.2023"), [1, 1, 2024, 16, 12, 2023]);
eq("numbers: digits first, then number words (but not the pronoun 'one')", numbersIn("Four (04) days and no one, Seven days"), [4, 4, 7]);
eq("numbers: 'one' counts when asked", numbersIn("One day", true), [1]);
eq("quote normalisation ignores spaces, case, punctuation", normalizeForQuote("Rs. 15,000 /-"), normalizeForQuote("rs 15000"));

// ---------------------------------------------------------------- ACCEPT
let r = verifyAnswer(GOOD, [P_WAGE]);
ok("the wage table with its column labels is accepted", r.ok, reason(r));
if (r.ok) {
  eq("three rows, each with label, column and value", r.value.rows.map((x) => [x.label, x.column, x.value]), [["Works", "Wages Per Day", "808"], ["Projects", "Wages Per Day", "740"], ["Town Serv (Elect)", "Wages Per Day", "809"]]);
  eq("one source, with its date and page", r.value.sources.map((s) => [s.n, s.id, s.page]), [[1, 82, 1]]);
  eq("the title and the note are kept", [r.value.title, r.value.note], [GOOD.title, GOOD.note]);
}
r = verifyAnswer({ answerable: true, title: "Contractor workers: leave per calendar year", rows: [
  row("Casual leave", "Casual Leave", "Four (04) days", 2, "Four (04) days Casual Leave and Seven (07) days Medical Leave for a calendar year"),
  row("Medical leave", "Medical Leave", "Seven (07) days", 2, "Four (04) days Casual Leave and Seven (07) days Medical Leave for a calendar year"),
], note: "" }, [P_WAGE, P_LEAVE]);
ok("leave days from a sentence are accepted (not a table row)", r.ok, reason(r));
const FQ = "selection trial shall be held for finalizing the Football team on 5th December, 2024 at ASP Stadium at 10 00 AM sharp";
r = verifyAnswer({ answerable: true, title: "Selection trial, 2024-25 football championship", rows: [
  row("Date", "", "5 December 2024", 3, FQ), row("Venue", "", "ASP Stadium", 3, FQ), row("Time", "", "10 00 AM", 3, FQ),
], note: "" }, [P_FOOT]);
ok("date, venue and time from one sentence are accepted", r.ok, reason(r));
r = verifyAnswer({ answerable: true, title: "Wage", rows: [row("Works", "Wages Per Day", "Rs 808", 1, ROW_W)], note: "" }, [P_WAGE]);
ok("'Rs' in front of a value is allowed", r.ok, reason(r));
r = verifyAnswer({ answerable: true, title: "Wage", rows: [row("Works", "Wages Per Day", "808", 1, "area 1 works basic 3350 00 vda 13478 00 constituent fda 375 00 of monthly hra 1720 30 wages ref 52 00 inc 270 00 awa 1750 00 total 20995 30 wages per day 808")], note: "" }, [P_WAGE]);
ok("a quote that differs only in spaces, case and punctuation is still verbatim", r.ok, reason(r));
const multi = mk(1, 82, "Wage notice", "2023-12-16", "intro text of the notice\n\n" + ROW_W);
multi.parts = [{ page: 1, text: "intro text of the notice" }, { page: 2, text: ROW_W }];
r = verifyAnswer({ answerable: true, title: "Wage", rows: [row("Works", "Wages Per Day", "808", 1, ROW_W)], note: "" }, [multi]);
ok("the page of a row is the page that holds its quote", r.ok && r.value.rows[0].page === 2, reason(r));

// ---------------------------------------------------------------- THE FAILURE OF 17 OCT (a monthly total shown as "per day") AND ITS FAMILY
const observed: ModelAnswer = {
  answerable: true, title: "Daily wage rates for contractor workers, effective 01.01.2024",
  rows: [row("Works", "Daily wage", "20995.30", 1, G_W), row("Projects", "Daily wage", "1924530", 1, G_P)], note: "",
};
bad("THE OBSERVED FAILURE: the total column shown as the daily wage, from the damaged stored text, is refused", observed, /column "Daily wage" does not stand beside the value/, [P_DAMAGED]);
bad("...and the same with no column label at all is refused: a number from a table needs its column", { ...observed, rows: [row("Works", "", "20995.30", 1, G_W)] }, /needs its column label/, [P_DAMAGED]);
bad("...and a damaged row quoted with the right-looking label 'Wages Per Day' is refused (the label is not beside the number)", { ...observed, rows: [row("Works", "Wages Per Day", "20995.30", 1, G_W)] }, /does not stand beside the value|not in its quote/, [P_DAMAGED]);
bad("the garbled number 1924530 can never pass as a wage", { ...observed, rows: [row("Projects", "Total", "1924530", 1, G_P)] }, /does not stand beside the value/, [P_DAMAGED]);
bad("the total column of the GOOD table is refused when the heading says 'Daily'", { ...GOOD, rows: [row("Works", "TOTAL", "20995.30", 1, ROW_W)], note: "" }, /heading says "daily" but no column or quote/);
r = verifyAnswer({ answerable: true, title: "Total wage for Works", rows: [row("Works", "TOTAL", "20995.30", 1, ROW_W)], note: "" }, [P_WAGE]);
ok("...but the total column IS accepted when the answer honestly says it is a total (no time word)", r.ok, reason(r));
bad("...and 'Monthly' in the heading is refused unless a column says so (strict on purpose)", { answerable: true, title: "Monthly wage totals", rows: [row("Works", "TOTAL", "20995.30", 1, ROW_W)], note: "" }, /heading says "monthly"/);
bad("THE LABEL AFTER THE NUMBER IS NOT ITS LABEL: 20995.30 stands right before 'Wages Per Day', yet belongs to TOTAL", { ...GOOD, rows: [row("Works", "Wages Per Day", "20995.30", 1, ROW_W)] }, /does not stand beside the value/);
bad("the right label on the WRONG value is refused (809 is the Town row)", { ...GOOD, rows: [row("Works", "Wages Per Day", "809", 1, ROW_W)] }, /value "809" is not in its quote/);
bad("the right value under ANOTHER row's label is refused", { ...GOOD, rows: [row("Projects", "Wages Per Day", "808", 1, ROW_W)] }, /label "Projects" is not in the same quote/);
bad("a wrong column whose number is in the quote but not beside the column is refused", { ...GOOD, rows: [row("Works", "Wages Per Day", "20995.30", 1, ROW_W)] }, /does not stand beside the value/);
bad("a column label that is not in the quote at all is refused", { ...GOOD, rows: [row("Works", "Net Pay", "808", 1, ROW_W)] }, /does not stand beside the value/);

// ---------------------------------------------------------------- a short table row (three numbers) is still a table row when its cells are separated by " | "
const SHORT_ROW = "Area: Canteen Staff | Rate: 5 | Days: 12 | Week: 3";
const P_SHORT = mk(1, 90, "Some notice", "2025-01-01", `Header\n${SHORT_ROW}\nFooter`);
r = verifyAnswer({ answerable: true, title: "Days", rows: [row("Canteen Staff", "Days", "12", 1, SHORT_ROW)], note: "" }, [P_SHORT]);
ok("a short labelled row: the value after its own column label is accepted", r.ok, reason(r));
bad("a short labelled row: the number BEFORE the label (Rate: 5, asked as Days) is refused", { answerable: true, title: "Days", rows: [row("Canteen Staff", "Days", "5", 1, SHORT_ROW)], note: "" }, /does not stand beside the value/, [P_SHORT]);
bad("a short labelled row: a label from another row is refused", { answerable: true, title: "Days", rows: [row("Security", "Days", "12", 1, SHORT_ROW)], note: "" }, /label "Security" is not in the same quote/, [P_SHORT]);
bad("a short labelled row: a number with no column label is refused", { answerable: true, title: "Days", rows: [row("Canteen Staff", "", "12", 1, SHORT_ROW)], note: "" }, /needs its column label/, [P_SHORT]);

// ---------------------------------------------------------------- the damaged OCR of a sentence gives no answer, not a wrong one
bad("a time misread by the scan (70 for 10) is refused when the model reads it as 10", { answerable: true, title: "Trial", rows: [row("Time", "", "10 00 AM", 3, "selection trial shall be held for finalizing the Football team on 5th December, 2024 at ASP Stadium at 70 00 AM sharp")], note: "" }, /value "10 00 AM" is not in its quote/, [P_FOOT_BAD]);

// ---------------------------------------------------------------- REFUSE: the other rules
bad("an INVENTED figure is refused (810 is in no quote)", { ...GOOD, rows: [row("Works", "Wages Per Day", "810", 1, ROW_W)] }, /value "810" is not in its quote/);
{ const rp = verifyAnswer({ ...GOOD, rows: [row("Works", "Wages Per Day", "808", 1, "The daily wage for the Works area is 808 rupees")] }, [P_WAGE]);
  ok("a paraphrased quote about a TRUE fact is replaced by the document's own words (the quote is a pointer)", rp.ok && /Wages Per Day: 808/.test(rp.value.rows[0].quote) && !/rupees/.test(rp.value.rows[0].quote), rp.ok ? rp.value.rows[0].quote : rp.reason); }
bad("a paraphrased quote about a value that is NOT in the document is refused", { ...GOOD, rows: [row("Works", "Wages Per Day", "999", 1, "The daily wage for the Works area is 999 rupees")] }, /not in the document word for word|not in its quote/);
bad("a quote taken from the WRONG document is refused", { ...GOOD, rows: [row("Works", "Wages Per Day", "808", 2, ROW_W)] }, /not in the document word for word/);
bad("a fact that names a passage that does not exist is refused", { ...GOOD, rows: [row("Works", "Wages Per Day", "808", 9, ROW_W)] }, /passage that does not exist/);
bad("'not answerable' is passed on as such", { answerable: false, title: "", rows: [], note: "" }, /^not_answerable$/);
bad("an answer without rows is refused", { ...GOOD, rows: [] }, /no facts/);
{ const r13 = verifyAnswer({ ...GOOD, note: "", rows: Array.from({ length: 13 }, () => WAGE_ROWS[0]) }, [P_WAGE]); ok("more than twelve rows: the first twelve are shown, with a note (presentation is repaired, not refused)", r13.ok && r13.value.rows.length === 12 && /more than are shown/.test(r13.value.note), r13.ok ? r13.value.note : r13.reason); }
bad("an empty heading is refused", { ...GOOD, title: "" }, /heading is empty/);
{ const rn = verifyAnswer({ ...GOOD, note: "x".repeat(300) }, [P_WAGE]); ok("a note over the limit with no sentence end is dropped (presentation is repaired, not refused)", rn.ok && rn.value.note === "", rn.ok ? rn.value.note : rn.reason);
  const rn2 = verifyAnswer({ ...GOOD, note: "Applies to all areas. " + "x".repeat(300) }, [P_WAGE]); ok("a long note keeps its first sentences", rn2.ok && rn2.value.note === "Applies to all areas.", rn2.ok ? rn2.value.note : rn2.reason);
  const rt = verifyAnswer({ ...GOOD, title: "Daily wage " + "x ".repeat(80) }, [P_WAGE]); ok("a long heading is shortened", rt.ok && rt.value.title.length <= 90 && rt.value.title.endsWith("\u2026"), rt.ok ? String(rt.value.title.length) : rt.reason); }
bad("a quote too short to prove anything is refused", { ...GOOD, rows: [row("Works", "", "808", 1, "808")] }, /too short/);
bad("a quote that is a whole table (not one row) is refused", { ...GOOD, rows: [row("Works", "Wages Per Day", "808", 1, WAGE_GOOD)] }, /too long/);
bad("a number invented in the HEADING is refused", { ...GOOD, title: "Daily wage rates, effective 01.01.2026" }, /number 2026 in the heading/);
bad("a number invented in the NOTE is refused", { ...GOOD, note: "Non-works areas get Rs 700." }, /number 700 in the note/);
bad("'monthly' in the note needs a column that says so", { answerable: true, title: "Leave", rows: [row("Casual leave", "Casual Leave", "Four (04) days", 2, "Four (04) days Casual Leave and Seven (07) days Medical Leave for a calendar year")], note: "Paid monthly." }, /note says "monthly"/);
bad("a non-numeric value that is not in the quote is refused", { answerable: true, title: "Pass", rows: [row("Pass 13", "", "Green", 1, "Non-works area:- Will be published on availability of Govt Gazette in this regard.")], note: "" }, /value "Green" is not in its quote/);
r = verifyAnswer({ answerable: true, title: "Pass", rows: [row("Canteen", "", "Gazette", 1, "Non-works area:- Will be published on availability of Govt Gazette in this regard.")], note: "" }, [P_WAGE]);
ok("in a SENTENCE a descriptive label is allowed (the quote is shown beside it)", r.ok, reason(r));

// ---------------------------------------------------------------- reading the model's reply
eq("plain JSON is read", parseModelAnswer('{"answerable": false}'), { answerable: false, title: "", rows: [], note: "" });
eq("JSON in a code fence is read", parseModelAnswer('```json\n{"answerable": true, "title": " T ", "rows": [{"label": "A", "column": "", "value": 808, "source": "1", "quote": "q"}], "note": "n"}\n```'), { answerable: true, title: "T", rows: [{ label: "A", column: "", value: "808", source: 1, quote: "q" }], note: "n" });
eq("JSON after some words is read", parseModelAnswer('Here you go: {"answerable": false} thanks')?.answerable, false);
eq("a reply that is not JSON is not read", parseModelAnswer("I think the answer is 808"), null);
eq("broken JSON is not read", parseModelAnswer('{"answerable": true, "title": '), null);
eq("'answerable' must be exactly true", parseModelAnswer('{"answerable": "yes", "title": "x", "rows": []}')?.answerable, false);

// ---------------------------------------------------------------- which results are worth reading
eq("a strong top match: the matching documents are picked, in order", pickAnswerItems([{ id: 82, type: "circular", matchPercentage: 99 }, { id: 12, type: "circular", matchPercentage: 91 }, { id: 5, type: "circular", matchPercentage: 70 }]), [{ type: "circular", id: 82 }, { type: "circular", id: 12 }]);
eq("a weak TOP match: nothing is read (no model call)", pickAnswerItems([{ id: 1, type: "circular", matchPercentage: 80 }, { id: 2, type: "circular", matchPercentage: 79 }]), []);
eq("no results: nothing", pickAnswerItems([]), []);
eq("at most three documents", pickAnswerItems([1, 2, 3, 4, 5].map((id) => ({ id, type: "circular", matchPercentage: 95 }))).length, 3);
eq("the similarity is used when there is no percentage", percentOf({ similarity: 0.931 }), 93);
eq("announcements and holiday notes can be read too", pickAnswerItems([{ id: 3, type: "holiday", matchPercentage: 99 }, { id: 4, type: "announcement", matchPercentage: 90 }]), [{ type: "holiday", id: 3 }, { type: "announcement", id: 4 }]);
eq("an unknown kind of result is ignored", pickAnswerItems([{ id: 3, type: "circular", matchPercentage: 99 }, { id: 4, type: "employee", matchPercentage: 99 }]), [{ type: "circular", id: 3 }]);

// ---------------------------------------------------------------- choosing what the model reads
const long: DocInput = {
  type: "circular", id: 5, title: "A long circular", date: "2025-01-01",
  chunks: [
    { page: 1, index: 0, text: "Introduction and background of the scheme. ".repeat(40) },
    { page: 2, index: 1, text: "The last date for submission of the scholarship application is 31 August 2026. ".repeat(3) },
    { page: 3, index: 2, text: "Annexure with the list of addresses. ".repeat(60) },
  ],
};
const short: DocInput = { type: "holiday", id: 7, title: "Policy note", date: null, chunks: [{ page: null, index: 0, text: "Compensatory off is given within two months." }] };
let ps = buildPassages("what is the last date for the scholarship application", [long, short], 3000);
eq("passages are numbered 1, 2", ps.map((p) => p.n), [1, 2]);
ok("a long document is cut to the part that matches the question", ps[0].text.includes("last date for submission") && ps[0].text.length <= 1500, String(ps[0].text.length));
eq("the best page is the page with the matching words", ps[0].page, 2);
ok("a short document is read whole", ps[1].text === "Compensatory off is given within two months.");
ok("the budget is shared between documents", ps.reduce((n, p) => n + p.text.length, 0) <= 3000);
eq("a document with no text is skipped", buildPassages("anything", [{ ...short, chunks: [{ page: 1, index: 0, text: "   " }] }]).length, 0);
ps = buildPassages("question", [{ ...long, chunks: [{ page: 3, index: 2, text: "third" }, { page: 1, index: 0, text: "first" }] }]);
eq("chosen parts are put back in page order", ps[0].parts.map((p) => p.page), [1, 3]);

// ---------------------------------------------------------------- the request
const prompt = buildAnswerPrompt("what daily wage rates are notified", [P_WAGE, P_LEAVE, P_FOOT]);
ok("the request carries the question and numbered passages", prompt.includes("QUESTION: what daily wage rates are notified") && prompt.includes("[1] Document: Notice for Contract Workers") && prompt.includes("[3] Document:"));
ok("the request forbids guessing, calculating and paraphrased quotes", /ONLY the numbered passages/.test(prompt) && /Do NOT calculate/.test(prompt) && /CHARACTER FOR CHARACTER/.test(prompt) && /"answerable": false/.test(prompt));
ok("the request tells the model to use the column label and never a total", /REQUIRED for a number that comes from a table/.test(prompt) && /NEVER take a total or any other column/.test(prompt) && /Column: value/.test(prompt));
ok("the request asks for rows, a title and an optional note", /"rows"/.test(prompt) && /"title"/.test(prompt) && /"note"/.test(prompt));
ok("the request carries each document's date", prompt.includes("(dated 2023-12-16)"));

// ---------------------------------------------------------------- asking, caching, failing
(async () => {
  clearAnswerCache();
  let calls = 0;
  const good = async () => { calls++; return JSON.stringify(GOOD); };
  let x = await answerFromPassages("what daily wage rates are notified", [P_WAGE], good);
  ok("a good reply is verified and returned", x.ok);
  x = await answerFromPassages("what daily wage rates are notified", [P_WAGE], good);
  ok("asking the same thing again costs no model call (cached)", x.ok && calls === 1, `calls=${calls}`);
  await answerFromPassages("what are the daily wage rates?", [P_WAGE], good);
  ok("a different question is a different cache entry", calls === 2, `calls=${calls}`);

  clearAnswerCache();
  let n = 0;
  const flaky = async () => { n++; if (n === 1) throw new Error("rate limit"); return JSON.stringify(GOOD); };
  x = await answerFromPassages("wage rates", [P_WAGE], flaky);
  ok("a model failure gives 'model_error'", !x.ok && x.reason === "model_error");
  x = await answerFromPassages("wage rates", [P_WAGE], flaky);
  ok("a model failure is NOT cached: the next try asks again and succeeds", x.ok && n === 2, `n=${n}`);

  clearAnswerCache();
  x = await answerFromPassages("canteen menu", [P_WAGE], async () => '{"answerable": false}');
  ok("'not answerable' is returned as such", !x.ok && x.reason === "not_answerable");
  x = await answerFromPassages("q1", [P_WAGE], async () => "sorry, I cannot do that");
  ok("an unreadable reply gives no answer", !x.ok && /not readable/.test(x.reason));
  x = await answerFromPassages("q2", [P_WAGE], async () => JSON.stringify({ ...GOOD, rows: [row("Works", "Wages Per Day", "999", 1, ROW_W)] }));
  ok("an invented figure from the model never reaches the screen", !x.ok && /999/.test(x.reason));
  x = await answerFromPassages("q3", [P_DAMAGED], async () => JSON.stringify(observed));
  ok("the exact wrong answer of 17 Oct, produced again by a model, never reaches the screen", !x.ok && /does not stand beside/.test(x.reason));
  x = await answerFromPassages("q4", [], good);
  ok("no passages, no answer, no model call", !x.ok && x.reason === "no_passages" && calls === 2);

  // ---------------------------------------------------------------- the REAL wage notice as the pipeline now reads it (17 Oct): a long heading may be shortened
  {
    const wage: string = JSON.parse(readFileSync(join(__dirname, "..", "ingestion", "__fixtures__", "pilot-readings.json"), "utf8")).find((x: { id: string }) => x.id === "wage-notice").pipeline;
    const Q = "what daily wage rates are notified for contractor workers for 2024";
    // EXACTLY what the re-read stores: whitespace collapsed to single spaces (so the table rows are glued together), then 200-word chunks
    // (a chunk break can fall in the middle of a row), joined for the model with a blank line between chunks
    const flat = (wage + " \n").replace(/\s+/g, " ").trim();
    const docW: DocInput = { type: "circular", id: 82, title: "Notice for Contract Workers - Daily Rate of Wages w.e.f 01.01.2024", date: "2023-12-16", chunks: planChunks(buildPageUnits([wage], flat)).map((c) => ({ page: c.page, index: c.index, text: c.text })) };
    const pw = buildPassages(Q, [docW]);
    const rowOf = (area: string) => wage.split("\n").find((l) => l.includes(`Area: ${area}`)) as string;
    const ans = (column: string, rows: [string, string][], title = "Daily wage rates from 01.01.2024"): ModelAnswer => ({ answerable: true, title, note: "", rows: rows.map(([a, v]) => ({ label: a, column, value: v, source: 1, quote: rowOf(a) })) });
    const AREAS: [string, string][] = [["WORKS", "808"], ["PROJECTS", "740"], ["TOWN SERV(ELECT)", "809"]];
    ok("REAL wage notice: the passage is built and holds the three rows", pw.length === 1 && AREAS.every(([a]) => pw[0].text.includes(`Area: ${a}`)));
    for (const col of ["Daily Wages (Rs. Per Day of duty)", "Daily Wages (Rs.)", "Daily Wages", "Wages per day", "Per Day of duty"]) {
      const r = verifyAnswer(ans(col, AREAS), pw);
      ok(`REAL wage notice: the column "${col}" is accepted`, r.ok, r.ok ? "" : r.reason);
    }
    ok("REAL wage notice: the accepted answer carries the three rows", (() => { const r = verifyAnswer(ans("Daily Wages", AREAS), pw); return r.ok && r.value.rows.map((x) => x.value).join() === "808,740,809"; })());
    const refused = (name: string, a: ModelAnswer) => { const r = verifyAnswer(a, pw); ok(name, !r.ok && /does not stand beside|not in its quote|label/.test(r.reason), r.ok ? "ACCEPTED" : r.reason); };
    refused("REAL wage notice: a TOTAL is not a daily wage (column Daily Wages, value 20995.30)", ans("Daily Wages", [["WORKS", "20995.30"]]));
    refused("REAL wage notice: a BASIC is not a daily wage (value 3350.00)", ans("Daily Wages", [["WORKS", "3350.00"]]));
    refused("REAL wage notice: the daily wage is not the TOTAL column (column TOTAL, value 808)", ans("TOTAL", [["WORKS", "808"]], "Totals"));
    { const rr = verifyAnswer({ ...ans("Daily Wages", [["WORKS", "808"]]), rows: [{ label: "PROJECTS", column: "Daily Wages", value: "740", source: 1, quote: rowOf("WORKS") }] }, pw);
      ok("REAL wage notice: PROJECTS = 740 is TRUE, so a wrong quote (the WORKS row) is replaced by the document's real PROJECTS row", rr.ok && /Area: PROJECTS/.test(rr.value.rows[0].quote) && /: 740$/.test(rr.value.rows[0].quote), rr.ok ? rr.value.rows[0].quote : rr.reason); }
    { const rf = verifyAnswer({ ...ans("Daily Wages", [["WORKS", "808"]]), rows: [{ label: "WORKS", column: "Daily Wages", value: "740", source: 1, quote: rowOf("WORKS") }] }, pw);
      ok("REAL wage notice: WORKS = 740 is FALSE and is refused even when the quote is the WORKS row", !rf.ok, rf.ok ? rf.value.rows[0].quote : rf.reason); }
    const trapRow = "SL.: 9 | Area: SAMPLE | BASIC: 1.00 | VDA: 2.00 | FDA: 3.00 | HRA: 4.00 | INC: 5.00 | Daily Wages (Rs. Per Day of duty): 8080";
    const trap = verifyAnswer({ answerable: true, title: "Wages", note: "", rows: [{ label: "SAMPLE", column: "Daily Wages", value: "808", source: 1, quote: trapRow }] }, [mk(1, 9, "Trap", null, `Notice\n[TABLE]\n${trapRow}\n[/TABLE]`)]);
    ok("REAL wage notice: a value that is only the START of a longer number is refused (808 against 8080)", !trap.ok && /not in its quote|does not stand beside/.test(trap.reason), trap.ok ? "ACCEPTED" : trap.reason);
    const trapOk = verifyAnswer({ answerable: true, title: "Wages", note: "", rows: [{ label: "SAMPLE", column: "Daily Wages", value: "8080", source: 1, quote: trapRow }] }, [mk(1, 9, "Trap", null, `Notice\n[TABLE]\n${trapRow}\n[/TABLE]`)]);
    ok("...while the whole number 8080 is accepted", trapOk.ok, trapOk.ok ? "" : trapOk.reason);
    // ---- a quote that LEAVES CELLS OUT (what a model naturally writes): accepted only when every piece is word for word, in order, in ONE row
    const q = (label: string, value: string, quote: string, column = "Daily Wages"): ModelAnswer => ({ answerable: true, title: "Daily wage rates from 01.01.2024", note: "", rows: [{ label, column, value, source: 1, quote }] });
    const FULL = rowOf("WORKS").replace(/^SL\.: 1 \| /, "SL.: 1 | ");
    const yes = (name: string, a: ModelAnswer) => { const r = verifyAnswer(a, pw); ok(name, r.ok, r.ok ? "" : r.reason); };
    const no = (name: string, a: ModelAnswer) => { const r = verifyAnswer(a, pw); ok(name, !r.ok && /word for word|does not stand beside|label|not in its quote/.test(r.reason), r.ok ? "ACCEPTED" : r.reason); };
    yes("REAL stored form: the whole row, exactly", q("WORKS", "808", FULL));
    yes("REAL stored form: the row with the next row's first cell glued on", q("WORKS", "808", FULL + " SL.: 2"));
    yes("REAL stored form: only the two cells that matter, nothing marking the gap", q("WORKS", "808", "Area: WORKS | Daily Wages (Rs. Per Day of duty): 808"));
    yes("REAL stored form: the same with an ellipsis", q("WORKS", "808", "Area: WORKS | ... | Daily Wages (Rs. Per Day of duty): 808"));
    yes("REAL stored form: the same with a unicode ellipsis", q("PROJECTS", "740", "Area: PROJECTS … Daily Wages (Rs. Per Day of duty): 740"));
    yes("REAL stored form: heading, row start and the wage cell (the heading sits above row 1)", q("WORKS", "808", "Heading: CONSTITUENT OF MONTHLY WAGES SL.: 1 | Area: WORKS | BASIC: 3350.00 | Daily Wages (Rs. Per Day of duty): 808"));
    // the quote is a POINTER now: a quote that is not a copy (a made-up join, pieces in the wrong order, a misnamed cell, a paraphrase) is replaced by the
    // document's own words when the FACT it points at is true in the document; the card then shows the document's words, not the model's
    const fact = (name: string, a: ModelAnswer, shows: RegExp) => { const r = verifyAnswer(a, pw); ok(name, r.ok && shows.test(r.value.rows[0].quote), r.ok ? r.value.rows[0].quote : r.reason); };
    fact("REAL stored form: a made-up join of the heading with another row, about a TRUE fact, shows the document's real row", q("TOWN SERV(ELECT)", "809", "Heading: CONSTITUENT OF MONTHLY WAGES SL.: 3 | Area: TOWN SERV(ELECT) | BASIC: 3250.00 | Daily Wages (Rs. Per Day of duty): 809"), /^SL\.: 3 \| Area: TOWN SERV\(ELECT\) \| BASIC: 3250\.00 \|.*Daily Wages \(Rs\. Per Day of duty\): 809$/);
    yes("REAL stored form: a row that the chunk break cut in the middle (the model quotes straight across the break)", q("WORKS", "808", "Area: WORKS | BASIC: 3350.00 | VDA: 13478.00 | FDA: 375.00 | HRA: 1720.30 | REF ALLOW: 52.00 | INC: 270.00 | AWA: 1750.00 | TOTAL: 20995.30 | Daily Wages (Rs. Per Day of duty): 808"));
    no("REAL stored form: WORKS beside PROJECTS's wage is refused (a table value whose label is not in its row)", q("WORKS", "740", "Area: WORKS | Daily Wages (Rs. Per Day of duty): 740"));
    no("REAL stored form: pieces from two rows are refused (PROJECTS with the wage of the row before it)", q("PROJECTS", "808", "Area: PROJECTS | Daily Wages (Rs. Per Day of duty): 808"));
    no("REAL stored form: pieces from two rows are refused (PROJECTS with the wage of the row after it)", q("PROJECTS", "809", "Area: PROJECTS | Daily Wages (Rs. Per Day of duty): 809"));
    no("REAL stored form: an invented number is refused", q("WORKS", "999", "Area: WORKS | Daily Wages (Rs. Per Day of duty): 999"));
    fact("REAL stored form: pieces in the wrong order, about a TRUE fact, show the document's real row", q("WORKS", "808", "Daily Wages (Rs. Per Day of duty): 808 | Area: WORKS"), /^(CONSTITUENT OF MONTHLY WAGES )?SL\.: 1 \| Area: WORKS \|.*Daily Wages \(Rs\. Per Day of duty\): 808$/);
    fact("REAL stored form: a quote that names a cell wrongly, about a TRUE fact, shows the document's real row", q("WORKS", "808", "Area: WORKS | Overtime Wages (Rs. Per Day of duty): 808"), /Daily Wages \(Rs\. Per Day of duty\): 808$/);
    fact("REAL stored form: a paraphrase, about a TRUE fact, shows the document's real row", q("WORKS", "808", "The daily wage for the Works area is 808 rupees"), /^(CONSTITUENT OF MONTHLY WAGES )?SL\.: 1 \| Area: WORKS \|.*Daily Wages \(Rs\. Per Day of duty\): 808$/);
    no("REAL stored form: a FALSE claim is refused however it is quoted (the column Overtime Wages for 808)", q("WORKS", "808", "Area: WORKS | Overtime Wages (Rs. Per Day of duty): 808", "Overtime Wages"));
    no("REAL stored form: a paraphrase about the WRONG row is refused (Works with 740)", q("WORKS", "740", "The daily wage for the Works area is 740 rupees"));
    no("REAL stored form: a value that is nowhere in the document is refused whatever the quote says", q("WORKS", "999", "The daily wage for the Works area is 999 rupees"));
    no("REAL stored form: a quote with almost none of its words near the value is refused (too little overlap)", q("WORKS", "808", "Completely unrelated sentence about holidays and festivals in October"));
    no("REAL stored form: a total passed off as the daily wage is refused, even with cells left out", q("WORKS", "20995.30", "Area: WORKS | TOTAL: 20995.30"));
    ok("piecesInOneRow: one piece alone is not a 'pieces' quote", !piecesInOneRow("Area: WORKS", flat));
    ok("piecesInOneRow: pieces more than a row apart are refused", !piecesInOneRow("Notice Boards | Daily Wages (Rs. Per Day of duty): 740", flat));
    ok("quoteMissReport says where a quote stops matching", /first \d+ of \d+ letters and digits, then breaks at/.test(quoteMissReport("Area: WORKS | Overtime Wages: 808", flat)), quoteMissReport("Area: WORKS | Overtime Wages: 808", flat));

    // the refusal reason is printed in full
    const logs: string[] = [];
    sink = logs;
    clearAnswerCache();
    const bad = await answerFromPassages(Q, pw, async () => JSON.stringify(ans("TOTAL", [["WORKS", "808"]], "Totals")));
    sink = null;
    ok("a refusal prints the full reason in the terminal", !bad.ok && logs.some((l) => /^\[answer\] not shown: unverified: the column "TOTAL"/.test(l)), JSON.stringify(logs));
    ok("...and the model's own reply, so a refusal can be understood from the terminal alone", logs.some((l) => /^\[answer\] the model's reply was: \{"answerable":true/.test(l)), JSON.stringify(logs).slice(0, 300));
    clearAnswerCache();
  }

  // ---------------------------------------------------------------- THE CONFIRMATION GATE (a second reader's check of the page)
  {
    const gift = "Circular on the online option for the gift card. The gift card value (215,000) may be chosen online by every employee. For the year the gift card of Rs 15,000 may be chosen online.";
    const mkG = (checks?: Passage["checks"]) => ({ ...mk(1, 51, "Circular - Online option for Gift Card Rs. 15000", "2026-08-03", gift, 1), ...(checks ? { checks } : {}) } as Passage);
    const ask = (value: string, quote: string, checks?: Passage["checks"]) => verifyAnswer({ answerable: true, title: "Gift card value", note: "", rows: [{ label: "Gift card", column: "", value, source: 1, quote }] }, [mkG(checks)]);
    const CHK = { 1: { confirmed: ["15000"], unconfirmed: ["215000"] } };
    const bad215 = ask("215,000", "The gift card value (215,000) may be chosen online by every employee", CHK);
    ok("GATE: the number only the pipeline read (215,000) is refused, with the reason", !bad215.ok && /not confirmed by the second reading of page 1/.test(bad215.reason), bad215.ok ? "ACCEPTED" : bad215.reason);
    const good15 = ask("15,000", "the gift card of Rs 15,000 may be chosen online", CHK);
    ok("GATE: the number both readers had (15,000) is accepted", good15.ok, good15.ok ? "" : good15.reason);
    const unchecked = ask("215,000", "The gift card value (215,000) may be chosen online by every employee", undefined);
    ok("GATE: without a check, behaviour is exactly as before (the page was never checked)", unchecked.ok);
    const otherPage = ask("215,000", "The gift card value (215,000) may be chosen online by every employee", { 2: { confirmed: [], unconfirmed: ["215000"] } });
    ok("GATE: a check of ANOTHER page does not apply", otherPage.ok);
    const bothWays = ask("215,000", "The gift card value (215,000) may be chosen online by every employee", { 1: { confirmed: ["215000"], unconfirmed: [] } });
    ok("GATE: a number that is confirmed is accepted", bothWays.ok);
    const noDigits = verifyAnswer({ answerable: true, title: "Venue", note: "", rows: [{ label: "Venue", column: "", value: "ASP Stadium", source: 1, quote: "Trial on 5th December 2024 at ASP Stadium at 10 00 AM sharp" }] }, [{ ...mk(1, 7, "Football trial", null, "Football. Trial on 5th December 2024 at ASP Stadium at 10 00 AM sharp.", 1), checks: { 1: { confirmed: [], unconfirmed: ["2024", "1000"] } } }]);
    ok("GATE: a value with no digits is not affected by a check", noDigits.ok, noDigits.ok ? "" : noDigits.reason);
    const dateVal = verifyAnswer({ answerable: true, title: "Trial date", note: "", rows: [{ label: "Trial", column: "", value: "5th December 2024", source: 1, quote: "Trial on 5th December 2024 at ASP Stadium" }] }, [{ ...mk(1, 7, "Football trial", null, "Football. Trial on 5th December 2024 at ASP Stadium at 10 00 AM sharp.", 1), checks: { 1: { confirmed: [], unconfirmed: ["2024"] } } }]);
    ok("GATE: a date whose year is unconfirmed is refused", !dateVal.ok && /not confirmed/.test(dateVal.reason), dateVal.ok ? "ACCEPTED" : dateVal.reason);
    // a quote that leaves cells out is still found on its page (the longest piece), and a row cut by a chunk break counts every page
    const twoPage: Passage = { ...mk(1, 9, "Two pages", null, "x", 1), text: "Page one text. Area: NORTH | Rate: 12345 per day.\n\nPage two text. Area: SOUTH | Rate: 12345 per day.", parts: [{ page: 1, text: "Page one text. Area: NORTH | Rate: 12345 per day." }, { page: 2, text: "Page two text. Area: SOUTH | Rate: 12345 per day." }], checks: { 1: { confirmed: [], unconfirmed: ["12345"] }, 2: { confirmed: ["12345"], unconfirmed: [] } } };
    const tw = (area: string) => verifyAnswer({ answerable: true, title: "Rate", note: "", rows: [{ label: area, column: "Rate", value: "12345", source: 1, quote: `Area: ${area} | Rate: 12345` }] }, [twoPage]);
    const north = tw("NORTH"), south = tw("SOUTH");
    ok("GATE: the page that holds the quote decides (page 1 does not confirm 12345)", !north.ok && /page 1/.test(north.reason), north.ok ? "ACCEPTED" : north.reason);
    ok("GATE: ...and page 2, which confirms it, accepts it", south.ok, south.ok ? "" : south.reason);
    // buildPassages carries the checks through
    const withChecks = buildPassages("gift card", [{ type: "circular", id: 51, title: "Gift", date: null, chunks: [{ page: 1, index: 0, text: gift }], checks: CHK }]);
    ok("buildPassages passes the checks on to the passage", JSON.stringify(withChecks[0].checks) === JSON.stringify(CHK));
    ok("...and adds nothing when there are none", !("checks" in buildPassages("gift card", [{ type: "circular", id: 51, title: "Gift", date: null, chunks: [{ page: 1, index: 0, text: gift }] }])[0]));
  }

  // ---------------------------------------------------------------- the REAL corrigendum, and the model's REAL reply (copied from the terminal, 18 Oct)
  {
    const page: string = JSON.parse(readFileSync(join(__dirname, "..", "ingestion", "__fixtures__", "pilot-readings.json"), "utf8")).find((x: { id: string }) => x.id === "gift-card-corrigendum").pipeline;
    const flat = (page + " \n").replace(/\s+/g, " ").trim();
    const docC: DocInput = { type: "circular", id: 49, title: "Circular - Gift card corrigendum", date: "2026-08-08T00:00:00.000Z", chunks: planChunks(buildPageUnits([page], flat)).map((c) => ({ page: c.page, index: c.index, text: c.text })) };
    const Qc = "employees can choose a gift card online, what amount was first announced and what was it corrected to?";
    const pc = buildPassages(Qc, [docC]);
    const reply = `{"answerable":true,"title":"Gift Card Amount Correction 2026","rows":[{"label":"Initial announced amount","column":"Gift Card Amount","value":"Rs.15,000/-","source":1,"quote":"the amount of the Gift Card (E-Multi Benefit Card) mentioned as \\"Rs.15,000/-\\""},{"label":"Corrected amount","column":"Gift Card Amount","value":"Rs.14,999/-","source":1,"quote":"may please be read as \\"Rs.14,999/-\\""}]}`;
    const parsed = parseModelAnswer(reply);
    ok("REAL corrigendum: the model's reply from the terminal is readable", !!parsed);
    const real = parsed ? verifyAnswer(parsed, pc) : null;
    ok("REAL corrigendum: the model's reply is ACCEPTED (its second quote is a clause; the column is in the same sentence)", !!real && real.ok, real && !real.ok ? real.reason : "");
    const withChecks = pc.map((x) => ({ ...x, checks: { 1: { confirmed: ["15000", "14999", "8.8.2026".replace(/\./g, "."), "2026"], unconfirmed: [] } } }));
    ok("REAL corrigendum: ...and passes the confirmation gate when both amounts are confirmed", !!parsed && verifyAnswer(parsed, withChecks).ok);
    const gated = pc.map((x) => ({ ...x, checks: { 1: { confirmed: ["15000"], unconfirmed: ["14999"] } } }));
    const g = parsed ? verifyAnswer(parsed, gated) : null;
    ok("REAL corrigendum: ...and is refused if 14,999 were only read by the pipeline", !!g && !g.ok && /not confirmed by the second reading/.test(g.reason), g && !g.ok ? g.reason : "ACCEPTED");
    const row = (column: string, value: string, quote: string): ModelAnswer => ({ answerable: true, title: "Gift card", note: "", rows: [{ label: "Corrected amount", column, value, source: 1, quote }] });
    const clause = 'may please be read as "Rs.14,999/-"';
    const wrongCol = verifyAnswer(row("Daily Wage", "Rs.14,999/-", clause), pc);
    ok("REAL corrigendum: a column that is not in the sentence is still refused", !wrongCol.ok && /is not in its quote/.test(wrongCol.reason), wrongCol.ok ? "ACCEPTED" : wrongCol.reason);
    const nextSentence = verifyAnswer(row("Last date", "Rs.14,999/-", clause), pc);
    ok("REAL corrigendum: a column from the NEXT sentence (the last date) is refused", !nextSentence.ok && /is not in its quote/.test(nextSentence.reason), nextSentence.ok ? "ACCEPTED" : nextSentence.reason);
    ok("sentenceWordsAround: the words of the sentence that holds the clause", (() => { const w = sentenceWordsAround(pc[0].text, clause); return w.has("amount") && w.has("gift") && w.has("card") && !w.has("last"); })());
    ok("sentenceWordsAround: a table (one run of text with cells) gives no sentence at all", sentenceWordsAround("Heading: WAGES SL.: 1 | Area: WORKS | TOTAL: 20995.30 | Daily Wages (Rs. Per Day of duty): 808 SL.: 2 | Area: PROJECTS | TOTAL: 19245.30 | Daily Wages (Rs. Per Day of duty): 740", "Area: WORKS | TOTAL: 20995.30").size === 0);
    ok("sentenceWordsAround: a long run of numbers with no sentence end gives no sentence", sentenceWordsAround("Daily Wages Per Day " + "WORKS 3350.00 13478.00 375.00 1720.30 52.00 270.00 ".repeat(20) + "20995.30 end", "WORKS 3350.00 13478.00").size === 0);
    ok("sentenceWordsAround: an unknown quote gives nothing", sentenceWordsAround("A sentence. Another one.", "not there at all").size === 0);
  }

  // ---------------------------------------------------------------- EVERY COMBINATION (not one query at a time): quote styles x column wordings over the REAL passages
  {
    const wage: string = JSON.parse(readFileSync(join(__dirname, "..", "ingestion", "__fixtures__", "pilot-readings.json"), "utf8")).find((x: { id: string }) => x.id === "wage-notice").pipeline;
    const flat = (wage + " \n").replace(/\s+/g, " ").trim();
    const docW: DocInput = { type: "circular", id: 82, title: "Notice for Contract Workers - Daily Rate of Wages w.e.f 01.01.2024", date: "2023-12-16", chunks: planChunks(buildPageUnits([wage], flat)).map((c) => ({ page: c.page, index: c.index, text: c.text })) };
    const pw = buildPassages("what daily wage rates are notified for contractor workers for 2024", [docW]);
    const AREAS: { label: string; wage: string; total: string; cell: string }[] = [
      { label: "Works", wage: "808", total: "20995.30", cell: "WORKS" }, { label: "Projects", wage: "740", total: "19245.30", cell: "PROJECTS" }, { label: "Town Serv(Elect)", wage: "809", total: "21040.40", cell: "TOWN SERV(ELECT)" },
    ];
    const wageCell = (v: string) => `Daily Wages (Rs. Per Day of duty): ${v}`;
    const styles: [string, (a: (typeof AREAS)[number], v: string) => string][] = [
      ["whole row", (a, v) => (wage.split("\n").find((l) => l.includes(`Area: ${a.cell}`)) as string).replace(/ \| Daily Wages[^|]*$/, ` | ${wageCell(v)}`)],
      ["two cells", (a, v) => `Area: ${a.cell} | ${wageCell(v)}`],
      ["two cells with an ellipsis", (a, v) => `Area: ${a.cell} | ... | ${wageCell(v)}`],
      ["cells in the wrong order", (a, v) => `${wageCell(v)} | Area: ${a.cell}`],
      ["a paraphrase", (a, v) => `The daily wage for the ${a.label} area is ${v} rupees per day of duty`],
      ["the value cell only plus the area word", (a, v) => `${a.cell}: ${wageCell(v)}`],
    ];
    const columns = ["Daily Wages (Rs. Per Day of duty)", "Daily Wages", "Wages per day", "Daily Wages (Rs.)"];
    let accepted = 0, total = 0;
    const misses: string[] = [];
    for (const a of AREAS) for (const [sn, mkq] of styles) for (const col of columns) {
      total++;
      const r = verifyAnswer({ answerable: true, title: "Daily wage rates from 01.01.2024", note: "", rows: [{ label: a.label, column: col, value: a.wage, source: 1, quote: mkq(a, a.wage) }] }, pw);
      if (r.ok) accepted++; else misses.push(`${a.label} / ${sn} / ${col}: ${r.reason}`);
    }
    ok(`COMBINATIONS: every TRUE wage fact is accepted whatever the quote style and column wording (${accepted} of ${total})`, accepted === total, misses.slice(0, 4).join(" || "));
    // the FALSE claims: a wage under another area's label, a total or basic as the daily wage, a value that is not in the document
    let refused = 0, falseTotal = 0;
    const leaks: string[] = [];
    const falseClaims: { label: string; value: string; col: string; area: (typeof AREAS)[number] }[] = [];
    for (const a of AREAS) for (const b of AREAS) if (a !== b) falseClaims.push({ label: a.label, value: b.wage, col: "Daily Wages", area: b }); // another row's wage under this label
    for (const a of AREAS) { falseClaims.push({ label: a.label, value: a.total, col: "Daily Wages", area: a }); falseClaims.push({ label: a.label, value: "3350.00", col: "Daily Wages", area: a }); falseClaims.push({ label: a.label, value: "999", col: "Daily Wages", area: a }); }
    for (const f of falseClaims) for (const [sn, mkq] of styles) {
      falseTotal++;
      const r = verifyAnswer({ answerable: true, title: "Daily wage rates from 01.01.2024", note: "", rows: [{ label: f.label, column: f.col, value: f.value, source: 1, quote: mkq(f.area, f.value) }] }, pw);
      if (!r.ok) refused++; else leaks.push(`${f.label} = ${f.value} via ${sn}`);
    }
    ok(`COMBINATIONS: every FALSE wage claim is refused however it is quoted (${refused} of ${falseTotal})`, refused === falseTotal, "ACCEPTED: " + leaks.slice(0, 5).join(" || "));

    // the gift-card corrigendum (prose): the two amounts, each quoted as a whole sentence, a clause, or a paraphrase; and false ones
    const page: string = JSON.parse(readFileSync(join(__dirname, "..", "ingestion", "__fixtures__", "pilot-readings.json"), "utf8")).find((x: { id: string }) => x.id === "gift-card-corrigendum").pipeline;
    const docG: DocInput = { type: "circular", id: 49, title: "Circular - Gift card corrigendum", date: "2026-08-08T00:00:00.000Z", chunks: planChunks(buildPageUnits([page], (page + " \n").replace(/\s+/g, " ").trim())).map((c) => ({ page: c.page, index: c.index, text: c.text })) };
    const pg = buildPassages("what amount was first announced and what was it corrected to", [docG]);
    const sentence = 'the amount of the Gift Card (E-Multi Benefit Card) mentioned as "Rs.15,000/-" may please be read as "Rs.14,999/-"';
    const gstyles: [string, string][] = [["the whole sentence", sentence], ["the first clause", 'the amount of the Gift Card (E-Multi Benefit Card) mentioned as "Rs.15,000/-"'], ["the second clause", 'may please be read as "Rs.14,999/-"'], ["a paraphrase", "The Gift Card amount earlier given as Rs.15,000 is now to be read as Rs.14,999"]];
    let gAcc = 0, gTot = 0; const gMiss: string[] = [];
    for (const [label, value] of [["Initial announced amount", "Rs.15,000/-"], ["Corrected amount", "Rs.14,999/-"]]) for (const [sn, q] of gstyles) for (const col of ["Gift Card Amount", "Gift Card (E-Multi Benefit Card) amount", "Amount"]) {
      gTot++;
      const r = verifyAnswer({ answerable: true, title: "Gift Card amount correction", note: "", rows: [{ label, column: col, value, source: 1, quote: q }] }, pg);
      if (r.ok) gAcc++; else gMiss.push(`${label} / ${sn} / ${col}: ${r.reason}`);
    }
    ok(`COMBINATIONS: both gift-card amounts are accepted whatever the quote style and column wording (${gAcc} of ${gTot})`, gAcc === gTot, gMiss.slice(0, 4).join(" || "));
    let gRef = 0, gFalse = 0; const gLeak: string[] = [];
    for (const [label, value, col] of [["Corrected amount", "Rs.75,000/-", "Gift Card Amount"], ["Corrected amount", "Rs.215,000/-", "Gift Card Amount"], ["Last date", "Rs.14,999/-", "Last date"], ["Daily wage", "Rs.14,999/-", "Daily Wage"]]) for (const [sn, q] of gstyles) {
      gFalse++;
      const r = verifyAnswer({ answerable: true, title: "Gift Card", note: "", rows: [{ label, column: col, value, source: 1, quote: q }] }, pg);
      if (!r.ok) gRef++; else gLeak.push(`${label} = ${value} / ${col} via ${sn}`);
    }
    ok(`COMBINATIONS: false gift-card claims are refused (an amount that is not there, a column that is not in the sentence) (${gRef} of ${gFalse})`, gRef === gFalse, "ACCEPTED: " + gLeak.slice(0, 4).join(" || "));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
