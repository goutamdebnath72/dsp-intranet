// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/flights.selftest.ts
// The Andal Airport flights: the airport's own flight page (fixtures/kniairport-flights.html, read on 13 Nov 2026) is read and checked; a page laid out otherwise is refused.
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { AIRPORT, duration, FLIGHTS_URL, FlightsError, LIVE_ARRIVALS_URL, LIVE_DEPARTURES_URL, nextFlight, parseFlights, until } from "./flights";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const page = readFileSync("src/lib/live/fixtures/kniairport-flights.html", "utf8");
const NOW = DateTime.fromISO("2026-11-13T10:00:00+05:30");
const f = parseFlights(page, NOW);
const refuses = (html: string) => { try { parseFlights(html, NOW); return false; } catch (e) { return e instanceof FlightsError; } };
const find = (list: typeof f.departures, n: string) => list.find((x) => x.number === n);

ok("the airport is Kazi Nazrul Islam Airport (RDP), read from the airport's own flight page, and the page's own live boards are linked, not read", AIRPORT.iata === "RDP" && FLIGHTS_URL === "https://kniairport.com/flights/" && page.includes(LIVE_ARRIVALS_URL) && page.includes(LIVE_DEPARTURES_URL) && f.airport === "Kazi Nazrul Islam Airport");
ok("the real page gives six departures and six arrivals (the old cards left in its markup, outside the flight list, are not read)", f.departures.length === 6 && f.arrivals.length === 6, `${f.departures.length}/${f.arrivals.length}`);
ok("the page's update stamp (12-11-2026 20:20:36 IST) is read", f.updatedAt === "2026-11-12T14:50:36.000Z", f.updatedAt);
// the cards, as the page shows them
const d509 = find(f.departures, "6E 509"), a508 = find(f.arrivals, "6E 508");
ok("a Departure card: IndiGo 509 leaves Durgapur 08:55 and reaches Bengaluru 11:35 (2 h 40 min)", !!d509 && d509.city === "Bengaluru" && d509.iata === "BLR" && d509.time === "08:55" && d509.otherTime === "11:35" && d509.minutes === 160 && d509.airline === "IndiGo", JSON.stringify(d509));
ok("an Arrival card: IndiGo 508 leaves Bengaluru 05:45 and reaches Durgapur 08:15 (2 h 30 min): the times of an arrival are read the other way round", !!a508 && a508.city === "Bengaluru" && a508.iata === "BLR" && a508.time === "08:15" && a508.otherTime === "05:45" && a508.minutes === 150, JSON.stringify(a508));
ok("the routes are Bengaluru, Hyderabad, Chennai, Delhi (two a day each way) and Mumbai, each way", ["BLR", "HYD", "MAA", "BOM"].every((c) => f.departures.some((x) => x.iata === c) && f.arrivals.some((x) => x.iata === c)) && f.departures.filter((x) => x.iata === "DEL").length === 2 && f.arrivals.filter((x) => x.iata === "DEL").length === 2);
ok("every flight takes between 1 h 30 min and 3 h 30 min, which is right for these routes", [...f.departures, ...f.arrivals].every((x) => x.minutes >= 90 && x.minutes <= 210), [...f.departures, ...f.arrivals].map((x) => x.minutes).join());
ok("the lists are in order of the time at Durgapur", f.departures.every((x, k) => k === 0 || f.departures[k - 1].time <= x.time) && f.arrivals.every((x, k) => k === 0 || f.arrivals[k - 1].time <= x.time));
ok("an IndiGo number carries its standard code (6E 509); every flight has an airline name", [...f.departures, ...f.arrivals].every((x) => /^6E \d{3,4}$/.test(x.number) && x.airline === "IndiGo"));
ok("the last departure of the day is the Mumbai flight at 20:10 (which lands at 23:05)", f.departures[f.departures.length - 1].iata === "BOM" && f.departures[f.departures.length - 1].time === "20:10" && f.departures[f.departures.length - 1].otherTime === "23:05");
// helpers
ok("the next flight is the first at or after the time; none is left late in the evening", nextFlight(f.departures, "10:00")?.time === "12:00" && nextFlight(f.departures, "20:10")?.time === "20:10" && nextFlight(f.departures, "20:11") === null && nextFlight(f.arrivals, "00:00")?.time === "08:15");
ok("durations and waits are said plainly: '2 h 30 min', '45 min', '2 h', 'in 1 h 20 min', 'now'", duration(150) === "2 h 30 min" && duration(45) === "45 min" && duration(120) === "2 h" && until("10:00", "11:20") === "in 1 h 20 min" && until("10:00", "10:00") === "now" && until("10:00", "10:35") === "in 35 min");
// refusals
ok("a page with no update stamp, no flight list or no flights is refused", refuses(page.replace(/last updated on/i, "refreshed")) && refuses(page.replace('<ul id="schedule_list">', '<ul id="other">')) && refuses(page.replace(/data-direction="(Departure|Arrival)"/g, "")));
ok("an unreadable card is refused: no flight number, a time that is not a time", refuses(page.replace(/<h4>Flight Number<br><span>508<\/span>/, "<h4>Flight Number<br><span>?</span>")) && refuses(page.replace("<span>08:55</span>", "<span>25:99</span>")));
ok("a card that is not to or from Durgapur is refused, and so is a page laid out the other way round", refuses(page.replace('data-departure="RDP" data-arrival="BLR"', 'data-departure="DEL" data-arrival="BLR"')) && refuses(page.replace(/Durgapur \(Kazi Nazrul Islam Airport\) <br><span>08:55/, "Bengaluru (Kempegowda International Airport) <br><span>08:55")));
ok("an impossible flight time is refused (a flight that arrives 20 minutes after it leaves)", refuses(page.replace("<span>11:35</span>", "<span>09:15</span>")));
ok("an unusable update time (in the far future) is refused", refuses(page.replace("12-11-2026 20:20:36", "12-11-2027 20:20:36")));
console.log(`flights: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
