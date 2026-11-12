// src/lib/ui/identifiers.ts
//
// AN IDENTIFIER IS NOT AN AMOUNT. A bank account number, a policy number, a cheque number, an IFSC code, a ticket or circular number is a label: its digits are copied as the circular prints them, in
// one unbroken run, never grouped with commas ("34,42,04,00,623") and never turned into a number (a 16 to 18 digit number loses its last digits in a JavaScript number). Rupee amounts keep their
// Indian digit grouping. This module is the one place that tells the two apart, for the engine (text it writes) and the screen (cells it draws). Pure, no imports.

/** words that say a number is a label, not a sum */
const ID_WORDS = /(?:account|a\/c|acct|ifsc|micr|policy|cheque|check|chq|dd|ticket|pin|id|reference|ref|no\.?|number|code|utr|txn|transaction|mobile|phone|aadhaar|aadhar|pan|gstin|serial|sl\.?)/i;

/** A heading of a column (or a label before a number) that names an identifier. */
export function isIdentifierLabel(label: string | undefined | null): boolean {
  const t = (label || "").trim();
  return !!t && ID_WORDS.test(t) && !/\b(?:amount|rate|premium|fee|salary|wage|deposit|rent|cost|total|sum|value|price|charge|count|quantity)\b|\b(?:number|no\.?|nos\.?) of\b/i.test(t);
}

/** A run of digits that can only be an identifier: nine or more digits with no decimal part, no rupee sign, no "/-". Amounts of a crore or more are written with the rupee sign or a word. */
export function isLongDigitRun(digits: string): boolean {
  return /^\d{9,}$/.test((digits || "").trim());
}

/**
 * Text with the separators taken out of the digit runs that are identifiers: after a word like "account number", "A/c", "policy", "cheque", "IFSC", "ticket" (within a few characters), and any
 * run of nine or more digits that was grouped by commas or spaces without a rupee sign before it. Anything with a rupee sign, "Rs", a decimal point or "/-" is an amount and is not touched.
 */
export function stripIdentifierSeparators(text: string): { text: string; changed: string[] } {
  const changed: string[] = [];
  let out = text || "";
  // 1. a label, then a grouped run: "Account Number: 34,42,04,00,623"
  out = out.replace(/((?:account(?:\s+(?:number|no\.?))?|a\/c(?:\s*no\.?)?|acct\.?(?:\s*no\.?)?|policy(?:\s+(?:number|no\.?))?|cheque(?:\s+(?:number|no\.?))?|chq\.?(?:\s*no\.?)?|ticket(?:\s+(?:number|no\.?))?)\s*[:\-#]?\s*)(\d{1,4}(?:[,\s]\d{2,4}){2,6})(?![\d,]*\/-|\.\d)/gi, (m, label: string, run: string) => {
    const digits = run.replace(/[,\s]/g, "");
    if (digits === run) return m;
    changed.push(`${run} -> ${digits}`);
    return `${label}${digits}`;
  });
  // 2. any grouped run of nine or more digits with no rupee sign in front and no "/-" or decimals after
  out = out.replace(/(^|[^\d₹.,])(?<![₹]\s)(?<!Rs\.?\s?)(?<!INR\s?)(\d{1,3}(?:,\d{2,3}){3,5})(?![\d]|\.\d|\/-|,\d)/g, (m, pre: string, run: string) => {
    const digits = run.replace(/,/g, "");
    if (!isLongDigitRun(digits)) return m;
    changed.push(`${run} -> ${digits}`);
    return `${pre}${digits}`;
  });
  return { text: out, changed };
}
