// src/lib/search/quotedMatch.ts
//
// Single source of truth for how a *quoted* query is matched, so the SQL
// literal branch (semanticContentSearch), the JS isExactPhrase computation
// (route.ts) and the UI highlighter (searchUtils) all agree.
//
// OPTION 1 rules:
//   - Trigger is DOUBLE quotes only:  "..."
//   - Quoted + Latin-only phrase  -> case-INSENSITIVE, WHOLE-WORD
//   - Quoted + Indic script       -> case-insensitive substring (unchanged)
//   - Not quoted                  -> caller keeps its existing behaviour
//
// Case-insensitive is deliberate: the corpus is OCR'd and case-noisy
// (e.g. "SHRAM BHAVAN" vs "Shram Bhavan"), so matching must fold case.
// The only thing quoting changes is whole-word vs substring.
//
// Nothing here touches the vector path or the title fallback.

const INDIC_SCRIPT_REGEX = /[\p{Script=Devanagari}\p{Script=Bengali}]/u;

export type QuotedMode = {
  isQuoted: boolean;
  /** the phrase with the surrounding double quotes stripped and trimmed */
  phrase: string;
  /** true only when quoted AND the phrase is Latin-script (no Indic chars) */
  wholeWord: boolean;
};

/** Is the raw query wrapped in a matched pair of DOUBLE quotes? */
export function isDoubleQuoted(raw: string): boolean {
  const q = (raw || "").trim();
  return q.length >= 2 && q.startsWith('"') && q.endsWith('"');
}

/** Classify a raw query into how its literal branch should behave. */
export function classifyQuoted(raw: string): QuotedMode {
  const trimmed = (raw || "").trim();
  const isQuoted = isDoubleQuoted(trimmed);
  const phrase = isQuoted ? trimmed.slice(1, -1).trim() : trimmed;
  const hasIndic = INDIC_SCRIPT_REGEX.test(phrase);
  // Whole-word applies to any quoted Latin phrase, INCLUDING codes that
  // contain punctuation ("HR-CLC", "DSP/PERS-NW", "bams.saildsp.co.in").
  // The boundary is defined as "not flanked by a letter or digit" (see
  // wordBoundaryRegexSource / the SQL branch) rather than POSIX \y, because
  // \y wrapped around a hyphenated token does not anchor at internal
  // punctuation. Indic phrases stay substring (\y is unreliable for those
  // scripts).
  return {
    isQuoted,
    phrase,
    wholeWord: isQuoted && !hasIndic && phrase.length > 0,
  };
}

/** Escape a string so it is safe inside a POSIX/JS regular expression. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The regex SOURCE the highlighter should use for this mode:
 *  - wholeWord: \bphrase\b   (Latin word boundaries)
 *  - otherwise: phrase       (substring)
 * Always paired with the "gi" flags by the caller (case-insensitive).
 */
export function highlightRegexSource(mode: QuotedMode): string {
  const esc = escapeRegex(mode.phrase);
  // Boundary = not preceded/followed by a letter or digit. Works for codes
  // with internal punctuation, unlike \b (which treats "-" and "/" as
  // boundaries and so cannot anchor "HR-CLC" as one token).
  return mode.wholeWord ? `(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])` : esc;
}

/**
 * JS-side test that mirrors the SQL literal branch exactly.
 *  - wholeWord: /\bphrase\b/i  (case-insensitive, whole-word)
 *  - otherwise: case-insensitive substring
 * `haystack` is a single field (headline or chunk text).
 */
export function literalPhraseMatches(
  haystack: string,
  mode: QuotedMode,
): boolean {
  const hay = haystack || "";
  if (!mode.phrase) return false;

  if (mode.wholeWord) {
    // Boundary = not flanked by a letter/digit, so codes with internal
    // punctuation ("HR-CLC", "DSP/PERS-NW") anchor correctly. `i` =>
    // case-insensitive (OCR corpus is case-noisy).
    const re = new RegExp(
      `(?<![A-Za-z0-9])${escapeRegex(mode.phrase)}(?![A-Za-z0-9])`,
      "i",
    );
    return re.test(hay);
  }

  return hay.toLowerCase().includes(mode.phrase.toLowerCase());
}
