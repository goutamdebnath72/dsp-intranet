// src/lib/ingestion/ocrMerge.ts
//
// How the two OCR passes of one page are combined. Pure functions, no I/O, tested in ocrMerge.selftest.ts.
//
// WHY (measured, not assumed -- see ocrMerge.selftest.ts for the exact outputs of the real engine on a scan-like page):
//   * The ENGLISH pass reads Latin letters and digits correctly: "Rs. 15,000/-", "10:00 AM", "05-12-2026", a 19-character
//     policy number. On a Hindi line it produces gibberish LETTERS, but its digits are still right.
//   * The HINDI+ENGLISH+BENGALI pass reads Hindi and Bengali properly, but it damages Latin digits and codes:
//     "Rs. 15,000/-" -> "Rs. 5,000/-", "10:00 AM" -> "0:00 AM", "16.12.2023" -> "76.|2.2023", "14,999" -> "]4,999".
//   Until now BOTH full texts were stored, so every number existed twice -- once right, once wrong -- and search and the
//   synthesis could quote either. A wrong value was therefore never "an OCR error you can see", it was a coin toss.
//
// RULE: the English pass is kept in full. From the Hindi/Bengali pass ONLY its Indic-script words are kept; every Latin
// letter and digit it produced is thrown away. Hindi and Bengali stay searchable; no contradicting copy of a number can
// be stored.

/** Bump this whenever the merge rules below change, OR the table rebuilding (tableReconstruction.ts) changes what it adds to a page's
 *  text: a saved reading made by an older rule is then ignored by the re-read tool's cache.
 *  2 = the table header fix (a roster page used to get a 60,000-character column dump).
 *  4 = English-pass words that sit where the Hindi/Bengali pass reads Indic script are cut before the merge (indicMisreads.ts).
 *  5 = the Indic words of a line are split at punctuation (a hyphen, a quote, a bracket) and no longer glued ("প্রকল্পএর"). */
export const OCR_MERGE_VERSION = 5;

/** Devanagari, Bengali, Vedic extensions, Devanagari Extended, zero-width joiners (needed inside conjuncts). */
const INDIC_CHAR = /[\u0900-\u097F\u0980-\u09FF\u1CD0-\u1CFF\uA8E0-\uA8FF\u200C\u200D]/;
/** An actual letter (not a vowel sign, digit or punctuation): what proves a token is a word. */
const INDIC_LETTER = /[\u0904-\u0939\u093D\u0950\u0958-\u0961\u0985-\u09B9\u09BD\u09CE\u09DC-\u09E1\u09F0\u09F1]/;

/** Devanagari and Bengali DIGITS (०-९, ০-৯): numerals the Indic model reads in their own script -- not the Latin-digit damage. */
const INDIC_DIGIT = /[\u0966-\u096F\u09E6-\u09EF]/;

/** Punctuation that stands BETWEEN two words in running text: a hyphen or dash, a quote, a bracket, a colon, a semicolon, a comma. It is where a Bengali suffix attaches
 *  ("প্রকল্প)’-এর") and it must not glue two words into one ("প্রকল্পএর"). Other OCR junk inside a word (| ~ ^ _ ...) is still dropped, which joins a broken word back together. */
const WORD_SEPARATORS = /[-\u2010-\u2015\u2018\u2019\u201C\u201D'"()[\]{}:;,]+/;

/** A line needs at least this many Indic letters to count: a stray hallucinated mark is not a sentence. */
export const MIN_LINE_INDIC_LETTERS = 3;
/** A page needs at least this many in total, or it is treated as having no Indic text at all (English-only page). */
export const MIN_PAGE_INDIC_LETTERS = 12;

const countLetters = (s: string): number => {
  let n = 0;
  for (const c of s) if (INDIC_LETTER.test(c)) n++;
  return n;
};

/** A token the Hindi/Bengali pass read as a word or numeral of its own script: at least one Indic letter, or an Indic digit (marks alone do not count). */
export function isIndicWord(token: string): boolean {
  let t = "";
  for (const c of token || "") if (INDIC_CHAR.test(c)) t += c;
  return countLetters(t) > 0 || [...t].some((c) => INDIC_DIGIT.test(c));
}

/** Only the Indic-script words of a text (Latin letters, ASCII digits and ASCII punctuation removed). "" if the page has too little. */
export function indicOnlyText(text: string): string {
  const kept: string[] = [];
  let total = 0;
  for (const line of (text || "").split(/\r?\n/)) {
    const tokens: string[] = [];
    let letters = 0;
    for (const raw of line.split(/\s+/).flatMap((w) => w.split(WORD_SEPARATORS))) {
      if (!raw) continue;
      let t = "";
      for (const c of raw) if (INDIC_CHAR.test(c)) t += c;
      const l = countLetters(t);
      const hasDigit = [...t].some((c) => INDIC_DIGIT.test(c));
      // kept: a word, or a numeral written in Indic digits. Not kept: joiners/marks alone. Latin digits never get here.
      if (l > 0 || hasDigit) {
        tokens.push(t);
        letters += l;
      }
    }
    if (letters >= MIN_LINE_INDIC_LETTERS) {
      kept.push(tokens.join(" "));
      total += letters;
    }
  }
  return total >= MIN_PAGE_INDIC_LETTERS ? kept.join("\n") : "";
}

/** Numeric tokens (amounts, dates, times, codes) -- used only to REPORT how often the two readers disagreed. */
export function numericTokens(text: string): string[] {
  return (text || "").match(/\d[\d.,:/\-]*\d|\d/g) ?? [];
}

/** Numbers the Hindi/Bengali pass read that the English pass did not: each one is a probable misreading that is now discarded. */
export function discardedNumbers(eng: string, tri: string): string[] {
  const have = new Set(numericTokens(eng));
  const out: string[] = [];
  for (const t of numericTokens(tri)) if (!have.has(t) && !out.includes(t)) out.push(t);
  return out;
}

export interface MergedPage {
  text: string;
  /** Indic letters kept from the Hindi/Bengali pass (0 = an English-only page). */
  indicLetters: number;
  /** Numbers only the Hindi/Bengali pass saw: discarded as probable misreadings. */
  discarded: string[];
  /** The English pass produced nothing, so the Hindi/Bengali text had to be used in full (its Latin digits are NOT trustworthy). */
  fellBackToIndicPass: boolean;
}

/**
 * eng:   text of the English pass.   table: the table reconstructed from the English pass's word positions ("" if none).
 * tri:   text of the Hindi+English+Bengali pass.
 */
export function mergeOcrPasses(eng: string, table: string, tri: string): MergedPage {
  const engText = eng || "";
  if (!engText.trim()) {
    // The English pass failed or found nothing: the other pass is all there is. Better than an empty page, but flagged.
    return { text: (tri || "") + "\n", indicLetters: countLetters(tri || ""), discarded: [], fellBackToIndicPass: true };
  }
  const indic = indicOnlyText(tri || "");
  const parts = [engText, "\n"];
  if (table && table.trim()) parts.push("\n", table, "\n");
  if (indic) parts.push(indic, "\n");
  return { text: parts.join(""), indicLetters: indic ? countLetters(indic) : 0, discarded: discardedNumbers(engText + "\n" + (table || ""), tri || ""), fellBackToIndicPass: false };
}
