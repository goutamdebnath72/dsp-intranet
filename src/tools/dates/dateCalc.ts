// src/tools/dates/dateCalc.ts
//
// DATE CALCULATIONS FOR THE SEARCH BAR, with Luxon only (the project's rule for dates). Pure: `now` is a parameter so the tests fix it; nothing is stored or sent.
//
// Understands, in plain words:
//   days between 1 jan 2026 and 15 mar 2026        15/03/2026 - 01/01/2026 is NOT read as a date calculation (it is arithmetic), but "days from X to Y" is
//   90 days from today · 30 days after 5 march 2026 · 2 weeks before 1 dec 2026 · 45 days ago · 5 jan 2026 + 3 months
//   age 15/08/1985 · age born 15 aug 1985
//   retirement date born 15/08/1975
//   what day is 26 jan 2027 · week number of 3 march 2026
//   days until 25 dec 2026 · days since 1 jan 2026 · days left in 2026
//   working days between 1 jan 2026 and 31 jan 2026 (Monday to Friday; holidays are NOT taken out, and the answer says so)
//   today's date
// Dates are written the Indian way: day first (15/08/1985 is 15 August). A date without a year is accepted only in "days until 25 dec" (the next one).

import { DateTime } from "luxon";

export const ZONE = "Asia/Kolkata";

export interface DateAnswer {
  kind: "date";
  title: string;
  /** the main answer, large */
  headline: string;
  lines: Array<{ label: string; value: string }>;
  notes: string[];
}

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
/** one date as people write it */
const D = String.raw`(?:today|tomorrow|yesterday|\d{1,2}(?:st|nd|rd|th)?[\s/.\-]+(?:\d{1,2}|(?:${MONTHS}))[\s/.\-,]+\d{4}|(?:${MONTHS})\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{4}-\d{2}-\d{2})`;
const DNY = String.raw`(?:${D}|\d{1,2}(?:st|nd|rd|th)?\s+(?:${MONTHS}))`; // a date that may have no year

const FORMATS = ["d/M/yyyy", "d-M-yyyy", "d.M.yyyy", "d M yyyy", "d MMM yyyy", "d MMMM yyyy", "d MMM, yyyy", "MMM d yyyy", "MMMM d yyyy", "MMM d, yyyy", "MMMM d, yyyy", "yyyy-MM-dd", "d/MMM/yyyy", "d-MMM-yyyy", "d.MMM.yyyy"];

export function startOfToday(now?: DateTime): DateTime {
  return (now ?? DateTime.now()).setZone(ZONE).startOf("day");
}

/** One date, or null. `now` fixes "today". A date with no year takes the NEXT such day when `nextYear` is set. */
export function parseDate(text: string, now?: DateTime, nextYear = false): DateTime | null {
  const today = startOfToday(now);
  const t = (text || "").trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/\s+/g, " ").replace(/\.$/, "");
  if (t === "today") return today;
  if (t === "tomorrow") return today.plus({ days: 1 });
  if (t === "yesterday") return today.minus({ days: 1 });
  for (const f of FORMATS) {
    const d = DateTime.fromFormat(t, f, { zone: ZONE, locale: "en" });
    if (d.isValid && d.year >= 1000) return d.startOf("day");
  }
  if (nextYear) {
    for (const f of ["d MMM", "d MMMM"]) {
      const d = DateTime.fromFormat(t, f, { zone: ZONE, locale: "en" });
      if (d.isValid) {
        let y = d.set({ year: today.year }).startOf("day");
        if (y < today) y = y.plus({ years: 1 });
        return y;
      }
    }
  }
  return null;
}

export const fmtDate = (d: DateTime): string => d.setLocale("en").toFormat("cccc, d LLLL yyyy");
export const fmtShort = (d: DateTime): string => d.setLocale("en").toFormat("d LLL yyyy");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const nf = (n: number) => n.toLocaleString("en-IN");

/** years, months and days between two dates (a <= b) */
export function ymd(a: DateTime, b: DateTime): { years: number; months: number; days: number } {
  const x = b.diff(a, ["years", "months", "days"]).toObject();
  return { years: Math.floor(x.years ?? 0), months: Math.floor(x.months ?? 0), days: Math.round(x.days ?? 0) };
}
const ymdText = (a: DateTime, b: DateTime): string => {
  const { years, months, days } = ymd(a, b);
  return [years ? plural(years, "year") : "", months ? plural(months, "month") : "", days || (!years && !months) ? plural(days, "day") : ""].filter(Boolean).join(", ");
};

/** Monday to Friday days from a (included) to b (excluded) */
export function weekdaysBetween(a: DateTime, b: DateTime): number {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const total = Math.round(to.diff(from, "days").days);
  if (total > 366 * 200) return NaN;
  let n = 0;
  for (let i = 0; i < total; i++) if (from.plus({ days: i }).weekday <= 5) n++;
  return n;
}

/** Superannuation: on attaining `age` (60); at the end of that month, or of the month before when the birthday is the 1st (the usual public-sector rule: confirm with HR). */
export function retirementDate(dob: DateTime, age = 60): { birthday: DateTime; retires: DateTime } {
  const birthday = dob.plus({ years: age });
  const retires = dob.day === 1 ? birthday.minus({ months: 1 }).endOf("month").startOf("day") : birthday.endOf("month").startOf("day");
  return { birthday, retires };
}

const UNIT = String.raw`(day|days|week|weeks|month|months|year|years)`;
type Unit = "days" | "weeks" | "months" | "years";
const unitOf = (u: string): Unit => (u.startsWith("day") ? "days" : u.startsWith("week") ? "weeks" : u.startsWith("month") ? "months" : "years");

/** A date calculation question, answered; null when the text is not one. `now` fixes today. */
export function answerDateQuestion(raw: string, now?: DateTime): DateAnswer | null {
  const q = (raw || "").trim().toLowerCase().replace(/^(?:what\s+is|what's|how\s+many|calculate|find)\s+/, "").replace(/[?.]+$/, "").replace(/\s+/g, " ").trim();
  if (!q || q.length > 100) return null;
  const today = startOfToday(now);
  let m: RegExpExecArray | null;

  // today's date
  if (/^(?:today'?s?\s+date|the\s+date\s+today|date\s+today|current\s+date|today\s+date|what\s+day\s+is\s+(?:it|today)|day\s+today|day\s+and\s+date)$/.test(q)) {
    return { kind: "date", title: "Today", headline: fmtDate(today), lines: [{ label: "Week number", value: String(today.weekNumber) }, { label: "Day of the year", value: `${today.ordinal} of ${today.daysInYear}` }], notes: ["Today, in Indian Standard Time."] };
  }

  // working days between
  if ((m = new RegExp(`^(?:working|business)\\s+days|^weekdays`).exec(q)) && (m = new RegExp(`^(?:working days|business days|weekdays)\\s+(?:between|from)\\s+(${D})\\s+(?:and|to|till|until)\\s+(${D})$`).exec(q))) {
    const a = parseDate(m[1], now), b = parseDate(m[2], now);
    if (!a || !b) return null;
    const [from, to] = a <= b ? [a, b] : [b, a];
    const n = weekdaysBetween(from, to.plus({ days: 1 })); // both days included
    if (Number.isNaN(n)) return null;
    return { kind: "date", title: "Working days", headline: plural(n, "working day"), lines: [{ label: "From", value: fmtDate(from) }, { label: "To (included)", value: fmtDate(to) }, { label: "Calendar days", value: String(Math.round(to.diff(from, "days").days) + 1) }], notes: ["Monday to Friday, both end dates included. Holidays are NOT taken out: subtract the plant's holidays that fall in the period."] };
  }

  // days between / from X to Y
  if ((m = new RegExp(`^(?:(days|weeks|months|years)\\s+)?(?:between|from)\\s+(${D})\\s+(?:and|to|till|until)\\s+(${D})$`).exec(q)) || (m = new RegExp(`^(?:the\\s+)?(?:difference|gap)\\s+between\\s+(${D})\\s+and\\s+(${D})$`).exec(q))) {
    const hasUnit = m.length === 4;
    const a = parseDate(hasUnit ? m[2] : m[1], now), b = parseDate(hasUnit ? m[3] : m[2], now);
    if (!a || !b) return null;
    const [from, to] = a <= b ? [a, b] : [b, a];
    const days = Math.round(to.diff(from, "days").days);
    return {
      kind: "date",
      title: "Between two dates",
      headline: plural(days, "day"),
      lines: [
        { label: "From", value: fmtDate(from) },
        { label: "To", value: fmtDate(to) },
        { label: "In years, months and days", value: ymdText(from, to) },
        { label: "In weeks", value: `${nf(Math.floor(days / 7))} weeks${days % 7 ? ` and ${plural(days % 7, "day")}` : ""}` },
        { label: "Working days (Mon–Fri)", value: String(weekdaysBetween(from, to)) },
      ],
      notes: [`The start date is not counted, the end date is (${plural(days + 1, "day")} if both are counted).`],
    };
  }

  // 90 days from today / 30 days after D / 2 weeks before D / 45 days ago
  if ((m = new RegExp(`^(\\d{1,5})\\s*${UNIT}\\s+(from|after|before|ago)(?:\\s+(${D}))?$`).exec(q))) {
    const n = Number(m[1]);
    const unit = unitOf(m[2]);
    const dir = m[3];
    if (dir === "ago" && m[4]) return null;
    const base = m[4] ? parseDate(m[4], now) : today;
    if (!base) return null;
    const sign = dir === "after" || dir === "from" ? 1 : -1;
    const out = base.plus({ [unit]: sign * n });
    if (!out.isValid) return null;
    return { kind: "date", title: sign > 0 ? "Date after" : "Date before", headline: fmtDate(out), lines: [{ label: "Starting from", value: fmtDate(base) }, { label: sign > 0 ? "Plus" : "Minus", value: `${nf(n)} ${unit}` }], notes: unit === "months" || unit === "years" ? ["A month or a year is added as a calendar month or year (31 January + 1 month = 28 or 29 February)."] : [] };
  }
  // 5 jan 2026 + 3 months
  if ((m = new RegExp(`^(${D})\\s*([+-])\\s*(\\d{1,5})\\s*${UNIT}$`).exec(q))) {
    const base = parseDate(m[1], now);
    if (!base) return null;
    const n = Number(m[3]);
    const unit = unitOf(m[4]);
    const out = base.plus({ [unit]: (m[2] === "+" ? 1 : -1) * n });
    if (!out.isValid) return null;
    return { kind: "date", title: m[2] === "+" ? "Date after" : "Date before", headline: fmtDate(out), lines: [{ label: "Starting from", value: fmtDate(base) }, { label: m[2] === "+" ? "Plus" : "Minus", value: `${nf(n)} ${unit}` }], notes: [] };
  }

  // age
  if ((m = new RegExp(`^(?:my\\s+)?age(?:\\s+(?:of|if|for|on|dob|date of birth))*(?:\\s+(?:person\\s+)?born)?(?:\\s+on)?\\s+(${D})$`).exec(q)) || (m = new RegExp(`^how\\s+old\\s+(?:am\\s+i\\s+)?(?:if\\s+)?(?:i\\s+was\\s+)?born\\s+(?:on\\s+)?(${D})$`).exec(q))) {
    const dob = parseDate(m[1], now);
    if (!dob || dob > today) return null;
    let next = dob.set({ year: today.year });
    if (next <= today) next = dob.set({ year: today.year + 1 });
    const days = Math.round(today.diff(dob, "days").days);
    return {
      kind: "date",
      title: "Age",
      headline: ymdText(dob, today),
      lines: [
        { label: "Born", value: fmtDate(dob) },
        { label: "As on", value: fmtDate(today) },
        { label: "Total days lived", value: nf(days) },
        { label: "Next birthday", value: `${fmtDate(next)} (in ${plural(Math.round(next.diff(today, "days").days), "day")})` },
      ],
      notes: [],
    };
  }

  // retirement
  if ((m = new RegExp(`^(?:superannuation|retirement|retire)(?:\\s+date)?(?:\\s+(?:of|for|if|on|dob|date of birth|calculator))*(?:\\s+(?:person\\s+)?born)?(?:\\s+on)?\\s+(${D})$`).exec(q))) {
    const dob = parseDate(m[1], now);
    if (!dob || dob > today) return null;
    const r = retirementDate(dob, 60);
    const left = r.retires >= today ? ymdText(today, r.retires) : null;
    return {
      kind: "date",
      title: "Retirement date (age 60)",
      headline: fmtDate(r.retires),
      lines: [
        { label: "Born", value: fmtDate(dob) },
        { label: "Completes 60", value: fmtDate(r.birthday) },
        ...(left ? [{ label: "Time left from today", value: left }] : [{ label: "Status", value: "This date has passed" }]),
      ],
      notes: ["Rule used: retirement on the last day of the month in which the 60th birthday falls (the previous month if born on the 1st). Check the rule that applies to you with HR."],
    };
  }

  // what day is D
  if ((m = new RegExp(`^(?:day(?:\\s+of\\s+the\\s+week)?(?:\\s+(?:is|was|on|of))?|weekday(?:\\s+of)?|what\\s+day\\s+(?:is|was|will\\s+be))\\s+(${D})$`).exec(q))) {
    const d = parseDate(m[1], now);
    if (!d) return null;
    const diff = Math.round(d.diff(today, "days").days);
    return { kind: "date", title: "Day of the week", headline: fmtDate(d), lines: [{ label: "Week number", value: String(d.weekNumber) }, { label: "Day of the year", value: `${d.ordinal} of ${d.daysInYear}` }, { label: diff === 0 ? "From today" : diff > 0 ? "Days from today" : "Days ago", value: diff === 0 ? "today" : nf(Math.abs(diff)) }], notes: [] };
  }

  // week number
  if ((m = new RegExp(`^week\\s+(?:number|no)(?:\\s+(?:of|for|on))?\\s+(${D})$`).exec(q))) {
    const d = parseDate(m[1], now);
    if (!d) return null;
    return { kind: "date", title: "Week number", headline: `Week ${d.weekNumber} of ${d.weekYear}`, lines: [{ label: "Date", value: fmtDate(d) }], notes: ["ISO weeks: Monday is the first day, and week 1 is the week with the year's first Thursday."] };
  }

  // days left in the year
  if ((m = /^days?\s+(?:left|remaining)\s+(?:in|of|this)\s+(?:the\s+)?(?:year|(\d{4}))$/.exec(q)) || (m = /^days?\s+(?:left|remaining)\s+(?:in|of)\s+(\d{4})$/.exec(q))) {
    const year = m[1] ? Number(m[1]) : today.year;
    const end = DateTime.fromObject({ year, month: 12, day: 31 }, { zone: ZONE }).startOf("day");
    const days = Math.round(end.diff(today, "days").days);
    if (days < 0) return null;
    return { kind: "date", title: `Days left in ${year}`, headline: plural(days, "day"), lines: [{ label: "Year ends", value: fmtDate(end) }, { label: "Weeks", value: `${Math.floor(days / 7)} weeks and ${plural(days % 7, "day")}` }], notes: [] };
  }

  // days until / since D
  if ((m = new RegExp(`^days?\\s+(until|till|to|since|left\\s+(?:until|till|for|to))\\s+(${DNY})$`).exec(q))) {
    const since = m[1] === "since";
    const d = parseDate(m[2], now, !since);
    if (!d) return null;
    const diff = Math.round(d.diff(today, "days").days);
    if (since) {
      if (diff > 0) return null;
      return { kind: "date", title: "Days since", headline: plural(-diff, "day"), lines: [{ label: "Since", value: fmtDate(d) }, { label: "Which is", value: ymdText(d, today) }], notes: [] };
    }
    if (diff < 0) return null;
    return { kind: "date", title: "Days until", headline: diff === 0 ? "That is today" : plural(diff, "day"), lines: [{ label: "Until", value: fmtDate(d) }, { label: "Which is", value: diff === 0 ? "today" : ymdText(today, d) }, { label: "Weeks", value: `${Math.floor(diff / 7)} weeks and ${plural(diff % 7, "day")}` }], notes: [] };
  }
  return null;
}
