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
  parseMonthName,
  parseExplicitDate,
  parseRelativeDate,
  extractYears,
  getHolidayNames,
  findHolidayNameInText,
} from "./terms";

export type HolidayIntent =
  | { kind: "holidayCount"; year: number; type: HolidayType | null }
  | { kind: "holidayList"; year: number; type: HolidayType | null; month: number | null }
  | { kind: "holidayBreakdown"; year: number }
  | { kind: "holidayCompare"; yearA: number; yearB: number; type: HolidayType | null }
  | { kind: "holidayFindOne"; name: string; year: number | null }
  | {
      kind: "holidayTypeLookup";
      name: string | null;
      date: { month: number; day: number } | null;
      year: number;
    }
  | { kind: "holidayExists"; date: { month: number; day: number }; year: number };

const HOLIDAY_WORD = /\bholidays?\b/;
const COMPARE_WORD = /\b(vs|versus|compared to|compare)\b/;
const BREAKDOWN_WORD = /\b(breakdown|break up|by type|distribution|split up|split by type)\b/;
const COUNT_WORD = /\b(how many|number of|no of|no\. of|count of|count|total number of)\b/;
const LIST_WORD = /\b(list|show|which|display)\b/;
const FINDONE_WORD = /\b(when is|what date|date of|which date)\b/;
const TYPE_Q_WORD = /\b(what type|which type|type of|restricted or festival|festival or restricted)\b/;
const EXISTS_WORD = /\bis\b.*\bholiday\b|\bholiday\b.*\bis\b/;

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
  const toks = t.split(/\s+/).filter((x) => x && !FILLER.has(x));
  return toks.join(" ").trim();
}

export async function parseHolidayIntent(
  query: string,
  now: DateTime = DateTime.now(),
): Promise<HolidayIntent | null> {
  const q = normTerm(query);
  const hasHolidayWord = HOLIDAY_WORD.test(q);

  const names = await getHolidayNames();
  const nameMatch = findHolidayNameInText(q, names);

  // Nothing that signals the holiday domain at all -> not our query.
  if (!hasHolidayWord && !nameMatch) return null;

  const type = resolveHolidayType(q);
  const explicitDate = parseExplicitDate(q);
  const relativeDate = parseRelativeDate(q, now);
  const date = explicitDate
    ? { month: explicitDate.month, day: explicitDate.day }
    : relativeDate
      ? { month: relativeDate.month, day: relativeDate.day }
      : null;
  const years = extractYears(q, now);
  const explicitYearFromDate = explicitDate?.year ?? null;

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

  // ---- count / list (need the holiday word) ----
  if (hasHolidayWord) {
    const year = years[0] ?? explicitYearFromDate ?? now.year;
    const month = explicitDate ? explicitDate.month : parseMonthName(q);

    // Hijack guard -- see file header. Applies to every sub-branch below.
    const leftover = leftoverAfterStrip(q);
    if (leftover) return null;

    if (LIST_WORD.test(q)) return { kind: "holidayList", year, type, month };
    if (COUNT_WORD.test(q)) return { kind: "holidayCount", year, type };
    // Bare "holidays in 2026" with neither an explicit count nor list verb --
    // default to a list (the more informative answer).
    return { kind: "holidayList", year, type, month };
  }

  return null;
}
