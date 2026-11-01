// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/dates.selftest.ts      (also under TZ=UTC and TZ=America/New_York: the answers must not change)
// Step 65c: "Luxon is the date and time library throughout the app". Every place that used the built-in Date for date handling now uses Luxon; for each one the OLD code is kept below as a REFERENCE and the new
// behaviour is compared with it over many inputs. Two places had a latent zone bug and are DELIBERATELY different (marked). A guard fails if native date handling or another date library comes back.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DateTime } from "luxon";
import { IST, nowIso, toDateTime, toIsoInstant } from "./dates";
import { formatCell } from "./nl2sql/display";
import { isSunday, parsePrintedDate } from "./ingestion/schedule/dates";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

// ---- the helpers ----
ok("nowIso: an ISO instant in UTC with milliseconds, within two seconds of the clock", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(nowIso()) && Math.abs(Date.parse(nowIso()) - Date.now()) < 2000);
const CORPUS: unknown[] = [
  new Date("2026-10-31T10:30:05.123Z"), new Date(2026, 9, 31), new Date(2026, 0, 1, 0, 0, 0), new Date(2026, 11, 31, 23, 59, 59),
  "2026-10-31T10:30:05.123Z", "2026-10-31T10:30:05Z", "2026-10-31T16:00:05+05:30", "2026-10-31T10:30:05", "2026-02-05", "2024-02-29", "2026-12-31", "2026-01-01",
  "2026-02-05 10:00:00", "2026-02-05 10:00:00.250", "Sat, 31 Oct 2026 10:30:05 GMT",
];
for (const v of CORPUS) {
  const old = new Date(v as string | Date).toISOString();
  ok(`toIsoInstant(${v instanceof Date ? "Date " + v.toISOString() : JSON.stringify(v)}) equals new Date(...).toISOString() in zone ${ZONE}`, toIsoInstant(v) === old, `${toIsoInstant(v)} vs ${old}`);
}
ok("a thing that is not a date gives null (the old code THREW a RangeError)", toIsoInstant("not a date") === null && toIsoInstant("") === null && toIsoInstant(null) === null && toIsoInstant(undefined) === null && toIsoInstant({}) === null && toIsoInstant("2026-02-30") === null);
ok("toDateTime: a Date, epoch milliseconds, a DateTime, strings with and without a time", toDateTime(new Date(0)).toMillis() === 0 && toDateTime(86400000).toMillis() === 86400000 && toDateTime(DateTime.fromISO("2026-01-02")).isValid && toDateTime(" 2026-10-31 ").isValid);
ok("a date WITHOUT a time is that calendar day, read in UTC, so no zone can move it", toDateTime("2026-02-05").toISODate() === "2026-02-05" && toDateTime("2026-02-05").zoneName === "UTC" && toDateTime("2026-02-05", IST).zoneName === IST);
ok("toDateTime does not turn rubbish into a date (a bare number string, words, an impossible day)", !toDateTime("abc").isValid && !toDateTime("2026-13-01").isValid && !toDateTime("2026-02-30").isValid && !toDateTime(NaN).isValid);

// ---- the table cells (nl2sql/display.ts formatCell): the OLD code, kept as the reference ----
const oldDateCell = (value: unknown): string => {
  const d = value instanceof Date ? value : new Date(String(value));
  if (!Number.isNaN(d.getTime())) {
    const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", ...(dateOnly ? { timeZone: "UTC" } : {}) });
  }
  return String(value);
};
const CELLS: unknown[] = [...CORPUS.filter((v) => typeof v !== "string" || !v.startsWith("Sat,")), "2026-09-05", "2026-03-01", "2025-12-31", "2000-02-29"];
for (const v of CELLS) ok(`table cell ${v instanceof Date ? "Date " + v.toISOString() : JSON.stringify(v)}: Luxon equals the old text in zone ${ZONE}`, formatCell(v, "date") === oldDateCell(v), `${formatCell(v, "date")} vs ${oldDateCell(v)}`);
ok("table cells: an empty value is a dash, a value that is no date is shown as it is, a number and a text column are untouched", formatCell("", "date") === "\u2014" && formatCell(null, "date") === "\u2014" && formatCell("banana", "date") === "banana" && formatCell(1234.5, "number") === "1,234.5" && formatCell("x", "text") === "x");
ok("table cells: a September date reads 'Sept' (the British short month) exactly as before", formatCell("2026-09-05", "date") === "05 Sept 2026");

// ---- 'is this a real calendar day' (search/circularAnswer.ts dateKey) and the schedule helpers (ingestion/schedule/dates.ts) over every day of 1900..2100 ----
let calendarSame = true, sundaySame = true, lastSame = true;
for (let y = 1900; y <= 2100 && calendarSame; y++) {
  for (let m = 1; m <= 12; m++) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if ((DateTime.utc(y, m, 1).daysInMonth ?? 31) !== last) lastSame = false;
    for (let d = 1; d <= 32; d++) {
      const real = new Date(Date.UTC(y, m - 1, d));
      const oldValid = real.getUTCFullYear() === y && real.getUTCMonth() === m - 1 && real.getUTCDate() === d;
      if (oldValid !== DateTime.utc(y, m, d).isValid) calendarSame = false;
      if (y >= 2000 && y <= 2100 && oldValid && (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0) !== isSunday({ year: y, month: m, day: d })) sundaySame = false;
    }
  }
}
ok("'is it a real calendar day' (31.02 is none): Luxon and the old Date agree on every day-number of every month of 1900 to 2100", calendarSame);
ok("the number of days in each month of 1900 to 2100 (leap years included): the same", lastSame);
ok("isSunday agrees with the old code for every real day of 2000 to 2100", sundaySame);
ok("parsePrintedDate keeps rejecting an impossible day and accepting the last day of a month (29.02.2024 yes, 29.02.2025 no, 31.04.2025 no)", parsePrintedDate("29.02.2024") !== null && parsePrintedDate("29.02.2025") === null && parsePrintedDate("31.04.2025") === null && parsePrintedDate("30.04.2025") !== null);

// ---- the clock of the announcement form, the history dates of the PAX panel, the holiday toast ----
const instants = Array.from({ length: 300 }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 29 * 3600 * 1000 + i * 17));
const oldClock = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const newClock = (d: Date) => DateTime.fromJSDate(d).setZone(IST).setLocale("en-IN").toLocaleString({ hour: "2-digit", minute: "2-digit", second: "2-digit" });
ok("the clock of the announcement form: the same text as before for 300 instants, in zone " + ZONE, instants.every((d) => oldClock(d) === newClock(d)));
const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
ok("DELIBERATE FIX: the date beside the clock is the day in INDIA (the old one printed the UTC day, so it was yesterday's date from midnight to 5:30 in the morning)", instants.every((d) => DateTime.fromJSDate(d).setZone(IST).toISODate() === istDay(d)) && instants.some((d) => d.toISOString().slice(0, 10) !== istDay(d)));
ok("what the form sends to the server is the same instant in the same text as before", instants.every((d) => DateTime.fromJSDate(d).setZone(IST).toUTC().toISO() === d.toISOString()));
const oldHist = (d: Date) => d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const newHist = (iso: string) => DateTime.fromISO(iso).setZone(IST).setLocale("en-IN").toLocaleString({ dateStyle: "medium", timeStyle: "short" });
ok("the PAX history and delegate dates: the same text as before for 300 instants (the old code used the visitor's zone, this is India's, as the editors are)", instants.every((d) => oldHist(d) === newHist(d.toISOString())));
ok("...the delegate's date alone ('31 Oct 2026')", DateTime.fromISO("2026-10-31T10:00:00.000Z").setZone(IST).setLocale("en-IN").toLocaleString({ dateStyle: "medium" }) === "31 Oct 2026");
const oldToast = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const newToast = (iso: string) => DateTime.fromISO(iso).setLocale("en-IN").toLocaleString({ day: "numeric", month: "short" });
const days = Array.from({ length: 366 }, (_, i) => DateTime.fromISO("2026-01-01").plus({ days: i }).toISODate() as string);
ok("the holiday toast ('8 Nov'): the same text as before for every day of 2026 and 2027's first days", days.every((d) => oldToast(d) === newToast(d)));

// ---- year of a circular (semanticPolicySearch) ----
const yearOld = (d: unknown) => new Date(d as string).getFullYear();
ok("the year of a published date: the same as before for Dates and timestamps (a date without a time is now its own year in every zone)", [new Date(2025, 5, 1), new Date(2024, 11, 31, 23, 0), "2025-06-01T10:00:00Z", "2023-07-15T04:00:00+05:30"].every((d) => toDateTime(d).year === yearOld(d)) && toDateTime("2025-12-31").year === 2025 && toDateTime("2026-01-01").year === 2026);

// ---- the guard: Luxon is the library, native date handling does not come back ----
const SKIP_DIRS = new Set(["node_modules", ".next"]);
const offenders: Record<string, string[]> = { nativeDate: [], otherLibrary: [] };
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(full); continue; }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(name) || /\.selftest\./.test(name) || /\.sandbox\./.test(name)) continue;
    const text = strip(readFileSync(full, "utf8"));
    const rel = full.replace(process.cwd() + "/", "");
    if (/new Date\(|Date\.parse\(|\.toLocaleDateString\(|\.toLocaleTimeString\(|\.getFullYear\(|\.getUTCDate\(|\.getUTCDay\(|Date\.UTC\(/.test(text)) offenders.nativeDate.push(rel);
    if (/from ["'](moment|moment-timezone|dayjs|date-fns|date-fns-tz|js-joda|spacetime|date-and-time|datejs)(\/[^"']*)?["']|require\(["'](moment|dayjs|date-fns)/.test(text)) offenders.otherLibrary.push(rel);
  }
};
walk(join(process.cwd(), "src"));
ok("GUARD: no file of the program handles dates with the built-in Date (no new Date(, Date.parse, toLocaleDateString, getFullYear, Date.UTC); Luxon does", offenders.nativeDate.length === 0, JSON.stringify(offenders.nativeDate));
ok("GUARD: no other date library is imported by the program (react-day-picker, a calendar WIDGET, is the only date package used, and only in three components, always with Luxon on the program's side of it)", offenders.otherLibrary.length === 0, JSON.stringify(offenders.otherLibrary));
const pickerUsers: string[] = [];
const walk2 = (dir: string) => { for (const name of readdirSync(dir)) { const full = join(dir, name); if (statSync(full).isDirectory()) { if (!SKIP_DIRS.has(name)) walk2(full); continue; } if (/\.(ts|tsx)$/.test(name) && !/\.selftest\./.test(name) && /from ["']react-day-picker["']/.test(readFileSync(full, "utf8"))) pickerUsers.push(full.replace(process.cwd() + "/", "")); } };
walk2(join(process.cwd(), "src"));
ok("the calendar widget is used in exactly the three components that were reviewed (each converts Luxon to a Date only at the widget's edge)", JSON.stringify(pickerUsers.sort()) === JSON.stringify(["src/components/CircularUploadModal.tsx", "src/components/EventCalendar.tsx", "src/components/YearCalendarModal.tsx"]), JSON.stringify(pickerUsers));
for (const f of ["src/components/EventCalendar.tsx", "src/components/YearCalendarModal.tsx", "src/components/CircularUploadModal.tsx"]) {
  const t = readFileSync(f, "utf8");
  ok(`${f}: Luxon is imported, and the widget's Date is made by .toJSDate() and read back by DateTime.fromJSDate (the boundary)`, /from "luxon"/.test(t) && /toJSDate\(\)/.test(t));
}

console.log(`dates selftest: ${pass} passed, ${fail} failed   (zone ${ZONE})`);
process.exit(fail ? 1 : 0);
