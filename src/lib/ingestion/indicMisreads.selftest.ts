/**
 * Self-test of the rule that cuts the English pass's misreadings of Indic glyphs (step 43a).
 * Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/indicMisreads.selftest.ts
 * The three pages are REAL (__fixtures__/indic-misreads.json: the engine's own output, word positions and confidences): a fully Bengali circular, and the Hindi
 * and English scanned pages of the GPAIS notice (their hand-made truth is eval/ocr-pilot-truth.json).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIDENT_ENGLISH_WORD, MIN_COVER, indicMisreads } from "./indicMisreads";
import { OCR_MERGE_VERSION, indicOnlyText, isIndicWord, mergeOcrPasses } from "./ocrMerge";
import { numbersOf } from "./readingCheck";
import { textOfWords, type TsvWord } from "./ruledTable";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

type Row = [number, number, number, number, number, number, number, number, string];
const fx = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "indic-misreads.json"), "utf8")) as Record<string, { eng: Row[]; tri: Row[]; triText: string }>;
const toWords = (rows: Row[]): TsvWord[] => rows.map((r, i) => ({ lineNo: i, block: r[0], par: r[1], line: r[2], left: r[3], top: r[4], width: r[5], height: r[6], conf: r[7], text: r[8] }));
const canon = (s: string) => s.replace(/,/g, "").replace(/[/:-]/g, ".");
const truthFile = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "eval", "ocr-pilot-truth.json"), "utf8")).pages as { id: string; numbers: string[] }[];
const truth = (id: string) => new Set((truthFile.find((p) => p.id === id) as { numbers: string[] }).numbers.map(canon));
const numsOf = (words: TsvWord[]) => [...numbersOf(textOfWords(words))];

ok("the merge version says the rule changed (the re-read tool's cache is then ignored)", OCR_MERGE_VERSION === 6);
ok("an Indic word: a letter or an Indic digit; Latin, ASCII digits and a mark alone are not", isIndicWord("আগস্ট") && isIndicWord("২০২৬") && isIndicWord("(ডিএসপি)") && !isIndicWord("2026") && !isIndicWord("SAIL") && !isIndicWord("\u09be") && !isIndicWord(""));
ok("the confidence that keeps a word and the share that cuts it are what the module says", CONFIDENT_ENGLISH_WORD === 85 && MIN_COVER === 0.4);

// ---- the REAL Bengali circular
{
  const eng = toWords(fx.bengali.eng), tri = toWords(fx.bengali.tri), cut = indicMisreads(eng, tri, fx.bengali.triText);
  const keep = eng.filter((w) => !cut.includes(w));
  const TRUTH = new Set(["2026.131", "15.08.2026", "2026", "31", "206"]);
  const before = numsOf(eng), after = numsOf(keep);
  ok("REAL Bengali: the English pass invented 12 numbers that are not on the page", before.filter((n) => !TRUTH.has(n)).length === 12, JSON.stringify(before));
  ok("REAL Bengali: after the cut NONE is left (the two real Latin numbers stay: the reference 2026/131 and the date 15.08.2026)", after.join() === "2026.131,15.08.2026", JSON.stringify(after));
  const kept = keep.map((w) => w.text);
  ok("REAL Bengali: the genuine Latin tokens are kept: the reference, the date, (Shramik Kalyan Cell)", kept.includes("HR-CLC/MERIT_AWD/Amnd/2026/131") && kept.includes("15.08.2026") && kept.includes("(Shramik") && kept.includes("Kalyan") && kept.some((t) => t.startsWith("Cell")), kept.join(" ").slice(0, 200));
  ok("REAL Bengali: most of the English pass was gibberish and is cut (60 or more of 90 words), none of it with a confidence of 85 or more", cut.length >= 60 && cut.every((w) => w.conf < 85), String(cut.length));
  const merged = mergeOcrPasses(textOfWords(keep), "", fx.bengali.triText);
  const mn = [...numbersOf(merged.text)];
  ok("REAL Bengali, after the merge: every number the page has is stored (including the Bengali digits ২০২৬, ৩১, ২০৬) and nothing else", [...TRUTH].every((n) => mn.includes(n)) && mn.every((n) => TRUTH.has(n)), JSON.stringify(mn));
  ok("REAL Bengali: the Bengali text itself is untouched by the cut (the deadline sentence is stored)", merged.text.includes("৩১ আগস্ট ২০২৬") && merged.text.includes("কক্ষ নং ২০৬"));
  const before2 = [...numbersOf(mergeOcrPasses(textOfWords(eng), "", fx.bengali.triText).text)];
  ok("REAL Bengali: without the cut the merge stores those 12 invented numbers (what the upload did)", before2.filter((n) => !TRUTH.has(n)).length >= 12, JSON.stringify(before2));
}

// ---- the REAL full circular, as the upload renders it (04_2026.pdf, one scan, rendered at 300/72): the page whose stray numbers 19 and 41 got through at 50%
{
  const eng = toWords(fx.bengaliPdf.eng), tri = toWords(fx.bengaliPdf.tri), cut = indicMisreads(eng, tri, fx.bengaliPdf.triText);
  const keep = eng.filter((w) => !cut.includes(w));
  const TRUTH = new Set(["2026.131", "15.08.2026", "2026", "31", "206"]);
  const before = numsOf(eng), after = numsOf(keep);
  ok("REAL full circular: the English pass alone has 8 or more numbers that are not on the page", before.filter((n) => !TRUTH.has(n)).length >= 8, JSON.stringify(before));
  ok("REAL full circular: after the cut only the reference 2026/131 and the date 15.08.2026 are left (the stray 19 and 41 are gone)", after.join() === "2026.131,15.08.2026", JSON.stringify(after));
  const kept = keep.map((w) => w.text);
  ok("REAL full circular: the genuine Latin tokens are kept (reference, date, Shramik Kalyan Cell, the logo's SAIL)", kept.includes("HR-CLC/MERIT_AWD/Amnd/2026/131") && kept.includes("15.08.2026") && kept.includes("(Shramik") && kept.includes("Kalyan") && kept.some((t) => t.startsWith("Cell")) && kept.includes("SAIL"), kept.join(" ").slice(0, 200));
  const merged = mergeOcrPasses(textOfWords(keep), "", fx.bengaliPdf.triText);
  const mn = [...numbersOf(merged.text)];
  ok("REAL full circular, after the merge: exactly the numbers the page has (the Bengali digits ২০২৬, ৩১, ২০৬ included) and nothing else", [...TRUTH].every((n) => mn.includes(n)) && mn.every((n) => TRUTH.has(n)), JSON.stringify(mn));
  ok("REAL full circular: the deadline sentence and the room are stored", merged.text.includes("তারিখ ৩১ আগস্ট ২০২৬ পর্যন্ত বর্ধিত করা হয়েছে") && merged.text.includes("কক্ষ নং ২০৬"));
  ok("REAL full circular: Bengali words are not glued where the page has a hyphen, a quote or a bracket (প্রকল্প এর, সিএন ৯ এর, এইচআর সিএলসি)", /প্রকল্প এর/.test(merged.text) && /সিএন ৯ এর/.test(merged.text) && /এইচআর সিএলসি/.test(merged.text) && !/প্রকল্পএর|সিএন৯এর|এইচআরসিএলসি/.test(merged.text), merged.text.slice(0, 600));
}

// ---- the REAL Hindi page of GPAIS: no true number may be lost
for (const [key, id] of [["gpaisHindi", "gpais-hindi"], ["gpaisEnglish", "gpais-english"]] as const) {
  const eng = toWords(fx[key].eng), tri = toWords(fx[key].tri), cut = indicMisreads(eng, tri, fx[key].triText);
  const keep = eng.filter((w) => !cut.includes(w));
  const before = new Set(numsOf(eng)), after = new Set(numsOf(keep)), t = truth(id);
  const foundBefore = [...t].filter((n) => before.has(n)), foundAfter = [...t].filter((n) => after.has(n));
  ok(`REAL ${id}: every true number the English pass had is still there after the cut (${foundBefore.length} before, ${foundAfter.length} after)`, foundBefore.length > 0 && foundAfter.length === foundBefore.length, JSON.stringify([...t].filter((n) => before.has(n) && !after.has(n))));
  ok(`REAL ${id}: every number the cut removes is one the page does not have`, [...before].filter((n) => !after.has(n)).every((n) => !t.has(n)), JSON.stringify([...before].filter((n) => !after.has(n))));
}
{
  const hi = indicMisreads(toWords(fx.gpaisHindi.eng), toWords(fx.gpaisHindi.tri), fx.gpaisHindi.triText);
  const en = indicMisreads(toWords(fx.gpaisEnglish.eng), toWords(fx.gpaisEnglish.tri), fx.gpaisEnglish.triText);
  ok("REAL: the Hindi page loses its gibberish lines (100 or more words) and the English page only the gibberish from its Hindi letterhead (under 20 words)", hi.length >= 100 && en.length > 0 && en.length < 20, `${hi.length} / ${en.length}`);
  const enText = textOfWords(toWords(fx.gpaisEnglish.eng).filter((w) => !en.includes(w)));
  ok("REAL English page: its English sentences are all still there after the cut", ["Revised of GPAIS amount", "Policy Number", "Old Plant Personnel Building", "competent authority"].every((p) => enText.includes(p)), enText.slice(0, 120));
}

// ---- Devanagari and Bengali NUMERALS stay whole (step 43b cut them at their separators: the dry run of the archive showed new numbers 000, 0000, 500)
{
  const pad = (s: string) => `${s} शुल्क देय है और अंतिम तिथि बढ़ा दी गई है`; // enough Indic letters for the page threshold
  const nums = (s: string) => [...numbersOf(indicOnlyText(pad(s)))].join();
  ok("an amount with a comma stays one number: ६,००० = 6000 (it was 000)", nums("रु. ६,००० प्रति माह") === "6000", nums("रु. ६,००० प्रति माह"));
  ok("an amount in lakhs: १,५०,००० = 150000 (it was 50 and 000)", nums("रु. १,५०,००० मात्र") === "150000", nums("रु. १,५०,००० मात्र"));
  ok("two amounts: २,८०० and ७,६०० = 2800 and 7600 (the 2 and the 7 were lost)", nums("२,८०० और ७,६०० रुपये") === "2800,7600", nums("२,८०० और ७,६०० रुपये"));
  ok("a date is a date: २०-०८-२०२६ = 20.08.2026 (it fell into 20, 08, 2026)", nums("दिनांक २०-०८-२०२६ तक") === "20.08.2026", nums("दिनांक २०-०८-२०२६ तक"));
  ok("a session: २०२५-२६ = 2025.26", nums("सत्र २०२५-२६ के लिए") === "2025.26", nums("सत्र २०२५-२६ के लिए"));
  ok("a ratio: ३०:७० = 30.70, a decimal: ६.५ = 6.5", nums("अनुपात ३०:७०") === "30.70" && nums("दर ६.५ प्रतिशत") === "6.5", nums("अनुपात ३०:७०") + " | " + nums("दर ६.५ प्रतिशत"));
  ok("Bengali numerals too: ২০২৬-২৭ = 2026.27, ১,৫০০ = 1500", nums("সময় ২০২৬-২৭ এর জন্য") === "2026.27" && nums("টাকা ১,৫০০ মাত্র") === "1500", nums("সময় ২০২৬-২৭ এর জন্য") + " | " + nums("টাকা ১,৫০০ মাত্র"));
  ok("punctuation AFTER a numeral still separates it from the next word: ২০২৬’-এর is 2026 and এর", indicOnlyText(pad("‘অ্যাওয়ার্ড ২০২৬’-এর জন্য")).split("\n")[0].split(" ").join("|").includes("২০২৬|এর") && nums("‘অ্যাওয়ার্ড ২০২৬’-এর জন্য") === "2026", indicOnlyText(pad("‘অ্যাওয়ার্ড ২০২৬’-এর জন্য")).split("\n")[0]);
  ok("a separator BETWEEN a letter and a digit still splits (সিএন-৯-এর is সিএন ৯ এর), and ASCII digits are still never kept", /সিএন ৯ এর/.test(indicOnlyText(pad("ক্যান্টিন সিএন-৯-এর বিপরীতে"))) && !/[0-9]/.test(indicOnlyText(pad("মূল্য 15,000 টাকা"))));
}

// ---- the guards
{
  const W = (text: string, conf: number, left = 100, top = 100, width = 100, height = 30): TsvWord => ({ lineNo: 0, block: 1, par: 1, line: 1, left, top, width, height, conf, text });
  const indicPage = "বিষয় মেরিট স্কলারশিপ স্কিম আবেদনপত্র জমা দেওয়ার শেষ তারিখ বর্ধিত করা হয়েছে সংশ্লিষ্ট সকল চুক্তিভিত্তিক কর্মীকে";
  const over = W("আগস্ট", 95);
  ok("an English word of 80 over an Indic word is cut", indicMisreads([W("2016", 80)], [over], indicPage).length === 1);
  ok("...but a confident one (85 or more) over the same Indic word is kept: a genuine Latin token inside an Indic line", indicMisreads([W("15.08.2026", 93)], [over], indicPage).length === 0 && indicMisreads([W("15.08.2026", 85)], [over], indicPage).length === 0);
  ok("an English word with no Indic word at its place is kept, however unsure", indicMisreads([W("2016", 10, 600, 100)], [over], indicPage).length === 0);
  ok("an English word covered under 40% is kept (35%), at 40% or more it is cut (45%)", indicMisreads([W("2016", 10, 100, 100, 100, 30)], [W("আগস্ট", 95, 165, 100, 100, 30)], indicPage).length === 0 && indicMisreads([W("2016", 10, 100, 100, 100, 30)], [W("আগস্ট", 95, 155, 100, 100, 30)], indicPage).length === 1);
  ok("a wide English word over TWO Indic words is cut by their cover together (30% each, 60% together), though neither alone reaches 40%", indicMisreads([W("2016", 10, 100, 100, 200, 30)], [W("আগস্ট", 95, 100, 100, 60, 30), W("তারিখ", 95, 240, 100, 60, 30)], indicPage).length === 1 && indicMisreads([W("2016", 10, 100, 100, 200, 30)], [W("আগস্ট", 95, 100, 100, 60, 30)], indicPage).length === 0);
  ok("a page with too few Indic letters is an English page: nothing is cut, so hallucinated marks cannot remove English words", indicMisreads([W("2016", 10)], [W("আগ", 90)], "আগ").length === 0 && indicMisreads([W("2016", 10)], [W("আগ", 90)], "").length === 0);
  ok("a mark alone, or a Latin word, in the Indic pass is not Indic script", indicMisreads([W("2016", 10)], [W("\u09be", 90), W("SAIL", 90)], indicPage).length === 0);
  ok("an Indic numeral counts as Indic script: an English-pass number over ২০২৬ is cut", indicMisreads([W("2016", 40)], [W("২০২৬", 90)], indicPage).length === 1);
  ok("words with no size are ignored", indicMisreads([W("2016", 10, 100, 100, 0, 0)], [over], indicPage).length === 0 && indicMisreads([W("2016", 10)], [W("আগস্ট", 90, 100, 100, 0, 0)], indicPage).length === 0);
  ok("nothing in, nothing out", indicMisreads([], [over], indicPage).length === 0 && indicMisreads([W("2016", 10)], [], indicPage).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
