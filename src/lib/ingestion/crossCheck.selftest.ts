/**
 * Self-test of the English / Hindi / Bengali cross-check and of the checks it records (step 42a).
 * Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/crossCheck.selftest.ts
 * The main cases are REAL: the pipeline's readings of the GPAIS pair and of the mediclaim Hindi page (pilot fixtures), with the mediclaim English page as
 * printed on the circular; the Bengali pages are constructed (a Bengali page of the GPAIS notice with the same numbers).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPassages, verifyAnswer } from "../search/circularAnswer";
import { checkRowsFor, pageTextHash } from "../search/pageChecks";
import {
  TRUST_ENGLISH, TWIN_READER, combineChecks, crossCheck, crossCheckWithWitnesses, decodeWitness, isWitness, majorNumbers, mergeIntoStored, pageScripts, renderReport, scriptOf,
  siblingsOf, summarize, titleFamily, twinChecks, twinChecksFor, witnessPage,
  type CircularFindings, type StoredCheck,
} from "./crossCheck";
import { indicMisreads } from "./indicMisreads";
import { mergeOcrPasses } from "./ocrMerge";
import { textOfWords, type TsvWord } from "./ruledTable";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const pilot: { id: string; pipeline: string }[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "pilot-readings.json"), "utf8"));
const P = (id: string) => (pilot.find((x) => x.id === id) as { pipeline: string }).pipeline;
const GP_HI = P("gpais-hindi"), GP_EN = P("gpais-english");
const GP_BN = "বিষয়: ঠিকা শ্রমিকদের জন্য জিপিএআইএস প্রিমিয়াম পরিমাণ সংশোধন সংক্রান্ত বিজ্ঞপ্তি। পূর্ববর্তী বিজ্ঞপ্তি HR-CLC/GPAIS-RN/77 তারিখ 20.08.2024। ঠিকাদার কর্তৃক নিযুক্ত ঠিকা শ্রমিকদের জন্য 01.01.2025 থেকে জমা দেওয়া সংশোধিত পরিমাণ নিম্নরূপ হবে। প্রিমিয়াম 150.00 131.25 112.50 সদস্যতা ফি 1.00 1.00 1.00 পরিষেবা মাশুল 15.00 13.12 11.25 জিএসটি 27.00 23.62 20.25 মোট প্রায় 193.00 169.00 145.00 পলিসি নম্বর 0315054224P110856231 এই বিজ্ঞপ্তি যোগ্য কর্তৃপক্ষের অনুমোদনপ্রাপ্ত।";
const MEDI_EN = "STEEL AUTHORITY OF INDIA LIMITED DURGAPUR STEEL PLANT No: DSP/PERS-NW/MEDICLAIM_EXTN/2026/1617 Dated: 11-08-2026 CIRCULAR Circular Sl. No: 2026/52 Communication has been received from Corporate Office, SAIL, New Delhi, regarding the extension of renewal under the SAIL Mediclaim Scheme for the year 2026-2027. The renewal facility will remain available up to 20-08-2026, including for gap cases. It is being circulated for information of all concerned. [Authority No: HR/ITB & Med./SMS (2026-27)/Ext. dated 10-08-2026] Distribution: Standard";
const HI_WORDS = "स्टील अथॉरिटी ऑफ इंडिया लिमिटेड दुर्गापुर इस्पात संयंत्र परिपत्र कर्मचारियों के लिए ऑनलाइन उपहार कार्ड का विकल्प पत्र संख्या दिनांक क्रमांक अंतिम तिथि ";
const GIFT_HI = HI_WORDS + "DSP/PERS-NW/2026/1567 03-08-2026 2026/50 Rs 15000 The gift card value (215,000) may be chosen online by every employee 20-08-2026";
const GIFT_EN = "STEEL AUTHORITY OF INDIA LIMITED DURGAPUR STEEL PLANT CIRCULAR Online option for Gift Card Rs. 15000 to employees DSP/PERS-NW/2026/1567 03-08-2026 2026/50 The value of the gift card is Rs. 15,000 and the last date for the option is 20-08-2026.";

const g1 = (pages: { page: number; text: string }[]) => crossCheck(pages)[0];
const checkOf = (pages: { page: number; text: string }[], page: number) => twinChecks(crossCheck(pages)).find((c) => c.page === page);

// ---- scripts
ok("scripts: Hindi, English, Bengali", scriptOf(GP_HI) === "devanagari" && scriptOf(GP_EN) === "latin" && scriptOf(GP_BN) === "bengali");
ok("a page with too little text has no script", scriptOf("Notice 1500") === "none" && scriptOf("") === "none");
ok("a page of both scripts, neither dominant, is mixed", scriptOf("स्टील अथॉरिटी ऑफ इंडिया लिमिटेड दुर्गापुर इस्पात संयंत्र " + "Steel Authority of India Limited Durgapur Steel Plant ".repeat(3)) === "mixed");
ok("important numbers are those with 4 digits or a point, in one canonical form", [...majorNumbers("Dated 11-08-2026, Rs 150.00, 15 days, ref 2026/52, 7")].sort().join() === "11.08.2026,150.00,2026.52");
ok("what a second reader wrote in [handwritten: ...] is not part of the page", [...majorNumbers("Date 20-08-2026 [handwritten: Soumit Roy 11/8/2026 ?]")].join() === "20.08.2026");

// ---- the real GPAIS pair: English + Hindi, nothing wrong
{
  const g = g1([{ page: 1, text: GP_HI }, { page: 2, text: GP_EN }]);
  ok("REAL: GPAIS English + Hindi is one group of two pages with 17 numbers on both", g.languages === "English + Hindi" && g.pages.length === 2 && g.confirmed[1].length === 17 && g.confirmed[2].length === 17, JSON.stringify([g.languages, g.confirmed]));
  ok("REAL: nothing is flagged (the year 2025 on one page and JAN-25 on the other is not a disagreement)", g.disagreements.length === 0 && g.variants.length === 0 && g.singles.length === 0, JSON.stringify([g.disagreements, g.variants, g.singles]));
  const c = twinChecks([g]);
  ok("REAL: both pages record 17 confirmed numbers and nothing unconfirmed", c.length === 2 && c.every((x) => x.confirmed.length === 17 && x.unconfirmed.length === 0 && x.reader === TWIN_READER && x.status === "twin"), JSON.stringify(c));
}

// ---- THREE languages
{
  const pages = [{ page: 1, text: GP_HI }, { page: 2, text: GP_EN }, { page: 3, text: GP_BN }];
  const g = g1(pages);
  ok("English + Hindi + Bengali is one group of three pages, 17 numbers confirmed on each", g.languages === "English + Hindi + Bengali" && g.pages.length === 3 && [1, 2, 3].every((p) => g.confirmed[p].length === 17), JSON.stringify([g.languages, g.confirmed]));
  ok("a circular in English and Bengali only is a group too", g1([{ page: 1, text: GP_EN }, { page: 2, text: GP_BN }]).languages === "English + Bengali");
  {
    // Hindi has numbers 1-5 of the English page's 8, Bengali has 4-8: they share too little with each other (2 of 8) but each matches the English page (5 of 8)
    const en = "Steel Authority of India Limited Durgapur Steel Plant notice numbers 1001 1002 1003 1004 1005 1006 1007 1008 for the contractor workers";
    const hi = HI_WORDS + "1001 1002 1003 1004 1005";
    const bn = "ইস্পাত কর্তৃপক্ষ দুর্গাপুর ইস্পাত কারখানা বিজ্ঞপ্তি ঠিকা শ্রমিকদের জন্য সংখ্যা 1004 1005 1006 1007 1008";
    ok("the test pages have the scripts intended", scriptOf(en) === "latin" && scriptOf(hi) === "devanagari" && scriptOf(bn) === "bengali", [scriptOf(en), scriptOf(hi), scriptOf(bn)].join());
    ok("Hindi and Bengali pages that share too little with each other join through the English page", g1([{ page: 1, text: hi }, { page: 2, text: en }, { page: 3, text: bn }])?.pages.length === 3);
    ok("...and without the English page they are no group", crossCheck([{ page: 1, text: hi }, { page: 3, text: bn }]).length === 0);
  }

  // the Bengali page misreads two numbers; English and Hindi agree
  const bad = pages.map((p) => (p.page === 3 ? { ...p, text: GP_BN.replace("20.08.2024", "20.0824").replace("193.00", "1930") } : p));
  const gb = g1(bad);
  ok("a misread on the Bengali page, against two pages that agree, is a disagreement with two supporting pages", gb.disagreements.length === 2 && gb.disagreements.every((d) => d.a.page === 3 && d.a.script === "bengali" && d.support === 2), JSON.stringify(gb.disagreements.map((d) => [d.a.value, d.b.value, d.support])));
  ok("...and only the Bengali page's misreadings are recorded as unconfirmed", checkOf(bad, 3)?.unconfirmed.slice().sort().join() === "1930,20.0824" && checkOf(bad, 1)?.unconfirmed.length === 0 && checkOf(bad, 2)?.unconfirmed.length === 0, JSON.stringify(twinChecks([gb])));
  ok("...and the other numbers of the Bengali page stay confirmed", (checkOf(bad, 3)?.confirmed.length ?? 0) === 15);

  // the English page is the odd one out against Hindi and Bengali
  const odd = pages.map((p) => (p.page === 2 ? { ...p, text: GP_EN.replace("193.00", "1930") } : p));
  ok("an English reading that two other pages contradict is recorded as unconfirmed (no page is trusted for its language)", checkOf(odd, 2)?.unconfirmed.join() === "1930" && checkOf(odd, 1)?.unconfirmed.length === 0 && checkOf(odd, 3)?.unconfirmed.length === 0, JSON.stringify(twinChecks(crossCheck(odd))));
}

// ---- the real mediclaim pair: the known misread; one page against one, so both readings are unconfirmed
{
  const pages = [{ page: 1, text: P("mediclaim-hindi") }, { page: 2, text: MEDI_EN }];
  const g = g1(pages);
  ok("REAL: the misread deadline on the Hindi page (20.0802) is a disagreement with the English page's 20.08.2026, one against one", g.disagreements.length === 1 && g.disagreements[0].a.value === "20.0802" && g.disagreements[0].b.value === "20.08.2026" && g.disagreements[0].support === 1, JSON.stringify(g.disagreements));
  ok("REAL: nothing says which is wrong, so BOTH are recorded as unconfirmed (the owner's rule: an honest not-found over a confident wrong answer)", !TRUST_ENGLISH && checkOf(pages, 1)?.unconfirmed.join() === "20.0802" && checkOf(pages, 2)?.unconfirmed.join() === "20.08.2026", JSON.stringify(twinChecks([g])));
  ok("REAL: the circular number 2026/52, missing from the Hindi page, is a single: shown, never recorded", g.singles.some((s) => s.value === "2026.52" && s.script === "latin") && !checkOf(pages, 2)?.unconfirmed.includes("2026.52") && !checkOf(pages, 2)?.confirmed.includes("2026.52"), JSON.stringify(g.singles));
  ok("REAL: a disagreement carries the words around each number", /20-0802|20\.0802|200802/.test(g.disagreements[0].a.context) && /20-08-2026/.test(g.disagreements[0].b.context), JSON.stringify(g.disagreements[0]));
}

// ---- the gift card: a stray digit in front of a number (the rupee sign read as a 2) is a variant
{
  const pages = [{ page: 1, text: GIFT_HI }, { page: 2, text: GIFT_EN }];
  const g = g1(pages);
  ok("a stray digit in front (215000 next to 15000, which the other page confirms) is a variant", g.variants.length === 1 && g.variants[0].value === "215000" && g.variants[0].base === "15000" && g.variants[0].script === "devanagari", JSON.stringify([g.variants, g.disagreements, g.singles]));
  ok("...recorded as unconfirmed on the Hindi page only; 15000 stays confirmed on both", checkOf(pages, 1)?.unconfirmed.join() === "215000" && checkOf(pages, 1)?.confirmed.includes("15000") === true && checkOf(pages, 2)?.unconfirmed.length === 0 && checkOf(pages, 2)?.confirmed.includes("15000") === true);

  // THE ANSWER CARD'S GATE, with these checks
  const chunks = [{ page: 1, index: 0, text: GIFT_HI }, { page: 2, index: 1, text: GIFT_EN }];
  const checks = Object.fromEntries(twinChecksFor(chunks).map((c) => [c.page, { confirmed: c.confirmed, unconfirmed: c.unconfirmed }]));
  const passages = buildPassages("gift card value", [{ type: "circular", id: 51, title: "Circular - Online option for Gift Card Rs. 15000 to employees", date: null, chunks, checks }]);
  const ask = (value: string, quote: string) => verifyAnswer({ answerable: true, title: "Gift card value", note: "", rows: [{ label: "gift card", column: "", value, source: 1, quote }] }, passages);
  const wrong = ask("215,000", "The gift card value (215,000) may be chosen online by every employee");
  ok("GATE: the answer 215,000 is refused, because the English page does not confirm it", !wrong.ok && /not confirmed by the second reading of page 1/.test(wrong.reason), wrong.ok ? "ACCEPTED" : wrong.reason);
  const right = ask("Rs. 15,000", "The value of the gift card is Rs. 15,000");
  ok("GATE: the answer Rs. 15,000 (the English page) passes", right.ok, right.ok ? "" : right.reason);
}

// ---- a bare year is never the base of a longer form (circular 23 of the archive: 931.2025, a reference number, next to the year 2025)
{
  const en = "Steel Authority of India Limited Durgapur Steel Plant health check up circular numbers 1001 1002 1003 1004 for the year 2025 dated 2025";
  const hi = HI_WORDS + "1001 1002 1003 1004 931/2025 2025";
  const pages = [{ page: 1, text: hi }, { page: 2, text: en }];
  const g = g1(pages);
  ok("the group is found, and 2025 is confirmed on both pages", !!g && g.confirmed[1].includes("2025") && g.confirmed[2].includes("2025"));
  ok("931.2025 next to the year 2025 is NOT a longer form (a reference number ends with the year); it is a single, and nothing is recorded against it", g.variants.length === 0 && g.singles.some((x) => x.value === "931.2025") && !checkOf(pages, 1)?.unconfirmed.includes("931.2025"), JSON.stringify([g.variants, g.singles]));
}

// ---- when there is no group
{
  const en1 = "Notice dated 11-08-2026 about Rs 150.00 and policy 0315054224 with reference 2026/52 for the contractor workers of the plant";
  const en2 = "Another notice dated 11-08-2026 about Rs 150.00 and policy 0315054224 with reference 2026/52 for the contractor workers of the plant";
  ok("two English pages are not a group", crossCheck([{ page: 1, text: en1 }, { page: 2, text: en2 }]).length === 0);
  ok("two Hindi pages are not a group", crossCheck([{ page: 1, text: GP_HI }, { page: 2, text: P("gift-card-hindi") }]).length === 0);
  ok("a single page, or none, is no group", crossCheck([{ page: 1, text: GP_HI }]).length === 0 && crossCheck([]).length === 0);
  ok("a Hindi page and an English page about different things are not a group", crossCheck([{ page: 1, text: GP_HI }, { page: 2, text: MEDI_EN }]).length === 0);
  ok("pages of a script that cannot be told (too little text) are left out", crossCheck([{ page: 1, text: "20-08-2026 150.00" }, { page: 2, text: GP_EN }]).length === 0);
  const four = crossCheck([{ page: 1, text: GP_HI }, { page: 2, text: GP_EN }, { page: 3, text: P("mediclaim-hindi") }, { page: 4, text: MEDI_EN }]);
  ok("four pages of two different notices make two groups", four.length === 2 && four[0].pages.map((p) => p.page).join() === "1,2" && four[1].pages.map((p) => p.page).join() === "3,4", JSON.stringify(four.map((g) => g.pages)));
}

// ---- what is never recorded
{
  const hindi = "स्टील अथॉरिटी ऑफ इंडिया लिमिटेड दुर्गापुर इस्पात संयंत्र सूचना ठेकेदारों के लिए राशि 150.00 131.25 112.50 दिनांक 20.08.2024 01.01.2025 कुल 7391.75 खण्ड 2.59 वर्ष 2025 ".repeat(2);
  const english = "Steel Authority of India Limited Durgapur Steel Plant Notice for the contractors amount 150.00 131.25 112.50 dated 20.08.2024 01.01.2025 clause 2.5 year JAN-25 ".repeat(2);
  const pages = [{ page: 1, text: hindi }, { page: 2, text: english }];
  const g = g1(pages);
  ok("an amount on one page only, with nothing like it on the other, is a single: never recorded as unconfirmed", g.singles.map((s) => s.value).join() === "7391.75" && checkOf(pages, 1)?.unconfirmed.length === 0, JSON.stringify([g.singles, twinChecks([g])]));
  ok("clause numbers (2.59 against 2.5) and bare years (2025 against JAN-25) are not disagreements or singles", g.disagreements.length === 0 && !g.singles.some((s) => s.value === "2.59" || s.value === "2025"));
  ok("a bare year that is shared is still confirmed", majorNumbers("year 2025 and 20.08.2024").has("2025") && g.confirmed[1].includes("01.01.2025"));
}

// ---- combining with the second reading's checks
{
  const second = [{ page: 1, status: "agreed", confirmed: ["15000", "20.08.2026"], unconfirmed: ["99999"], secondOnly: ["7"], reader: "gemini:gemini-3.8-flash" }];
  const twin = [
    { page: 1, status: "twin", confirmed: ["2026.50"], unconfirmed: ["20.08.2026", "215000"], secondOnly: [], reader: TWIN_READER },
    { page: 2, status: "twin", confirmed: ["15000"], unconfirmed: [], secondOnly: [], reader: TWIN_READER },
  ];
  const c = combineChecks(second, twin);
  ok("a number the second reading confirmed is lifted from the twin's unconfirmed list (20.08.2026), and the other twin finding stays (215000)", c[0].confirmed.slice().sort().join() === "15000,20.08.2026,2026.50" && c[0].unconfirmed.slice().sort().join() === "215000,99999", JSON.stringify(c[0]));
  ok("the second reading's status and second-only list are kept; the reader says both", c[0].status === "agreed" && c[0].secondOnly.join() === "7" && c[0].reader === `gemini:gemini-3.8-flash+${TWIN_READER}`, JSON.stringify(c[0]));
  ok("a page only the twin check knows is added; the result is in page order", c.length === 2 && c[1].page === 2 && c[1].status === "twin");
  ok("combining twice gives the same result", JSON.stringify(combineChecks(c, twin)) === JSON.stringify(c));
  ok("nothing from the second reading: the twin checks stand as they are", JSON.stringify(combineChecks([], twin)) === JSON.stringify(twin));
}

// ---- merging into what the archive already stores
{
  const text = "page text of page one";
  const hash = pageTextHash(text);
  const twin = { page: 1, status: "twin", confirmed: ["15000"], unconfirmed: ["215000"], secondOnly: [], reader: TWIN_READER };
  const stored: StoredCheck = { page: 1, status: "agreed", confirmed: ["20.08.2026"], unconfirmed: [], secondOnly: [], reader: "gemini:x", textHash: hash };
  const m = mergeIntoStored(stored, twin, hash);
  ok("a fresh stored check is merged with the twin's", m.confirmed.slice().sort().join() === "15000,20.08.2026" && m.unconfirmed.join() === "215000" && m.textHash === hash && m.reader === `gemini:x+${TWIN_READER}`, JSON.stringify(m));
  const stale = mergeIntoStored({ ...stored, textHash: "another-text" }, twin, hash);
  ok("a stored check about OTHER text (its fingerprint differs) is replaced, never kept", stale.confirmed.join() === "15000" && stale.reader === TWIN_READER && stale.textHash === hash, JSON.stringify(stale));
  ok("a page with no stored check just gets the twin's", mergeIntoStored(null, twin, hash).confirmed.join() === "15000");
  const again = mergeIntoStored({ page: 1, status: m.status, confirmed: m.confirmed, unconfirmed: m.unconfirmed, secondOnly: m.secondOnly, reader: m.reader, textHash: hash }, twin, hash);
  ok("merging the same twin check again changes nothing", JSON.stringify(again) === JSON.stringify(m), JSON.stringify(again));
}

// ---- from stored chunks (the same input as checkRowsFor)
{
  const chunks = [{ page: 1, index: 0, text: GP_HI.slice(0, 700) }, { page: 1, index: 1, text: GP_HI.slice(700) }, { page: 2, index: 2, text: GP_EN }];
  const direct = twinChecks(crossCheck([{ page: 1, text: GP_HI.slice(0, 700) + " " + GP_HI.slice(700) }, { page: 2, text: GP_EN }]));
  const viaChunks = twinChecksFor(chunks);
  ok("the checks of a circular from its chunks (a page's chunks are joined) equal those from whole pages", viaChunks.length === 2 && viaChunks.every((c) => c.confirmed.length >= 15) && direct.length === 2, JSON.stringify(viaChunks.map((c) => [c.page, c.confirmed.length])));
  ok("a page that is not in the chunks (page null) is left out", twinChecksFor([{ page: null, index: 0, text: GP_EN }]).length === 0);
}

// ---- the sequence the upload route runs (step 42a): twin checks merged with the second reading's, with the fingerprints of the stored chunks
{
  const chunks = [{ page: 1, index: 0, text: GIFT_HI }, { page: 2, index: 1, text: GIFT_EN }];
  const second = [{ page: 2, status: "agreed", confirmed: ["15000"], unconfirmed: [], secondOnly: [], reader: "gemini:x" }];
  const rows = checkRowsFor(combineChecks(second, twinChecksFor(chunks)), chunks);
  ok("the upload's rows: one per page, each with the fingerprint of the text that is stored", rows.length === 2 && rows[0].textHash === pageTextHash(GIFT_HI) && rows[1].textHash === pageTextHash(GIFT_EN), JSON.stringify(rows.map((r) => [r.page, r.textHash.slice(0, 6)])));
  ok("...page 1 (no second reading) carries the twin's finding; page 2 names both readers", rows[0].unconfirmed.join() === "215000" && rows[1].reader === `gemini:x+${TWIN_READER}` && rows[1].status === "agreed", JSON.stringify(rows));
  const noSecond = checkRowsFor(combineChecks([], twinChecksFor(chunks)), chunks);
  ok("with the second reader off or failed the twin rows still come", noSecond.length === 2 && noSecond.every((r) => r.reader === TWIN_READER) && noSecond[0].unconfirmed.join() === "215000");
  const one = [{ page: 1, index: 0, text: GIFT_EN }];
  ok("a one-page circular gets no rows from the twin check", checkRowsFor(combineChecks([], twinChecksFor(one)), one).length === 0);
}

// ---- the SAME circular in another language as a SEPARATE file (the Merit Award Scheme amendment: three files, "(Eng)", "(Hin)", "(Beng)")
{
  const T = { eng: "Circular -, Merit Award Scheme,26 (Amendment), Contract Workers (Eng)", hin: "Circular - Merit Award Scheme, 26 (Amendment), Contract Workers (Hin)", ben: "Circular -, Merit Award Scheme,26 (Amendment), Contract Workers (Beng)" };
  const FAMILY = "circular merit award scheme 26 amendment contract workers";
  ok("a title without its language tag is the same in English, Hindi and Bengali", titleFamily(T.eng) === FAMILY && titleFamily(T.hin) === FAMILY && titleFamily(T.ben) === FAMILY, [titleFamily(T.eng), titleFamily(T.hin), titleFamily(T.ben)].join(" | "));
  ok("tags written other ways go too: (English), [Hindi], - Bengali, in English", ["Notice (English)", "Notice [Hindi]", "Notice - Bengali", "Notice in English", "NOTICE (Bangla)"].every((t) => titleFamily(t) === "notice"));
  ok("a different year or scheme is a different family", titleFamily("Merit Award Scheme,27 (Amendment) (Eng)") !== titleFamily("Merit Award Scheme,26 (Amendment) (Eng)") && titleFamily("Extension of Mediclaim (2026-2027)") !== titleFamily("Extension of Mediclaim (26-27)"));
  ok("a title that is only a tag has no family", titleFamily("(Eng)") === "" && titleFamily("") === "");
  const sib = siblingsOf([{ id: 84, headline: T.eng }, { id: 85, headline: T.hin }, { id: 86, headline: T.ben }, { id: 90, headline: "A different circular" }]);
  ok("the siblings of each circular of the family (and none for a circular alone)", sib.get(84)?.join() === "85,86" && sib.get(86)?.join() === "84,85" && !sib.has(90), JSON.stringify([...sib]));
  ok("a witness page number is internal: it decodes to its circular and page, and a circular's own pages are not witnesses", JSON.stringify(decodeWitness(witnessPage(84, 3))) === '{"circular":84,"page":3}' && !isWitness(3) && decodeWitness(2) === null);

  // the Bengali circular as the upload now stores it: the REAL page (engine output), the English pass cleaned by the rule, merged
  const fxb = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "indic-misreads.json"), "utf8")).bengali as { eng: number[][]; tri: number[][]; triText: string };
  const wd = (rows: (number | string)[][]): TsvWord[] => rows.map((r, i) => ({ lineNo: i, block: r[0] as number, par: r[1] as number, line: r[2] as number, left: r[3] as number, top: r[4] as number, width: r[5] as number, height: r[6] as number, conf: r[7] as number, text: String(r[8]) }));
  const engW = wd(fxb.eng), cut = new Set(indicMisreads(engW, wd(fxb.tri), fxb.triText));
  const BEN = mergeOcrPasses(textOfWords(engW.filter((w) => !cut.has(w))), "", fxb.triText).text;
  const EN = "STEEL AUTHORITY OF INDIA LIMITED DURGAPUR STEEL PLANT No: HR-CLC/MERIT_AWD/Amnd/2026/131 Date: 15.08.2026 NOTICE Subject: Extension of the last date for submission of applications for the Merit Scholarship Award 2026. The last date for submission of the application for the Merit Scholarship Scheme 2026 (Higher Education Scholarship Scheme) has been extended up to 31 August 2026. All concerned contract workers are requested to submit the duly filled application with the necessary documents within the stipulated date. For details contact the Shramik Kalyan Cell, Room No. 206, Ispat Bhawan, or the registered office of DSPCWWS, Old Plant Personnel Building, Opposite Canteen CN-9, Durgapur Steel Plant. Issued with the approval of the competent authority.";
  const HI = HI_WORDS + "मेरिट स्कॉलरशिप योजना की आवेदन जमा करने की अंतिम तिथि बढ़ा दी गई है सभी संबंधित संविदा कर्मचारियों से अनुरोध है। HR-CLC/MERIT_AWD/Amnd/2026/131 15.08.2026 31 अगस्त 2026 कक्ष संख्या 206";
  ok("the three pages have the scripts intended", scriptOf(EN) === "latin" && scriptOf(HI) === "devanagari" && scriptOf(BEN) === "bengali", [scriptOf(EN), scriptOf(HI), scriptOf(BEN)].join());
  const ownBn = [{ page: 1, text: BEN }];
  const wit = [{ circular: 84, page: 1, text: EN }, { circular: 85, page: 1, text: HI }];
  const gs = crossCheckWithWitnesses(ownBn, wit);
  ok("REAL: the Bengali circular and its English and Hindi versions (separate circulars) form ONE group of three scripts", gs.length === 1 && gs[0].languages === "English + Hindi + Bengali" && gs[0].pages.length === 3 && gs[0].pages.filter((p) => isWitness(p.page)).length === 2, JSON.stringify(gs.map((g) => [g.languages, g.pages])));
  ok("REAL: the reference number 2026/131 and the date 15.08.2026 are confirmed on all three pages", ["2026.131", "15.08.2026"].every((n) => gs[0].pages.every((p) => gs[0].confirmed[p.page].includes(n))), JSON.stringify(gs[0].confirmed));
  const mine = twinChecks(gs, (page) => !isWitness(page));
  ok("only the Bengali circular's OWN page gets a check (the witnesses are not written to)", mine.length === 1 && mine[0].page === 1 && mine[0].confirmed.includes("2026.131") && mine[0].unconfirmed.length === 0 && gs[0].disagreements.length === 0, JSON.stringify(mine));

  // the Bengali reading is damaged, as the Indic pass really damages Latin digits (15.08.2026 -> 5.08.2026): two other circulars agree against it
  const damaged = crossCheckWithWitnesses([{ page: 1, text: BEN.replace("15.08.2026", "5.08.2026") }], wit);
  ok("a damaged date on the Bengali circular, against two versions that agree, is a disagreement with two supporting pages, recorded as unconfirmed on the Bengali page only", damaged[0].disagreements.length === 1 && damaged[0].disagreements[0].support === 2 && twinChecks(damaged, (pg) => !isWitness(pg))[0].unconfirmed.join() === "5.08.2026", JSON.stringify(damaged[0].disagreements.map((d) => [d.a.value, d.b.value, d.support])));

  // what is NOT a translation
  const v2 = EN.replace("31 August 2026", "20 August 2026").replace("15.08.2026", "11.08.2026");
  ok("a revised version of the same circular (the same script) is never a witness", crossCheckWithWitnesses([{ page: 1, text: EN }], [{ circular: 99, page: 1, text: v2 }]).length === 0);
  ok("a version in another language about something else (no numbers in common) is not a witness either", crossCheckWithWitnesses(ownBn, [{ circular: 99, page: 1, text: "STEEL AUTHORITY OF INDIA LIMITED DURGAPUR STEEL PLANT Circular 2025/77 dated 03.01.2025 about the Sports Club trial on 04.01.2025 at 6.00 PM; fee 1500.00 per head" }]).length === 0);
  ok("a circular with no witnesses is cross-checked on its own pages, as before", crossCheckWithWitnesses([{ page: 1, text: GP_HI }, { page: 2, text: GP_EN }], []).length === 1);

  // the report: the family is listed once, under the lowest circular, with real circular and page names
  const damagedBen = BEN.replace("15.08.2026", "5.08.2026");
  const of = (id: number, own: string, ws: { circular: number; page: number; text: string }[], sib: number[]): CircularFindings => ({ id, serial: id, headline: id === 86 ? T.ben : id === 85 ? T.hin : T.eng, pages: 1, groups: crossCheckWithWitnesses([{ page: 1, text: own }], ws), siblings: sib });
  const items: CircularFindings[] = [
    of(84, EN, [{ circular: 85, page: 1, text: HI }, { circular: 86, page: 1, text: damagedBen }], [85, 86]),
    of(85, HI, [{ circular: 84, page: 1, text: EN }, { circular: 86, page: 1, text: damagedBen }], [84, 86]),
    of(86, damagedBen, wit, [84, 85]),
  ];
  const sm = summarize(items);
  ok("the family is counted ONCE: one family of three circulars, one group, one flagged group (not three)", sm.families === 1 && sm.familyCirculars === 3 && sm.groups === 1 && sm.flagged.length === 1 && sm.flagged[0].item.id === 84, JSON.stringify({ f: sm.families, c: sm.familyCirculars, g: sm.groups, fl: sm.flagged.map((x) => x.item.id) }));
  const only86 = summarize([items[2]]);
  ok("a run restricted to ONE circular of the family (--ids) still counts and lists its group: the owner is the lowest circular IN the report", only86.groups === 1 && only86.flagged.length === 1 && only86.flagged[0].item.id === 86 && /Bengali circular 86 page 1 `5\.08\.2026`/.test(renderReport([items[2]])), JSON.stringify({ g: only86.groups, f: only86.flagged.length }));
  const md = renderReport(items);
  ok("the report names the family, and the damaged reading by its circular and page, never by an internal number", /Families of circulars with the same title in different languages \(separate files\): 1 \(3 circulars\)/.test(md) && /Bengali circular 86 page 1 `5\.08\.2026`/.test(md) && !/page 10[0-9]{4}/.test(md) && (md.match(/### Circular/g) ?? []).length === 1, md.slice(0, 1400));
  ok("every page of the family is counted as in a group, in the pages-by-script line", (() => { const sc = items.map((it, i) => ({ ...it, scripts: pageScripts([{ page: 1, text: [EN, HI, damagedBen][i] }]) })); return /Pages by script: English 1 \(in a group: 1\), Hindi 1 \(in a group: 1\), Bengali 1 \(in a group: 1\)/.test(renderReport(sc)); })());
}

// ---- the report
{
  const medi = crossCheck([{ page: 1, text: P("mediclaim-hindi") }, { page: 2, text: MEDI_EN }]);
  const gp3 = crossCheck([{ page: 1, text: GP_HI }, { page: 2, text: GP_EN }, { page: 3, text: GP_BN }]);
  const gift = crossCheck([{ page: 1, text: GIFT_HI }, { page: 2, text: GIFT_EN }]);
  const items: CircularFindings[] = [
    { id: 85, serial: 13, headline: "Circular- Extension of SAIL Mediclaim policy (2026-2027)", pages: 2, groups: medi },
    { id: 21, serial: 7, headline: "Notice for Contractor Workers - Revised GPAIS Premium Amount", pages: 3, groups: gp3 },
    { id: 51, serial: 7, headline: "Circular - Online option for Gift Card Rs. 15000 to employees", pages: 2, groups: gift },
    { id: 5, serial: 1, headline: "A one-page notice", pages: 1, groups: [] },
  ];
  const s = summarize(items);
  ok("the summary counts circulars, groups by languages, clean and flagged groups", s.circulars === 4 && s.withTwoPages === 3 && s.groups === 3 && s.clean === 1 && s.flagged.length === 2 && s.byLanguages.some(([l, n]) => l === "English + Hindi" && n === 2) && s.byLanguages.some(([l, n]) => l === "English + Hindi + Bengali" && n === 1), JSON.stringify({ ...s, flagged: s.flagged.length }));
  ok("the summary says what recording would do: pages, confirmed numbers, unconfirmed readings", s.pagesRecorded === 7 && s.numbersUnconfirmed === 3 && s.numbersConfirmed > 40, JSON.stringify([s.pagesRecorded, s.numbersConfirmed, s.numbersUnconfirmed]));
  items[0].scripts = pageScripts([{ page: 1, text: P("mediclaim-hindi") }, { page: 2, text: MEDI_EN }]);
  items[1].scripts = pageScripts([{ page: 1, text: GP_HI }, { page: 2, text: GP_EN }, { page: 3, text: GP_BN }]);
  items[2].rupee = [{ page: 1, suspects: [{ value: "215000", base: "15000", context: "the gift card value (215,000) may be chosen" }], junk: [{ glyph: "%", amount: "15000", context: "the amount (% 15,000) is" }] }];
  const withScripts = renderReport(items);
  ok("the report counts the pages by script (two circulars given: English 2 and Hindi 2, all in a group, and Bengali 1, in a group)", /Pages by script: English 2 \(in a group: 2\), Hindi 2 \(in a group: 2\), Bengali 1 \(in a group: 1\), mixed 0, too little text 0/.test(withScripts), (withScripts.match(/Pages by script:.*/) ?? ["no line"])[0]);
  ok("...and has a rupee-sign section with the amount and the symbol", /## The rupee sign/.test(withScripts) && /circular 51 page 1: `215000` next to `15000`/.test(withScripts) && /circular 51 page 1: `%` before `15000`/.test(withScripts), withScripts.slice(900, 2400));
  ok("the rupee suspect is counted in the summary (one amount, one page)", summarize(items).slotSuspects === 1 && summarize(items).suspectPages.length === 1 && summarize(items).junkPages.length === 1);
  const md = renderReport(items.map((i) => ({ ...i, scripts: undefined, rupee: undefined })));
  ok("the report opens with the counts and the languages", /Circulars read: 4 \| with two or more pages: 3 \| groups of pages/.test(md) && /- English \+ Hindi \+ Bengali: 1/.test(md) && /3 readings are recorded as unconfirmed/.test(md), md.slice(0, 700));
  ok("the report shows the disagreement with both readings and the variant with its base", /Hindi page 1 `20\.0802`/.test(md) && /English page 2 `20\.08\.2026`/.test(md) && /Hindi page 1 `215000`.* is a longer form of `15000`/.test(md), md.slice(0, 1600));
  ok("the clean group is not listed in the details, and a number only on the English page is", !/### Circular 21/.test(md) && /only on the English page 2: `2026\.52`/.test(md));
  ok("an empty archive gives a readable report", /Circulars read: 0/.test(renderReport([])));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
