// src/lib/nl2sql/designationFilter.ts
//
// The filter box above a list of people understands DESIGNATIONS. Pure functions, no database, no React.
//
//   * case does not matter and the dot after a short form is optional:  gm, GM, Dy, dy.  Asst, asst.  Sr, Jr, Mgr, Mngr
//   * the initials of a designation mean THAT designation and no other:  gm = General Manager, dgm = Dy. General Manager, agm = Asst. General Manager,
//     cgm = Chief General Manager, ed = Executive Director, dic = Director In-charge, jo = Junior Officer, mo = Medical Officer
//   * a whole title is recognised the same way:  "general manager" shows the General Managers only (not the Dy. or Asst. ones), "Dy. general manager",
//     "asst. general manager", "sr mgr", "dy mngr", "jr mngr" ...
//   * "Asst.General Manager" (no space, as it may be stored) and "Asst. General Manager" are the same thing: dots and spaces never matter
//   * several designations in one box, separated by a comma (or ;  |  or the word "or"):  gm, dgm, agm
//   * a designation can be combined with a word:  "roy gm"  (the General Managers named Roy)
//   * which titles exist is read from the list itself, so nothing here has to be kept up to date; a title that is not in the list shows no rows
// Anything that is not a designation (a name, a ticket, a department, a code) is found as before, as text anywhere in the row.

const fold = (s: string): string => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
/** Letters and digits only: "Asst.General" and "Asst. General" both become "asstgeneral". */
export const squash = (s: string): string => fold(s).replace(/[^\p{L}\p{N}]+/gu, "");
const wordsOf = (s: string): string[] => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Short forms of one word (the dot after them is optional because dots are ignored). */
const SHORT_WORDS: Record<string, string[]> = {
  asst: ["assistant"],
  dy: ["deputy"],
  sr: ["senior"],
  jr: ["junior"],
  mgr: ["manager"],
  mngr: ["manager"],
  mnger: ["manager"],
  incharge: ["in", "charge"],
};
/** The initials of a whole designation: each one means that designation only. */
const INITIALS: Record<string, string[]> = {
  dic: ["director", "in", "charge"],
  ed: ["executive", "director"],
  cgm: ["chief", "general", "manager"],
  gm: ["general", "manager"],
  dgm: ["deputy", "general", "manager"],
  agm: ["assistant", "general", "manager"],
  jo: ["junior", "officer"],
  mo: ["medical", "officer"],
};
/** A short form that on its own already names a designation ("Mgr" is the Manager). */
const SHORT_ALONE = new Set(["mgr", "mngr", "mnger"]);

const expand = (w: string): string[] => INITIALS[w] ?? SHORT_WORDS[w] ?? [w];

/** The designation in one fixed spelling: "Asst.General Manager", "Asst. General Manager" and "Assistant General Manager" all give "assistant general manager". */
export const canonicalTitle = (text: string): string => wordsOf(text).flatMap(expand).join(" ");

/** True for the column that holds the designation of a person (not its code, grade or rank). */
export const isDesignationColumn = (c: { key: string; label: string; kind: string }): boolean =>
  c.kind !== "code" && /designation/i.test(`${c.key} ${c.label}`) && !/code|rank|grade|track|count|number/i.test(c.key);

/** A designation as it is SHOWN: a space after the dot ("Asst.General Manager" reads "Asst. General Manager"). The stored value is never changed. */
export const tidyDesignation = (s: string): string => s.replace(/\.(?=[A-Za-z])/g, ". ").replace(/ {2,}/g, " ");

/** "gm, dgm, agm" is three alternatives; a row that fits any one of them is shown. */
export const splitAlternatives = (query: string): string[] =>
  query
    .split(/[,;|]|\s+or\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

export interface CompiledAlternative {
  /** The designation this alternative asks for (in canonical spelling), or null when it asks for none. */
  title: string | null;
  /** The remaining words: each must be found, as text, somewhere in the row. */
  rest: string[];
}
export interface PreparedRow {
  lower: string;
  squashed: string;
  title: string;
}

/** Finds the designation inside one alternative (the longest run of words that is one) and leaves the other words as plain text to find. */
export function compileAlternative(alt: string, known: Set<string>, enabled = true): CompiledAlternative {
  const tokens = alt.split(/\s+/).filter(Boolean);
  if (!enabled) return { title: null, rest: tokens }; // a list with no designation column: everything is plain text
  for (let len = Math.min(5, tokens.length); len >= 1; len--) {
    for (let start = 0; start + len <= tokens.length; start++) {
      const words = wordsOf(tokens.slice(start, start + len).join(" "));
      if (words.length === 0) continue;
      const title = words.flatMap(expand).join(" ");
      const initials = len === 1 && words.length === 1 && INITIALS[words[0]] !== undefined;
      const shortAlone = len === 1 && words.length === 1 && SHORT_ALONE.has(words[0]);
      // initials always mean their designation (even when the list has none: then no rows are shown); a whole title counts when the list really has it
      if (initials || ((words.length >= 2 || shortAlone) && known.has(title))) {
        return { title, rest: [...tokens.slice(0, start), ...tokens.slice(start + len)] };
      }
    }
  }
  return { title: null, rest: tokens };
}

export function alternativeMatches(c: CompiledAlternative, p: PreparedRow): boolean {
  if (c.title !== null && p.title !== c.title) return false;
  return c.rest.every((w) => {
    if (p.lower.includes(w.toLowerCase())) return true;
    const s = squash(w);
    return s.length >= 3 && p.squashed.includes(s);
  });
}
