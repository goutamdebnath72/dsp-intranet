/**
 * The reading check: two independent readings of one page (the OCR pipeline's and a second reader's) compared on what matters most, the
 * numbers. Two readers that fail in different ways seldom make the same mistake, so I treat a number both have as confirmed, and a number only one
 * has as a reason to look at the page. The check also catches two failures a score never shows: letters from a script that does not belong in the
 * text (a model wrote Cyrillic "М" and "И" inside a Latin name), and a second reading that stopped early (a model that began repeating
 * blank table rows and never reached the end of the page, or a reply cut off at the length limit).
 *
 * Pure functions, no database and no model: the callers decide what is stored and shown.
 */
import { STOPPED_MARKER } from "./pageReader";

export type CheckStatus =
  /** every number is in both readings */
  | "agreed"
  /** at least one number is in only one of the readings, or a letter from a wrong script was found */
  | "differences"
  /** the second reading stopped early, so I do NOT hold against the first a number only the first reading has: it is simply not covered */
  | "partial"
  /** the second reading is empty or far too short to compare */
  | "second_unusable";

export interface OddScript {
  reader: "first" | "second";
  chars: string;
  context: string;
}

export interface PageCheck {
  status: CheckStatus;
  /** numbers both readings have */
  confirmed: string[];
  /** important numbers only the first (pipeline) reading has: not confirmed by the second */
  onlyFirst: string[];
  /** important numbers only the second reading has: the first may have missed them (or the second invented them) */
  onlySecond: string[];
  /** small plain numbers (under 4 digits, no separator) that only one reading has: I count them, but they do not raise the status, since they are mostly page furniture and junk from garbled lines */
  minorOnlyFirst: string[];
  minorOnlySecond: string[];
  /** numbers inside [handwritten: ...] in the readings (only a model can read them): they can CONFIRM a number of the other reading, but I never flag them on their own */
  handwritten: string[];
  oddScripts: OddScript[];
  /** why the second reading cannot be fully used, if so */
  secondProblem?: string;
}

const DEVANAGARI_DIGITS = /[\u0966-\u096F]/g;
const BENGALI_DIGITS = /[\u09E6-\u09EF]/g;

/** Writes the Devanagari and Bengali digits as the digits 0-9. */
export function asciiDigits(s: string): string {
  return s
    .replace(DEVANAGARI_DIGITS, (c) => String(c.charCodeAt(0) - 0x0966))
    .replace(BENGALI_DIGITS, (c) => String(c.charCodeAt(0) - 0x09e6));
}

/** I treat a dash between digits, written as an en dash, an em dash, a minus sign or a spaced hyphen, as the same separator as a plain hyphen: "(2026 - 2027)" and "(2026\u20132027)" are "(2026-2027)". */
export function dashesBetweenDigits(s: string): string {
  return s.replace(/(\d)\s*[\u2010-\u2015\u2212]\s*(?=\d)/g, "$1-").replace(/(\d)\s+-\s+(?=\d)/g, "$1-");
}

/**
 * Gives the numbers of a text, each in one canonical form: no thousands commas, and the separators of dates, times and references all written as ".",
 * so 20-08-2026, 20.08.2026 and 20/08/2026 are one number. I do not count a lone digit (list numbers, "(i)") as a number worth comparing.
 */
export function numbersOf(text: string, withHandwritten = false): Set<string> {
  const out = new Set<string>();
  for (const m of dashesBetweenDigits(asciiDigits(withoutNoise(text, withHandwritten))).matchAll(/\d[\d,]*(?:[./:-]\d[\d,]*)*/g)) {
    const canon = m[0].replace(/,/g, "").replace(/[/:-]/g, ".");
    if (canon.length >= 2) out.add(canon);
  }
  return out;
}

const HANDWRITTEN = /\[handwritten:[^\]]*\]/gi;

/** Returns the text without what is not part of the page: the pipeline's own "col11:" labels and the [handwritten: ...] spans. */
function withoutNoise(text: string, keepHandwritten = false): string {
  return (keepHandwritten ? text : text.replace(HANDWRITTEN, " ")).replace(/\bcol\d+:/gi, " ");
}

/** The numbers inside [handwritten: ...] spans. */
export function handwrittenNumbers(text: string): string[] {
  const out = new Set<string>();
  for (const span of text.match(HANDWRITTEN) ?? []) for (const n of numbersOf(span, true)) out.add(n);
  return [...out];
}

/** An important number is one with four digits or more, or one with a separator (a date, an amount with decimals, a phone or reference number). */
export function isMajor(n: string): boolean {
  return n.replace(/\D/g, "").length >= 4 || n.includes(".");
}

/** Gives the words around the first place where a number (in its canonical form) stands in a text, so a human can judge it. null if it is not there. */
export function numberContext(text: string, canon: string, radius = 36): string | null {
  const t = dashesBetweenDigits(asciiDigits(text));
  for (const m of t.matchAll(/\d[\d,]*(?:[./:-]\d[\d,]*)*/g)) {
    if (m[0].replace(/,/g, "").replace(/[/:-]/g, ".") !== canon) continue;
    const i = m.index ?? 0;
    return t.slice(Math.max(0, i - radius), i + m[0].length + radius).replace(/\s+/g, " ").trim();
  }
  return null;
}

const UNEXPECTED = /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Arabic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Hebrew}\p{Script=Thai}]+/gu;

/** Finds letters from a script that does not belong in these circulars (Latin, Devanagari and Bengali do), with where they stand. */
export function oddScriptsIn(text: string, reader: "first" | "second"): OddScript[] {
  const out: OddScript[] = [];
  for (const m of text.matchAll(UNEXPECTED)) {
    const i = m.index ?? 0;
    out.push({ reader, chars: m[0], context: text.slice(Math.max(0, i - 14), i + m[0].length + 14).replace(/\s+/g, " ") });
    if (out.length >= 10) break;
  }
  return out;
}

/** I cannot compare a second reading shorter than this share of the first in any useful way. */
export const MIN_LENGTH_SHARE = 0.15;

export function checkReadings(first: string, second: string): PageCheck {
  const odd = [...oddScriptsIn(first, "first"), ...oddScriptsIn(second, "second")];
  const n1 = numbersOf(first, true);
  const handwritten = [...new Set([...handwrittenNumbers(first), ...handwrittenNumbers(second)])];
  const trimmed = second.replace(STOPPED_MARKER, "").trim();
  const split = (xs: string[]) => ({ major: xs.filter(isMajor), minor: xs.filter((x) => !isMajor(x)) });
  if (!trimmed || (first.trim().length > 200 && trimmed.length < MIN_LENGTH_SHARE * first.trim().length)) {
    const f = split([...n1]);
    return { status: "second_unusable", confirmed: [], onlyFirst: f.major, onlySecond: [], minorOnlyFirst: f.minor, minorOnlySecond: [], handwritten, oddScripts: odd, secondProblem: trimmed ? "the second reading is far shorter than the first" : "the second reading is empty" };
  }
  const n2 = numbersOf(second);
  const n2All = numbersOf(second, true);
  const confirmed = [...n1].filter((n) => n2All.has(n));
  const f = split([...n1].filter((n) => !n2All.has(n)));
  const g = split([...n2].filter((n) => !n1.has(n)));
  const stopped = second.includes(STOPPED_MARKER);
  let status: CheckStatus;
  if (stopped) status = g.major.length || odd.length ? "differences" : "partial";
  else status = f.major.length || g.major.length || odd.length ? "differences" : "agreed";
  return {
    status, confirmed, onlyFirst: f.major, onlySecond: g.major, minorOnlyFirst: f.minor, minorOnlySecond: g.minor, handwritten, oddScripts: odd,
    secondProblem: stopped ? "the second reading stopped early (the reply was cut off or the model began repeating itself)" : undefined,
  };
}
