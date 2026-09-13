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
  return mode.wholeWord ? `\\b${esc}\\b` : esc;
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
    // \b is ASCII-word-boundary in JS; the phrase is Latin-only here so that
    // is exactly right. `i` => case-insensitive (option 1).
    const re = new RegExp(`\\b${escapeRegex(mode.phrase)}\\b`, "i");
    return re.test(hay);
  }

  return hay.toLowerCase().includes(mode.phrase.toLowerCase());
}
