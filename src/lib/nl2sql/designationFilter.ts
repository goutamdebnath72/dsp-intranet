// src/lib/nl2sql/designationFilter.ts
//
// The filter box above a list of people understands DESIGNATIONS. Pure functions, no database, no React.
//
//   * case does not matter and the dot after a short form is optional:  gm, GM, Dy, dy.  Asst, asst.  Sr, Jr, Mgr, Mngr
//   * the initials of a designation mean THAT designation and no other:  gm = General Manager, dgm = Dy. General Manager, agm = Asst. General Manager,
//     cgm = Chief General Manager, ed = Executive Director, dic = Director In-charge, mo = Medical Officer
//   * a whole title is recognised the same way:  "general manager" shows the General Managers only (not the Dy. or Asst. ones), "Dy. general manager",
//     "asst. general manager", "sr mgr", "dy mngr", "jr mngr" ...
//   * "Asst.General Manager" (no space, as it may be stored) and "Asst. General Manager" are the same thing: dots and spaces never matter
//   * several designations in one box, separated by a comma (or ;  |  or the word "or"):  gm, dgm, agm
//   * a designation can be combined with a word:  "roy gm"  (the General Managers named Roy)
//   * which titles exist is read from the list itself, so nothing here has to be kept up to date; a title that is not in the list shows no rows
//   * the ORIGIN of an executive, read from the ticket: an executive ticket is 4 + a second digit + four more digits, and the second digit never changes in a whole service life:
//     9 = joined as an executive on day 1 (a direct recruit); any other digit = promoted from the non-executives (a promotee: called JO for the first 18 months, then holding the normal
//     designation, a DGM or AGM later). "jo", "promotee", "promotees", "promoted officers" show the promotees whatever their designation is today; "direct", "direct recruit", "day 1", "d1" the
//     direct recruits. They combine with a designation or a word ("jo agm", "direct gm", "jo roy"). They work when the list shows a ticket column (otherwise they are plain text).
// Anything that is not a designation or an origin (a name, a ticket, a department, a code) is found as before, as text anywhere in the row.

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

/** Where an executive came from, read from the ticket: "promotee" (promoted from the non-executives), "direct" (joined as an executive on day 1) or "" (no executive ticket). */
export type Origin = "promotee" | "direct" | "";
/** 49xxxx = direct recruit; 40xxxx to 48xxxx = promotee; anything else (a non-executive ticket, a blank, a code) = no origin. */
export const originOfTicket = (ticket: string): Origin => {
  const t = ticket.trim();
  if (/^49\d{4}$/.test(t)) return "direct";
  if (/^4[0-8]\d{4}$/.test(t)) return "promotee";
  return "";
};
/** True for the column that holds the ticket number. */
export const isTicketColumn = (c: { key: string; label: string; kind: string }): boolean => /ticket/i.test(c.key) && !/mail|phone|mobile/i.test(c.key);

/** The words that ask for an origin (dots, dashes and capitals do not matter: "Day-1", "JO", "Promotee Officers"). */
const ORIGIN_PHRASES: Record<string, Origin> = {};
for (const w of ["jo", "jos", "promotee", "promotees", "promoty", "promoted"]) ORIGIN_PHRASES[w] = "promotee";
for (const w of ["officer", "officers", "executive", "executives"]) {
  ORIGIN_PHRASES[`promotee ${w}`] = "promotee";
  ORIGIN_PHRASES[`promoted ${w}`] = "promotee";
  ORIGIN_PHRASES[`jo ${w}`] = "promotee";
  ORIGIN_PHRASES[`direct ${w}`] = "direct";
  ORIGIN_PHRASES[`day 1 ${w}`] = "direct";
  ORIGIN_PHRASES[`day one ${w}`] = "direct";
  ORIGIN_PHRASES[`day1 ${w}`] = "direct";
}
for (const w of ["direct", "day1", "d1", "day 1", "day one", "direct recruit", "direct recruits"]) ORIGIN_PHRASES[w] = "direct";

export interface CompiledAlternative {
  /** The designation this alternative asks for (in canonical spelling), or null when it asks for none. */
  title: string | null;
  /** The origin this alternative asks for ("" when none). */
  origin: Origin;
  /** The remaining words: each must be found, as text, somewhere in the row. */
  rest: string[];
}
export interface PreparedRow {
  lower: string;
  squashed: string;
  title: string;
  origin: Origin;
}
/** What the list can answer: designations need a designation column, origins need a ticket column. Without one the words are plain text. */
export interface Enabled {
  designations: boolean;
  origins: boolean;
}

/** The longest run of the alternative's words that `pick` accepts; the other words are what is left. */
function takeSpan<T>(tokens: string[], pick: (words: string[], len: number) => T | null): { value: T; rest: string[] } | null {
  for (let len = Math.min(5, tokens.length); len >= 1; len--) {
    for (let start = 0; start + len <= tokens.length; start++) {
      const words = wordsOf(tokens.slice(start, start + len).join(" "));
      if (words.length === 0) continue;
      const value = pick(words, len);
      if (value !== null) return { value, rest: [...tokens.slice(0, start), ...tokens.slice(start + len)] };
    }
  }
  return null;
}

/** Finds the origin and the designation inside one alternative and leaves the other words as plain text to find. */
export function compileAlternative(alt: string, known: Set<string>, enabled: Enabled = { designations: true, origins: true }): CompiledAlternative {
  let tokens = alt.split(/\s+/).filter(Boolean);
  let origin: Origin = "";
  let title: string | null = null;
  if (enabled.origins) {
    const found = takeSpan(tokens, (words) => ORIGIN_PHRASES[words.join(" ")] ?? null);
    if (found) {
      origin = found.value;
      tokens = found.rest;
    }
  }
  if (enabled.designations) {
    const found = takeSpan(tokens, (words, len) => {
      const t = words.flatMap(expand).join(" ");
      const initials = len === 1 && words.length === 1 && INITIALS[words[0]] !== undefined;
      // a short form counts on its own only when it is the WHOLE entry ("mgr"): in "dy mngr" the pair is the title, and if the list has no such title it is plain text
      const shortAlone = len === 1 && words.length === 1 && SHORT_ALONE.has(words[0]) && tokens.length === 1;
      // initials always mean their designation (even when the list has none: then no rows are shown); a whole title counts when the list really has it
      return initials || ((words.length >= 2 || shortAlone) && known.has(t)) ? t : null;
    });
    if (found) {
      title = found.value;
      tokens = found.rest;
    }
  }
  return { title, origin, rest: tokens };
}

export function alternativeMatches(c: CompiledAlternative, p: PreparedRow): boolean {
  if (c.title !== null && p.title !== c.title) return false;
  if (c.origin !== "" && p.origin !== c.origin) return false;
  return c.rest.every((w) => {
    if (p.lower.includes(w.toLowerCase())) return true;
    const s = squash(w);
    return s.length >= 3 && p.squashed.includes(s);
  });
}
