// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/freshness.selftest.ts
// Checks whether a live card's figure is marked live, the last close, or a saved copy, at the hours that matter.
import { DateTime } from "luxon";
import { quoteFreshness, goldFreshness } from "./freshness";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const ist = (iso: string) => DateTime.fromISO(iso, { zone: "Asia/Kolkata" });
const Q = (name: string, time: string) => ({ name, time });

// I use Monday 16 Nov 2026 as the weekday; Saturday 14 and Sunday 15 are not weekdays.
const monMid = ist("2026-11-16T11:00:00");
ok("a price a few minutes old, inside the session, is LIVE", quoteFreshness(Q("Sensex", ist("2026-11-16T10:48:00").toISO()!), monMid).state === "live");
ok("the same price, 25 minutes old, is the last close (the feed has stopped or the day is a holiday)", quoteFreshness(Q("Sensex", ist("2026-11-16T10:35:00").toISO()!), monMid).state === "last");
ok("before the opening bell, yesterday's close is the LAST CLOSE", quoteFreshness(Q("Sensex", ist("2026-11-13T15:30:00").toISO()!), ist("2026-11-16T09:00:00")).text === "LAST CLOSE");
ok("after the close, the day's last price is the LAST CLOSE", quoteFreshness(Q("Nifty 50", ist("2026-11-16T15:30:00").toISO()!), ist("2026-11-16T16:30:00")).state === "last");
ok("on a Sunday the last price is the LAST CLOSE, however fresh the fetch", quoteFreshness(Q("Sensex", ist("2026-11-13T15:30:00").toISO()!), ist("2026-11-15T12:00:00")).state === "last");
ok("a weekday market holiday needs no calendar: the newest price is the old close, so it reads LAST CLOSE", quoteFreshness(Q("Sensex", ist("2026-11-13T15:30:00").toISO()!), ist("2026-11-16T11:00:00")).state === "last");
ok("a price at 9:20, five minutes after the bell, is LIVE", quoteFreshness(Q("Sensex", ist("2026-11-16T09:15:00").toISO()!), ist("2026-11-16T09:20:00")).state === "live");
ok("a saved copy is SAVED COPY even when its time is recent; another name beside it is not", quoteFreshness(Q("Nifty 50", ist("2026-11-16T10:55:00").toISO()!), monMid, ["Nifty 50"]).state === "saved" && quoteFreshness(Q("Sensex", ist("2026-11-16T10:55:00").toISO()!), monMid, ["Nifty 50"]).state === "live");
ok("a time that cannot be read is never called live", quoteFreshness(Q("Sensex", "not a time"), monMid).state === "last");

ok("gold: today's rate with no asOf is live: the opening (AM) rate, then the closing (PM) rate", goldFreshness({ session: "AM" }, false).text === "LIVE · OPENING (AM)" && goldFreshness({ session: "PM" }, false).text === "LIVE · CLOSING (PM)" && goldFreshness({ session: "PM" }, false).state === "live");
ok("gold: when IBJA has put up nothing for today, the pill is the last published day, in grey", (() => { const g = goldFreshness({ session: "PM", asOf: "2026-11-13" }, false); return g.state === "last" && g.text === "LAST PUBLISHED · Fri, 13 Nov"; })());
ok("gold: a saved copy is SAVED COPY whatever else is true", goldFreshness({ session: "PM" }, true).state === "saved" && goldFreshness({ session: "PM", asOf: "2026-11-13" }, true).text === "SAVED COPY");
ok("every label carries a sentence for the tooltip and the screen reader", [quoteFreshness(Q("x", ""), monMid), quoteFreshness(Q("x", ""), monMid, ["x"]), goldFreshness({ session: "AM" }, false), goldFreshness({ session: "PM", asOf: "2026-11-13" }, false), goldFreshness({ session: "AM" }, true)].every((l) => l.detail.length > 20));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
