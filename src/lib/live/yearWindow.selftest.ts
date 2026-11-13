// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/yearWindow.selftest.ts
// THE ONE-YEAR WINDOW: every one-year chart starts on the same date one year before today and ends today (or on the latest published day).
import { DateTime } from "luxon";
import { carryToToday, fromYearAgo, reachesYearAgo, yearAgo } from "./yearWindow";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const at = (iso: string) => DateTime.fromISO(`${iso}T11:00:00`, { zone: "Asia/Kolkata" });
const day = (n: number) => DateTime.fromISO("2025-11-10", { zone: "UTC" }).plus({ days: n }).toISODate() as string;
const record = Array.from({ length: 30 }, (_, i) => ({ date: day(i), value: 100 + i }));

ok("a year before 13 November 2026 is 13 November 2025", yearAgo(at("2026-11-13")) === "2025-11-13");
ok("29 February has no anniversary in a common year: a year before 29 Feb 2028 is 28 Feb 2027, and a year before 1 March 2027 is 1 March 2026", yearAgo(at("2028-02-29")) === "2027-02-28" && yearAgo(at("2027-03-01")) === "2026-03-01");
ok("the date is the Indian date: 1 am on 14 Nov in India is still 13 Nov in London, and the window follows India", yearAgo(DateTime.fromISO("2026-11-13T21:30:00Z")) === "2025-11-14" && yearAgo(DateTime.fromISO("2026-11-13T18:00:00Z")) === "2025-11-13");

const a = fromYearAgo(record, at("2026-11-13"));
ok("a record with a point on the date: it begins on that very point (13 Nov 2025) and the earlier points are dropped", a[0].date === "2025-11-13" && a[0].value === 103 && a[0].carried === undefined && a.length === 27);
const gap = record.filter((p) => p.date !== "2025-11-15" && p.date !== "2025-11-16");
const b = fromYearAgo(gap, at("2026-11-15"));
ok("no point on the date (a weekend): the first point is dated exactly that day and holds the last figure before it, saying which day that was", b[0].date === "2025-11-15" && b[0].carried === "2025-11-14" && b[0].value === 104 && b[1].date === "2025-11-17");
ok("the carried figure is a real published one (never invented): its value is that of the carried day", b[0].value === gap.find((p) => p.date === b[0].carried)?.value);
ok("a record that does not reach back to the date is returned as it is", fromYearAgo(record, at("2026-11-08")) === record && !reachesYearAgo(record, at("2026-11-08")) && reachesYearAgo(record, at("2026-11-13")));
ok("other fields of a point are kept (an estimate flag)", fromYearAgo([{ date: "2025-11-01", value: 1, est: true }, { date: "2025-11-20", value: 2, est: false }], at("2026-11-13"))[0].est === true);
const c = carryToToday([{ date: "2026-11-11", value: 5 }, { date: "2026-11-12", value: 6 }], at("2026-11-13"));
ok("a price that stays until changed is carried on to today with its last value, saying from which day", c.carriedFrom === "2026-11-12" && c.points.length === 3 && c.points[2].date === "2026-11-13" && c.points[2].value === 6);
ok("a record that already ends today is not touched", carryToToday([{ date: "2026-11-13", value: 5 }], at("2026-11-13")).carriedFrom === null);

console.log(`yearWindow: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
