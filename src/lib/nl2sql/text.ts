// src/lib/nl2sql/text.ts

/**
 * I normalize a question so the same question typed slightly differently maps
 *  to one key (case, spacing, stray punctuation). I KEEP double quotes: they
 *  change the meaning (exact match).
 */
export function normalizeQuestion(q: string): string {
  return (q || "")
    .toLowerCase()
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^a-z0-9\u0900-\u097F\u0980-\u09FF" ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** I collapse whitespace so two SQL strings that differ only in layout compare equal. */
export function normalizeSql(sql: string): string {
  return (sql || "").replace(/\s+/g, " ").replace(/;+\s*$/, "").trim().toLowerCase();
}
