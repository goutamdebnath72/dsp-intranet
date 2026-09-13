// src/lib/utils/queryCleaner.ts

/**
 * Cleans the search query while strictly preserving everything the search
 * pipeline depends on:
 *  - English alphanumerics (a-z, A-Z, 0-9)
 *  - Devanagari script (Hindi) and Bengali script
 *  - The DOUBLE QUOTE (") — it is the case-insensitive whole-word trigger,
 *    so it must survive to the router / API.
 *  - Literal punctuation that appears inside real circular content and is
 *    routinely searched: . - / @ : # & ( ) , and _
 *    (e.g. "Rs.500", "HR-CLC/MERIT_AWD/2026/131", "bams.saildsp.co.in",
 *     "affdf@icici"). Stripping these would break literal/quoted lookups.
 *
 * Only genuinely junk characters (control glyphs, stray symbols/dingbats)
 * are collapsed to spaces.
 */
export function cleanQueryString(query: string): string {
  if (!query) return "";

  return (
    query
      // Keep: letters/numbers, whitespace, Devanagari, Bengali, the double
      // quote, and the literal punctuation set the corpus/queries rely on.
      .replace(
        /[^\p{Script=Devanagari}\p{Script=Bengali}a-zA-Z0-9\s".\-/@:#&(),_]/gu,
        " ",
      )
      // Collapse runs of whitespace, but do NOT trim quotes/punctuation.
      .replace(/\s+/g, " ")
      .trim()
  );
}
