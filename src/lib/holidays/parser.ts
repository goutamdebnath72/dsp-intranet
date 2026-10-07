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
  parseMonthNames,
  parseExplicitDate,
  parseRelativeDate,
  parseDateRange,
  parseRelativeMonths,
  RELATIVE_MONTHS_RE,
  extractYears,
  getHolidayNames,
  findHolidayNameInText,
  findHolidayNamePhonetic,
} from "./terms";

export type HolidayIntent =
  | { kind: "holidayCount"; year: number; type: HolidayType | null; category: string | null }
  | {
      kind: "holidayList";
      year: number;
      type: HolidayType | null;
      months: number[] | null;
      category: string | null;
      fromDate: string | null;
      toDate: string | null;
    }
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
  | { kind: "holidayInvalidCategory"; input: string }
  // A query that is internally contradictory or names a shape of input this
  // parser can't confidently resolve -- e.g. "upcoming holidays in 2023"
  // (a past year can't be "upcoming"), or a "from X to Y" that doesn't
  // parse as two real dates. Must surface as an explicit, visible rejection
  // -- never silently reinterpreted into whatever the parser could salvage,
  // and never silently handed to circular search as if this were an
  // ordinary unstructured question.
  | { kind: "holidayBadQuery"; message: string }
  // "holiday notification 2025" / "notify me about holidays" -- asking for
  // a genuinely different capability (a standing alert, not a one-off
  // lookup) that doesn't exist yet. Must not be answered as if it were a
  // normal list query.
  | { kind: "holidayNotificationRequest" };

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
// "upcoming holidays" / "remaining holidays this year" / "what's left this
// year" -- a genuinely different question from a plain year list: it means
// "from TODAY to the end of the current year," not the whole year including
// dates already past. Confirmed failing case: "upcoming holidays" alone
// (no year, no list/count word) previously fell through this parser
// entirely -- see leftoverAfterStrip, which now strips this phrase before
// deciding whether anything unrelated survives.
const UPCOMING_WORD =
  /\b(upcoming|remaining|left (in|this) (the )?year|rest of (the )?year|still to come|coming up|yet to come)\b/;

// "holiday notification 2025" / "notify me about holidays" -- this is a
// request for a standing ALERT (something that would need to exist
// separately, e.g. a login-time reminder with its own subscribe/unsubscribe
// flow), not a one-off lookup. Deliberately NOT treated as filler (an
// earlier version of this set discarded these words, which meant "holiday
// notification 2025" silently answered as if it had just asked for the
// plain list -- technically an answer, but not the one the word
// "notification" actually asked for).
const NOTIFICATION_WORD = /\b(notification|notify|notified|alert|remind|reminder|subscribe|subscription)\b/;

// Words to discard when checking whether anything OTHER than the holiday
// domain itself survives in the query (see hijack guard above). Widened
// after real, confirmed failures: "annual holiday list 2025", "employee
// holiday calendar 2025", "official holiday list 2025", "holiday schedule
// for 2025", "public holiday list 2025" all contain the literal word
// "holiday" but were rejected because a common, perfectly ordinary
// descriptive word wasn't recognized as harmless filler. Notification-
// related words are deliberately NOT here -- see NOTIFICATION_WORD above.
const FILLER = new Set([
  "the", "a", "an", "is", "are", "was", "were", "this", "of", "for", "in", "at", "on", "to", "from",
  "and", "with", "that", "he", "she", "they", "it", "them",
  "current", "currently", "now", "please", "tell", "me", "what", "which", "our", "we", "us",
  "plant", "dsp", "sail", "company",
  "do", "does", "did", "will", "would", "can", "could", "i", "my", "any", "there",
  "how", "many", "much", "number", "total", "count", "list", "show", "display",
  "have", "has", "get", "gets", "fall", "falls", "falling",
  "annual", "annually", "employee", "employees", "staff", "worker", "workers", "calendar",
  "official", "schedule", "public", "between", "till", "until",
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
  t = t.replace(UPCOMING_WORD, " ");
  t = t.replace(RELATIVE_MONTHS_RE, " ");
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

/**
 * For a query that names a holiday but has no "when is ..." cue: whatever is being asked
 * beyond the holiday name itself (after removing every word of every holiday name/alias,
 * the holiday vocabulary and filler). Empty = a plain date lookup ("Holi 2026").
 * Non-empty = a question about something else ("SAIL Foundation Day 5 km walk run").
 */
export function bareNameLeftover(q: string, names: { name: string; aliases?: string[] }[]): string {
  const nameWords = new Set<string>();
  const words = (t: string) => normTerm(t).replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter(Boolean);
  for (const rec of names) {
    for (const w of words(rec.name)) nameWords.add(w);
    for (const al of rec.aliases ?? []) for (const w of words(al)) nameWords.add(w);
  }
  const rest = q.split(/\s+/).filter((w) => !nameWords.has(w)).join(" ");
  return leftoverAfterStrip(rest).replace(/\b(or|vs|versus|type|kind|date|dates|day)\b/g, " ").replace(/\s+/g, " ").trim();
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
  // unrelated word that happens to contain those letters). UPCOMING_WORD
  // also counts on its own -- "upcoming 2024" has no "holiday" in it either,
  // but it's still worth engaging this parser for: the hijack guard just
  // below (leftoverAfterStrip) already refuses to answer unless NOTHING
  // else survives stripping, so a genuinely unrelated "upcoming meetings"
  // still correctly falls through (leftover = "meetings") -- this only
  // catches the narrow, otherwise-silently-dropped case of "upcoming" (or a
  // bare year) with nothing else in the query at all.
  if (!hasHolidayWord && !nameMatch && !type && !UPCOMING_WORD.test(q) && !RELATIVE_MONTHS_RE.test(q)) return null;

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
    // A bare name with NO "when is ..." cue answers as a date lookup only when nothing
    // else is being asked: "Holi 2026" yes; "SAIL Foundation Day 5 km walk run" is a
    // question about a circular, not about the holiday -> hand it to circular search.
    if (!FINDONE_WORD.test(q) && bareNameLeftover(q, names)) return null;
    const year = years[0] ?? explicitYearFromDate ?? null;
    return { kind: "holidayFindOne", name: nameMatch, year };
  }

  // ---- count / list: the literal word "holiday(s)", a bare type
  // abbreviation (RH/FH/CH), or UPCOMING_WORD alone is enough to reach this
  // branch -- see the initial domain gate above for why each of these is
  // safe to widen on its own (the hijack guard immediately below still
  // protects against anything genuinely unrelated slipping through). ----
  if (hasHolidayWord || type || UPCOMING_WORD.test(q) || RELATIVE_MONTHS_RE.test(q)) {
    // "Upcoming" / "remaining" / "next N months" / "previous N months" on
    // their own, with no literal "holiday(s)" anywhere in the query, are
    // deliberately rejected rather than silently treated as if they meant
    // holidays -- "next 2 months" alone is ambiguous (next 2 months of
    // WHAT?) and guessing the domain from these words alone is exactly the
    // kind of silent reinterpretation this parser's hijack guard otherwise
    // exists to prevent. This check runs before anything else in this
    // branch specifically because it's the more fundamental problem -- a
    // query missing the required word shouldn't also be evaluated for a
    // year mismatch, wrong format, etc.
    if ((UPCOMING_WORD.test(q) || RELATIVE_MONTHS_RE.test(q)) && !hasHolidayWord && !type) {
      return {
        kind: "holidayBadQuery",
        message:
          "Please include the word \"holiday\" or \"holidays\" somewhere in the query -- for example \"upcoming holidays\", \"next 2 months of holidays\", or \"previous month's holidays\".",
      };
    }

    // "holiday notification 2025" / "notify me about holidays" -- a request
    // for a standing alert, a genuinely different capability from a one-off
    // lookup. Checked BEFORE the hijack guard, since these words are
    // deliberately not filler (see NOTIFICATION_WORD's comment) and would
    // otherwise survive leftoverAfterStrip and just fall through to
    // circular search, showing the person unrelated documents instead of
    // an honest "that's not built yet, here's what we could build."
    if (NOTIFICATION_WORD.test(q)) return { kind: "holidayNotificationRequest" };

    // Explicit custom date range ("from 10/03/2025 to 15/06/2025"),
    // checked before the ordinary year/month resolution below since it
    // supersedes both when present.
    const range = parseDateRange(q, now);
    if (range?.kind === "ambiguous") {
      return {
        kind: "holidayBadQuery",
        message:
          "I can see you're asking for a date range, but couldn't read the two dates. Try the format dd/mm/yyyy to dd/mm/yyyy -- for example \"holidays from 01/03/2025 to 30/06/2025\".",
      };
    }
    if (range?.kind === "missing-year") {
      return {
        kind: "holidayBadQuery",
        message:
          "Please include the year for both dates in your range -- for example \"holidays from 01/03/2025 to 30/06/2025\", not just \"1 March to 30 June\".",
      };
    }
    if (range?.kind === "range" && range.from.year !== range.to.year) {
      return {
        kind: "holidayBadQuery",
        message: `A date range spanning two different years (${range.from.year} to ${range.to.year}) isn't supported yet -- please ask about one year at a time.`,
      };
    }

    // "next N months" / "previous N months" -- same year-boundary
    // discipline as the date-range check above: a request that would cross
    // into a different calendar year is rejected outright, not silently
    // clipped or shifted.
    const relMonths = parseRelativeMonths(q, now);
    if (relMonths?.kind === "cross-year") {
      return {
        kind: "holidayBadQuery",
        message: `That range would cross into ${relMonths.wouldBeYear}, a different year from today's (${now.year}) -- only ranges that stay within the current year are supported. Try a smaller number of months.`,
      };
    }

    const leftover = leftoverAfterStrip(q);
    if (leftover) return null;

    if (range?.kind === "range") {
      const year = range.from.year;
      const pad = (n: number) => String(n).padStart(2, "0");
      const fromDate = `${range.from.year}-${pad(range.from.month)}-${pad(range.from.day)}`;
      const toDate = `${range.to.year}-${pad(range.to.month)}-${pad(range.to.day)}`;
      return { kind: "holidayList", year, type, months: null, category, fromDate, toDate };
    }

    if (relMonths?.kind === "months") {
      const explicitYearHere = years[0] ?? explicitYearFromDate;
      if (explicitYearHere != null && explicitYearHere !== relMonths.year) {
        return {
          kind: "holidayBadQuery",
          message: `"Next"/"previous" are relative to today, which is in ${relMonths.year} -- ${explicitYearHere} doesn't match. Ask for the ${explicitYearHere} holiday list directly instead, naming the months you want.`,
        };
      }
      return {
        kind: "holidayList",
        year: relMonths.year,
        type,
        months: relMonths.months,
        category,
        fromDate: null,
        toDate: null,
      };
    }

    const year = years[0] ?? explicitYearFromDate ?? now.year;
    const months = explicitDate ? [explicitDate.month] : parseMonthNames(q);

    // "Upcoming holidays" means from TODAY onward, not the whole year. An
    // explicit year that ISN'T the current one makes "upcoming" self-
    // contradictory -- "upcoming holidays in 2023" can't mean anything,
    // 2023 is over -- so this is reported as a bad query rather than
    // silently answered as an ordinary full-year list, which would hide
    // the fact that the question itself didn't make sense.
    const explicitYear = years[0] ?? explicitYearFromDate;
    if (UPCOMING_WORD.test(q) && explicitYear != null && explicitYear !== now.year) {
      return {
        kind: "holidayBadQuery",
        message: `"Upcoming" only makes sense for the current year (${now.year}) -- ${explicitYear} isn't upcoming, it's ${explicitYear < now.year ? "already past" : "in the future, but not right after today"}. Ask for the ${explicitYear} holiday list directly instead.`,
      };
    }
    const fromDate = UPCOMING_WORD.test(q) && year === now.year ? now.toISODate() : null;

    if (LIST_WORD.test(q)) return { kind: "holidayList", year, type, months: months.length ? months : null, category, fromDate, toDate: null };
    if (COUNT_WORD.test(q)) return { kind: "holidayCount", year, type, category };
    // Bare "holidays in 2026" with neither an explicit count nor list verb --
    // default to a list (the more informative answer).
    return { kind: "holidayList", year, type, months: months.length ? months : null, category, fromDate, toDate: null };
  }

  return null;
}
