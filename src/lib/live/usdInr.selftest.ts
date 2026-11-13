// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/usdInr.selftest.ts
// The dollar-rupee history: read from the real answer of Frankfurter (the European Central Bank's reference rates) of 13 Nov 2026, and refused when it is not what it should be.
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { parseUsdInr, rangeStart, validUsdInr, RateTrendError } from "./usdInr";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const real = JSON.parse(readFileSync("src/lib/live/fixtures/frankfurter-usd-inr.json", "utf8")) as { rates: Record<string, { INR: number }> };
const NOW = DateTime.fromISO("2026-11-13T11:00:00", { zone: "Asia/Kolkata" });
const throwsWith = (f: () => unknown, re: RegExp) => { try { f(); return false; } catch (e) { return e instanceof RateTrendError && re.test(e.message); } };
const clone = () => ({ rates: { ...real.rates } });

ok("the request starts six days before the anniversary, so that the working day on or after it is inside", rangeStart(NOW) === "2025-11-07");
const pts = parseUsdInr(real, NOW);
ok("the year is the 255 working days from 13 Nov 2025 (the same date a year before today, 13 Nov 2026) to 12 Nov 2026 (the latest the ECB has published), in date order", pts.length === 255 && pts[0].date === "2025-11-13" && pts[0].carried === undefined && pts[pts.length - 1].date === "2026-11-12" && pts.every((p, i) => i === 0 || pts[i - 1].date < p.date));
ok("the rate on this day a year ago (13 Nov 2025) is 88.69 and the latest is 94.04", pts[0].value === 88.69 && pts[pts.length - 1].value === 94.04);
const hi = pts.reduce((a, p) => (p.value > a.value ? p : a)), lo = pts.reduce((a, p) => (p.value < a.value ? p : a));
ok("the highest is 96.83 on 20 May 2026 and the lowest 88.50 on 19 Nov 2025", hi.value === 96.83 && hi.date === "2026-05-20" && lo.value === 88.5 && lo.date === "2025-11-19");
ok("the days before the anniversary that the request carried are dropped", !pts.some((p) => p.date < "2025-11-13"));
// a weekend anniversary: no rate is published, the last working day's rate is the one in force, said so, and the chart still begins on the very date
const sunday = parseUsdInr(real, DateTime.fromISO("2026-11-15T11:00:00", { zone: "Asia/Kolkata" }));
ok("when the anniversary is a Saturday (15 Nov 2025, today 15 Nov 2026) the chart begins on that date with the rate of Friday 14 Nov, marked as carried; the next point is the Monday", sunday[0].date === "2025-11-15" && sunday[0].carried === "2025-11-14" && sunday[0].value === 88.68 && sunday[1].date === "2025-11-17" && sunday[1].carried === undefined);
ok("a working-day anniversary needs no carrying", pts.every((p) => p.carried === undefined));
ok("a valid trend is accepted; a short or unordered one is not", validUsdInr({ points: pts }) && !validUsdInr({ points: pts.slice(0, 50) }) && !validUsdInr({ points: [...pts].reverse() }) && !validUsdInr(null));

// the order in which the source lists the days does not matter
const shuffled = { rates: Object.fromEntries(Object.entries(real.rates).reverse()) };
ok("the days are sorted whatever the order of the answer", parseUsdInr(shuffled, NOW)[0].date === "2025-11-13");

// refusals: a changed answer is an error, never a wrong number
ok("not an object of rates is refused", throwsWith(() => parseUsdInr({}, NOW), /form expected/) && throwsWith(() => parseUsdInr(null, NOW), /form expected/));
{ const j = clone(); j.rates["2026-03-02"] = { INR: 9.4 as number }; ok("an implausible rate (9.4) is refused", throwsWith(() => parseUsdInr(j, NOW), /not a plausible figure/)); }
{ const j = clone(); (j.rates as Record<string, unknown>)["2026-03-02"] = { USD: 94 }; ok("a day without a rupee rate is refused", throwsWith(() => parseUsdInr(j, NOW), /not a plausible figure/)); }
{ const j = clone(); (j.rates as Record<string, unknown>)["March 2"] = { INR: 94 }; ok("a day that is not a date is refused", throwsWith(() => parseUsdInr(j, NOW), /is not a date/)); }
ok("a stale record (latest day more than a week old) is refused", throwsWith(() => parseUsdInr(real, NOW.plus({ days: 9 })), /out of date/));
ok("a record that is only a few days old is accepted (a weekend)", parseUsdInr(real, NOW.plus({ days: 3 })).length === 254);
{ const j = { rates: Object.fromEntries(Object.entries(real.rates).filter(([d]) => d >= "2026-06-01")) }; ok("a record shorter than a year is refused", throwsWith(() => parseUsdInr(j, NOW), /shorter than a year/)); }
{ const j = { rates: Object.fromEntries(Object.entries(real.rates).filter(([d]) => d < "2026-01-05" || d > "2026-01-30")) }; ok("a hole of more than a week in the record is refused", throwsWith(() => parseUsdInr(j, NOW), /gap after 2026-01-02/)); }
{ const j = { rates: Object.fromEntries(Object.entries(real.rates).filter(([d]) => d >= "2025-11-20" || d < "2025-11-10")) }; ok("a record that begins well after the anniversary is refused", throwsWith(() => parseUsdInr(j, NOW), /full year/)); }

// the route and the status page
const route = readFileSync("src/app/api/live/usd-inr/route.ts", "utf8").replace(/^\s*\/\/.*$/gm, "");
ok("the route reads nothing from the caller (no request, no cookies, no headers) and asks one fixed Frankfurter address", !/\bnew Request\b|\brequest\b|cookies\(|headers\(|searchParams/.test(route) && /api\.frankfurter\.dev\/v1\/\$\{rangeStart\(\)\}\.\.\?base=USD&symbols=INR/.test(route) && /export async function GET\(\)/.test(route));
ok("the status page asks it too", /usd-inr\/route/.test(readFileSync("src/app/api/live/status/route.ts", "utf8")));

console.log(`usdInr: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
