// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/kolkataView.selftest.ts
// This tests what the Kolkata tab shows: the owner's rule (a train of one of Howrah, Sealdah, Santragachi and Kolkata must not touch any OTHER of the four, whether it stops or only passes, and the trains the rule removes are kept
// with the reason), the times and days at the starting station, the kind of each train, the reason a train has no fare, the counts of the four stations, and the checks that keep a bad answer from being drawn.
// The rows are made by hand in the shape the database gives; the real set was counted on 28 Nov 2026 (HWH 317 trains, 201 of them touch no other of the four; SDAH 357; SRC 30; KOAA 14).
import { alsoTouches, buildKolkata, durationText, fareStateOf, isStartCode, looksLikeKolkata, STARTS, START_CODES, startsHere, stationTrains, toTrain, type FareSummary, type KolRow } from "./kolkataView";
import { TERMINAL_CODES } from "./kolkataSet";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const row = (o: Partial<KolRow> & { number: string; from: string }): KolRow => ({
  name: `Train ${o.number}`, type: "Mail/Express", to: "XYZ", toName: "Somewhere", runDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], distanceKm: 500, durationMin: 600, prsBookable: true, touches: [o.from], inSet: true,
  halts: [{ code: o.from, departure: "10:00" }, { code: "BWN", departure: "11:30" }], fetchedAt: "2026-11-28T06:00:00.000Z", ...o,
});
const rows: KolRow[] = [
  row({ number: "12347", from: "HWH", name: "Sahid Express", type: "Superfast Express", halts: [{ code: "HWH", departure: "21:55" }, { code: "BWN", departure: "23:00" }] }),
  row({ number: "13023", from: "HWH", name: "Howrah Gaya Express", touches: ["HWH", "SRC"], halts: [{ code: "HWH", departure: "07:00" }, { code: "SRC", departure: "07:15" }] }),
  row({ number: "12021", from: "HWH", name: "Jan Shatabdi", type: "Jan Shatabdi Express", halts: [{ code: "HWH", departure: "06:05" }, { code: "TATA", departure: "09:00" }] }),
  // a train that only PASSES Santragachi: it is on that station's board (touches) but is not a halt of its own route
  row({ number: "12839", from: "HWH", name: "Chennai Mail", touches: ["HWH", "SRC"], halts: [{ code: "HWH", departure: "23:30" }, { code: "KGP", departure: "01:20" }] }),
  // a train whose halts show the other station though the boards do not (the two kinds of evidence are each enough)
  row({ number: "12000", from: "HWH", name: "Halt Only", touches: ["HWH"], halts: [{ code: "HWH", departure: "05:00" }, { code: "KOAA", departure: "05:20" }] }),
  row({ number: "37101", from: "HWH", name: "Howrah Local", type: "Suburban", prsBookable: false, halts: [{ code: "HWH", departure: "05:10" }, { code: "BDC", departure: "05:50" }] }),
  row({ number: "03003", from: "HWH", name: "Special Express", type: "Train on Demand", halts: [{ code: "HWH", departure: "08:45" }, { code: "BDC", departure: "09:30" }] }),
  row({ number: "13187", from: "SDAH", name: "Maa Tara Express", halts: [{ code: "SDAH", departure: "20:45" }, { code: "BHP", departure: "22:00" }] }),
  row({ number: "31301", from: "SDAH", name: "Sealdah Local", type: "Suburban", prsBookable: false, halts: [{ code: "SDAH", departure: "04:00" }, { code: "BNJ", departure: "05:00" }] }),
  row({ number: "22841", from: "SRC", name: "Santragachi Antyodaya", halts: [{ code: "SRC", departure: "15:00" }, { code: "KGP", departure: "16:30" }] }),
  row({ number: "13161", from: "KOAA", name: "Tebhaga Express", halts: [{ code: "KOAA", departure: "21:10" }, { code: "BHP", departure: "23:00" }] }),
  // out of the set (goes over Durgapur): never shown, never counted, not even among the "left out"
  row({ number: "12301", from: "HWH", name: "Rajdhani", inSet: false, halts: [] }),
  // a train with no readable departure at its station, and one with no readable day: neither can be drawn, and each is counted as unreadable
  row({ number: "11111", from: "SDAH", name: "No Time", halts: [{ code: "SDAH", departure: null }, { code: "BHP", departure: "22:00" }] }),
  row({ number: "22222", from: "SDAH", name: "No Day", runDays: [], halts: [{ code: "SDAH", departure: "09:00" }, { code: "BHP", departure: "10:00" }] }),
];
const fares = new Map<string, FareSummary>([
  ["12347", { classes: 4, receivedAt: "2026-11-28T08:00:00.000Z" }],
  ["12021", { classes: 2, receivedAt: "2026-11-27T08:00:00.000Z" }],
  ["13187", { classes: 3, receivedAt: "2026-11-28T09:00:00.000Z" }],
  ["13161", { classes: 0, receivedAt: "2026-11-28T10:00:00.000Z" }],
]);

// ---- the four stations
ok("the four stations are Howrah, Sealdah, Santragachi and Kolkata, in the owner's order, and are the same codes the harvest uses", STARTS.map((s) => s.code).join() === "HWH,SDAH,SRC,KOAA" && START_CODES.join() === TERMINAL_CODES.join());
ok("only the four codes are a station (anything else, a number, nothing, is not)", isStartCode("HWH") && isStartCode("KOAA") && !isStartCode("DGR") && !isStartCode("hwh") && !isStartCode(undefined) && !isStartCode(7));

// ---- the owner's rule
ok("a train touches another of the four when its board list or its halts say so: Santragachi on the boards (13023, and 12839 which only PASSES it), Kolkata among the halts (12000)", alsoTouches(rows[1]).join() === "SRC" && alsoTouches(rows[3]).join() === "SRC" && alsoTouches(rows[4]).join() === "KOAA");
ok("a train that touches no other is its own station's alone (12347 at Howrah: touches only HWH, halts at HWH and BWN)", alsoTouches(rows[0]).length === 0 && alsoTouches(rows[9]).length === 0);
ok("its own station is never 'another': a Howrah train that stops at Howrah again is not out for that", alsoTouches(row({ number: "10001", from: "HWH", halts: [{ code: "HWH", departure: "10:00" }, { code: "HWH", departure: "20:00" }] })).length === 0);
const h = stationTrains(rows, fares, "HWH");
ok("Howrah shows 12347, 12021, the local 37101 and the special 03003; 13023, 12839 and 12000 are left out, each once", h.trains.map((t) => t.number).sort().join() === "03003,12021,12347,37101" && h.leftOut.map((l) => l.number).join() === "12000,12839,13023", `${h.trains.map((t) => t.number)} / ${h.leftOut.map((l) => l.number)}`);
ok("each train left out says which other station it touches", h.leftOut.find((l) => l.number === "13023")?.also.join() === "SRC" && h.leftOut.find((l) => l.number === "12000")?.also.join() === "KOAA");
ok("a train that is out of the set (it goes over Durgapur) is neither shown nor in the left-out list", !h.trains.some((t) => t.number === "12301") && !h.leftOut.some((l) => l.number === "12301"));
ok("a train belongs to its STARTING station only: Sealdah's list has no Howrah train, and no train is in two stations' lists", stationTrains(rows, fares, "SDAH").trains.every((t) => t.fromCode === "SDAH") && new Set(STARTS.flatMap((s) => stationTrains(rows, fares, s.code).trains.map((t) => t.number))).size === STARTS.flatMap((s) => stationTrains(rows, fares, s.code).trains).length);
ok("a row is a train of the tab only when its first halt is its own starting station", startsHere(rows[0]) && !startsHere(rows[11]) && !startsHere({ inSet: true, from: "HWH", halts: [{ code: "SRC" }] }) && !startsHere({ inSet: true, from: "HWH", halts: [] }) && !startsHere({ inSet: true, from: "DGR", halts: [{ code: "DGR" }] }));

// ---- time, days, kind
const t = toTrain(rows[0], "saved")!;
ok("a train's time is its departure at its starting station, it has no arrival there, and its days are the days it leaves (no day is moved on)", t.departure === "21:55" && t.arrival === null && t.days.length === 7 && t.fromCode === "HWH" && t.from === "Howrah");
ok("a train that runs on some days keeps them in the week's order", toTrain(row({ number: "10002", from: "SRC", runDays: ["sat", "tue"] }), "saved")!.days.join() === "tue,sat");
ok("the kind: Suburban, EMU, MEMU and Passenger are local; 'Train on Demand' is special; the rest are express", ["Suburban", "EMU", "MEMU", "Passenger"].every((ty) => toTrain(row({ number: "10003", from: "HWH", type: ty }), "saved")!.kind === "local") && toTrain(rows[6], "saved")!.kind === "special" && toTrain(rows[0], "saved")!.kind === "express" && toTrain(rows[2], "saved")!.label === "Jan Shatabdi" && toTrain(rows[0], "saved")!.label === "Superfast");
ok("a train with no readable departure, or with no readable day, is not drawn, and is counted as unreadable (never given a made-up time)", toTrain(rows[12], "saved") === null && toTrain(rows[13], "saved") === null && stationTrains(rows, fares, "SDAH").unreadable === 2);
const order = h.trains.map((x) => x.departure);
ok("the trains are in the order of the clock at the station, and the same minute by train number", order.join() === ["05:10", "06:05", "08:45", "21:55"].join(), order.join());

// ---- the fare of each train
ok("the fare state: saved (classes answered), none (the service sold nothing), not-collected (sold, but no row), not-sold (the reservation system does not sell it)", fareStateOf(rows[0], fares) === "saved" && fareStateOf(rows[10], fares) === "none" && fareStateOf(rows[6], fares) === "not-collected" && fareStateOf(rows[5], fares) === "not-sold");

// ---- the answer
const a = buildKolkata(rows, fares, "HWH");
ok("the answer for Howrah has its express (12347, 12021, 03003) and local (37101) trains apart, in the clock's order", a.express.map((x) => x.number).join() === "12021,03003,12347" && a.local.map((x) => x.number).join() === "37101", `${a.express.map((x) => x.number)}`);
ok("it carries the counts of all FOUR stations, so the picker shows them whichever one is open", a.stations.map((s) => `${s.code}:${s.express}/${s.local}/${s.leftOut}`).join() === "HWH:3/1/3,SDAH:1/1/0,SRC:1/0/0,KOAA:1/0/0", a.stations.map((s) => `${s.code}:${s.express}/${s.local}/${s.leftOut}`).join());
ok("the date of the OLDEST record shown, the date of the OLDEST fare shown (12021's, 27 Nov), and the number with a fare", a.savedAt === "2026-11-28T06:00:00.000Z" && a.fareAt === "2026-11-27T08:00:00.000Z" && a.withFares === 2, `${a.savedAt} ${a.fareAt} ${a.withFares}`);
ok("a station with no fare at all has no fare date", buildKolkata(rows, new Map(), "SRC").fareAt === null);
ok("the answer passes the check that guards what is drawn; a damaged one does not", looksLikeKolkata(a) && !looksLikeKolkata(null) && !looksLikeKolkata({ ...a, station: "DGR" }) && !looksLikeKolkata({ ...a, stations: a.stations.slice(1) }) && !looksLikeKolkata({ ...a, express: [{ ...a.express[0], fare: "yes" }] }) && !looksLikeKolkata({ ...a, local: [{ ...a.local[0], departure: null }] }));

// ---- how long
ok("a run time is said in hours and minutes, and not at all when it is not known", durationText(600) === "10 h" && durationText(95) === "1 h 35 min" && durationText(45) === "45 min" && durationText(null) === "" && durationText(0) === "" && durationText(NaN) === "");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
