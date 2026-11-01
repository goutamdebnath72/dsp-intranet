// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/peopleEvents/rules.selftest.ts
// Step 65a: the date rules of the People & Events widget. PURE.

import { DateTime } from "luxon";
import { checkDates, isBirthdayOn, isMtTicket, jubileeDate, jubileeInMonthOf, minJoiningAge, msUntilNextMidnight, parseDay, retirementDate, retiresInMonthOf, todayIST, ZONE } from "./rules";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const day = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).startOf("day");
const iso = (d: DateTime) => d.toISODate();

// ---- the day is the day in INDIA ----
ok("todayIST: 23:30 UTC on 30 Oct is already 31 Oct in India (UTC+5:30)", iso(todayIST(DateTime.fromISO("2026-10-30T23:30:00Z"))) === "2026-10-31");
ok("...and 18:29 UTC on 30 Oct is still 30 Oct in India", iso(todayIST(DateTime.fromISO("2026-10-30T18:29:00Z"))) === "2026-10-30");
ok("a date is read in India, whatever the machine's own zone is (no day is lost)", iso(parseDay("2026-10-31")) === "2026-10-31" && parseDay("2026-10-31").zoneName === ZONE);
ok("a date that does not exist is invalid, not rolled over", !parseDay("2026-02-30").isValid && !parseDay("nonsense").isValid);

// ---- birthdays ----
ok("a birthday is today when the day and the month are today's, in any year", isBirthdayOn("1985-10-31", day("2026-10-31")) && isBirthdayOn("1966-03-01", day("2027-03-01")) && !isBirthdayOn("1985-10-30", day("2026-10-31")) && !isBirthdayOn("1985-11-30", day("2026-10-30")));
ok("29 February: celebrated on 28 February in a year without one", isBirthdayOn("1988-02-29", day("2026-02-28")) && isBirthdayOn("1988-02-29", day("2027-02-28")) && !isBirthdayOn("1988-02-29", day("2026-03-01")));
ok("...and on 29 February itself in a leap year, NOT also on the 28th of that year", isBirthdayOn("1988-02-29", day("2028-02-29")) && !isBirthdayOn("1988-02-29", day("2028-02-28")));
ok("a 28 February birthday is not moved", isBirthdayOn("1990-02-28", day("2026-02-28")) && isBirthdayOn("1990-02-28", day("2028-02-28")));
ok("garbage is never a birthday", !isBirthdayOn("", day("2026-10-31")) && !isBirthdayOn("2026-13-45", day("2026-10-31")));

// ---- retirement: the last day of the month in which 60 is reached ----
ok("born 14 Oct 1966 -> retires 31 Oct 2026", iso(retirementDate("1966-10-14")) === "2026-10-31");
ok("born 1 Oct 1966 and 31 Oct 1966 -> the same farewell day, 31 Oct 2026 (the month of the 60th birthday)", iso(retirementDate("1966-10-01")) === "2026-10-31" && iso(retirementDate("1966-10-31")) === "2026-10-31");
ok("born in February: 28 Feb in a normal year, 29 Feb in a leap year (2064)", iso(retirementDate("1967-02-10")) === "2027-02-28" && iso(retirementDate("2004-02-10")) === "2064-02-29");
ok("born 29 Feb 1968 (60th birthday in 2028, a leap year) -> 29 Feb 2028", iso(retirementDate("1968-02-29")) === "2028-02-29");
ok("born 30 April 1966 -> 30 April 2026", iso(retirementDate("1966-04-30")) === "2026-04-30");
ok("born 31 Dec 1966 -> 31 Dec 2026 (the year does not roll)", iso(retirementDate("1966-12-31")) === "2026-12-31");
ok("retiresInMonthOf: the whole month counts, from the 1st to the last day", retiresInMonthOf("1966-10-14", day("2026-10-01")) && retiresInMonthOf("1966-10-14", day("2026-10-31")) && !retiresInMonthOf("1966-10-14", day("2026-11-01")) && !retiresInMonthOf("1966-10-14", day("2026-09-30")) && !retiresInMonthOf("1966-10-14", day("2025-10-15")));
ok("a person who is 59 and 11 months is not retiring this month", !retiresInMonthOf("1966-11-05", day("2026-10-31")));

// ---- silver jubilee: 25 years of service completed in the month ----
ok("joined 12 Oct 2001 -> the 25th year is completed on 12 Oct 2026", iso(jubileeDate("2001-10-12")) === "2026-10-12" && jubileeInMonthOf("2001-10-12", day("2026-10-31")) && jubileeInMonthOf("2001-10-12", day("2026-10-01")));
ok("joined 31 Oct 2001 -> still this month; joined 1 Nov 2001 -> next month", jubileeInMonthOf("2001-10-31", day("2026-10-15")) && !jubileeInMonthOf("2001-11-01", day("2026-10-15")));
ok("24 years and 25 years and 26 years: only the 25th year is a jubilee", !jubileeInMonthOf("2002-10-12", day("2026-10-15")) && !jubileeInMonthOf("2000-10-12", day("2026-10-15")));
ok("joined 29 Feb 2000 -> 28 Feb 2025 (no 29th that year), in February", iso(jubileeDate("2000-02-29")) === "2025-02-28" && jubileeInMonthOf("2000-02-29", day("2025-02-10")));

// ---- the age rules ----
ok("MT = an executive with a 49xxxx ticket; a promotee (any other second digit), a non-executive with such a number, a malformed ticket are not", isMtTicket("498301", "executive") && !isMtTicket("412345", "executive") && !isMtTicket("490000", "nonexecutive") && !isMtTicket("49830", "executive") && !isMtTicket("4983011", "executive") && isMtTicket(" 491234 ", "executive"));
ok("minimum age at joining: 23 for an MT, 18 for everybody else", minJoiningAge("498301", "executive") === 23 && minJoiningAge("412345", "executive") === 18 && minJoiningAge("123456", "nonexecutive") === 18);
const T = day("2026-10-31");
const chk = (dob: string | null, doj: string | null, ticket: string, cohort: string) => checkDates({ dob, doj, ticketNo: ticket, cohort, today: T });
ok("a fine pair passes (an MT who joined at 24, a non-executive who joined at 18 exactly)", chk("1990-05-05", "2014-06-01", "498301", "executive").length === 0 && chk("1980-03-03", "1998-03-03", "123456", "nonexecutive").length === 0);
ok("joined the day BEFORE the 18th birthday: refused; on the birthday: fine", chk("1980-03-03", "1998-03-02", "123456", "nonexecutive").length === 1 && chk("1980-03-03", "1998-03-03", "123456", "nonexecutive").length === 0);
ok("an MT who joined at 22: refused (23 is the minimum); at exactly 23: fine; the same age is fine for a promotee", chk("1990-05-05", "2012-06-01", "498301", "executive").some((m) => /23/.test(m)) && chk("1990-05-05", "2013-05-05", "498301", "executive").length === 0 && chk("1990-05-05", "2012-06-01", "412345", "executive").length === 0);
ok("joined or born in the future: refused", chk("1990-05-05", "2027-01-01", "123456", "nonexecutive").some((m) => /joined in the future/.test(m)) && chk("2030-01-01", null, "123456", "nonexecutive").some((m) => /born in the future/.test(m)));
ok("already past the farewell day (60 reached last month): refused as an employee in service", chk("1966-09-15", null, "123456", "nonexecutive").some((m) => /retirement/.test(m)) && chk("1966-10-15", null, "123456", "nonexecutive").length === 0);
ok("empty dates are not a problem; a bad date is reported", chk(null, null, "123456", "nonexecutive").length === 0 && chk("2026-13-01", null, "123456", "nonexecutive").length === 1);

// ---- the midnight timer ----
const noon = DateTime.fromISO("2026-10-31T12:00:00", { zone: ZONE });
ok("midnight: from noon it is 12 hours", msUntilNextMidnight(noon) === 12 * 3600 * 1000);
ok("...from one second before midnight it is one second; from midnight exactly it is a full day", msUntilNextMidnight(DateTime.fromISO("2026-10-31T23:59:59", { zone: ZONE })) === 1000 && msUntilNextMidnight(DateTime.fromISO("2026-11-01T00:00:00", { zone: ZONE })) === 24 * 3600 * 1000);
ok("...it is counted in INDIA's day: 18:30 UTC is midnight there, whatever zone the machine has", msUntilNextMidnight(DateTime.fromISO("2026-10-31T18:29:00Z")) === 60 * 1000);

console.log(`peopleEvents rules selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
