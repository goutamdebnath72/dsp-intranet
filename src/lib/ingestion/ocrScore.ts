// src/lib/ingestion/ocrScore.ts
//
// SCORING A READING AGAINST WHAT A PAGE REALLY SAYS (eval/ocr-pilot-truth.json, transcribed by eye). Pure: used by scripts/ocr-pilot.ts, which
// reads the same pages with every reader (Tesseract as it was, the new pipeline, Gemini, a local model) and prints one comparable score each.
//
//   numbers   every key number must be read EXACTLY (commas ignored), standing alone: "808" is not found inside "1808";
//   phrases   key words and names must be there (case, spaces and punctuation ignored; Hindi and Bengali letters count);
//   together  a label and its value must stand on ONE line: this is what a table reader must get right ("Kaushal Award ... 500");
//   forbidden wrong readings seen before: each one found is a mistake;
//   garbage   grid-line characters stuck to digits ("3350.00]"), a sign of a damaged table.

import { normalizeForQuote } from "@/lib/search/circularAnswer";

export interface Truth {
  id: string;
  numbers: string[];
  phrases: string[];
  together: string[][];
  forbidden: string[];
}

export interface Score {
  numbersFound: number;
  numbersTotal: number;
  missingNumbers: string[];
  phrasesFound: number;
  phrasesTotal: number;
  missingPhrases: string[];
  togetherFound: number;
  togetherTotal: number;
  missingTogether: string[];
  forbiddenFound: string[];
  garbage: number;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The text with the commas inside numbers removed ("15,000" -> "15000"). */
function noCommas(s: string): string {
  return s.replace(/(\d),(?=\d)/g, "$1");
}

/** True if the number stands alone in the text: not inside a longer number or word. */
export function hasNumber(text: string, number: string): boolean {
  const t = noCommas(number.trim()).split(/\s+/).map(esc).join("\\s+");
  return new RegExp(`(?<![0-9A-Za-z])${t}(?![0-9A-Za-z])`, "i").test(noCommas(text));
}

function isNumberLike(part: string): boolean {
  return /\d/.test(part) && !/\p{L}{3,}/u.test(part);
}

function partOnLine(line: string, part: string): boolean {
  return isNumberLike(part) ? hasNumber(line, part) : normalizeForQuote(line).includes(normalizeForQuote(part));
}

export function scoreText(text: string, t: Truth): Score {
  const lines = text.split(/\r?\n/);
  const nText = normalizeForQuote(text);
  const missingNumbers = t.numbers.filter((n) => !hasNumber(text, n));
  const missingPhrases = t.phrases.filter((p) => !nText.includes(normalizeForQuote(p)));
  const missingTogether = t.together.filter((g) => !lines.some((l) => g.every((part) => partOnLine(l, part)))).map((g) => g.join(" + "));
  // a forbidden reading is a WRONG ONE like "3350.00]": its punctuation is the whole point, so it is compared as written (case and spaces aside)
  const flat = text.toLowerCase().replace(/\s+/g, " ");
  const forbiddenFound = t.forbidden.filter((f) => flat.includes(f.toLowerCase().replace(/\s+/g, " ")));
  const garbage = (text.match(/\d[\]|_]|[\]|_]\d/g) ?? []).length;
  return {
    numbersFound: t.numbers.length - missingNumbers.length,
    numbersTotal: t.numbers.length,
    missingNumbers,
    phrasesFound: t.phrases.length - missingPhrases.length,
    phrasesTotal: t.phrases.length,
    missingPhrases,
    togetherFound: t.together.length - missingTogether.length,
    togetherTotal: t.together.length,
    missingTogether,
    forbiddenFound,
    garbage,
  };
}

/**
 * Where two readers stand on the truth numbers: found by both (confirmed), by only one (to be checked), by neither (lost).
 * This is the idea of the two-reader design: a number both readers give is very probably right.
 */
export function agreement(a: string, b: string, numbers: string[]): { both: number; onlyA: number; onlyB: number; neither: number } {
  let both = 0, onlyA = 0, onlyB = 0, neither = 0;
  for (const n of numbers) {
    const x = hasNumber(a, n), y = hasNumber(b, n);
    if (x && y) both++; else if (x) onlyA++; else if (y) onlyB++; else neither++;
  }
  return { both, onlyA, onlyB, neither };
}
