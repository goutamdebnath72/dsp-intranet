// src/lib/search/quotedMatch.ts
//
// This is the single source of truth for how I match a *quoted* query, so the SQL
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
// (e.g. "SHRAM BHAVAN" vs "Shram Bhavan"), so I fold case when matching.
// Quoting changes only one thing: whole-word instead of substring.
//
// Nothing here touches the vector path or the title fallback.

const INDIC_SCRIPT_REGEX = /[\p{Script=Devanagari}\p{Script=Bengali}]/u;

export type QuotedMode = {
  isQuoted: boolean;
  /** I keep the phrase with the surrounding double quotes stripped and trimmed */
  phrase: string;
  /** I set this to true only when the query is quoted AND the phrase is Latin-script (no Indic chars) */
  wholeWord: boolean;
};

/** I ask here whether the raw query is wrapped in a matched pair of DOUBLE quotes. */
export function isDoubleQuoted(raw: string): boolean {
  const q = (raw || "").trim();
  return q.length >= 2 && q.startsWith('"') && q.endsWith('"');
}

/** I classify a raw query here to decide how its literal branch should behave. */
export function classifyQuoted(raw: string): QuotedMode {
  const trimmed = (raw || "").trim();
  const isQuoted = isDoubleQuoted(trimmed);
  const phrase = isQuoted ? trimmed.slice(1, -1).trim() : trimmed;
  const hasIndic = INDIC_SCRIPT_REGEX.test(phrase);
  // I apply whole-word to any quoted Latin phrase, INCLUDING codes that
  // contain punctuation ("HR-CLC", "DSP/PERS-NW", "bams.saildsp.co.in").
  // I define the boundary as "not flanked by a letter or digit" (see
  // wordBoundaryRegexSource / the SQL branch) rather than POSIX \y, because
  // \y wrapped around a hyphenated token does not anchor at internal
  // punctuation. Indic phrases stay substring, since \y is unreliable for those
  // scripts.
  return {
    isQuoted,
    phrase,
    wholeWord: isQuoted && !hasIndic && phrase.length > 0,
  };
}

/** I use this to escape a string so it is safe inside a POSIX/JS regular expression. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * I return the regex SOURCE the highlighter should use for this mode:
 *  - wholeWord: \bphrase\b   (Latin word boundaries)
 *  - otherwise: phrase       (substring)
 * The caller always pairs it with the "gi" flags (case-insensitive).
 */
export function highlightRegexSource(mode: QuotedMode): string {
  const esc = escapeRegex(mode.phrase);
  // My boundary is: not preceded or followed by a letter or digit. This works for codes
  // with internal punctuation, unlike \b, which treats "-" and "/" as
  // boundaries and so cannot anchor "HR-CLC" as one token.
  return mode.wholeWord ? `(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])` : esc;
}

/**
 * This is the JS-side test, and I keep it mirroring the SQL literal branch exactly.
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
    // My boundary is "not flanked by a letter/digit", so codes with internal
    // punctuation ("HR-CLC", "DSP/PERS-NW") anchor correctly. The `i` flag makes it
    // case-insensitive because the OCR corpus is case-noisy.
    const re = new RegExp(
      `(?<![A-Za-z0-9])${escapeRegex(mode.phrase)}(?![A-Za-z0-9])`,
      "i",
    );
    return re.test(hay);
  }

  return hay.toLowerCase().includes(mode.phrase.toLowerCase());
}
