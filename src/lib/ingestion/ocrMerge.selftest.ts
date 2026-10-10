// src/lib/ingestion/ocrMerge.selftest.ts
// Run:  npx tsx src/lib/ingestion/ocrMerge.selftest.ts
// The fixtures are the REAL output of Tesseract 5.3.4 (CLI, --psm 3) on two scan-like pages (English only; English + Hindi + Bengali):
//   -l eng            -> lab_pageN_english_pass.txt
//   -l hin+eng+ben    -> lab_pageN_indic_pass.txt
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { discardedNumbers, indicOnlyText, mergeOcrPasses, numericTokens } from "./ocrMerge";

const dir = join(__dirname, "__fixtures__");
const fx = (n: string) => readFileSync(join(dir, n), "utf8");
let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

// ---- page 1: an English-only page ----
const p1 = mergeOcrPasses(fx("lab_page1_english_pass.txt"), "", fx("lab_page1_indic_pass.txt"));
for (const good of ["Rs. 15,000/-", "10:00 AM", "05-12-2026", "0315054224P110856231", "Rs. 14,999/-", "31-08-2026", "20.08.2026", "2026/51"]) {
  check(`page 1 keeps the correct reading "${good}"`, p1.text.includes(good));
}
const damaged: [string, RegExp][] = [
  ["Rs. 5,000/- (15,000 misread)", /Rs\. 5,000/],
  ["0:00 AM (10:00 misread)", /(^|[^\d])0:00 AM/],
  ["05-2-2026 (05-12-2026 misread)", /05-2-2026/],
  ["]4,999 (14,999 misread)", /\]4,999/],
  ["0350542246085623] (policy number misread)", /0350542246085623\]/],
  ["3-08-2026 (31-08-2026 misread)", /(^|[^\d])3-08-2026/],
  ["2026/5 (2026/51 misread)", /2026\/5(?!\d)/],
];
for (const [label, re] of damaged) check(`page 1 does NOT contain the damaged reading ${label}`, !re.test(p1.text));
check("page 1 is English-only: no Indic text is added", p1.indicLetters === 0);
check("page 1: the numbers only the Hindi/Bengali pass saw are reported as discarded", p1.discarded.length >= 4 && p1.discarded.every((d) => !numericTokens(fx("lab_page1_english_pass.txt")).includes(d)), JSON.stringify(p1.discarded));
check("page 1: the English page is stored exactly once (the text is not doubled)", p1.text.split("Rs. 15,000/-").length - 1 === 1);

// ---- page 2: a bilingual page ----
const p2 = mergeOcrPasses(fx("lab_page2_english_pass.txt"), "", fx("lab_page2_indic_pass.txt"));
for (const hindi of ["दैनिक वेतन", "आकस्मिक अवकाश", "चिकित्सा अवकाश", "मासिक कुल"]) check(`page 2 keeps the Hindi words "${hindi}"`, p2.text.includes(hindi));
for (const bengali of ["দৈনিক মজুরি", "টাকা", "চুক্তিভিত্তিক"]) check(`page 2 keeps the Bengali words "${bengali}"`, p2.text.includes(bengali));
for (const good of ["16.12.2023", "10:00 AM", "12-12-2026", "Rs. 20,995.30", "Rs. 808/-"]) check(`page 2 keeps the correct English reading "${good}"`, p2.text.includes(good));
for (const [label, re] of [["76.|2.2023 (16.12.2023 misread)", /76\.\|2\.2023/], ["]0:00 AM", /\]0:00 AM/], ["72-2-2026", /72-2-2026/], ["]2-2-2026", /\]2-2-2026/]] as [string, RegExp][]) {
  check(`page 2 does NOT contain the damaged reading ${label}`, !re.test(p2.text));
}
check("page 2: Hindi/Bengali words were added", p2.indicLetters > 40, String(p2.indicLetters));
check("page 2: the Indic block carries no Latin letter and no ASCII digit", !/[0-9A-Za-z]/.test(indicOnlyText(fx("lab_page2_indic_pass.txt"))));
check("page 2: Bengali numerals (৮০৮) are kept, as numerals in their own script", p2.text.includes("৮০৮"));

// ---- the rules, one by one ----
check("a stray few Indic marks on an English page add nothing (page threshold)", indicOnlyText("Hello world\nअब\nfoo bar") === "");
const lines = indicOnlyText("वेतन रु बढ़ोतरी आदेश जारी\nअब\nफिर नीति लागू होगी यहाँ");
check("a line with fewer than 3 Indic letters is dropped when others pass", lines.split("\n").length === 2 && !lines.includes("अब"), lines);
check("a mixed token keeps only its Indic part: 'वेतनRs.15,000/-' -> 'वेतन'", indicOnlyText("वेतनRs.15,000/- के लिए निर्धारित किया गया है\nदैनिक मजदूरी").startsWith("वेतन के"), indicOnlyText("वेतनRs.15,000/- के लिए निर्धारित किया गया है"));
check("Devanagari digits are kept next to words (the Indic model reads its own numerals)", indicOnlyText("वेतन रु १५००० निर्धारित किया गया है").includes("१५०००"));
check("ASCII digits inside an Indic line are never kept", !/[0-9]/.test(indicOnlyText("दैनिक वेतन रु 808/- तथा 20,995.30 निर्धारित किया गया है")));
check("text with no Indic script at all gives an empty string", indicOnlyText("The quick brown fox 15,000") === "" && indicOnlyText("") === "");

// ---- fallback and ordering ----
const fb = mergeOcrPasses("", "", "Rs. 5,000/- वेतन");
check("if the English pass produced nothing, the other text is used in full and FLAGGED", fb.fellBackToIndicPass && fb.text.includes("Rs. 5,000/-") && fb.discarded.length === 0);
check("a whitespace-only English pass counts as nothing", mergeOcrPasses("  \n ", "", "x").fellBackToIndicPass);
const ord = mergeOcrPasses("ENGLISH TEXT 15,000", "TABLE | ROW", "दैनिक वेतन रु तथा मासिक कुल रु निर्धारित किया गया है");
check("order: English text, then the rebuilt table, then the Indic words", ord.text.indexOf("ENGLISH TEXT") < ord.text.indexOf("TABLE | ROW") && ord.text.indexOf("TABLE | ROW") < ord.text.indexOf("दैनिक"), ord.text);
check("an empty table adds nothing", !mergeOcrPasses("ENGLISH", "   ", "").text.includes("TABLE"));
check("numericTokens finds amounts, dates, times, codes", numericTokens("Rs. 15,000/- at 10:00 on 05-12-2026 no. 0315054224").join(" ") === "15,000 10:00 05-12-2026 0315054224", numericTokens("Rs. 15,000/- at 10:00 on 05-12-2026 no. 0315054224").join(" "));
check("discardedNumbers lists each unseen number once", discardedNumbers("a 15,000", "a 5,000 b 5,000 c 15,000").join("|") === "5,000");

console.log(`\nocrMerge selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
