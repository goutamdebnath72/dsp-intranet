// src/lib/dates.ts
//
// THE SMALL LUXON HELPERS FOR PLACES THAT USED THE BUILT-IN `Date` (step 65c; owner, 1 Nov 2026: "Luxon is the date and time library throughout the app; any other date or time handling is converted to Luxon").
// Luxon only: nothing here touches the built-in `Date` except where a caller hands one in (a database driver returns Dates).
//   IST          the plant's zone; "today" is the day in India, whatever zone the server (Vercel runs in UTC) or the visitor has.
//   nowIso()     the moment now as an ISO instant in UTC with milliseconds ("2026-11-01T10:00:00.000Z"): what `new Date().toISOString()` gave.
//   toDateTime() a Date, a date string (ISO, SQL, RFC 2822, HTTP) or epoch milliseconds, as a DateTime (invalid when it is none of these).
//                A date WITHOUT a time ("2026-02-05") is that calendar day, read in UTC, so that no zone can move it by a day (as `new Date("2026-02-05")` always was, a UTC midnight).
//   toIsoInstant() the same as an ISO instant in UTC, or null when it is not a date.

import { DateTime } from "luxon";

export const IST = "Asia/Kolkata";

export const nowIso = (): string => DateTime.now().toUTC().toISO() as string;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function toDateTime(value: unknown, zone?: string): DateTime {
  if (value instanceof DateTime) return zone ? value.setZone(zone) : value;
  if (value instanceof Date) return DateTime.fromJSDate(value, zone ? { zone } : {});
  if (typeof value === "number") return DateTime.fromMillis(value, zone ? { zone } : {});
  if (typeof value === "string") {
    const s = value.trim();
    const opts = { zone: zone ?? (DATE_ONLY.test(s) ? "utc" : undefined) };
    for (const parse of [DateTime.fromISO, DateTime.fromSQL, DateTime.fromRFC2822, DateTime.fromHTTP]) {
      const d = parse(s, opts);
      if (d.isValid) return d;
    }
  }
  return DateTime.invalid("not a date");
}

export const toIsoInstant = (value: unknown): string | null => {
  const d = toDateTime(value);
  return d.isValid ? (d.toUTC().toISO() as string) : null;
};
