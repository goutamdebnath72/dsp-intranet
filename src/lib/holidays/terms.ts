// src/lib/holidays/terms.ts
//
// Deterministic term/date parsing for holiday queries. No AI. Mirrors the
// employees parser's style: plain regex + a small curated map, grounded in
// the live corpus (scripts/probe-holidays.mjs, scripts/probe-holidays-battery.mjs).
//
// Enum ground truth (confirmed against the live DB, 2026-09-21 probe):
//   CH = Closed Holiday    (mandatory, non-optional -- Independence Day,
//        Republic Day, Gandhi Jayanti, May Day, SAIL Foundation Day). NOT
//        "Compensated" -- the model file's inline comment is wrong; fixed
//        here (the term mapping), left alone there (renaming that comment
//        is cosmetic and out of scope for Stage 2).
//   FH = Festival Holiday  (fixed religious/festival calendar -- Diwali,
//        Durga Puja tithis, Eid, Christmas, Good Friday, Janmashtami, etc.)
//   RH = Restricted Holiday (the large optional pick-list -- Holi, Bengali
//        New Year, various pujas, etc.)

import { DateTime } from "luxon";
import { getDb } from "@/lib/db";
import { HolidayType } from "@/lib/db/models/holiday-master.model";
import { normTerm } from "@/lib/employees/designations";

// ----------------------------------------------------------------------------
// Type-code / type-name -> HolidayType
// ----------------------------------------------------------------------------
const TYPE_TERMS: Array<{ re: RegExp; type: HolidayType }> = [
  { re: /\brestricted\b/, type: HolidayType.RH },
  { re: /\boptional\b/, type: HolidayType.RH },
  { re: /\brh\b/, type: HolidayType.RH },
  { re: /\bfestival\b/, type: HolidayType.FH },
  { re: /\bfh\b/, type: HolidayType.FH },
  { re: /\bclosed\b/, type: HolidayType.CH },
  { re: /\bgazetted\b/, type: HolidayType.CH },
  { re: /\bnational\b/, type: HolidayType.CH },
  { re: /\bmandatory\b/, type: HolidayType.CH },
  { re: /\bcompulsory\b/, type: HolidayType.CH },
  { re: /\bch\b/, type: HolidayType.CH },
];

export const TYPE_LABEL: Record<HolidayType, string> = {
  [HolidayType.CH]: "Closed",
  [HolidayType.FH]: "Festival",
  [HolidayType.RH]: "Restricted",
};

/** Resolve a free-text holiday-type mention to its enum, or null if none found. */
export function resolveHolidayType(normalizedText: string): HolidayType | null {
  for (const { re, type } of TYPE_TERMS) {
    if (re.test(normalizedText)) return type;
  }
  return null;
}

// ----------------------------------------------------------------------------
// Employee category (A/B/C/D) -- as distinct from HolidayType (CH/FH/RH).
// Needed for questions like "how many RH can Category B take" or "which FH
// does Category A get", which filter by WHO the entitlement applies to, not
// by which kind of holiday it is.
// ----------------------------------------------------------------------------
const CATEGORY_RE = /\bcat(?:egory)?[.\s-]*([a-z0-9]+)\b/i;
const VALID_CATEGORIES = new Set(["A", "B", "C", "D"]);

/** Result of trying to resolve a "Category X" mention: either a real,
 *  known category (A-D), or an explicit mention of something that ISN'T
 *  one (e.g. "category Z", "category 5", "category abc") -- these two
 *  cases must never be conflated. Conflating them (treating an
 *  unrecognized token the same as "no category was mentioned at all")
 *  would silently answer a nonsense category as if it were an unfiltered
 *  query -- see resolveCategory's docstring below. */
export type CategoryResolution =
  | { valid: true; category: string }
  | { valid: false; input: string };

/** Resolve a free-text "Category X" mention to its single-letter code, or
 *  flag it as invalid, or return null if no "cat"/"category" mention
 *  exists in the text at all. Accepts "category b", "cat b", "cat. b",
 *  "category-b", case-insensitively. A valid category is always returned
 *  as the uppercase letter, matching how categories are stored
 *  (holidayyear.categories, e.g. "A,B", and holiday_rh_quota.category).
 *
 *  The captured token is whatever whole word follows "cat"/"category" --
 *  word-bounded on BOTH sides, not just a single character -- so "category
 *  b" (one letter) and "category abc" or "category 5" (not a single valid
 *  letter) are all recognized as an attempted category mention and can be
 *  told apart from each other, rather than a multi-character token simply
 *  failing to match at all and silently falling back to null.
 *
 *  Distinguishing "not mentioned" (null) from "mentioned but invalid"
 *  ({valid:false}) matters: a caller that only checked "is category
 *  truthy?" would treat "how many RH can category Z take" the same as a
 *  plain unfiltered "how many RH", silently answering a question that was
 *  never asked instead of saying Category Z doesn't exist. */
export function resolveCategory(normalizedText: string): CategoryResolution | null {
  const m = normalizedText.match(CATEGORY_RE);
  if (!m) return null;
  const token = m[1].toUpperCase();
  if (token.length === 1 && VALID_CATEGORIES.has(token)) {
    return { valid: true, category: token };
  }
  return { valid: false, input: token };
}

// ----------------------------------------------------------------------------
// Month names
// ----------------------------------------------------------------------------
const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export const MONTH_LABEL: Record<number, string> = {
  1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June",
  7: "July", 8: "August", 9: "September", 10: "October", 11: "November", 12: "December",
};

const MONTH_WORD_RE =
  /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/g;

export function parseMonthName(normalizedText: string): number | null {
  const m = normalizedText.match(MONTH_WORD_RE);
  if (!m) return null;
  return MONTH_NAMES[m[0]] ?? null;
}

// ----------------------------------------------------------------------------
// Explicit day+month (+ optional year) extraction, e.g.
//   "15 august", "august 15", "15th august 2026", "2026 08 15" (ISO -- normTerm
//   turns "-"/"/" into spaces so "2026-08-15" arrives as "2026 08 15").
// ----------------------------------------------------------------------------
export function parseExplicitDate(
  normalizedText: string,
): { month: number; day: number; year: number | null } | null {
  // ISO-ish: yyyy mm dd
  let m = normalizedText.match(/\b(20\d{2})\s+(\d{1,2})\s+(\d{1,2})\b/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day, year };
  }

  // "15 august" / "15th august" (day before month name)
  m = normalizedText.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\b/);
  if (m && MONTH_NAMES[m[2]]) {
    const day = parseInt(m[1], 10);
    const month = MONTH_NAMES[m[2]];
    if (day >= 1 && day <= 31) {
      const yearM = normalizedText.match(/\b(20\d{2})\b/);
      return { month, day, year: yearM ? parseInt(yearM[1], 10) : null };
    }
  }

  // "august 15" / "august 15th" (month name before day)
  m = normalizedText.match(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m && MONTH_NAMES[m[1]]) {
    const month = MONTH_NAMES[m[1]];
    const day = parseInt(m[2], 10);
    if (day >= 1 && day <= 31) {
      const yearM = normalizedText.match(/\b(20\d{2})\b/);
      return { month, day, year: yearM ? parseInt(yearM[1], 10) : null };
    }
  }

  // Bare "dd mm" (Indian DD/MM convention; normTerm already turned "/" and
  // "-" into spaces). Only a fallback -- requires both numbers to be
  // plausible day/month values, to avoid eating unrelated number pairs.
  m = normalizedText.match(/\b(\d{1,2})\s+(\d{1,2})\b(?!\s*\d)/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12) {
      const yearM = normalizedText.match(/\b(20\d{2})\b/);
      return { month: b, day: a, year: yearM ? parseInt(yearM[1], 10) : null };
    }
  }

  return null;
}

// ----------------------------------------------------------------------------
// Relative dates ("today", "tomorrow", "next monday") -> a concrete DateTime.
// Luxon only, per project rule.
// ----------------------------------------------------------------------------
const WEEKDAYS: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
};

export function parseRelativeDate(normalizedText: string, now: DateTime): DateTime | null {
  if (/\btoday\b/.test(normalizedText)) return now.startOf("day");
  if (/\btomorrow\b/.test(normalizedText)) return now.plus({ days: 1 }).startOf("day");

  const m = normalizedText.match(
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (m) {
    const target = WEEKDAYS[m[1]] as 1 | 2 | 3 | 4 | 5 | 6 | 7;
    let d = now.startOf("day").set({ weekday: target });
    if (d <= now.startOf("day")) d = d.plus({ weeks: 1 });
    return d;
  }
  return null;
}

// ----------------------------------------------------------------------------
// Relative / explicit YEAR resolution ("this year", "last year", "2026", ...).
// Returns every year mentioned, in reading order, resolved to a concrete
// number via Luxon's current year. Callers still MUST check the year is
// actually loaded in holidayyear before answering from it -- this function
// never invents data, it only resolves what the text says into a number.
// ----------------------------------------------------------------------------
export function extractYears(normalizedText: string, now: DateTime): number[] {
  const years: number[] = [];
  const seen = new Set<number>();
  const re = /\b(this|current|last|previous|next)\s+year\b|\b(20\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalizedText))) {
    let y: number;
    if (m[2]) y = parseInt(m[2], 10);
    else if (m[1] === "last" || m[1] === "previous") y = now.year - 1;
    else if (m[1] === "next") y = now.year + 1;
    else y = now.year; // "this"/"current" year
    if (!seen.has(y)) {
      seen.add(y);
      years.push(y);
    }
  }
  return years;
}

// ----------------------------------------------------------------------------
// Holiday-name matching against the live corpus. Short in-memory cache (the
// table changes rarely, and this mirrors the existing "static list of known
// terms" pattern used for designations/departments -- except sourced live
// from the DB instead of hardcoded, so it never drifts from the real data).
// ----------------------------------------------------------------------------

/** One holidaymaster row's canonical name plus any known alternate spellings
 *  (e.g. "Doljatra" carrying alias "Dol Yatra"). Aliases let a query using
 *  either spelling resolve to the same row -- see findHolidayNameInText. */
export interface HolidayNameRecord {
  name: string;
  aliases: string[];
}

const nameCache = new Map<number | "all", { records: HolidayNameRecord[]; at: number }>();
const NAME_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Fetch known holiday names (+ aliases) for name matching. When `year` is
 * given, results are scoped to holidaymaster rows that actually have a
 * holidayyear instance that year -- critical because this corpus's exact
 * printed spelling for the same conceptual holiday genuinely drifts year to
 * year (sometimes just whitespace, e.g. "Dashami / Dussehra" vs "Dashami/
 * Dussehra"; sometimes a real respelling, e.g. "Pongal" vs "Pongol"). An
 * unscoped search across every year at once has no way to prefer the
 * spelling that's actually correct for the year being asked about, and can
 * resolve to a different year's variant entirely -- which then fails to
 * match anything when looked up against the year the person actually meant.
 * When `year` is omitted (no year known yet, e.g. bare "when is Holi"),
 * falls back to the original unscoped, all-years search.
 */
export async function getHolidayNames(year?: number | null): Promise<HolidayNameRecord[]> {
  const key: number | "all" = year ?? "all";
  const now = Date.now();
  const cached = nameCache.get(key);
  if (cached && now - cached.at < NAME_CACHE_TTL_MS) return cached.records;
  try {
    const d = await getDb();
    const rows: Array<{ name: string; aliases: string[] | null }> = year
      ? await d.query(
          `SELECT DISTINCT hm.name, hm.aliases
             FROM holidaymaster hm
             JOIN holidayyear hy ON hy."holidayMasterId" = hm.id
            WHERE hy.year = $1`,
          [year],
        )
      : await d.query(`SELECT DISTINCT name, aliases FROM holidaymaster`);
    const records = rows.map((r) => ({ name: r.name, aliases: r.aliases ?? [] }));
    nameCache.set(key, { records, at: now });
    return records;
  } catch (e) {
    console.warn("getHolidayNames failed; treating as no known names:", (e as any)?.message ?? e);
    return nameCache.get(key)?.records ?? [];
  }
}

/**
 * Find the longest name-or-alias that appears as a whole phrase in the query
 * (case/punctuation-insensitive via normTerm on both sides). Mirrors
 * findDepartmentInText's longest-match-wins approach. Requires >= 4
 * characters to avoid accidental short-token hits. Always returns the
 * CANONICAL holidaymaster.name -- even when what actually matched in the
 * query text was one of that row's aliases -- so every caller downstream
 * (the hijack guard, and the name filter handed to queryHolidays' DB
 * lookups, which match against the literal `name` column) keeps working
 * against a real holidaymaster.name without needing to know aliases exist.
 */
export function findHolidayNameInText(
  normalizedQuery: string,
  names: HolidayNameRecord[],
): string | null {
  const nq = ` ${normalizedQuery} `;
  let best: { name: string; len: number } | null = null;
  for (const rec of names) {
    // Many holidaymaster rows are printed as slash-joined compounds (e.g.
    // "Kali Puja/Diwali", "Milad-Un-Nabi/Id-E-Milad/Onam", "Durgapuja -
    // Vijaya Dashami / Dussehra"), and/or carry a parenthetical alternate
    // name or annotation (e.g. "Diwali (Deepavali)", "Id-ul-Zuha (Bakrid)
    // (*)"). Without this, only the full name typed verbatim would ever
    // match, so a plain "when is Diwali", "when is Onam", or "when is
    // Bakrid" would silently fail even when that holiday is loaded --
    // split on "/" (on the RAW name, before normTerm turns "/" into a
    // space) for each slash-joined part, and for each of those, also
    // generate the bare name with any "(...)" removed AND the content
    // inside each "(...)" on its own, so both halves of a parenthetical
    // are independently matchable.
    const slashParts = rec.name.split(/\/|\bor\b/i).map((s) => s.trim());
    const parenExpanded: string[] = [];
    for (const part of slashParts) {
      parenExpanded.push(part);
      parenExpanded.push(part.replace(/\([^)]*\)/g, " "));
      const parens = part.match(/\(([^)]*)\)/g) ?? [];
      for (const p of parens) parenExpanded.push(p.slice(1, -1));
    }
    const candidates = [rec.name, ...rec.aliases, ...slashParts, ...parenExpanded];
    for (const raw of candidates) {
      const n = normTerm(raw);
      if (n.length < 4) continue;
      if (nq.includes(` ${n} `) && (!best || n.length > best.len)) {
        best = { name: rec.name, len: n.length };
      }
    }
  }
  return best ? best.name : null;
}

// ----------------------------------------------------------------------------
// Phonetic fallback -- ONLY tried when findHolidayNameInText (structural +
// alias matching above) finds nothing. This is the third layer of the
// hybrid plan: structural/alias matching catches everything it can find as
// a literal substring; phonetic matching catches SPELLING/TRANSLITERATION
// drift of the same name that a substring check can't (Mohammad/Mohammed,
// Shivratri/Shivaratri, Janmashtami/Janmasthami, Pongal/Pongol). It
// deliberately CANNOT and must not be relied on for genuinely different
// names of the same festival that don't sound alike (Kali Puja vs Shyama
// Puja) -- those need an explicit holidaymaster.aliases entry instead;
// phonetic matching is not a substitute for that.
// ----------------------------------------------------------------------------

// A small set of question-framing words that are never part of a holiday
// name, stripped in addition to the domain scaffolding (type/year/month/day)
// so what's left is name-shaped before it's handed to the phonetic function
// -- which expects a name-like string, not a full sentence.
const QUESTION_FRAME_WORDS = /\b(when|what|which|is|are|falls?|fall|falling|date|on|the|a|an|of)\b/g;

// Local copy of parser.ts's HOLIDAY_WORD -- terms.ts can't import it back
// from parser.ts (parser.ts already imports from terms.ts; that would be
// circular), and the constant is tiny and unlikely to drift.
const HOLIDAY_WORD_LOCAL = /\bholidays?\b/;

function stripDomainScaffolding(q: string): string {
  let t = q;
  t = t.replace(HOLIDAY_WORD_LOCAL, " ");
  t = t.replace(/\b(restricted|optional|rh|festival|fh|closed|gazetted|national|mandatory|compulsory|ch)\b/g, " ");
  t = t.replace(/\b(this|current|last|previous|next)\s+year\b/g, " ");
  t = t.replace(/\b20\d{2}\b/g, " ");
  t = t.replace(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/g, " ");
  t = t.replace(/\b\d{1,2}(st|nd|rd|th)?\b/g, " ");
  return t;
}

/** Isolate the name-shaped remainder of a query for the phonetic fallback
 *  (e.g. "when is diwali in 2024" -> "diwali"). Separate from
 *  leftoverAfterStrip in parser.ts, which serves a different purpose (the
 *  hijack guard) and must NOT strip question-framing words -- there, a bare
 *  leftover "when" would correctly still count as "something real is being
 *  asked," whereas here it would only get in the way of the name match. */
function extractNameFragment(q: string): string {
  let t = stripDomainScaffolding(q);
  t = t.replace(QUESTION_FRAME_WORDS, " ");
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Phonetic name match. Built as a self-contained fallback using Postgres's
 * stock fuzzystrmatch extension (dmetaphone) -- see phonetic_setup_final.sql
 * for the migration, which was actually installed and tested locally
 * (not just written) before this was wired in: 4 of 5 real corpus spelling
 * variants (Shivratri/Shivaratri, Pongal/Pongol, Mohammad/Mohammed,
 * Bhatridwitiya/Bhatridwitya) match correctly; the one confirmed miss
 * (Janmashtami/Janmasthami -- "sh" and "sth" are genuinely different
 * consonant sounds to an English-oriented algorithm) is covered separately
 * via an explicit alias in that same migration.
 *
 * Requires holidaymaster.name_phonetic to exist and be populated (see the
 * migration). Safe to ship before that migration runs: if the column/
 * function isn't there yet, the query throws, is caught, and this simply
 * returns null -- identical to having no phonetic layer at all. The moment
 * the migration is applied, this starts working with no further code
 * changes.
 */
export async function findHolidayNamePhonetic(
  rawQuery: string,
  year: number | null,
): Promise<string | null> {
  const fragment = extractNameFragment(rawQuery);
  if (fragment.length < 4) return null;
  try {
    const d = await getDb();
    const rows: Array<{ name: string }> = year
      ? await d.query(
          `SELECT DISTINCT hm.name
             FROM holidaymaster hm
             JOIN holidayyear hy ON hy."holidayMasterId" = hm.id
            WHERE hy.year = $1
              AND holiday_phonetic_match($2, hm.name_phonetic)
            ORDER BY hm.name ASC
            LIMIT 1`,
          [year, fragment],
        )
      : await d.query(
          `SELECT DISTINCT hm.name
             FROM holidaymaster hm
            WHERE holiday_phonetic_match($1, hm.name_phonetic)
            ORDER BY hm.name ASC
            LIMIT 1`,
          [fragment],
        );
    return rows[0]?.name ?? null;
  } catch {
    // Expected until the phonetic_setup_final.sql migration is applied --
    // not worth logging on every query (see docstring above).
    return null;
  }
}