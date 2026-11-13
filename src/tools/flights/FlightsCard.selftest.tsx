// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/flights/FlightsCard.selftest.tsx
// The Andal Airport flights card and the words that open it: drawn from the airport's real flight page (13 Nov 2026), saying plainly that it is a timetable and not live status; the route reads nothing from the caller.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DateTime } from "luxon";
import { detectTool } from "../../lib/tools/detect";
import { parseFlights } from "../../lib/live/flights";
import { FlightsBody, FLIGHTS_REFRESH_MS, updatedText } from "./FlightsCard";
import { flightsTopic } from "./topic";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const data = parseFlights(readFileSync("src/lib/live/fixtures/kniairport-flights.html", "utf8"), DateTime.fromISO("2026-11-13T10:00:00+05:30"));
const TODAY = DateTime.fromISO("2026-11-14T10:00:00+05:30");
const draw = (now: string, today: DateTime = TODAY) => renderToStaticMarkup(<FlightsBody data={data} now={now} today={today} />);
const html = draw("10:00");
const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

ok("the card names the airport and its code, and says when the airport last updated its list (12 Nov, 8:20 pm), in Indian time", /Kazi Nazrul Islam Airport/.test(text) && /\(RDP\)/.test(text) && text.includes("12 Nov, 8:20 pm") && updatedText("2026-11-12T14:50:36.000Z") === "12 Nov, 8:20 pm" && /Indian time/.test(text));
ok("two lists, leaving Durgapur and reaching Durgapur, six flights in each", /aria-label="Leaving Durgapur"/.test(html) && /aria-label="Reaching Durgapur"/.test(html) && (html.match(/<li class="flex items-baseline gap-4/g) ?? []).length === 12);
ok("a departure says 'To Bengaluru (BLR)', the airline and number, when it reaches and how long it flies: 08:55, IndiGo 6E 509, reaches 11:35, 2 h 40 min", /08:55/.test(text) && /To Bengaluru \(BLR\)/.test(text) && /IndiGo 6E 509 · reaches 11:35 · 2 h 40 min/.test(text));
ok("an arrival says 'From Bengaluru (BLR)', when it leaves there and how long it flies: 08:15, IndiGo 6E 508, leaves 05:45, 2 h 30 min", /From Bengaluru \(BLR\)/.test(text) && /IndiGo 6E 508 · leaves 05:45 · 2 h 30 min/.test(text));
ok("the next flight of each list is marked with how long to wait: at 10:00 the next departure is 12:00 (in 2 h) and the next arrival 11:25 (in 1 h 25 min)", (html.match(/aria-current="true"/g) ?? []).length === 2 && /Next · in 2 h/.test(text) && /Next · in 1 h 25 min/.test(text));
const late = draw("20:30"), midnight = draw("00:05");
ok("late in the evening no departure is marked and the card says no more flights are left in that list; early in the morning the first flight of each list is next", !/aria-current="true"/.test(late.split('aria-label="Reaching Durgapur"')[0]) && /No more flights in this list after 20:30 today/.test(late) && (midnight.match(/aria-current="true"/g) ?? []).length === 2 && !/No more flights/.test(midnight));
ok("flights already gone are dimmed", (draw("15:00").match(/opacity-55/g) ?? []).length > 3 && !/opacity-55/.test(draw("00:05")));
ok("the card says plainly that it is the timetable, NOT live status (no delay, no cancellation), that the schedule can change, and to check with the airline on the day", /timetable, not live status/.test(text) && /does not show a delay or a cancellation/.test(text) && /does not say on which days of the week a flight runs/.test(text) && /check with the airline on the day of travel/.test(text));
ok("the title has headroom above it (padding and an equal negative margin), so the ellipsis clip does not shave the tops of b, d, h, l, f and the dot of i", (html.match(/pt-\[0\.12em\] -mt-\[0\.12em\]/g) ?? []).length === 12);
ok("it links the airport's own live arrivals and departures boards and its flight page, each in a new tab with noopener", (html.match(/target="_blank"/g) ?? []).length === 3 && (html.match(/rel="noopener noreferrer"/g) ?? []).length === 3 && /fidslive\.in\/arrival_no_add/.test(html) && /fidslive\.in\/departure_no_add/.test(html) && /kniairport\.com\/flights\//.test(html));
ok("the card refreshes itself every ten minutes", FLIGHTS_REFRESH_MS === 10 * 60 * 1000);
ok("the time sits at the TOP LEFT of each card and its top is the top of the first line: both have the room above a capital trimmed (text-box trim-start cap alphabetic), the larger time is let down 0.05 em for the height of Poppins' round digits, and a browser without text-box falls back to the baselines; no fixed line height (the omnibar's text stays elastic)", !/<li class="flex items-(center|start)/.test(html) && (html.match(/<li class="flex items-baseline gap-4 [^"]*supports-\[text-box:trim-start_cap_alphabetic\]:items-start/g) ?? []).length === 12 && (html.match(/class="relative top-\[0\.05em\] w-14 shrink-0 text-lg font-extrabold leading-none[^"]*supports-\[text-box:trim-start_cap_alphabetic\]:\[text-box:trim-start_cap_alphabetic\]/g) ?? []).length === 12 && (html.match(/leading-snug text-slate-800 supports-\[text-box:trim-start_cap_alphabetic\]:\[text-box:trim-start_cap_alphabetic\]/g) ?? []).length === 12 && !/leading-\d|leading-\[/.test(html));
ok("the first line is NOT trimmed at its bottom: it is cut with overflow hidden for its ellipsis, and a trim at the baseline would clip the tails of g, y and p ('Bengaluru' would read 'Benaaluru', 'Hyderabad' 'Hvderabad')", !/trim-both/.test(html) && !/trim-end/.test(html) && (html.match(/block truncate pt-\[0\.12em\] -mt-\[0\.12em\] text-sm font-bold/g) ?? []).length === 12);
ok("more room between the time and the three lines of data on the right: a gap of 1rem (gap-4) after a time column of 3.5rem, where it was 0.75rem", (html.match(/gap-4/g) ?? []).length >= 12 && !/<li class="flex items-baseline gap-3/.test(html) && (html.match(/class="relative top-\[0\.05em\] w-14/g) ?? []).length === 12);
// the fare chip and the days chip
const fareChips = html.match(/≈ ₹[\d,]+/g) ?? [];
ok("a flight LEAVING Durgapur shows a rough fare chip 'about ₹6,900, one way, economy' for Delhi; the arrivals show none (the listings are for Durgapur to the city)", fareChips.length === 6 && /≈ ₹6,900 one way, economy/.test(text) && !html.split('aria-label="Reaching Durgapur"')[1].includes("≈ ₹"), fareChips.join());
ok("every route has its chip, Chennai included (about ₹6,500): all six departures carry one", /≈ ₹7,800/.test(text) && /≈ ₹7,600/.test(text) && /≈ ₹7,500/.test(text) && /≈ ₹6,500/.test(text) && (html.split('aria-label="Reaching Durgapur"')[0].match(/bg-amber-100/g) ?? []).length === 6);
ok("each fare chip has a tooltip that gives the count of listings, the range and the date and says it is not the airline's price", /title="Rough one-way economy fare, about the middle of what public booking sites listed on 13 Nov 2026: 5 listings showed ₹6,746 to ₹7,368\. Not the airline&#x27;s price\.|title="Rough one-way economy fare[^"]*Not the airline(&#x27;|')s price/.test(html));
ok("the card carries a disclaimer under the lists: a rough guide, not the airline's price, the sites it came from and their date, they disagree, depends on the date, higher close to the day, no fare for Chennai, check IndiGo", /About the fares:/.test(text) && /not the airline's price/.test(text) && /ixigo, MakeMyTrip, Goibibo, Momondo, Yatra, Google Flights and IndiGo's route page/.test(text) && /13 Nov 2026/.test(text) && /disagree with one another/.test(text) && /how early you book/.test(text) && /much higher close to the day of travel/.test(text) && /rougher guide still/.test(text) && !/No fare was found/.test(text) && /IndiGo's own booking page/.test(text));
const old = draw("10:00", DateTime.fromISO("2027-01-10T10:00:00+05:30"));
ok("an out-of-date fare guide (over 45 days) shows no fare chip and says so", !/≈ ₹/.test(old) && !/About the fares/.test(old) && /The fare guide is out of date/.test(old.replace(/<[^>]+>/g, " ")));
ok("no days chip is drawn while no flight's days have been checked (nothing is guessed), and the card still says the page does not give the days", !/bg-sky-100 px-2 py-0.5 text-\[11px\]/.test(html) && /does not say on which days of the week a flight runs/.test(text));
// the words
const live = (q: string) => { const h = detectTool(q, DateTime.fromISO("2026-11-13T10:00:00+05:30")); return h && h.kind === "live" ? h.topic : null; };
ok("'andal airport flights to and from' and its like open the card", ["andal airport flights to and from", "durgapur flights", "flights", "andal airport", "durgapur airport flight timetable", "rdp flights", "flight schedule", "kazi nazrul islam airport", "durgapur airport", "kaji nazrul airport", "Kaji Nazrul Islam Airport Durgapur", "flights from durgapur to delhi"].every((q) => live(q) === "flights"));
ok("an ordinary question is not the card's: 'ltc flight booking rules' and 'air travel entitlement'", ["ltc flight booking rules", "air travel entitlement"].every((q) => live(q) !== "flights"));
ok("the sample questions are the card's own words", flightsTopic.samples.every((s) => live(s.q) === "flights") && flightsTopic.samples.some((s) => s.q === "andal airport flights to and from"));
const route = readFileSync("src/app/api/live/flights/route.ts", "utf8");
ok("the route reads nothing from the caller: no request parameter, the airport's fixed address only", /export async function GET\(\)/.test(route) && !/searchParams|req\.|request/.test(route) && /FLIGHTS_URL/.test(route));
console.log(`FlightsCard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
