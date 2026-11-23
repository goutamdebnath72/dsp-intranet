// src/lib/utils/queryCleaner.ts
import { canonicalIndic } from "../ingestion/indicRepair";

/**
 * I clean the search query but strictly preserve everything the search
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
 * I collapse only genuinely junk characters (control glyphs, stray symbols/dingbats)
 * to spaces.
 */
export function cleanQueryString(query: string): string {
  if (!query) return "";

  // The circulars are stored with Hindi and Bengali words in Unicode NFC and without joiner characters, so I bring a query typed with a joiner (phone keyboards add
  // them inside conjuncts) or with the other form of ড় য় ड़ to the same form. Before this, a joiner was turned into a space and split the word in two.
  return (
    canonicalIndic(query.replace(/[\u200C\u200D]/g, ""))
      // I keep letters/numbers, whitespace, Devanagari, Bengali, the double
      // quote, and the literal punctuation set that the corpus and the queries rely on.
      .replace(
        /[^\p{Script=Devanagari}\p{Script=Bengali}a-zA-Z0-9\s".\-/@:#&(),_]/gu,
        " ",
      )
      // I collapse runs of whitespace, but do NOT trim quotes/punctuation.
      .replace(/\s+/g, " ")
      .trim()
  );
}
