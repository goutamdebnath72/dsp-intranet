// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/search/circularAnswer.selftest.ts
// No database, no network, no model: the model is a fake function.

import {
  answerFromPassages, buildAnswerPrompt, buildPassages, clearAnswerCache, normalizeForQuote, numbersIn, parseModelAnswer, percentOf, pickAnswerItems, verifyAnswer,
  type DocInput, type ModelAnswer, type Passage,
} from "./circularAnswer";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const eq = (name: string, got: unknown, want: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

// ---------------------------------------------------------------- fixtures: the text of two real-looking documents
const WAGE_TEXT =
  "Steel Authority of India Limited Durgapur Steel plant No. PL-CLC/WAGE/Jan-2024 Dated: 16.12.2023 NOTICE for CONTRACT WORKERS " +
  "minimum Rate of Wages of Contract Workers (in DSP) w.e.f. 01.01.2024 are as follows: SL. Area BASIC VDA FDA HRA REF ALLOW INC AWA TOTAL Daily Wages " +
  "1 WORKS 3350.00 13478.00 375.00 1720.30 52.00 270.00 1750.00 20995.30 808\n" +
  "2 PROJECTS 3350.00 13478.00 375.00 1720.30 52.00 270.00 0.00 19245.30 740\n" +
  "3 TOWN SERV(ELECT) 3250.00 13450.00 375.00 1707.50 52.00 455.90 1750.00 21040.40 809\n" +
  "Non-works area:- Will be published on availability of Govt Gazette in this regard.";
const LEAVE_TEXT =
  "II. Casual Leave & Medical Leave: Four (04) days Casual Leave and Seven (07) days Medical Leave for a calendar year. " +
  "IV. Earned Leave: One (01) day per 20 days of actual work in Works, Projects & TS (Elec.)";
const HINDI_TEXT = "जो भी पहले हो केवल क्षतिपूर्ति अवकाश दिया जाएगा। आकस्मिक अवकाश एवं चिकित्सा अवकाश एक कैलेंडर वर्ष के लिए चार दिनों का आकस्मिक अवकाश";

const P_WAGE: Passage = { n: 1, type: "circular", id: 82, title: "Notice for Contract Workers - Daily Rate of Wages w.e.f 01.01.2024 (excluding Non-Works)", date: "2023-12-16", page: 1, text: WAGE_TEXT, parts: [{ page: 1, text: WAGE_TEXT }] };
const P_LEAVE: Passage = { n: 2, type: "circular", id: 22, title: "Circular - Holidays and leaves for contractor workers in DSP -2025", date: "2024-12-27", page: 2, text: LEAVE_TEXT, parts: [{ page: 2, text: LEAVE_TEXT }] };
const P_HINDI: Passage = { n: 3, type: "circular", id: 12, title: "Circular - Holidays and Leaves for Contractor Workers in DSP - 2024", date: "2023-12-26", page: 1, text: HINDI_TEXT, parts: [{ page: 1, text: HINDI_TEXT }] };
const PASSAGES = [P_WAGE, P_LEAVE, P_HINDI];

const ROW_W = "1 WORKS 3350.00 13478.00 375.00 1720.30 52.00 270.00 1750.00 20995.30 808";
const ROW_P = "2 PROJECTS 3350.00 13478.00 375.00 1720.30 52.00 270.00 0.00 19245.30 740";
const ROW_T = "3 TOWN SERV(ELECT) 3250.00 13450.00 375.00 1707.50 52.00 455.90 1750.00 21040.40 809";
const GOOD: ModelAnswer = {
  answerable: true,
  answer: "From 1 January 2024 the daily wage is Rs 808 for Works, Rs 740 for Projects and Rs 809 for Town Serv (Elect).",
  facts: [
    { source: 1, quote: ROW_W, values: ["808"] },
    { source: 1, quote: ROW_P, values: ["740"] },
    { source: 1, quote: ROW_T, values: ["809"] },
  ],
};
const reason = (r: ReturnType<typeof verifyAnswer>) => (r.ok ? "OK" : r.reason);

// ---------------------------------------------------------------- numbers and quotes
eq("numbers: commas and decimals", numbersIn("Rs. 15,000/- and 1720.30 and 9049.00"), [15000, 1720.3, 9049]);
eq("numbers: a date is split into its parts", numbersIn("w.e.f 01.01.2024 dated 16.12.2023"), [1, 1, 2024, 16, 12, 2023]);
eq("numbers: digits first, then number words (but not the pronoun 'one')", numbersIn("Four (04) days and no one, Seven days"), [4, 4, 7]);
eq("numbers: 'one' counts when asked", numbersIn("One day", true), [1]);
eq("numbers: nothing in a text with no numbers", numbersIn("The notice applies to all workers"), []);
eq("quote normalisation ignores spaces, case, punctuation", normalizeForQuote("Rs. 15,000 /-"), normalizeForQuote("rs 15000"));
ok("quote normalisation keeps Hindi letters", normalizeForQuote("आकस्मिक अवकाश").length > 5);

// ---------------------------------------------------------------- ACCEPT
let r = verifyAnswer(GOOD, PASSAGES);
ok("a fully proved answer is accepted", r.ok, reason(r));
if (r.ok) {
  eq("the answer text is kept", r.value.text, GOOD.answer);
  eq("the three quotes become evidence", r.value.evidence.map((e) => e.quote), [ROW_W, ROW_P, ROW_T]);
  eq("one source, with its title, date and page", r.value.sources.map((s) => [s.n, s.id, s.page]), [[1, 82, 1]]);
}
r = verifyAnswer({ answerable: true, answer: "Contractor workers get four days of casual leave and seven days of medical leave in a calendar year.", facts: [{ source: 2, quote: "Four (04) days Casual Leave and Seven (07) days Medical Leave for a calendar year", values: ["04", "07"] }] }, PASSAGES);
ok("number words in the answer are matched to the quote (four = (04))", r.ok, reason(r));
r = verifyAnswer({ answerable: true, answer: "Casual leave and medical leave are the same in both years.", facts: [{ source: 2, quote: "Four (04) days Casual Leave and Seven (07) days Medical Leave", values: [] }, { source: 3, quote: "आकस्मिक अवकाश एवं चिकित्सा अवकाश एक कैलेंडर वर्ष के लिए चार दिनों का", values: [] }] }, PASSAGES);
ok("two documents and a Hindi quote are accepted", r.ok, reason(r));
if (r.ok) eq("sources are listed in passage order", r.value.sources.map((s) => s.n), [2, 3]);
r = verifyAnswer({ answerable: true, answer: "The Works wage is Rs 808.", facts: [{ source: 1, quote: "1 works 3350 00 13478 00 375 00 1720 30 52 00 270 00 1750 00 20995 30 808", values: ["808"] }] }, PASSAGES);
ok("a quote that differs only in spaces, case and punctuation is still verbatim", r.ok, reason(r));
const multi: Passage = { ...P_WAGE, parts: [{ page: 1, text: "intro text of the notice number PL-CLC" }, { page: 2, text: WAGE_TEXT }], text: "intro text of the notice number PL-CLC\n\n" + WAGE_TEXT };
r = verifyAnswer({ answerable: true, answer: "The Works wage is Rs 808.", facts: [{ source: 1, quote: ROW_W, values: ["808"] }] }, [multi]);
ok("the page of the evidence is the page that holds the quote", r.ok && r.value.evidence[0].page === 2, reason(r));

// ---------------------------------------------------------------- REFUSE
const bad = (name: string, a: ModelAnswer, expect: RegExp, ps: Passage[] = PASSAGES) => {
  const x = verifyAnswer(a, ps);
  ok(name, !x.ok && expect.test(x.reason), `got ${reason(x)}`);
};
bad("an INVENTED figure is refused (810 is in no quote)", { ...GOOD, answer: "The daily wage is Rs 810 for Works." }, /number 810 in the answer is in no quote/);
bad("a paraphrased quote is refused", { ...GOOD, facts: [{ source: 1, quote: "The daily wage for the Works area is 808 rupees", values: ["808"] }] }, /not in the document word for word/);
bad("a value that is not in its own quote is refused", { ...GOOD, facts: [{ source: 1, quote: ROW_P, values: ["808"] }] }, /value "808" is not in its quote/);
bad("a number added by the model (26 days) is refused: no calculation", { ...GOOD, answer: "The wage is Rs 808 per day for 26 days." }, /number 26/);
bad("a fact that names a passage that does not exist is refused", { ...GOOD, facts: [{ source: 9, quote: ROW_W, values: ["808"] }] }, /passage that does not exist/);
bad("a quote taken from the WRONG document is refused", { ...GOOD, facts: [{ source: 2, quote: ROW_W, values: ["808"] }] }, /not in the document word for word/);
bad("'not answerable' is passed on as such", { answerable: false, answer: "", facts: [] }, /^not_answerable$/);
bad("an answer without facts is refused", { answerable: true, answer: "The wage is Rs 808.", facts: [] }, /no facts/);
bad("more than eight facts are refused", { ...GOOD, facts: Array.from({ length: 9 }, () => ({ source: 1, quote: ROW_W, values: ["808"] })) }, /too many/);
bad("an empty answer is refused", { ...GOOD, answer: "" }, /empty or too long/);
bad("a very long answer is refused", { ...GOOD, answer: "x".repeat(900) }, /empty or too long/);
bad("a quote too short to prove anything is refused", { ...GOOD, facts: [{ source: 1, quote: "808", values: ["808"] }] }, /too short/);
bad("a quote that is a whole table (not one row) is refused", { ...GOOD, facts: [{ source: 1, quote: WAGE_TEXT, values: ["808"] }] }, /too long/);
bad("a number word the quotes do not support is refused (six days)", { answerable: true, answer: "Contractor workers get six days of casual leave.", facts: [{ source: 2, quote: "Four (04) days Casual Leave and Seven (07) days Medical Leave", values: [] }] }, /number 6/);
bad("a date that is in no quote and not in the document's title or date is refused", { ...GOOD, answer: "The wage applies from 1 January 2026." }, /number 2026/);
bad("a non-numeric value that is not in the quote is refused", { answerable: true, answer: "The notice is about wages.", facts: [{ source: 1, quote: "NOTICE for CONTRACT WORKERS minimum Rate of Wages of Contract Workers", values: ["bonus"] }] }, /value "bonus"/);

// ---------------------------------------------------------------- reading the model's reply
eq("plain JSON is read", parseModelAnswer('{"answerable": false}'), { answerable: false, answer: "", facts: [] });
eq("JSON in a code fence is read", parseModelAnswer('```json\n{"answerable": true, "answer": " A ", "facts": [{"source": "1", "quote": "q", "values": [808]}]}\n```'), { answerable: true, answer: "A", facts: [{ source: 1, quote: "q", values: ["808"] }] });
eq("JSON after some words is read", parseModelAnswer('Here you go: {"answerable": false} thanks')?.answerable, false);
eq("a reply that is not JSON is not read", parseModelAnswer("I think the answer is 808"), null);
eq("broken JSON is not read", parseModelAnswer('{"answerable": true, "answer": '), null);
eq("'answerable' must be exactly true", parseModelAnswer('{"answerable": "yes", "answer": "x", "facts": []}')?.answerable, false);

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
ok("a long document is cut to the part that matches the question", ps[0].text.includes("last date for submission") && ps[0].text.length <= 1500);
eq("the best page is the page with the matching words", ps[0].page, 2);
ok("a short document is read whole", ps[1].text === "Compensatory off is given within two months.");
ok("the budget is shared between documents", ps.reduce((n, p) => n + p.text.length, 0) <= 3000);
eq("a document with no text is skipped", buildPassages("anything", [{ ...short, chunks: [{ page: 1, index: 0, text: "   " }] }]).length, 0);
ps = buildPassages("question", [{ ...long, chunks: [{ page: 3, index: 2, text: "third" }, { page: 1, index: 0, text: "first" }] }]);
eq("chosen parts are put back in page order", ps[0].parts.map((p) => p.page), [1, 3]);

// ---------------------------------------------------------------- which results are worth reading
eq("a strong top match: the matching documents are picked, in order", pickAnswerItems([{ id: 82, type: "circular", matchPercentage: 99 }, { id: 12, type: "circular", matchPercentage: 91 }, { id: 5, type: "circular", matchPercentage: 70 }]), [{ type: "circular", id: 82 }, { type: "circular", id: 12 }]);
eq("a weak TOP match: nothing is read (no model call)", pickAnswerItems([{ id: 1, type: "circular", matchPercentage: 80 }, { id: 2, type: "circular", matchPercentage: 79 }]), []);
eq("no results: nothing", pickAnswerItems([]), []);
eq("at most three documents", pickAnswerItems([1, 2, 3, 4, 5].map((id) => ({ id, type: "circular", matchPercentage: 95 }))).length, 3);
eq("the similarity is used when there is no percentage", percentOf({ similarity: 0.931 }), 93);
eq("announcements and holiday notes can be read too", pickAnswerItems([{ id: 3, type: "holiday", matchPercentage: 99 }, { id: 4, type: "announcement", matchPercentage: 90 }]), [{ type: "holiday", id: 3 }, { type: "announcement", id: 4 }]);
eq("an unknown kind of result is ignored", pickAnswerItems([{ id: 3, type: "circular", matchPercentage: 99 }, { id: 4, type: "employee", matchPercentage: 99 }]), [{ type: "circular", id: 3 }]);

// ---------------------------------------------------------------- the request
const prompt = buildAnswerPrompt("what daily wage rates are notified", PASSAGES);
ok("the request carries the question and numbered passages", prompt.includes("QUESTION: what daily wage rates are notified") && prompt.includes("[1] Document: Notice for Contract Workers") && prompt.includes("[3] Document:"));
ok("the request forbids guessing, calculating and paraphrased quotes", /ONLY the numbered passages/.test(prompt) && /Do NOT calculate/.test(prompt) && /CHARACTER FOR CHARACTER/.test(prompt) && /"answerable": false/.test(prompt));
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
  x = await answerFromPassages("q2", [P_WAGE], async () => JSON.stringify({ ...GOOD, answer: "The wage is Rs 999." }));
  ok("an invented figure from the model never reaches the screen", !x.ok && /999/.test(x.reason));
  x = await answerFromPassages("q3", [], good);
  ok("no passages, no answer, no model call", !x.ok && x.reason === "no_passages" && calls === 2);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
