// src/lib/holidays/parser.ts
//
// Deterministic holiday-query intent parser (mirrors employees/parser.ts's
// style). No AI. Called from employees/parser.ts's parseAnalytics BEFORE the
// weak person-name-guess branch, so "how many holidays" can never be
// mistaken for a name search (handoff §2.5).
//
// Query families (handoff §2.3): count, list, find-one, type-lookup, exists,
// breakdown, compare. All resolve relative time (Luxon) to a CONCRETE
// year/month/date before returning -- queryHolidays() takes only concrete
// values and never invents data itself.
//
// Hijack guard (mirrors the defect family fixed in employees/parser.ts §1.6,
// applied here to a parallel risk): a query that merely CONTAINS the word
// "holiday" is not necessarily a data question -- "what is the holiday
// policy for contract workers" must hand off to circular search, not return
// a wrong/empty DB answer. leftoverAfterStrip() strips every
// holiday-domain token (the word itself, type terms, year/month/day
// mentions) and refuses to answer if real topic words remain.

import { DateTime } from "luxon";
import { HolidayType } from "@/lib/db/models/holiday-master.model";
import { normTerm } from "@/lib/employees/designations";
import {
  resolveHolidayType,
  resolveCategory,
  parseMonthName,
  parseExplicitDate,
  parseRelativeDate,
  extractYears,
  getHolidayNames,
  findHolidayNameInText,
  findHolidayNamePhonetic,
} from "./terms";

export type HolidayIntent =
  | { kind: "holidayCount"; year: number; type: HolidayType | null; category: string | null }
  | { kind: "holidayList"; year: number; type: HolidayType | null; month: number | null; category: string | null }
  | { kind: "holidayBreakdown"; year: number }
  | { kind: "holidayCompare"; yearA: number; yearB: number; type: HolidayType | null }
  | { kind: "holidayFindOne"; name: string; year: number | null }
  | {
      kind: "holidayTypeLookup";
      name: string | null;
      date: { month: number; day: number } | null;
      year: number;
    }
  | { kind: "holidayExists"; date: { month: number; day: number }; year: number }
  | { kind: "holidayRhQuota"; year: number; category: string | null }
  | { kind: "holidayInvalidCategory"; input: string };

const HOLIDAY_WORD = /\bholidays?\b/;
const COMPARE_WORD = /\b(vs|versus|compared to|compare)\b/;
const BREAKDOWN_WORD = /\b(breakdown|break up|by type|distribution|split up|split by type)\b/;
const COUNT_WORD = /\b(how many|number of|no of|no\. of|count of|count|total number of)\b/;
const LIST_WORD = /\b(list|show|which|display)\b/;
const FINDONE_WORD = /\b(when is|what date|date of|which date)\b/;
const TYPE_Q_WORD = /\b(what type|which type|type of|restricted or festival|festival or restricted)\b/;
const EXISTS_WORD = /\bis\b.*\bholiday\b|\bholiday\b.*\bis\b/;
const RH_QUOTA_WORD =
  /\b(quota|entitled|entitlement|allowed)\b|\bcan\b.{0,25}\b(take|taken|takes|avail|availed|availing|choose|chosen|choosing)\b/;

// Words to discard when checking whether anything OTHER than the holiday
// domain itself survives in the query (see hijack guard above).
const FILLER = new Set([
  "the", "a", "an", "is", "are", "was", "were", "this", "of", "for", "in", "at", "on", "to", "from",
  "and", "with", "that", "he", "she", "they", "it", "them",
  "current", "currently", "now", "please", "tell", "me", "what", "which", "our", "we", "us",
  "plant", "dsp", "sail", "company",
  "do", "does", "did", "will", "would", "can", "could", "i", "my", "any", "there",
  "how", "many", "much", "number", "total", "count", "list", "show", "display",
  "have", "has", "get", "gets", "fall", "falls", "falling",
]);

/**
 * Strip every holiday-domain token (the word "holiday(s)", a type term, a
 * year phrase/number, a month name, a bare day number) from the query, then
 * remove filler. Whatever is left is "real topic" -- if it's non-empty, this
 * is not a structured data question and must hand off to circular search.
 */
function leftoverAfterStrip(q: string): string {
  let t = q;
  t = t.replace(HOLIDAY_WORD, " ");
  t = t.replace(/\b(restricted|optional|rh|festival|fh|closed|gazetted|national|mandatory|compulsory|ch)\b/g, " ");
  t = t.replace(/\b(this|current|last|previous|next)\s+year\b/g, " ");
  t = t.replace(/\b20\d{2}\b/g, " ");
  t = t.replace(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/g, " ");
  t = t.replace(/\b\d{1,2}(st|nd|rd|th)?\b/g, " ");
  t = t.replace(/\bcat(?:egory)?[.\s-]*[abcd]\b/g, " ");
  t = t.replace(
    /\b(quota|entitled|entitlement|allowed|avail|availed|availing|choose|chosen|choosing|take|taken|takes)\b/g,
    " ",
  );
  const toks = t.split(/\s+/).filter((x) => x && !FILLER.has(x));
  return toks.join(" ").trim();
}

export async function parseHolidayIntent(
  query: string,
  now: DateTime = DateTime.now(),
): Promise<HolidayIntent | null> {
  const q = normTerm(query);
  const hasHolidayWord = HOLIDAY_WORD.test(q);
  const type = resolveHolidayType(q);

  // Extracted before name resolution so getHolidayNames can be scoped to
  // the year actually being asked about -- see that function's docstring
  // for why an unscoped, all-years search can silently resolve a
  // drifting/compound holiday name (Diwali, Dussehra, Pongal, ...) to a
  // DIFFERENT year's exact spelling than the one in the question, which
  // then fails to match anything when looked up against the right year.
  const explicitDate = parseExplicitDate(q);
  const relativeDate = parseRelativeDate(q, now);
  const date = explicitDate
    ? { month: explicitDate.month, day: explicitDate.day }
    : relativeDate
      ? { month: relativeDate.month, day: relativeDate.day }
      : null;
  const years = extractYears(q, now);
  const explicitYearFromDate = explicitDate?.year ?? null;
  const nameLookupYear = years[0] ?? explicitYearFromDate ?? null;

  const names = await getHolidayNames(nameLookupYear);
  let nameMatch = findHolidayNameInText(q, names);

  // Phonetic fallback (layer 3 of the hybrid plan): only tried when
  // structural/alias matching found nothing, AND the query is shaped like
  // a find-a-date question (FINDONE_WORD, defined below and already used
  // for that exact purpose elsewhere in this file) -- this parser runs on
  // EVERY message in the app before the people-domain parser even sees it,
  // so an unconditional DB round-trip here would tax every unrelated
  // query, not just holiday ones. "when is X" / "what date is X" / "date
  // of X" / "which date is X" is a small, well-defined, low-frequency
  // shape that's exactly where a misspelled or synonym name is most
  // likely to show up.
  if (!nameMatch && FINDONE_WORD.test(q)) {
    nameMatch = await findHolidayNamePhonetic(q, nameLookupYear);
  }

  // Nothing that signals the holiday domain at all -> not our query. A bare
  // type mention (RH/FH/CH) counts too -- "how many RH can Category B take"
  // never says the word "holiday" at all, but "RH" alone is unambiguous
  // (word-bounded in resolveHolidayType, so this can't misfire on an
  // unrelated word that happens to contain those letters).
  if (!hasHolidayWord && !nameMatch && !type) return null;

  // ---- invalid category: an explicit "category X" mention where X isn't
  // A/B/C/D. Checked before every other branch (rhQuota, compare,
  // breakdown, count/list) since none of them should silently answer as
  // if no category had been named -- see resolveCategory's docstring. ----
  const categoryResolution = resolveCategory(q);
  if (categoryResolution && !categoryResolution.valid) {
    return { kind: "holidayInvalidCategory", input: categoryResolution.input };
  }
  const category = categoryResolution?.category ?? null;

  // ---- RH quota: "how many RH can Category B take", "RH quota for 2024" --
  // a distinct question about per-category ENTITLEMENT (a policy fact from
  // holiday_rh_quota), not a count of actual holiday instances. Checked
  // before compare/breakdown/count/list since it has its own, more specific
  // detection words (quota/entitled/can take) that would otherwise also
  // satisfy COUNT_WORD's "how many" and be misrouted to a plain count. ----
  if (type === HolidayType.RH && RH_QUOTA_WORD.test(q)) {
    // Same hijack guard as the count/list branch below: RH_QUOTA_WORD's
    // bare "quota" match is deliberately broad, so a question that merely
    // mentions quota but is actually asking something else entirely --
    // "can a NEW JOINER get a full RH quota" is asking about proration
    // eligibility, not the flat per-category number -- must not be
    // silently answered as if it were a plain quota lookup. leftoverAfterStrip
    // already strips every quota-vocabulary word this branch cares about
    // (quota/entitled/allowed/take/avail/choose/...), so anything real left
    // over (like "new joiner") correctly falls through to semantic search,
    // which finds the actual "Proportionate RH for new joiners" policy note.
    const leftover = leftoverAfterStrip(q);
    if (leftover) return null;
    const year = years[0] ?? explicitYearFromDate ?? now.year;
    return { kind: "holidayRhQuota", year, category };
  }

  // ---- compare (needs the holiday word; two related years) ----
  if (hasHolidayWord && COMPARE_WORD.test(q)) {
    const yearA = years[0] ?? explicitYearFromDate ?? now.year;
    const yearB = years[1] ?? yearA - 1;
    return { kind: "holidayCompare", yearA, yearB, type };
  }

  // ---- breakdown (needs the holiday word) ----
  if (hasHolidayWord && BREAKDOWN_WORD.test(q)) {
    const year = years[0] ?? explicitYearFromDate ?? now.year;
    return { kind: "holidayBreakdown", year };
  }

  // ---- exists: a date + "holiday" + "is" ----
  if (date && hasHolidayWord && EXISTS_WORD.test(q)) {
    const year = explicitYearFromDate ?? years[0] ?? now.year;
    return { kind: "holidayExists", date, year };
  }

  // ---- type-lookup: by date, or by a known holiday NAME, with a "type" cue ----
  if (TYPE_Q_WORD.test(q)) {
    const year = explicitYearFromDate ?? years[0] ?? now.year;
    if (date) return { kind: "holidayTypeLookup", name: null, date, year };
    if (nameMatch) return { kind: "holidayTypeLookup", name: nameMatch, date: null, year };
  }

  // ---- find-one: a known holiday NAME + a "when/what date" cue, or a name
  // match with no other holiday-domain cue at all (e.g. bare "Holi 2026"). ----
  if (nameMatch && (FINDONE_WORD.test(q) || !hasHolidayWord)) {
    const year = years[0] ?? explicitYearFromDate ?? null;
    return { kind: "holidayFindOne", name: nameMatch, year };
  }

  // ---- count / list: the literal word "holiday(s)" OR a bare type
  // abbreviation (RH/FH/CH) is enough to reach this branch -- "how many RH
  // does category D get in 2025" never says "holiday" at all, and must
  // not fall through to null (which would silently hand the question to
  // semantic search instead of the DB). Safe to widen: the hijack guard
  // immediately below runs unconditionally and already strips type
  // abbreviations before deciding whether anything unrelated survives. ----
  if (hasHolidayWord || type) {
    const year = years[0] ?? explicitYearFromDate ?? now.year;
    const month = explicitDate ? explicitDate.month : parseMonthName(q);

    // Hijack guard -- see file header. Applies to every sub-branch below.
    const leftover = leftoverAfterStrip(q);
    if (leftover) return null;

    if (LIST_WORD.test(q)) return { kind: "holidayList", year, type, month, category };
    if (COUNT_WORD.test(q)) return { kind: "holidayCount", year, type, category };
    // Bare "holidays in 2026" with neither an explicit count nor list verb --
    // default to a list (the more informative answer).
    return { kind: "holidayList", year, type, month, category };
  }

  return null;
}
