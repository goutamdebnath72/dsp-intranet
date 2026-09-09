// src/lib/utils/queryCleaner.ts

/**
 * Cleans the search query while strictly preserving:
 * - English alphanumeric characters (a-z, A-Z, 0-9)
 * - Devanagari script (Hindi)
 * - Bengali script
 */
export function cleanQueryString(query: string): string {
  if (!query) return "";

  return (
    query
      // Keep English, numbers, spaces, Devanagari, and Bengali
      .replace(/[^\p{Script=Devanagari}\p{Script=Bengali}a-zA-Z0-9\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}
