// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/railway/KolkataPanel.selftest.tsx
// Checks the third tab of the railway card, the Kolkata stations: the picker of the four stations with their counts, the express list and the violet list of local trains of the station chosen (times at the station, days, the reason a
// train has no fare, the ₹ Fares button only where a fare is saved), the list of trains the owner's rule left out, the honest line about when the records were saved, the fare finder from the station, the search words that open the tab,
// and that the routes read the Kolkata tables only for the four station codes. The sizes are checked too: nothing in the tab has a pixel width or a pixel text size, so it follows the reader's text size.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DateTime } from "luxon";
import { buildKolkata, type FareSummary, type KolRow } from "../../lib/live/kolkataView";
import { KolkataBody, LeftOutList, SavedLine, StationPicker } from "./KolkataPanel";
import { RailwayTabs } from "./RailwayTabs";
import { railwayTopic } from "./topic";
import { railwayUi } from "./ui";
import { originName } from "./Fares";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

const row = (o: Partial<KolRow> & { number: string; from: string }): KolRow => ({
  name: `Train ${o.number}`, type: "Mail/Express", to: "XYZ", toName: "Somewhere", runDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], distanceKm: 500, durationMin: 600, prsBookable: true, touches: [o.from], inSet: true,
  halts: [{ code: o.from, departure: "10:00" }, { code: "BWN", departure: "11:30" }], fetchedAt: "2026-11-28T06:00:00.000Z", ...o,
});
const rows: KolRow[] = [
  row({ number: "12347", from: "HWH", name: "Sahid Express", type: "Superfast Express", toName: "Radhikapur", distanceKm: 1204, durationMin: 1385, runDays: ["mon", "thu"], halts: [{ code: "HWH", departure: "21:55" }, { code: "BWN", departure: "23:00" }] }),
  row({ number: "12021", from: "HWH", name: "Howrah Barbil Jan Shatabdi", type: "Jan Shatabdi Express", halts: [{ code: "HWH", departure: "06:05" }, { code: "TATA", departure: "09:00" }] }),
  row({ number: "13023", from: "HWH", name: "Howrah Gaya Express", touches: ["HWH", "SRC"], halts: [{ code: "HWH", departure: "07:00" }, { code: "SRC", departure: "07:15" }] }),
  row({ number: "12839", from: "HWH", name: "Chennai Mail", touches: ["HWH", "SRC", "KOAA"], halts: [{ code: "HWH", departure: "23:30" }, { code: "KGP", departure: "01:20" }] }),
  row({ number: "37101", from: "HWH", name: "Howrah Bandel Local", type: "Suburban", prsBookable: false, halts: [{ code: "HWH", departure: "05:10" }, { code: "BDC", departure: "05:50" }] }),
  row({ number: "03003", from: "HWH", name: "Jagadhatri Special", type: "Train on Demand", halts: [{ code: "HWH", departure: "08:45" }, { code: "BDC", departure: "09:30" }] }),
  row({ number: "13031", from: "HWH", name: "Howrah Jaynagar Express", halts: [{ code: "HWH", departure: "09:10" }, { code: "BWN", departure: "10:30" }] }),
  row({ number: "63001", from: "HWH", name: "Howrah MEMU", type: "MEMU", halts: [{ code: "HWH", departure: "12:00" }, { code: "BWN", departure: "13:00" }] }),
  row({ number: "13187", from: "SDAH", name: "Maa Tara Express", halts: [{ code: "SDAH", departure: "07:20" }, { code: "BHP", departure: "09:00" }] }),
  row({ number: "22841", from: "SRC", name: "Santragachi Antyodaya", prsBookable: false, halts: [{ code: "SRC", departure: "15:00" }, { code: "KGP", departure: "16:30" }] }),
];
const fares = new Map<string, FareSummary>([
  ["12347", { classes: 4, receivedAt: "2026-11-28T08:00:00.000Z" }],
  ["12021", { classes: 2, receivedAt: "2026-11-27T08:00:00.000Z" }],
  ["13187", { classes: 3, receivedAt: "2026-11-28T09:00:00.000Z" }],
  ["13031", { classes: 0, receivedAt: "2026-11-28T10:00:00.000Z" }],
  ["63001", { classes: 1, receivedAt: "2026-11-28T10:00:00.000Z" }],
]);
const data = buildKolkata(rows, fares, "HWH");
const draw = (more: Partial<React.ComponentProps<typeof KolkataBody>> = {}) => renderToStaticMarkup(<KolkataBody data={data} station="HWH" onStation={() => {}} now={{ hm: "10:00", day: "wed" }} {...more} />);
const html = draw();
const text = strip(html);

// ---- the picker
ok("the picker has four tabs in the owner's order, each with its code, its own name and its two counts", (html.match(/role="tab"/g) ?? []).length === 4 && /Howrah[\s\S]*Sealdah[\s\S]*Santragachi[\s\S]*Kolkata/.test(strip(html.slice(html.indexOf("data-kolkata-picker"), html.indexOf("data-station-panel")))) && /Howrah Junction/.test(text) && /Kolkata Chitpur/.test(text));
ok("the station chosen is the selected tab (Howrah), the others are not, and only the selected one is in the tab order", /id="kolkata-station-HWH"[^>]*aria-selected="true"[^>]*tabindex="0"|aria-selected="true"[^>]*id="kolkata-station-HWH"/.test(html) && (html.match(/aria-selected="false"/g) ?? []).length === 3 && (html.match(/tabindex="-1"/g) ?? []).length >= 3);
ok("each station's counts are on its card: Howrah 4 express and 2 local, Sealdah 1 express, Santragachi 1 express and no local", /data-station="HWH"[\s\S]*?<span class="tabular-nums">4<\/span> express[\s\S]*?<span class="tabular-nums">2<\/span> local/.test(html) && /data-station="SDAH"[\s\S]*?<span class="tabular-nums">1<\/span> express/.test(html) && /data-station="SRC"[\s\S]*?<span class="tabular-nums">1<\/span> express[\s\S]*?<span class="tabular-nums">0<\/span> local/.test(html), strip(html.slice(html.indexOf("data-kolkata-picker"), html.indexOf("data-station-panel"))));
ok("the cards share the width and wrap by themselves (an auto-fit grid in rem), so a long name or a larger text size makes more rows and breaks nothing", /auto-fit,minmax\(min\(100%,9.5rem\),1fr\)/.test(html));

// ---- the intro states the rule in words
ok("the intro says what is listed: the trains that START at the four, do not go over Durgapur or Asansol and do not touch any other of the four; it gives the total (8 shown) and the clock", /The Kolkata stations/.test(text) && /the 8 trains that start at one of them/.test(text) && /do not go over Durgapur or Asansol/.test(text) && /do not touch any other of these four/.test(text) && /10:00 now/.test(text), text.slice(0, 600));

// ---- the station's lists
const ex = html.slice(html.indexOf('aria-label="Leaving Howrah"'), html.indexOf('data-tone="local"'));
ok("the express list has the trains of Howrah in the order of the clock at Howrah (06:05, 08:45, 09:10, 21:55), the special among them, and not the two the rule left out (13023, 12839) nor the locals", [...ex.matchAll(/(\d{2}:\d{2})<\/span>/g)].map((m) => m[1]).slice(0, 4).join() === "06:05,08:45,09:10,21:55" && !/13023|12839|37101|63001/.test(ex) && />Special</.test(ex), [...ex.matchAll(/(\d{2}:\d{2})<\/span>/g)].map((m) => m[1]).join());
ok("a train shows its time at the station with 'starts here' (it starts there), its name, number and class, both ends with the codes, and its days (Sahid Express: Mon, Thu)", /21:55/.test(text) && /starts here/.test(text) && /Sahid Express/.test(text) && /12347 · Superfast/.test(text) && /Mon, Thu/.test(text) && /Howrah/.test(text) && /\(HWH\)/.test(text));
ok("how far and how long the whole run is a chip (1,204 km · 23 h 5 min), with a note saying what it measures", /1,204 km · 23 h 5 min/.test(text) && /Distance and time of the whole run/.test(html));
ok("a train with a saved fare has the ₹ Fares button (12347, 12021); a train without one has none, and says why in a dashed chip: 'No fare sold' (13031, the service sold nothing), 'Fare not collected' (the special 03003, sold but not collected)", (ex.match(/data-fares-button/g) ?? []).length === 2 && /data-no-fare="none"/.test(ex) && /No fare sold/.test(ex) && /data-no-fare="not-collected"/.test(ex) && /Fare not collected/.test(ex));
const lo = html.slice(html.indexOf('data-tone="local"'), html.indexOf("data-left-out"));
ok("the local trains are in their own violet section: the suburban 37101 and the MEMU 63001, with the words that most of them have no fare and why", /Local and suburban trains of Howrah/.test(strip(lo)) && /37101/.test(lo) && /63001/.test(lo) && /Most of these have no fare here/.test(strip(lo)) && /border-violet-200 bg-violet-50\/70/.test(html));
ok("a local train that the reservation system does sell (63001, its fare is saved) has a button that says ₹ Fares, not a hint, and one that is not sold (37101) has none and no chip of 'No fare sold'", /63001/.test(lo) && (lo.match(/data-fares-button/g) ?? []).length === 1 && /₹ Fares/.test(strip(lo)) && !/₹ Fare hint/.test(strip(lo)) && !/data-no-fare/.test(lo));
ok("the column says how many of the express trains have saved fares: '2 of the 4 have saved fares from Howrah' (the local train with one is not counted there)", /2 of the 4 have saved fares from Howrah/.test(text), text.match(/\d of the \d have saved fares[^.]*/)?.[0] ?? "");

// ---- the switches
const onlyWed = draw({ todayOnly: true }); // Wed
ok("'only trains that run today' drops the Mon/Thu train (12347) on a Wednesday, and a train that runs daily stays", !/12347/.test(onlyWed) && /12021/.test(onlyWed));
ok("'Special trains' off drops the special (03003)", !/03003/.test(draw({ specials: false })) && /03003/.test(html));
ok("the next train that runs today after 10:00 is marked in its list (12347 is Mon/Thu, so the 21:55 is not; the Jan Shatabdi is gone by 10:00)", /aria-current="true"/.test(draw({ now: { hm: "07:00", day: "mon" } })) && /Next · in /.test(strip(draw({ now: { hm: "07:00", day: "mon" } }))));

// ---- left out
const left = renderToStaticMarkup(<LeftOutList data={data} />);
ok("the trains the rule left out are listed in a closed disclosure, each with the other stations it touches: 13023 at Santragachi, 12839 at Santragachi and Kolkata", /<details/.test(left) && !/<details[^>]*open/.test(left) && /2 Howrah trains that also touch Santragachi and Kolkata/.test(strip(left)) && /Santragachi \(SRC\)/.test(strip(left)) && /Santragachi \(SRC\) and Kolkata \(KOAA\)/.test(strip(left)), strip(left));
ok("it says plainly that they are outside the rule, not wrong", /Nothing is wrong with them/.test(strip(left)));
ok("a station with nothing left out has no such list", renderToStaticMarkup(<LeftOutList data={buildKolkata(rows, fares, "SDAH")} />) === "");

// ---- the honest line
const saved = renderToStaticMarkup(<SavedLine savedAt="2026-11-28T06:00:00.000Z" fareAt="2026-11-27T08:00:00.000Z" now={DateTime.fromISO("2026-11-29T10:00:00", { zone: "Asia/Kolkata" })} />);
ok("the line says when the timetable was saved and when the fares were received, with how long ago, green while they are young, and that nothing refreshes them", /Timetable saved from RailRadar on Sat 28 Nov 2026/.test(strip(saved)) && /yesterday/.test(strip(saved)) && /fares received on Fri 27 Nov 2026/.test(strip(saved)) && /2 days ago/.test(strip(saved)) && /data-old="false"/.test(saved) && /nothing refreshes them/.test(strip(saved)));
const old = renderToStaticMarkup(<SavedLine savedAt="2026-11-28T06:00:00.000Z" fareAt={null} now={DateTime.fromISO("2026-12-20T10:00:00", { zone: "Asia/Kolkata" })} />);
ok("when the records are more than a week old the line turns amber and says to check NTES and IRCTC", /data-old="true"/.test(old) && /bg-amber-50/.test(old) && /22 days old/.test(strip(old)) && /Check NTES and IRCTC/.test(strip(old)));

// ---- loading another station
const switching = draw({ station: "SDAH" });
ok("while another station is being asked for, the picker stays with that station selected and the lists wait (a pulsing placeholder), so the old station's trains are never shown under the new name", /id="kolkata-station-SDAH"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="kolkata-station-SDAH"/.test(switching) && /aria-busy="true"/.test(switching) && !/data-saved-line/.test(switching) && !/Sahid Express/.test(switching) && /data-kolkata-picker/.test(switching));
ok("the picker alone works as a tab list with the arrow keys (the handler is on every tab)", (renderToStaticMarkup(<StationPicker stations={data.stations} value="HWH" onPick={() => {}} />).match(/role="tab"/g) ?? []).length === 4);

// ---- features shared with the other tabs
ok("the tab has what the other tabs have: the two switches, the legend, the fare finder (going from Howrah), the short forms with the four stations written out, the timetable-not-live words and the NTES and RailRadar links", /aria-pressed="false"[^>]*>Only trains that run today</.test(html) && /aria-pressed="true"[^>]*>Special trains</.test(html) && /data-legend/.test(html) && /data-finder/.test(html) && /Going from Howrah|Where are you going from Howrah/.test(text) && /data-short-forms/.test(html) && /SDAH<\/strong> Sealdah/.test(html) && /SRC<\/strong> Santragachi Junction/.test(html) && /saved timetable, not live running status/.test(text) && /enquiry\.indianrail\.gov\.in/.test(html) && /railradar\.in/.test(html));
ok("the fare words say the starting station: Howrah, Sealdah, Santragachi, Kolkata (and still Durgapur and Asansol for the other tabs)", originName("HWH") === "Howrah" && originName("SDAH") === "Sealdah" && originName("SRC") === "Santragachi" && originName("KOAA") === "Kolkata" && originName("ASN") === "Asansol" && originName("DGR") === "Durgapur" && originName(undefined) === "Durgapur");

// ---- the tabs
const tabs = renderToStaticMarkup(<RailwayTabs />);
ok("the railway card has three tabs: Durgapur first and selected, then Asansol, then 'Kolkata: Howrah, Sealdah, Santragachi, Kolkata'", (tabs.match(/role="tab"/g) ?? []).length === 3 && /Kolkata: Howrah, Sealdah, Santragachi, Kolkata/.test(strip(tabs)));
ok("the Kolkata tab is not asked for until it is opened: its panel is hidden and empty", /id="railway-panel-kol"[^>]*hidden=""|hidden=""[^>]*id="railway-panel-kol"/.test(tabs) && !/data-kolkata-panel/.test(tabs) && !/data-kolkata-picker/.test(tabs));
const tabsKol = renderToStaticMarkup(<RailwayTabs start="kol" startStation="SDAH" />);
ok("starting on the Kolkata tab shows it first (loading) and hides the Durgapur panel", /id="railway-panel-dgr"[^>]*hidden=""|hidden=""[^>]*id="railway-panel-dgr"/.test(tabsKol) && /aria-busy="true"/.test(tabsKol));

// ---- the search line
const ui = railwayUi.live!;
const cardKol = renderToStaticMarkup(<>{ui.card("sdah")}</>);
ok("the panel's title names the three places; 'sdah' opens the card on the Kolkata tab, 'asn' on Asansol, anything else on Durgapur", ui.title === "Trains at Durgapur, Asansol and Kolkata" && /id="railway-panel-kol"(?![^>]*hidden)/.test(cardKol) && /id="railway-panel-asn"(?![^>]*hidden)/.test(renderToStaticMarkup(<>{ui.card("asn")}</>)) && /id="railway-panel-dgr"(?![^>]*hidden)/.test(renderToStaticMarkup(<>{ui.card(undefined)}</>)));
const lang = railwayTopic.live!.lang!;
ok("the words open the right tab: hwh, sealdah, santragachi, kolkata, koaa, chitpur name a Kolkata station; asn still wins over them; dgr and durgapur keep it on Durgapur; 'asn durgapur' is still Asansol", lang(["hwh"]) === "hwh" && lang(["sealdah", "trains"]) === "sdah" && lang(["santragachi"]) === "src" && lang(["kolkata", "trains"]) === "koaa" && lang(["koaa"]) === "koaa" && lang(["chitpur"]) === "koaa" && lang(["howrah", "trains"]) === "hwh" && lang(["asn", "howrah"]) === "asn" && lang(["dgr", "hwh"]) === undefined && lang(["durgapur", "howrah"]) === undefined && lang(["asn", "durgapur"]) === "asn" && lang(["trains"]) === undefined);
const keys = railwayTopic.live!.keys as readonly string[], extras = railwayTopic.live!.extra as readonly string[];
ok("the Kolkata codes are key words (they open the card alone) and the station names are extra words (they need 'train' or another key)", ["hwh", "sdah", "src", "koaa"].every((w) => keys.includes(w)) && ["howrah", "sealdah", "santragachi", "kolkata"].every((w) => extras.includes(w) && !keys.includes(w)));

// ---- the routes and the sizes
const code = (f: string) => readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
const fare = code("src/app/api/live/railway-fare/route.ts"), legs = code("src/app/api/live/railway-fare-legs/route.ts"), find = code("src/app/api/live/railway-fare-find/route.ts"), kol = code("src/app/api/live/railway-kol/route.ts");
ok("the fare, stops and finder routes read the Kolkata tables only for one of the four codes (isStartCode); anything else means Durgapur, and ASN is still the Asansol tab", /isStartCode\(asked\)/.test(fare) && /isStartCode\(asked\)/.test(legs) && /isStartCode\(asked\)/.test(find) && /asked === "ASN"/.test(fare) && /asked === "ASN"/.test(legs) && /asked === "ASN"/.test(find));
ok("the Kolkata fare box never writes (its store's put does nothing), and no Kolkata route asks RailRadar", /put: async \(\) => \{\}/.test(fare) && ![fare, legs, find, kol].some((c) => /fetch\(|railradarKey|RAILRADAR_API_KEY|paced/.test(c)));
ok("the list route reads only the station code (checked against the four, Howrah when it is anything else) and keeps no copy of its own in the database", /isStartCode\(asked\) \? asked : "HWH"/.test(kol) && !/savedAnswers|persist/.test(kol));
const panel = readFileSync("src/tools/railway/KolkataPanel.tsx", "utf8").replace(/\/\/.*$/gm, "");
ok("nothing in the Kolkata tab has a pixel text size or a pixel width or height: every size is in rem or the box's own content", !/text-\[\d+(\.\d+)?px\]/.test(panel) && !/\b(w|h|min-w|max-w|min-h|max-h)-\[\d+(\.\d+)?px\]/.test(panel) && !/style=\{\{[^}]*px/.test(panel));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
