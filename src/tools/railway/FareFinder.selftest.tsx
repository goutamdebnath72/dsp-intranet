// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/railway/FareFinder.selftest.tsx
// "Find a fare": the closed box, the result list (order, switches, dates, honesty lines).
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { buildFind } from "../../lib/live/fareFind";
import { parseRailway } from "../../lib/live/railway";
import type { StopTrainRow } from "../../lib/live/fareLegStore";
import type { ClassFare } from "../../lib/live/fare";
import { FareFinder, FindResults, shownTrains } from "./FareFinder";
import { RailwayBody } from "./RailwayCard";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

const rw = parseRailway(JSON.parse(readFileSync("src/lib/live/fixtures/railradar-dgr-sample.json", "utf8")), { min: 1 });
const cl = (code: string, total: number, basis?: "table", high?: number): ClassFare => ({ code, name: code, total, ...(high ? { high } : {}), ...(basis ? { basis } : {}), parts: [] });
const row = (number: string, classes: ClassFare[], at = "2026-11-14T08:00:00.000Z"): StopTrainRow => ({ number, trainName: "n" + number, receivedAt: at, leg: { to: "ASN", name: "Asansol Jn", seq: 22, distanceKm: 43, journeyDate: "2026-11-21", classes } });
const rows = [row("13005", [cl("SL", 150), cl("3A", 520)]), row("22303", [cl("CC", 500)], "2026-11-12T08:00:00.000Z"), row("63505", [cl("UR", 35, "table", 40)]), row("12019", [cl("CC", 400), cl("EC", 800)]), row("03008", [cl("SL", 120)])];
const now = DateTime.fromISO("2026-11-20T12:00:00", { zone: "Asia/Kolkata" });
const answer = buildFind({ code: "ASN", name: "Asansol Jn" }, rows, rw, { withFares: 220, withLegs: 40 }, now)!;
const M = { hm: "10:00", day: "wed" as const };
const html = (o: Partial<{ onlyToday: boolean; specials: boolean; sort: "time" | "price" }> = {}, a = answer) => renderToStaticMarkup(<FindResults answer={a} now={M} onlyToday={o.onlyToday ?? false} specials={o.specials ?? true} sort={o.sort ?? "time"} />);

const closed = renderToStaticMarkup(<FareFinder now={M} onlyToday={false} specials />);
ok("the finder is closed at first: a button and one line, no search box and no request (a page of trains makes none)", /data-finder-button/.test(closed) && /Find a fare to a station/.test(closed) && /aria-expanded="false"/.test(closed) && !/data-find-results|Going from Durgapur to|Loading the stations/.test(closed));
const body = renderToStaticMarkup(<RailwayBody data={rw} now={M} />);
ok("it sits on the card, above the lists of trains", /data-finder/.test(body) && body.indexOf("data-finder") < body.indexOf('aria-label="Express and mail trains"'));

const h = html();
ok("the trains to a station are listed with their time at Durgapur, name, number, class word, distance, days and a chip per class with its fare", (h.match(/data-find-train=/g) ?? []).length === 5 && /Amritsar Mail/.test(text(h)) && /13005 · Express/.test(text(h)) && /runs on to Amritsar Junction/.test(text(h)) && /43 km/.test(text(h)) && /SL ₹150/.test(text(h)) && /3A ₹520/.test(text(h)) && /Daily/.test(text(h)));
ok("a Vande Bharat and a Shatabdi wear their badges and edges; a local train is violet and its fare says 'about' with its range", /VANDE BHARAT/.test(h) && /SHATABDI/.test(h) && /border-l-cyan-600/.test(h) && /border-l-indigo-600/.test(h) && /border-violet-100/.test(h) && /about ₹35–40/.test(text(h)));
ok("the date of the OLDEST fare is said first (12 Nov), then the count of trains, then the ONE-LINE disclaimer and the source in few words", /Fares last received from the railway: Thu 12 Nov 2026/.test(text(h)) && /5 trains go from Durgapur to Asansol Junction \(ASN\)/.test(text(h)) && /Approximate: may differ when you book\. Check IRCTC\./.test(text(h)) && /Source: RailRadar · Railway Board fare table \(local trains\)/.test(text(h)));
ok("it is honest that only some trains are collected so far, and that 'about' is an estimate, in a few words", /Collected for 40 of 220 trains so far: others may be missing\./.test(text(h)) && /“about” = estimate \(local train\)\./.test(text(h)));
ok("when everything is collected the 'may not be listed yet' line is gone", !/others may be missing/.test(html({}, { ...answer, coverage: { withFares: 220, withLegs: 220 } })));
const t = (o: Parameters<typeof shownTrains>[1]) => shownTrains(answer.trains, o).map((x) => x.number);
ok("by price puts the cheapest first (the local at Rs 35, then Rs 120 ...), by time keeps the order at Durgapur", t({ today: null, specials: true, sort: "price" })[0] === "63505" && t({ today: null, specials: true, sort: "price" }).join() !== t({ today: null, specials: true, sort: "time" }).join() && t({ today: null, specials: true, sort: "time" }).join() === answer.trains.map((x) => x.number).join());
ok("the specials switch hides special trains (03008 is one), and 'only today' hides trains that do not run today", !t({ today: null, specials: false, sort: "time" }).includes("03008") && t({ today: null, specials: true, sort: "time" }).includes("03008") && shownTrains(answer.trains, { today: "wed", specials: true, sort: "time" }).every((x) => x.days.includes("wed")) && shownTrains(answer.trains, { today: "wed", specials: true, sort: "time" }).length < answer.trains.length);
ok("when the switches hide every train it says so and how to see them", /No train matches the switches above/.test(text(html({ onlyToday: true, specials: false }, { ...answer, trains: answer.trains.filter((x) => x.kind === "special") }))));
ok("after the paid month the list is dated in amber and says the fares are no longer refreshed", /Check IRCTC for today's fare/.test(text(html({}, { ...answer, frozen: true }))) && /data-old="true"/.test(html({}, { ...answer, frozen: true })));
ok("the list scrolls inside the box and is positioned (a long list must not stretch the window)", /relative mt-2 max-h-96 space-y-1\.5 overflow-y-auto/.test(h));
console.log(`FareFinder: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
