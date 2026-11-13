// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/flightFacts.selftest.ts
// The two hand-reviewed facts of the flight list: the days a flight runs (a chip only for a checked row) and a rough one-way economy fare (the middle of dated public listings, hidden when out of date).
import { DateTime } from "luxon";
import { DAYS, daysChip, daysText, fareChip, fareGuideStale, FARE_AS_OF, FARE_STALE_DAYS, FARES, middleFare, rupees, WEEKDAYS, type DaysRow } from "./flightFacts";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const day = (iso: string) => DateTime.fromISO(iso, { zone: "Asia/Kolkata" });
const row = (days: DaysRow["days"]): DaysRow => ({ days, checked: "2026-11-20", source: "IndiGo timetable" });

// fares
ok("the middle of the listings is rounded to a hundred: Delhi 6,746 6,812 6,948 7,053 7,368 gives 6,900; Bengaluru (even number) gives 7,800; one listing gives itself rounded", middleFare(FARES.DEL.listings) === 6900 && middleFare(FARES.BLR.listings) === 7800 && middleFare(FARES.HYD.listings) === 7600 && middleFare(FARES.MAA.listings) === 6500 && middleFare([7548]) === 7500 && middleFare([1000, 2000]) === 1500);
ok("the rupee form uses Indian digit grouping: ₹7,800 and ₹10,593", rupees(7800) === "₹7,800" && rupees(10593) === "₹10,593");
const near = day("2026-11-14");
const del = fareChip("DEL", near)!;
ok("a route with listings has a chip 'about ₹6,900' whose tooltip gives the count, the range, the date, and says it is not the airline's price", !!del && del.text === "≈ ₹6,900" && /5 listings showed ₹6,746 to ₹7,368/.test(del.title) && /13 Nov 2026/.test(del.title) && /Not the airline's price/.test(del.title) && del.listings === 5, JSON.stringify(del));
ok("one listing is said to be one listing", /one listing showed ₹7,562/.test(fareChip("HYD", near)!.title) && fareChip("HYD", near)!.listings === 1);
ok("Chennai has its chip now (4 listings, about ₹6,500, range ₹5,299 to ₹8,206), and a code that is not in the table has none", fareChip("MAA", near)!.text === "≈ ₹6,500" && /4 listings showed ₹5,299 to ₹8,206/.test(fareChip("MAA", near)!.title) && fareChip("XXX", near) === null);
ok("the fare guide is dated and goes out of date: fine at 45 days, hidden after", FARE_AS_OF === "2026-11-13" && FARE_STALE_DAYS === 45 && !fareGuideStale(day("2026-12-28")) && fareGuideStale(day("2026-12-29")) && fareChip("DEL", day("2026-12-28")) !== null && fareChip("DEL", day("2027-01-05")) === null);
ok("an unusable date is out of date, and a custom table can be tested", fareGuideStale(near, "nonsense") && fareChip("DEL", near, { DEL: { listings: [] } }) === null && fareChip("DEL", near, { DEL: { listings: [5000] } })!.text === "≈ ₹5,000");
ok("every listing is a plausible one-way domestic fare (₹2,000 to ₹30,000) and no route lists fewer than one", Object.values(FARES).every((g) => g.listings.length >= 1 && g.listings.every((v) => v >= 2000 && v <= 30000)));
// days
ok("no flight shows a days chip until its days are checked: the table is empty and every lookup is null", Object.keys(DAYS).length === 0 && daysChip("6E 509") === null && daysChip("6E 2267") === null);
ok("a checked row gives 'Daily', 'Mon–Fri', or the days joined: daily; all seven days is daily; Mon to Fri; Mon · Wed · Fri; the order is the week's whatever order is given", daysText(row("daily")) === "Daily" && daysText(row([...WEEKDAYS])) === "Daily" && daysText(row(["Mon", "Tue", "Wed", "Thu", "Fri"])) === "Mon–Fri" && daysText(row(["Mon", "Wed", "Fri"])) === "Mon · Wed · Fri" && daysText(row(["Fri", "Mon", "Wed"])) === "Mon · Wed · Fri" && daysText(row(["Sat", "Sun"])) === "Sat · Sun");
ok("a row that is not valid gives no chip: no days, a repeated day, a day that is not a weekday, no check date, no source", daysText(undefined) === null && daysText(row([])) === null && daysText(row(["Mon", "Mon"])) === null && daysText(row(["Mon", "Funday" as never])) === null && daysText({ days: "daily", checked: "", source: "x" }) === null && daysText({ days: "daily", checked: "2026-11-20", source: " " }) === null);
const chip = daysChip("6E 509", { "6E 509": row(["Mon", "Wed", "Fri"]) })!;
ok("the days chip says where the days came from, when they were checked, and that schedules change", chip.text === "Mon · Wed · Fri" && /IndiGo timetable/.test(chip.title) && /20 Nov 2026/.test(chip.title) && /Schedules change/.test(chip.title));
console.log(`flightFacts: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
