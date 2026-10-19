// src/lib/ingestion/currency.ts
//
// THE INDIAN RUPEE SIGN (₹, U+20B9) IN THE TEXT OF A CIRCULAR (step 42b). It is printed before amounts all through the circulars, and OCR cannot read it:
// the English model of Tesseract has no rupee glyph at all, and on 342 degraded renders (19 Oct 2026, 19 font faces) it wrote the sign as 2, 7, 3, %, ¥, €, ®,
// =, ~, *, X, t, F or Z, or dropped it. When the sign touches the amount, a digit-like guess FUSES into the number: `₹15,000` became `215,000` and `715,000`,
// `₹112.50` became `2112.50`. That is a wrong amount that looks right; it caused the invented "275,000" of the gift-card circular.
//
// WHAT THE TEXT ALONE CAN DO (the glyph itself is a different job: it needs the page image): find an amount with ONE EXTRA LEADING DIGIT (2, 3 or 7, the
// digits seen) when the SAME PAGE also states the same amount without that digit (`(215,000)` with `Rs 15,000` elsewhere), and record it as UNCONFIRMED, so the
// answer card refuses an answer that rests on it (circularAnswer.ts, the confirmation gate). It cannot know the truth: a page may state both `15,000` and
// `215,000` for real, which is rare (the shorter amount must have 4 or more digits, and stand at least as often as the longer). A symbol written before an amount
// where no symbol can belong (`% 15,000`, `¥ 1,50,000/-`) is reported too: it is the rupee sign read as a symbol (and a picture of the printed sign).
//
// Pure; unit-tested by currency.selftest.ts.

import { storedPageTexts, type NewCheck } from "../search/pageChecks";
import { asciiDigits, dashesBetweenDigits, numberContext } from "./readingCheck";

export const RUPEE_SIGN = "\u20b9";
/** What may stand in front of an amount to say it is in rupees, besides the sign: Rs, Rs., INR, Rupees, and Hindi रु / रू. */
export const RUPEE_MARK_WORDS = ["rs", "inr", "rupees", "rupee", "\u0930\u0941", "\u0930\u0942"];
/** The digits a printed rupee sign was seen to fuse into an amount as. */
export const SLOT_DIGITS = ["2", "3", "7"];
/** Symbols that never belong in front of an amount in a circular (a percent sign comes AFTER its number): when one stands there, it is the rupee sign misread. */
export const SLOT_SYMBOLS = ["%", "\u00a5", "\u20ac", "\u00ae"];
export const RUPEE_SLOT_READER = "rupee-slot";

const HANDWRITTEN = /\[handwritten:[^\]]*\]/gi;
const NUMBER = /\d[\d,]*(?:[./:-]\d[\d,]*)*/g;
/** The same canonical form as readingCheck.numbersOf: no thousands commas, every separator of a date, time or reference written ".". */
const canon = (raw: string) => raw.replace(/,/g, "").replace(/[/:-]/g, ".");
const isYear = (n: string) => /^(199\d|20[0-3]\d)$/.test(n);
const digitCount = (n: string) => n.replace(/\D/g, "").length;
const prepare = (text: string) => dashesBetweenDigits(asciiDigits(String(text ?? "").replace(HANDWRITTEN, " "))).replace(/\bcol\d+:/gi, " ");

export interface Suspect {
  /** The amount with the extra leading digit, in canonical form. */
  value: string;
  /** The amount the page also states, without it. */
  base: string;
  context: string;
}

/** Amounts that are an amount the page also states, with one more digit (2, 3 or 7) in front of it: probably the rupee sign read as a digit. */
export function attachedDigitSuspects(text: string): Suspect[] {
  const t = prepare(text);
  const occurrences = new Map<string, number>();
  for (const m of t.matchAll(NUMBER)) {
    const c = canon(m[0]);
    if (digitCount(c) >= 2) occurrences.set(c, (occurrences.get(c) ?? 0) + 1);
  }
  const out: Suspect[] = [];
  for (const [value, count] of occurrences) {
    if (!SLOT_DIGITS.includes(value[0])) continue;
    const base = value.slice(1);
    if (!/^[1-9]/.test(base) || digitCount(base) < 4) continue; // "026.52" is a reference number; a short base is too common to conclude from
    if (isYear(value) || isYear(base)) continue; // 931.2025 is a reference number that ends with the year
    const baseCount = occurrences.get(base);
    if (!baseCount || baseCount < count) continue;
    out.push({ value, base, context: numberContext(String(text ?? ""), value) ?? "" });
  }
  return out;
}

export interface JunkSlot {
  glyph: string;
  /** The amount after it, in canonical form. */
  amount: string;
  context: string;
}

/** A symbol that cannot belong before an amount, standing right before one: the rupee sign read as that symbol. */
export function rupeeSlotJunk(text: string): JunkSlot[] {
  const t = prepare(text);
  const out: JunkSlot[] = [];
  const re = new RegExp(`(^|[^\\d${SLOT_SYMBOLS.join("")}])([${SLOT_SYMBOLS.join("")}])\\s?(\\d[\\d,]*(?:\\.\\d+)?)`, "g");
  for (const m of t.matchAll(re)) {
    const amount = canon(m[3]);
    if (digitCount(amount) < 2) continue;
    const at = (m.index ?? 0) + m[1].length;
    out.push({ glyph: m[2], amount, context: t.slice(Math.max(0, at - 30), at + m[0].length + 30).replace(/\s+/g, " ").trim() });
  }
  return out;
}

/** The checks of the pages of one circular: each amount with a stray leading digit is UNCONFIRMED (nothing is confirmed by this check). */
export function slotChecks(pages: { page: number; text: string }[]): NewCheck[] {
  const out: NewCheck[] = [];
  for (const p of pages) {
    const suspects = attachedDigitSuspects(p.text);
    if (suspects.length) out.push({ page: p.page, status: "slot", confirmed: [], unconfirmed: suspects.map((s) => s.value), secondOnly: [], reader: RUPEE_SLOT_READER });
  }
  return out.sort((a, b) => a.page - b.page);
}

/** The same from a circular's stored chunks (the input of checkRowsFor). */
export function slotChecksFor(chunks: { page: number | null; index: number; text: string }[]): NewCheck[] {
  return slotChecks([...storedPageTexts(chunks)].map(([page, text]) => ({ page, text })));
}
