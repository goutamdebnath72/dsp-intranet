// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/healthDates.selftest.ts
// Step 61a: an empty health check-up answer for a DATE says what kind of day it was and which dates the month's list has.

import { readFileSync } from "node:fs";
import { dateAsked, emptyDateNote } from "./healthDates";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
(async () => {
  ok("the date is read from the SQL that ran", dateAsked("SELECT * FROM nlq.health_checkups WHERE checkup_date = '2026-01-04'") === "2026-01-04" && dateAsked("... WHERE checkup_date::date = '2025-12-31' ORDER BY 1") === "2025-12-31");
  ok("a range, a month, no filter, or an impossible date gives none", dateAsked("... WHERE checkup_date BETWEEN '2026-01-01' AND '2026-01-03'") === null && dateAsked("SELECT 1") === null && dateAsked("... checkup_date = '2026-02-30'") === null && dateAsked("") === null);
  const jan2026 = [1, 2, 3, 5, 6, 7, 8, 9].map((d) => ({ checkup_date: `2026-01-0${d}` }));
  let seen: unknown[] = [];
  const run = async (_sql: string, params: unknown[]) => { seen = params; return jan2026; };
  const n = await emptyDateNote(run, "2026-01-04");
  ok("4 January 2026 (the empty answer HC-9): 'is a Sunday' and the dates of January 2026", n === "4 January 2026 is a Sunday. The health check-up dates in January 2026 are 1, 2, 3, 5, 6, 7, 8 and 9.", n ?? "null");
  ok("...the month and the year are what the query asks for", JSON.stringify(seen) === JSON.stringify([2026, 1]));
  ok("a Date object and a timestamp string are read too", (await emptyDateNote(async () => [{ checkup_date: new Date("2025-01-13T00:00:00") }, { checkup_date: "2025-01-14T00:00:00.000Z" }], "2025-01-12")) === "12 January 2025 is a Sunday. The health check-up dates in January 2025 are 13 and 14.");
  ok("one date only", (await emptyDateNote(async () => [{ checkup_date: "2024-12-02" }], "2024-12-01")) === "1 December 2024 is a Sunday. The health check-up dates in December 2024 are 2.");
  ok("no list for that month -> null (the answer already says there is none)", (await emptyDateNote(async () => [], "2027-03-04")) === null);
  ok("a database failure -> null, never an exception", (await emptyDateNote(async () => { throw new Error("db down"); }, "2026-01-04")) === null);
  ok("a bad date -> null", (await emptyDateNote(async () => jan2026, "nonsense")) === null);
  const om = readFileSync("src/lib/nl2sql/omnibar.ts", "utf8");
  ok("the pipeline adds the note to an empty answer that asked for a date (and only there)", om.includes("emptyDateNote(") && om.includes("dateAsked(String(res.sql") && om.indexOf("emptyDateNote(") > om.indexOf("emptyScheduleAnswer({"));
  console.log(`healthDates selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
