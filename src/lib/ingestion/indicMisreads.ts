// src/lib/ingestion/indicMisreads.ts
//
// ENGLISH-PASS WORDS THAT ARE MISREADINGS OF INDIC GLYPHS (step 43a). Each page is read twice (ocr.ts): with the English model and with the Hindi + English
// + Bengali model, and the merge (ocrMerge.ts) keeps the English reading in FULL. On a Hindi or Bengali line the English model writes gibberish, and where
// the line holds numerals it invents NUMBERS from them. Measured on a real fully Bengali circular (the Merit Award Scheme amendment, 19 Oct 2026): the page
// really has `2026/131`, `15.08.2026` and, in Bengali digits, `২০২৬`, `৩১`, `২০৬`; the upload stored those AND 14 numbers that are not on the page (93, 20230,
// 99, 516, 203, 91, 200, 41, 855, 2016, 5.97, 561, 20170, 42), with nine lines of Latin gibberish. A wrong number that looks like a number is worse than none.
//
// THE RULE (decided by the two readings' POSITIONS, not by guessing which pass to trust): an English-pass word is cut when
//   1. the Hindi/Bengali pass read INDIC SCRIPT where that word stands (at least half of the word's box lies inside the box of an Indic word or numeral), and
//   2. the English pass itself was not confident about it (confidence below CONFIDENT_ENGLISH_WORD).
// A genuine Latin token inside an Indic line (a reference number, a date, "Shramik Kalyan Cell") is read by the Indic pass as Latin, so it is not covered by an
// Indic word, and the English model is confident about it (88 to 97 on the Bengali page); the invented numbers scored 0 to 81. A page with too few Indic
// letters is an English page: nothing is cut there, so a few stray marks the Indic model hallucinates cannot remove English words.
//
// Pure; unit-tested on three real pages by indicMisreads.selftest.ts.

import { indicOnlyText, isIndicWord } from "./ocrMerge";
import type { TsvWord } from "./ruledTable";

/** An English-pass word at least this confident stays, even where the Indic pass sees Indic script. */
export const CONFIDENT_ENGLISH_WORD = 85;
/** The share of the English word's box that must lie inside an Indic word's box. */
export const MIN_COVER = 0.5;

const coverOf = (w: TsvWord, t: TsvWord): number => {
  const x = Math.max(0, Math.min(w.left + w.width, t.left + t.width) - Math.max(w.left, t.left));
  const y = Math.max(0, Math.min(w.top + w.height, t.top + t.height) - Math.max(w.top, t.top));
  return (x * y) / (w.width * w.height);
};

/** The English-pass words to cut: those the Indic pass read as Indic script, and the English pass was not sure of. */
export function indicMisreads(eng: TsvWord[], tri: TsvWord[], triText: string): TsvWord[] {
  if (!indicOnlyText(triText)) return []; // fewer Indic letters than a page needs: an English page
  const indic = tri.filter((t) => t.width > 0 && t.height > 0 && isIndicWord(t.text));
  if (!indic.length) return [];
  return eng.filter((w) => w.width > 0 && w.height > 0 && w.conf < CONFIDENT_ENGLISH_WORD && indic.some((t) => coverOf(w, t) >= MIN_COVER));
}
