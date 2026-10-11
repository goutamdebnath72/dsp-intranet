// src/lib/ingestion/schedule/dates.ts
//
// Reading a printed check-up date ("01-01-25", "13.01.2025") and judging it against the month the circular says it schedules.
// Nothing is guessed silently: a date whose YEAR is plainly wrong for its schedule is corrected only when day and month are consistent,
// and the correction is recorded; a date that does not fit at all is reported, never stored as if it were fine.

export interface ParsedDate {
  day: number;
  month: number; // 1-12
  year: number; // 4 digits
  twoDigitYear: boolean;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "01-01-25", "13.01.2025", "13/01/2025", "010125": day, month, year. Null when it is not a calendar date. */
export function parsePrintedDate(text: string): ParsedDate | null {
  const t = (text || "").trim();
  let m = t.match(/^(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{2}|\d{4})$/);
  if (!m) {
    const digits = t.replace(/\D/g, "");
    if (!/^[\d\s\-./]+$/.test(t) || (digits.length !== 6 && digits.length !== 8)) return null;
    m = [t, digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)] as unknown as RegExpMatchArray;
  }
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const two = m[3].length === 2;
  const year = two ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || year < 2000 || year > 2100) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > last) return null;
  return { day, month, year, twoDigitYear: two };
}

/** The month a roster schedules, read from its title: "...FOR THE MONTH OF JANNUARY 2025", "...DECEMBER 2024", "...MONTH OF JAN-2026". */
export function parseScheduleMonth(text: string): { month: number; year: number } | null {
  const t = (text || "").toUpperCase().replace(/\s+/g, " ");
  const m = t.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\W{0,4}(20\d\d)\b/);
  if (!m) return null;
  return { month: MONTHS.indexOf(m[1]) + 1, year: parseInt(m[2], 10) };
}

export const iso = (d: { day: number; month: number; year: number }) =>
  `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

export const isSunday = (d: { day: number; month: number; year: number }) => new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() === 0;

export interface JudgedDate {
  ok: boolean;
  /** ISO date to store, or null when the date does not fit the schedule */
  date: string | null;
  /** set when the year was corrected, or when something is odd */
  note: string | null;
}

/** Judge a printed date against the schedule month. */
export function judgeDate(printed: string, schedule: { month: number; year: number } | null): JudgedDate {
  const p = parsePrintedDate(printed);
  if (!p) return { ok: false, date: null, note: `"${printed}" is not a date` };
  if (!schedule) return { ok: true, date: iso(p), note: "the schedule month is not known, so the date could not be checked against it" };
  if (p.month !== schedule.month) return { ok: false, date: null, note: `printed ${printed}: the month is not the scheduled one (${MONTHS[schedule.month - 1]} ${schedule.year})` };
  if (p.year !== schedule.year) {
    const fixed = { day: p.day, month: p.month, year: schedule.year };
    return { ok: true, date: iso(fixed), note: `printed as ${printed.trim()}, but this schedule is for ${MONTHS[schedule.month - 1]} ${schedule.year}: the year was corrected` };
  }
  return { ok: true, date: iso(p), note: null };
}

/**
 * A printed date that is not a calendar date ("11/012/25": a stray digit in the circular itself). It is read only when removing ONE digit
 * gives exactly ONE date that fits the schedule's month and year; otherwise it stays unread. Returns null when there is no such reading.
 */
export function repairPrintedDate(printed: string, schedule: { month: number; year: number } | null): { date: string; note: string } | null {
  if (!schedule) return null;
  const digits = (printed || "").replace(/\D/g, "");
  if (digits.length !== 7 && digits.length !== 9) return null;
  const fits = new Set<string>();
  for (let i = 0; i < digits.length; i++) {
    const cand = digits.slice(0, i) + digits.slice(i + 1);
    const p = parsePrintedDate(cand);
    if (p && p.month === schedule.month && p.year === schedule.year) fits.add(iso(p));
  }
  if (fits.size !== 1) return null;
  const date = [...fits][0];
  return { date, note: `printed as "${printed.trim()}", which is not a valid date; ${date} is the only reading that fits the ${MONTHS[schedule.month - 1]} ${schedule.year} schedule` };
}
