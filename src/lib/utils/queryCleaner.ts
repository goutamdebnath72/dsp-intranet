// src/lib/utils/queryCleaner.ts

/**
 * Sanitizes a search query string:
 * - Trims leading and trailing whitespace
 * - Strips enclosing/stray quotation marks (', ", `, “, ”, ‘, ’)
 * - Strips trailing question marks, periods, and delimiters
 * - Eliminates redundant interstitial spaces
 */
export function cleanQueryString(rawQuery: string | null | undefined): string {
  if (!rawQuery || typeof rawQuery !== "string") {
    return "";
  }

  let cleaned = rawQuery.trim();

  let prev = "";
  while (cleaned !== prev) {
    prev = cleaned;
    // Strip leading quotation marks
    cleaned = cleaned.replace(/^['"`“”‘’]+/, "");
    // Strip trailing quotation marks, dots, question marks, and spaces
    cleaned = cleaned.replace(/['"`“”‘’?. ]+$/, "");
    // Normalize surrounding whitespace
    cleaned = cleaned.trim();
  }

  return cleaned;
}
