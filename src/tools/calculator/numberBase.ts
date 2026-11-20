// src/tools/calculator/numberBase.ts
//
// A NUMBER TYPED IN A BASE (pure, no React): the typed line that opens the scientific calculator on a value in binary, octal, decimal or hexadecimal. The reader is strict, so that no ordinary line is taken for it:
//   a number with its own prefix: "0xFF", "0b1010", "0o17" (and "0xFF to decimal", "0b1010 in hex");
//   a number and where to write it: "255 to binary", "10 in hex", "1010 binary to decimal", "ff hex to octal".
// A number with no base word is decimal; the letters A-F are digits only when the number is said to be hexadecimal (a bare "ff" is not a number). Only whole numbers, up to 2^53 - 1 (the largest a float holds
// exactly): a longer number is not read, not rounded. Nothing is guessed: a digit the base does not have ("0b102", "19 binary to hex") is no number.

import { BASE_LIMIT, type Base } from "./calcEngine";

export interface BaseAsk {
  /** the value */
  value: number;
  /** the base the calculator opens in: the one asked for, or the one the number was typed in when none was asked for */
  base: Base;
  /** the base the number was typed in */
  from: Base;
}

const WORD: Record<string, Base> = { binary: 2, bin: 2, octal: 8, oct: 8, decimal: 10, dec: 10, hexadecimal: 16, hex: 16 };
const PREFIX: Record<string, Base> = { "0x": 16, "0b": 2, "0o": 8 };
const DIGITS: Record<Base, RegExp> = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i };
const WORDS = Object.keys(WORD).join("|");
const TO = "(?:to|in|as|into)";

/** the whole number written in the base (digits only, no sign, no prefix), or null: wrong digits, no digits, or beyond 2^53 - 1 */
export function valueOfDigits(digits: string, base: Base): number | null {
  if (!DIGITS[base].test(digits)) return null;
  const v = parseInt(digits, base);
  return Number.isFinite(v) && v <= BASE_LIMIT && v.toString(base) === digits.toLowerCase().replace(/^0+(?=.)/, "") ? v : null;
}

/** the typed line as a number in a base, or null */
export function parseBaseLine(raw: string): BaseAsk | null {
  const q = (raw ?? "").trim().toLowerCase().replace(/[?.!]+$/, "").replace(/\s+/g, " ");
  if (!q || q.length > 80) return null;
  // 0xFF, 0b1010, 0o17, each alone or with "to/in <base>"
  const p = new RegExp(String.raw`^(0[xbo])([0-9a-f_]+)(?:\s+${TO}\s+(${WORDS}))?$`).exec(q);
  if (p) {
    const from = PREFIX[p[1]];
    const v = valueOfDigits(p[2].replace(/_/g, ""), from);
    return v === null ? null : { value: v, from, base: p[3] ? WORD[p[3]] : from };
  }
  // 255 to binary, 1010 binary to decimal, ff hex to octal
  const m = new RegExp(String.raw`^([0-9a-f]+)(?:\s+(${WORDS}))?\s+${TO}\s+(${WORDS})$`).exec(q);
  if (m) {
    const from = m[2] ? WORD[m[2]] : 10;
    const to = WORD[m[3]];
    if (from === to) return null;
    const v = valueOfDigits(m[1], from);
    return v === null ? null : { value: v, from, base: to };
  }
  return null;
}
