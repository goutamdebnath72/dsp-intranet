// Run (from the project root): npx tsx src/lib/ingestion/indicRepair.selftest.ts
import { canonicalIndic, indicDefect, repairIndic } from "./indicRepair";
import { createGeminiOcr, readingSummary } from "./geminiOcr";
import type { PageReader } from "./pageReader";
import { cleanQueryString } from "../utils/queryCleaner";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };

// the real slip found in the archive (circular 21, page 1): the table heading printed "क्र.सं." was stored with a Korean letter
const PRIMARY = "सभी ठेका श्रमिकों का विवरण उपलब्ध कराएंगे। 크.सं. | पिन नं. | नाम | पिता/पति का नाम | लिंग | जन्म तिथि";
const CHECKER = "सभी ठेका श्रमिकों का विवरण उपलब्ध कराएंगे। क्र.सं. | पिन नं. | नाम | पिता/पति का नाम | लिंग | जन्म तिथि";

// 1. detection
ok("a Korean letter is a stray-script slip", indicDefect("크.सं.")?.kind === "stray-script");
ok("a Cyrillic letter in a word is a slip", indicDefect("परिपतр")?.kind === "stray-script");
ok("Greek mu / omega are real symbols, not a slip", indicDefect("5μm") === null && indicDefect("100Ω") === null);
ok("a clean Hindi word is not a defect", indicDefect("क्र.सं.") === null && indicDefect("अर्थात्") === null && indicDefect("स्वास्थ्य") === null);
ok("a clean Bengali word is not a defect", indicDefect("ডিয়া") === null && indicDefect("স্কুল") === null);
ok("a virama followed by a vowel sign is impossible", indicDefect("क्ा")?.kind === "malformed-sequence");
ok("two vowel signs in a row are impossible", indicDefect("काी")?.kind === "malformed-sequence");
ok("a word starting with a vowel sign is impossible", indicDefect("ाम")?.kind === "malformed-sequence");
ok("a Bengali virama + vowel sign is impossible", indicDefect("ক্া")?.kind === "malformed-sequence");
ok("plain English and numbers are never a defect", indicDefect("Excel") === null && indicDefect("01.01.2025") === null && indicDefect("Rs.14,999/-") === null);
ok("a printed spelling slip is NOT a defect (kept as printed)", indicDefect("ठेकेदारो") === null && indicDefect("त्यौहारिय") === null && indicDefect("होलीका") === null);

// 2. repair from the other reading
{ const r = repairIndic(PRIMARY, CHECKER);
  ok("the Korean letter is replaced by the checker's word", r.text === CHECKER && r.repairs.length === 1 && r.repairs[0].to === "क्र.सं." && r.unresolved.length === 0, JSON.stringify(r)); }
{ const r = repairIndic(PRIMARY, null);
  ok("with no second reading nothing is guessed, the slip is reported", r.text === PRIMARY && r.repairs.length === 0 && r.unresolved.length === 1); }
{ const r = repairIndic(PRIMARY, "बिल्कुल अलग पाठ जिसमें वह शब्द नहीं है");
  ok("a second reading without the word leaves the slip and reports it", r.text === PRIMARY && r.unresolved[0]?.token === "크.सं."); }
{ const r = repairIndic("क्र.सं. और 크.सं. और ठेकेदारो", "क्र.सं. और क्र.सं. और ठेकेदारों");
  ok("only the defective token is touched: a printed slip is not 'corrected' even when the other reading differs", r.text === "क्र.सं. और क्र.सं. और ठेकेदारो", r.text); }
{ const r = repairIndic("पहला 크ा.सं. दूसरा", "पहला काम दूसरा क्रा.सं. और क्षा.सं.");
  ok("two possible words and no neighbour match: not guessed", r.text.includes("크ा.सं.") && r.repairs.length === 0, JSON.stringify(r)); }
{ const r = repairIndic("पहला 크ा.सं. दूसरा", "पहला क्रा.सं. दूसरा और क्षा.सं. तीसरा");
  ok("two possible words, one stands next to the same neighbours: that one", r.text === "पहला क्रा.सं. दूसरा" && r.repairs.length === 1, JSON.stringify(r)); }
{ const r = repairIndic("पहला क्ा दूसरा", "पहला क्या दूसरा");
  ok("a malformed sequence is replaced by the close clean word of the other reading", r.text === "पहला क्या दूसरा", JSON.stringify(r)); }
{ const r = repairIndic("line one\nकुल 크.सं. यहाँ\nline three", "x क्र.सं. y");
  ok("line breaks and spacing are kept", r.text === "line one\nकुल क्र.सं. यहाँ\nline three", JSON.stringify(r.text)); }

// 3. canonical form: precomposed ড় য় ড़ become the standard NFC sequence, other text is untouched
ok("the precomposed Bengali ya-nukta (U+09DF) becomes the standard sequence", canonicalIndic("ডিয়া").includes("য়") && !canonicalIndic("ডিয়া").includes("য়"));
ok("the precomposed Devanagari da-nukta (U+095C) becomes the standard sequence", canonicalIndic("खिलाड़ी").includes("ड़"));
ok("a word typed either way is the same after canonicalIndic", canonicalIndic("ডিয়া") === canonicalIndic("ডিয়া"));
ok("English text is not changed", canonicalIndic("Hello World 14,999") === "Hello World 14,999");
ok("already canonical text is unchanged", canonicalIndic("क्र.सं. पिन नं.") === "क्र.सं. पिन नं.");

// 3b. the query cleaner brings a typed query to the stored form
ok("a joiner typed inside a word does not split it", cleanQueryString("ক\u200D্ষ ছুটি") === "ক্ষ ছুটি", cleanQueryString("ক\u200D্ষ ছুটি"));
ok("a query typed with the precomposed letter equals the stored form", cleanQueryString("ডিয়া") === canonicalIndic("ডিয়া"));
ok("English and quoted queries are unchanged", cleanQueryString('"Rs.500" gift card') === '"Rs.500" gift card');

// 4. in the upload reader: primary slip is repaired from the checker, and the summary says so
const reader = (name: string, text: string): PageReader => ({ name, read: async () => text });
const run = async (p: string, c: string) => {
  const ocr = createGeminiOcr({ readers: { primary: reader("p", p), checker: reader("c", c) }, deadlineAt: Date.now() + 60_000 });
  ocr.start(1, Buffer.from([1]));
  return ocr.finish();
};
(async () => {
  const pad = " The Gift Card of Rs.14,999/- may be exercised through the ESS portal by 15.08.2026 for all executives of the plant.";
  { const r = await run(PRIMARY + pad, CHECKER + pad);
    ok("the upload text carries the repaired word", r.texts.get(1) === CHECKER + pad && r.log.pages[0].indicRepaired?.[0]?.to === "क्र.सं.", r.texts.get(1));
    ok("the summary mentions the correction", /1 Hindi\/Bengali letter slip of the reader corrected/.test(readingSummary(r.log)), readingSummary(r.log)); }
  { const r = await run(PRIMARY + pad, "x".repeat(5));
    ok("a slip the second reading cannot fix is reported in the log and the summary", r.log.pages[0].indicUnresolved?.length === 1 && /could not be corrected/.test(readingSummary(r.log)), readingSummary(r.log) + JSON.stringify(r.log.pages[0])); }
  { const r = await run("Plain English page. " + pad, "Plain English page. " + pad);
    ok("a clean English page is unchanged and its summary has no letter-slip note", r.texts.get(1) === ("Plain English page. " + pad).replace(/\s+/g, " ").trim() && !/letter slip/.test(readingSummary(r.log)), JSON.stringify(r.texts.get(1))); }
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
