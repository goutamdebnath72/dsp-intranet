// src/lib/nl2sql/healthDates.ts
//
// AN EMPTY HEALTH CHECK-UP ANSWER FOR A DATE says WHY (step 61a; open item "empty answer for a date with no check-up").
// "who has the health check-up on 4 January 2026?" used to say only "Nothing was found. The health check-up lists in the system are: ...". Now it also says what kind of day it was and which dates the list of that month
// HAS: "4 January 2026 is a Sunday. The health check-up dates in January 2026 are 1, 2, 3, 5, 6, 7 ...". Read from the data (nlq.health_checkups), never by the model; null when there is nothing to add.

import { DateTime } from "luxon";

type RunQuery = (sql: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;

/** The date a health check-up SQL filtered on (checkup_date = '2026-01-04'), or null. */
export function dateAsked(sql: string): string | null {
  const m = /checkup_date(?:\s*::\s*date)?\s*=\s*'(\d{4}-\d{2}-\d{2})'/i.exec(String(sql ?? ""));
  if (!m) return null;
  const d = DateTime.fromISO(m[1]);
  return d.isValid ? m[1] : null;
}

const joinAnd = (xs: string[]): string => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** "4 January 2026 is a Sunday. The health check-up dates in January 2026 are 1, 2, 3 and 5." or null (no list for that month: the answer already says so). */
export async function emptyDateNote(run: RunQuery, iso: string): Promise<string | null> {
  try {
    const d = DateTime.fromISO(iso);
    if (!d.isValid) return null;
    const rows = await run(
      `SELECT DISTINCT checkup_date FROM nlq.health_checkups WHERE schedule_year = $1 AND schedule_month_no = $2 ORDER BY checkup_date`,
      [d.year, d.month],
    );
    const days = [...new Set(rows.map((r) => (r.checkup_date instanceof Date ? DateTime.fromJSDate(r.checkup_date) : DateTime.fromISO(String(r.checkup_date).slice(0, 10)))).filter((x) => x.isValid).map((x) => x.day))].sort((a, b) => a - b);
    if (!days.length) return null;
    return `${d.toFormat("d LLLL yyyy")} is a ${d.toFormat("cccc")}. The health check-up dates in ${d.toFormat("LLLL yyyy")} are ${joinAnd(days.map(String))}.`;
  } catch (e) {
    console.warn(`EMPTY DATE NOTE: could not read the dates of the month (${String((e as Error)?.message ?? e).split("\n")[0]})`);
    return null;
  }
}
