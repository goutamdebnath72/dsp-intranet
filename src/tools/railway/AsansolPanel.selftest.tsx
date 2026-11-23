// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/railway/AsansolPanel.selftest.tsx
// Checks the railway card's two tabs and the Asansol tab, drawn from samples of RailRadar's real boards (16 Nov 2026). I expect the Asansol tab to list the trains that stop at Asansol and not at Durgapur, in two lists (those that pass
// Durgapur without stopping, those that do not go over it) and a violet one for the local trains, to say plainly that it is a timetable, and to be asked for only when it is opened.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { looksLikeAsansol, parseAsansol } from "../../lib/live/railwayAsansol";
import { looksLikeRailway, parseRailway } from "../../lib/live/railway";
import { KEPT_ASN_S } from "../../lib/live/railwayLoad";
import { AsansolBody } from "./AsansolPanel";
import { RailwayTabs } from "./RailwayTabs";
import { railwayUi } from "./ui";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const fx = (n: string) => JSON.parse(readFileSync(`src/lib/live/fixtures/${n}`, "utf8"));
const data = parseAsansol(fx("railradar-asn-sample.json"), fx("railradar-dgr-all-sample.json"), { minAsn: 1, minDgr: 1, minPass: 1 });
const draw = (hm = "10:00", day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" = "wed", more: { todayOnly?: boolean; specials?: boolean } = {}) => renderToStaticMarkup(<AsansolBody data={data} now={{ hm, day }} {...more} />);
const html = draw();
const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

ok("the tab names the station and its code, says how many trains are here and why (they do not stop at Durgapur), and how many are of each kind", /Asansol Railway Junction/.test(text) && /\(ASN\)/.test(text) && /the 11 trains that stop at Asansol and do not stop at Durgapur/.test(text) && /5 run over Durgapur without stopping, and 6 do not go over Durgapur at all/.test(text) && /A train that stops at Durgapur too is not listed here/.test(text));
ok("it explains that the times and days are those AT ASANSOL, and that 'here' means Asansol", /time at Asansol/.test(text) && /here.{0,3} below means Asansol/.test(text) && /days the train is at Asansol/.test(text));
ok("two lists side by side: 'Pass Durgapur without stopping' (5) and 'Do not go over Durgapur' (5 express and special), then the violet MEMU section (1)", (() => { const a = html.indexOf('aria-label="Pass Durgapur without stopping"'), b = html.indexOf('aria-label="Do not go over Durgapur"'), c = html.indexOf('data-tone="local"'); return a > 0 && b > a && c > b && /Pass Durgapur without stopping<span[^>]*>5</.test(html) && /Do not go over Durgapur<span[^>]*>5</.test(html) && /Local trains \(MEMU\)<span[^>]*>1</.test(html); })());
ok("each train says which kind it is: a rose chip 'Passes Durgapur, no stop' (5) or a grey 'Not via Durgapur' (6), each with a hover note", (html.match(/data-via="pass"/g) ?? []).length === 5 && (html.match(/data-via="away"/g) ?? []).length === 6 && /title="This train runs over Durgapur without stopping there: to take it, go to Asansol"/.test(html) && /title="This train does not go over Durgapur at all: it is not in Durgapur&#x27;s timetable"/.test(html));
ok("a train shows its time at Asansol (the Rajdhani 12302: 07:20, arr 07:18), name, number and class, its two ends with the codes, and the days at Asansol", /07:20/.test(text) && /arr 07:18/.test(text) && /New Delhi - Howrah Rajdhani Express/.test(text) && /12302 · /.test(text) && /\(NDLS\)/.test(text) && /\(HWH\)/.test(text) && /rounded-full[^>]*bg-sky-100[^>]*>Mon, Tue, Wed, Thu, Fri, Sun</.test(html));
ok("a train that starts at Asansol says 'starts here', one that ends there 'ends here'", /starts here/.test(text) && /ends here/.test(text));
ok("each train that goes on from Asansol has a ₹ Fares button (the MEMU a ₹ Fare hint); a train that ends at Asansol (03512, 12941) has none, there is no fare box until it is pressed, and the intro says the fares are from Asansol", (html.match(/data-fares-button/g) ?? []).length === 9 && (text.match(/₹ Fares/g) ?? []).length >= 8 && /₹ Fare hint/.test(text) && !/data-fare-box/.test(html) && /fares <strong>from Asansol<\/strong>|fares from Asansol/.test(html.replace(/<[^>]+>/g, "")) && !/₹ Fares[^]{0,900}12941 · /.test(html.slice(html.indexOf("12941") - 50, html.indexOf("12941") + 1500).replace(/<[^>]+>/g, " ")) );
ok("the special train is marked Special; with specials off it is gone; with 'only today' on, a train of other days is gone (12937 runs on Monday only)", />Special</.test(html) && !/>Special</.test(draw("10:00", "wed", { specials: false })) && /12937/.test(html) && !/12937/.test(draw("10:00", "wed", { todayOnly: true })) && /12937/.test(draw("10:00", "mon", { todayOnly: true })));
ok("the switches are buttons that say whether they are on", /aria-pressed="false"[^>]*>Only trains that run today</.test(html) && /aria-pressed="true"[^>]*>Special trains</.test(html));
ok("the next train that runs today is marked, in its own list, with the wait", /aria-current="true"/.test(html) && /Next · in /.test(text));
ok("the Asansol tab has the same features as the Durgapur tab: the legend (amber junction, premium badges, violet MEMU), the fare finder (going from Asansol), the two switches, the short forms (the Vande Bharat and Shatabdi badges come with the same row code, tested on the Durgapur tab)", /data-legend/.test(html) && /a junction/.test(text) && /= the premium trains/.test(text) && /the local trains/.test(text) && /data-finder/.test(html) && /Find a fare to a station/.test(text) && /Where are you going from Asansol\s*\?/.test(text) && /Only trains that run today/.test(text) && /data-short-forms/.test(html));
ok("the tab says plainly it is the timetable, NOT live running status, how the two kinds are told apart (Durgapur's timetable lists the trains that go through without stopping), and links NTES and RailRadar in new tabs", /timetable, not live running status/.test(text) && /Durgapur's timetable, which lists the trains that go through without stopping/.test(text) && (html.match(/target="_blank"/g) ?? []).length === 2 && (html.match(/rel="noopener noreferrer"/g) ?? []).length === 2);
ok("the short forms are written out at the bottom, as on the Durgapur tab", /data-short-forms/.test(html));

// the two tabs
const tabs = renderToStaticMarkup(<RailwayTabs />);
const ttext = tabs.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok("the railway card has two tabs, named in full: 'Durgapur Railway Station (DGR)' selected first and 'Asansol Railway Junction (ASN)'", (tabs.match(/role="tab"/g) ?? []).length === 2 && /Durgapur Railway Station \(DGR\)/.test(ttext) && /Asansol Railway Junction \(ASN\)/.test(ttext) && /id="railway-tab-dgr"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="railway-tab-dgr"/.test(tabs) && /id="railway-tab-asn"[^>]*aria-selected="false"|aria-selected="false"[^>]*id="railway-tab-asn"/.test(tabs) && (tabs.match(/role="tabpanel"/g) ?? []).length === 2);
ok("the Asansol tab is not asked for until it is opened: its panel is hidden and empty, the Durgapur panel is shown", /id="railway-panel-asn"[^>]*hidden=""|hidden=""[^>]*id="railway-panel-asn"/.test(tabs) && !/data-asansol-panel/.test(tabs) && !/id="railway-panel-dgr"[^>]*hidden/.test(tabs));
const tabsAsn = renderToStaticMarkup(<RailwayTabs start="asn" />);
ok("starting on the Asansol tab shows it first (loading), asks for the Asansol route only, and hides the Durgapur panel", /id="railway-panel-dgr"[^>]*hidden=""|hidden=""[^>]*id="railway-panel-dgr"/.test(tabsAsn) && /aria-busy="true"/.test(tabsAsn));
ok("the panel's title names both stations and its subtitle says what is in it, without repeating the title (the tabs below carry the full station names), and its card is the two-tab card", railwayUi.live?.title === "Trains at Durgapur and Asansol" && /Durgapur/.test(String(railwayUi.live?.subtitle)) && /Asansol/.test(String(railwayUi.live?.subtitle)) && !String(railwayUi.live?.subtitle).includes(String(railwayUi.live?.title)) && /data-railway-tabs/.test(renderToStaticMarkup(<>{railwayUi.live?.card()}</>)));
// The fares from Asansol are asked of the saved data of Asansol only
const fares = readFileSync("src/tools/railway/Fares.tsx", "utf8").replace(/\/\/.*$/gm, "");
const fareRoutes = ["railway-fare", "railway-fare-legs"].map((n) => readFileSync(`src/app/api/live/${n}/route.ts`, "utf8").replace(/\/\/.*$/gm, ""));
ok("the fare boxes of the Asansol tab ask the routes with from=ASN, and the routes accept only ASN (anything else means Durgapur), reading Asansol's own tables", /railway-fare\?train=\$\{number\}\$\{fromQuery\(from\)\}/.test(fares) && /railway-fare-legs\?train=\$\{number\}\$\{fromQuery\(from\)\}/.test(fares) && fareRoutes.every((t) => /get\("from"\) === "ASN" \? "ASN" : "DGR"/.test(t)) && /fareStoreFor\(await getDb\(\), from\)/.test(fareRoutes[0]) && /legStoreFor\(await getDb\(\), from\)/.test(fareRoutes[1]));
ok("the Asansol tab's fares say Asansol, not Durgapur: the table heading, the day asked, the km column and the stops text", /originName\(set\.from\)/.test(fares) && /originName\(from\)/.test(fares) && !/from Durgapur to/.test(fares) && !/is at Durgapur\)/.test(fares));
const finder = readFileSync("src/tools/railway/FareFinder.tsx", "utf8").replace(/\/\/.*$/gm, "");
const findRoute = readFileSync("src/app/api/live/railway-fare-find/route.ts", "utf8").replace(/\/\/.*$/gm, "");
ok("the fare finder of the Asansol tab asks with from=ASN, and its route accepts only ASN (anything else means Durgapur), keeps each station's list apart, reads Asansol's own leg tables and Asansol's timetable", /stops=1\$\{q\}/.test(finder) && /to=\$\{encodeURIComponent\(to \|\| "-"\)\}\$\{q\}/.test(finder) && /get\("from"\) === "ASN" \? "ASN" : "DGR"/.test(findRoute) && /legStoreFor\(await getDb\(\), from\)/.test(findRoute) && /from === "ASN" \? loadAsansol\(\) : loadRailway\(\)/.test(findRoute) && /stopsKept\[from\]/.test(findRoute) && /originName\(from\)/.test(finder) && !/from Durgapur to/.test(finder));
// I rely on this: nothing is lost, because both timetables keep their last good answer in the database
const rwRoute = readFileSync("src/app/api/live/railway/route.ts", "utf8").replace(/\/\/.*$/gm, "");
const asnRoute = readFileSync("src/app/api/live/railway-asn/route.ts", "utf8").replace(/\/\/.*$/gm, "");
ok("both timetable routes keep their last good answer in the database and show it, marked stale with its own time, when RailRadar does not answer; Asansol's list is kept three days (two requests each time)", /persist: \{ store: savedAnswers, check: looksLikeRailway \}/.test(rwRoute) && /persist: \{ store: savedAnswers, check: looksLikeAsansol \}/.test(asnRoute) && /ttlMs: KEPT_ASN_S \* 1000/.test(asnRoute) && KEPT_ASN_S === 3 * 24 * 60 * 60);
ok("a saved copy is shown only when it is the shape the card draws: the parsed lists pass, anything else does not", looksLikeAsansol(data) && !looksLikeAsansol({ ...data, count: 3 }) && !looksLikeAsansol(null) && !looksLikeAsansol({ ...data, express: [{ number: "x" }] }) && looksLikeRailway(parseRailway(fx("railradar-dgr-sample.json"), { min: 1 })) && !looksLikeRailway({}) && !looksLikeRailway(null));
// the route and the key
const route = readFileSync("src/app/api/live/railway-asn/route.ts", "utf8").replace(/\/\/.*$/gm, "");
const load = readFileSync("src/lib/live/railwayLoad.ts", "utf8").replace(/\/\/.*$/gm, "");
ok("the route reads nothing of the caller, and the two addresses asked are fixed in the code (Asansol's board, and Durgapur's with the pass-throughs)", !/req\.json|req\.text|formData|cookies\(|headers\(\)|searchParams|request/.test(route) && /askBoard\(RAILRADAR_ASN_URL\)/.test(load) && /askBoard\(RAILRADAR_DGR_ALL_URL\)/.test(load));

console.log(`AsansolPanel: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
