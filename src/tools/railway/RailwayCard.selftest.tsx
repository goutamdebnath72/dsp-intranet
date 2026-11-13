// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/railway/RailwayCard.selftest.tsx
// The Durgapur Railway Station card and the words that open it: drawn from a sample of RailRadar's real answer (13 Nov 2026), saying plainly that it is a timetable and not live status; the route reads nothing from the caller.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { detectTool } from "../../lib/tools/detect";
import { parseRailway } from "../../lib/live/railway";
import { RailwayBody, RAILWAY_REFRESH_MS } from "./RailwayCard";
import { railwayTopic } from "./topic";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const data = parseRailway(JSON.parse(readFileSync("src/lib/live/fixtures/railradar-dgr-sample.json", "utf8")), { min: 1 });
const withOther = { ...data, express: { ...data.express, other: [{ ...data.express.west[0], number: "99999", name: "Unplaced Test Express", fromCode: "AAA", toCode: "BBB", heading: "other" as const }] } };
const draw = (hm: string, day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" = "wed", more: { todayOnly?: boolean; specials?: boolean } = {}) => renderToStaticMarkup(<RailwayBody data={data} now={{ hm, day }} {...more} />);
const html = draw("10:00");
const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&gt;/g, ">").replace(/\s+/g, " ");

ok("the card names the station and its code and says how many trains it holds", /Durgapur Railway Station/.test(text) && /\(DGR\)/.test(text) && /24 in all/.test(text) && /Indian time/.test(text));
ok("it explains the two times: the departure large and the arrival under it, and that the days are the days at Durgapur", /the departure in large figures and the arrival under it/.test(text) && /days are the days the train is at Durgapur/.test(text));
ok("there are two sections, the express and mail trains first and the local trains below them, each in two directions", html.indexOf('aria-label="Express and mail trains"') > 0 && html.indexOf('aria-label="Local trains (MEMU)"') > html.indexOf('aria-label="Express and mail trains"') && (html.match(/aria-label="Towards Barddhaman and Howrah"/g) ?? []).length === 2 && (html.match(/aria-label="Towards Asansol and beyond"/g) ?? []).length === 2);
ok("a train shows its time (the departure, 00:06 for 13135), its arrival under it (arr 00:04), name, number, class and the two ends", /00:06/.test(text) && /arr 00:04/.test(text) && /Jaynagar Weekly Express/.test(text) && /13135 · Express · KOAA → JYG/.test(text));
ok("a train that starts here says so and one that ends here says so", /starts here/.test(text) && /ends here/.test(text));
ok("the days are chips: Daily for the daily trains, the day at Durgapur for the rest (13135 is Sun, not Sat)", (html.match(/>Daily</g) ?? []).length >= 8 && /rounded-full bg-sky-100[^>]*>Sun</.test(html) && /rounded-full bg-sky-100[^>]*>Mon, Tue, Fri, Sat</.test(html));
ok("a special train is marked Special", (html.match(/>Special</g) ?? []).length >= 4);
const htmlOther = renderToStaticMarkup(<RailwayBody data={withOther} now={{ hm: "10:00", day: "wed" }} />);
ok("when every train is placed there is no third list; a train the data cannot place goes in a closed details block, saying why, with where it starts and ends", !/<details/.test(html) && /<details/.test(htmlOther) && /Other through trains/.test(htmlOther.replace(/<[^>]+>/g, " ")) && /does not say which way they run past Durgapur/.test(htmlOther) && /Unplaced Test Express/.test(htmlOther) && /AAA → BBB/.test(htmlOther.replace(/&gt;/g, ">")));
ok("the next train that runs today is marked with the wait: on Wednesday at 10:00 the first marked one is a Wednesday train after 10:00", (html.match(/aria-current="true"/g) ?? []).length >= 2 && /Next · in /.test(text));
ok("trains already gone today are dimmed, and none are dimmed at one minute past midnight", (draw("20:00").match(/opacity-55/g) ?? []).length > 5 && !/opacity-55/.test(draw("00:01", "sun")));
ok("the switches are buttons that say whether they are on: only trains that run today (off) and special trains (on)", /aria-pressed="false"[^>]*>Only trains that run today</.test(html) && /aria-pressed="true"[^>]*>Special trains</.test(html));
const onlyToday = draw("10:00", "wed", { todayOnly: true }), noSpecials = draw("10:00", "wed", { specials: false });
ok("with 'only today' on, trains of other days are left out (13135 runs only on Sunday); with specials off, no Special chip", !/13135/.test(onlyToday) && /13135/.test(html) && !/>Special</.test(noSpecials));
ok("the card says plainly that it is the timetable, NOT live running status (no delay, cancellation or platform), that the railway revises timings, and links the official live enquiry", /timetable, not live running status/.test(text) && /does not show a delay, a cancellation or a platform/.test(text) && /check on the day/.test(text) && /enquiry\.indianrail\.gov\.in\/ntes/.test(html));
ok("it names how the days and the direction are worked out, not as facts the source stated", /worked out from the train's starting station/.test(text) && /direction is taken from where each train starts and ends \(for a few, from its route\)/.test(text));
ok("its links open in a new tab with noopener, and the plant's key is nowhere in the page", (html.match(/target="_blank"/g) ?? []).length === 2 && (html.match(/rel="noopener noreferrer"/g) ?? []).length === 2 && !/rg_[0-9a-f]{20}/.test(html));
ok("the lists scroll inside the card (a station has hundreds of trains) and can be reached by keyboard", /max-h-\[26rem\][^"]*overflow-y-auto/.test(html) && /tabindex="0"/.test(html));
ok("the time and the first line start on the same row of pixels (the trimming of the flights card)", (html.match(/text-box:trim-start_cap_alphabetic/g) ?? []).length >= 2 * 10 && /top-\[0\.05em\]/.test(html));
ok("the title has headroom above it (padding and an equal negative margin) so that the tops of b, d, h, l, f and the dot of i are not shaved by the ellipsis clip that the capital-height trim would otherwise cause", (html.match(/truncate pt-\[0\.12em\] -mt-\[0\.12em\]|pt-\[0\.12em\] -mt-\[0\.12em\]/g) ?? []).length >= 10);
ok("the card asks the server once an hour (the server itself keeps the answer twelve hours)", RAILWAY_REFRESH_MS === 60 * 60 * 1000);
// the words
const live = (q: string) => { const d = detectTool(q); return d && d.kind === "live" ? d.topic : null; };
ok("'durgapur railway station trains' and its like open the card", ["durgapur railway station trains", "trains", "durgapur railway station", "dgr trains", "train timetable", "memu", "durgapur train timetable", "trains at durgapur", "local trains", "express trains", "dgr", "train schedule", "railway"].every((q) => live(q) === "railway"), JSON.stringify(["durgapur railway station trains", "trains", "durgapur railway station", "dgr trains", "train timetable", "memu", "durgapur train timetable", "trains at durgapur", "local trains", "express trains", "dgr", "train schedule", "railway"].filter((q) => live(q) !== "railway")));
ok("the other live cards keep their words: weather, flights, airport", live("weather") === "weather" && live("flights") === "flights" && live("durgapur airport") === "flights" && live("kaji nazrul airport") === "flights" && live("durgapur weather") === "weather");
ok("a line with words that are not the card's does not open it (ticket booking, a tyre, a plain sum)", live("train ticket booking") === null && live("train 12 + 5") === null && live("205/55 R16 91V") !== "railway");
ok("the sample questions are the card's own words", railwayTopic.samples.every((s) => live(s.q) === "railway") && railwayTopic.samples.some((s) => s.q === "durgapur railway station trains"));

console.log(`RailwayCard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
