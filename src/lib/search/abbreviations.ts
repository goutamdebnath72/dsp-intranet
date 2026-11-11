// src/lib/search/abbreviations.ts
//
// Abbreviations that a circular DEFINES ITSELF ("financial assistance (FA)"), shared by the engine (server) and the briefing (screen).
// A definition is accepted only if the initials of the words before the bracket spell the abbreviation, so a loose phrase ("RFID Card Biometric (RFID)")
// is never taken for an expansion.

/**
 * "Contactless Face Recognition System (CFRS)": the words before the bracket are accepted as the expansion only if the INITIALS of the last words spell the
 * abbreviation, and then only those words are used. Returns null when they do not.
 */
export function expansionFromPhrase(abbr: string, phrase: string): string | null {
  const letters = abbr.replace(/[^A-Za-z]/g, "").toLowerCase();
  if (letters.length < 2) return null;
  const FILLER = new Set(["of", "and", "the", "for", "in", "to", "a", "an", "on", "at", "by"]);
  const words = (phrase || "").replace(/&/g, " ").split(/\s+/).filter(Boolean);
  const content = words.map((w, i) => ({ w, i })).filter((x) => !FILLER.has(x.w.toLowerCase()));
  if (content.length < letters.length) return null;
  const tail = content.slice(content.length - letters.length);
  if (tail.map((x) => x.w[0].toLowerCase()).join("") !== letters) return null;
  return words.slice(tail[0].i).join(" ");
}

const title = (s: string) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());

/** Every "Full Phrase (ABBR)" of the text whose initials spell the abbreviation: { FA: "Financial Assistance" }. The first definition of an abbreviation stands. */
export function definedAbbreviations(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of (text || "").matchAll(/([A-Za-z][A-Za-z\s&/-]{2,80}?)\s*\(\s*([A-Z]{2,6})\s*\)/g)) {
    const abbr = m[2];
    if (out[abbr]) continue;
    const exp = expansionFromPhrase(abbr, m[1].replace(/\//g, " ").trim());
    if (exp && exp.length > abbr.length) out[abbr] = title(exp);
  }
  return out;
}

/** The definitions (from definedAbbreviations) of the abbreviations a piece of text actually uses, as whole capital words. */
export function usedDefinitions(defined: Record<string, string>, shown: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [a, e] of Object.entries(defined)) if (new RegExp(`(?:^|[^A-Za-z])${a}s?(?![A-Za-z])`).test(shown)) out[a] = e;
  return out;
}
