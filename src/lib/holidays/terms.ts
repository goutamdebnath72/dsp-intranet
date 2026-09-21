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
let nameCache: { names: string[]; at: number } | null = null;
const NAME_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getHolidayNames(): Promise<string[]> {
  const now = Date.now();
  if (nameCache && now - nameCache.at < NAME_CACHE_TTL_MS) return nameCache.names;
  try {
    const d = await getDb();
    const rows: Array<{ name: string }> = await d.query(
      `SELECT DISTINCT name FROM holidaymaster`,
    );
    const names = rows.map((r) => r.name);
    nameCache = { names, at: now };
    return names;
  } catch (e) {
    console.warn("getHolidayNames failed; treating as no known names:", (e as any)?.message ?? e);
    return nameCache?.names ?? [];
  }
}

/**
 * Find the longest holidaymaster.name that appears as a whole phrase in the
 * query (case/punctuation-insensitive via normTerm on both sides). Mirrors
 * findDepartmentInText's longest-match-wins approach. Requires >= 4
 * characters to avoid accidental short-token hits.
 */
export function findHolidayNameInText(
  normalizedQuery: string,
  names: string[],
): string | null {
  const nq = ` ${normalizedQuery} `;
  let best: { name: string; len: number } | null = null;
  for (const raw of names) {
    const n = normTerm(raw);
    if (n.length < 4) continue;
    if (nq.includes(` ${n} `) && (!best || n.length > best.len)) {
      best = { name: raw, len: n.length };
    }
  }
  return best ? best.name : null;
}