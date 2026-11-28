// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/kolkataSet.selftest.ts
// This tests the rules of the third set of trains (the trains that START at Howrah, Sealdah, Santragachi or Kolkata and go over neither Durgapur nor Asansol) on RailRadar's real boards of 28 Nov 2026 (trimmed to the trains
// that matter) and the real full record of the Howrah - Gaya Express, which goes by the Sahibganj loop. The rules: taken once, under the STARTING station; out when on the Durgapur or Asansol board, or when the train's own route goes over either.
import { readFileSync } from "node:fs";
import { parseSchedule } from "./fare";
import { boardUrl, goesOver, hasReservedFares, haltsOnlyJson, parseBoard, parseTrainFull, requestsFor, reservedClasses, selectCandidates, TERMINAL_CODES, trainUrl } from "./kolkataSet";
import { catalogueFromRow, catalogueFromTrain, kolTableStatements } from "./kolkataStore";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };
const fx = (n: string) => JSON.parse(readFileSync(`src/lib/live/fixtures/${n}`, "utf8"));

const raw = fx("kol-boards-2026-11-28.json") as Record<string, unknown>;
const boards: Record<string, ReturnType<typeof parseBoard>> = {}, passing: Record<string, ReturnType<typeof parseBoard>> = {};
for (const c of TERMINAL_CODES) boards[c] = parseBoard(raw[c], c, 10);
for (const c of ["DGR", "ASN"]) passing[c] = parseBoard(raw[c], c, 10);
const { candidates, rejected } = selectCandidates(boards, passing);
const cand = (n: string) => candidates.find((c) => c.number === n);
const rej = (n: string) => rejected.find((c) => c.number === n);

ok("the addresses ask for the boards with the pass-throughs and for the full route", boardUrl("HWH") === "https://api.railradar.in/v1/stations/HWH/trains?includeIntermediate=true" && trainUrl("13023") === "https://api.railradar.in/v1/trains/13023?haltsOnly=false");
ok("a board that is not the answer expected, or holds too few trains, is an error and never half a set", throws(() => parseBoard({ success: false }, "HWH")) && throws(() => parseBoard(null, "HWH")) && throws(() => parseBoard({ success: true, data: { trains: [] } }, "HWH")) && boards.HWH.length === 145);
ok("every train of the set STARTS at one of the four stations, each once", candidates.length > 100 && candidates.every((c) => TERMINAL_CODES.includes(c.from)) && new Set(candidates.map((c) => c.number)).size === candidates.length);
const duo = cand("12222");
ok("a train on two of the four boards is taken once, under its starting station: the Howrah - Pune Duronto (on Howrah's board and Santragachi's) is Howrah's, touching both", !!duo && duo.from === "HWH" && duo.touches.join() === "HWH,SRC" && candidates.filter((c) => c.number === "12222").length === 1, JSON.stringify(duo));
ok("the Coromandel Express, which Santragachi's board also has, is Howrah's too, once", cand("12841")?.from === "HWH" && cand("12841")?.touches.includes("SRC") === true);
ok("trains that start at Sealdah, Santragachi and Kolkata are there under their own stations (Darjeeling Mail SDAH; Sealdah - Puri Duronto SDAH; the Santragachi - Tambaram Antyodaya SRC; Kolkata - Guwahati Garib Rath KOAA)", cand("12343")?.from === "SDAH" && cand("22201")?.from === "SDAH" && cand("22841")?.from === "SRC" && cand("12517")?.from === "KOAA");
ok("a train that only ENDS at Howrah (the Howrah SF Express from Tiruchchirappalli, the Howrah Mail from Mumbai) is not in the set, and not 'out' either: it does not start there", !cand("12664") && !rej("12664") && !cand("12809") && !rej("12809"));
ok("trains on the Durgapur or Asansol board are out with the reason: the Howrah Rajdhani (12301) and the Howrah - Ranchi Shatabdi (12019)", /Durgapur \(DGR\)/.test(rej("12301")?.reason ?? "") && /Durgapur|Asansol/.test(rej("12019")?.reason ?? "") && !cand("12301") && !cand("12019"));
ok("no train of the set is on either the Durgapur or the Asansol board", candidates.every((c) => !passing.DGR.some((p) => p.number === c.number) && !passing.ASN.some((p) => p.number === c.number)));
ok("a parcel train (Jpp Rcs Express 00150) is out: not for passengers", /not a passenger train/.test(rej("00150")?.reason ?? "") && !cand("00150"));
ok("the Howrah - New Jalpaiguri Shatabdi and the Howrah - Gaya Express are in the set before the route check (their routes are what proves it)", cand("12041")?.from === "HWH" && cand("13023")?.from === "HWH");

// the full record of a train
const gaya = fx("kol-train-13023-2026-11-28.json");
const t = parseTrainFull(gaya, "13023");
ok("the full record of 13023 gives its details: Howrah - Gaya Express, HWH to GAYA, 654.6 km, daily, returning as 13024, classes 2A, 3A and SL, bookable", t.name === "Howrah - Gaya Express" && t.from === "HWH" && t.to === "GAYA" && t.distanceKm === 654.6 && t.runDays.length === 7 && t.returnTrain === "13024" && t.classes.join() === "2A,3A,SL" && t.prsBookable, JSON.stringify([t.name, t.from, t.to, t.distanceKm, t.classes]));
ok("its halts are the 36 halts with their km from Howrah (0 at Howrah, 107.2 at Barddhaman, 654.6 at Gaya), the route holds all 142 stations, halts or not", t.halts.length === 36 && t.halts[0].code === "HWH" && t.halts[0].km === 0 && t.halts[2].code === "BWN" && t.halts[2].km === 107.2 && t.halts[35].code === "GAYA" && t.halts[35].km === 654.6 && t.route.length === 142, `${t.halts.length} ${t.route.length}`);
ok("the route proof: 13023 goes over neither Durgapur nor Asansol (it goes by the Sahibganj loop), so it stays in; the same route with Durgapur put into it is caught, and one with Asansol too", goesOver(t).length === 0 && goesOver({ route: [...t.route, "DGR"] }).join() === "DGR" && goesOver({ route: [...t.route, "ASN", "DGR"] }).join() === "DGR,ASN");
ok("the classes the record lists are known (Sleeper, AC 3 tier, AC 2 tier) and the train has reserved fares", reservedClasses(t).map((c) => c.code).join() === "SL,3A,2A" && hasReservedFares(t));
ok("the estimate of its fares' cost: all eight classes at the end station, then the listed classes for each halt in between: 8 + 3 x 34 = 110", requestsFor(t) === 110, String(requestsFor(t)));
ok("a train that cannot be booked in the reservation system (suburban, local) has details and no fares, and costs no request; one that can be booked is asked, whatever its record lists (12021 lists CC and the fare service sells 2S on it too)", !hasReservedFares({ prsBookable: false }) && requestsFor({ classes: [], prsBookable: false, halts: t.halts }) === 0 && hasReservedFares({ prsBookable: true }) && requestsFor({ classes: ["CC"], prsBookable: true, halts: t.halts.slice(0, 11) }) === 8 + 1 * 9);
const sch = parseSchedule(haltsOnlyJson(gaya), "13023", "HWH");
ok("the halts after the starting station read by the same reader as the Durgapur set's: 35 stops, Barddhaman at 107.2 km, the last Gaya at 654.6 km", sch.stops.length === 35 && sch.stops[1].code === "BWN" && sch.stops[1].km === 107.2 && sch.stops[34].code === "GAYA" && sch.stops[34].km === 654.6 && !sch.reverses);
ok("a record that is not the train asked for, or has no route, is an error", throws(() => parseTrainFull(gaya, "13024")) && throws(() => parseTrainFull({ success: true, data: { train: { number: "13023" }, route: [] } }, "13023")) && throws(() => parseTrainFull(null, "13023")));

// the catalogue row
const row = catalogueFromTrain(t, ["HWH"], true, "", new Date("2026-11-28T10:00:00Z"));
ok("the catalogue row of a train in the set keeps its halts; one that is out keeps none and says why", row.inSet && row.halts.length === 36 && catalogueFromTrain(t, ["HWH"], false, "route goes over Durgapur (DGR)", new Date()).halts.length === 0);
const back = catalogueFromRow({ train_number: "13023", train_name: row.name, train_type: row.type, category: row.category, from_code: "HWH", from_name: row.fromName, to_code: "GAYA", to_name: row.toName, run_days: JSON.stringify(row.runDays), distance_km: "654.6", duration_min: 895, total_halts: 36, return_train: "13024", classes: JSON.stringify(row.classes), prs_bookable: true, has_reversal: false, touches: JSON.stringify(["HWH"]), in_set: true, reason: "", halts: JSON.stringify(row.halts), fetched_at: new Date("2026-11-28T10:00:00Z") });
ok("a saved row reads back the same, and one that is not a train number is refused", !!back && back.number === "13023" && back.distanceKm === 654.6 && back.halts.length === 36 && back.classes.join() === "2A,3A,SL" && back.prsBookable && catalogueFromRow({ train_number: "abc", fetched_at: new Date() }) === null);
const sql = kolTableStatements().join("\n");
ok("the three tables are made closed to the public roles (row-level security on, rights taken from anon and authenticated)", /train_kol/.test(sql) && /train_fare_kol/.test(sql) && /train_fare_leg_kol/.test(sql) && (sql.match(/ENABLE ROW LEVEL SECURITY/g) || []).length === 3 && (sql.match(/REVOKE ALL ON public\.train_\w+ FROM anon, authenticated/g) || []).length === 3);
ok("the SQL file for the tables names the same three tables", (() => { const f = readFileSync("src/lib/nl2sql/sql/32_train_kol.sql", "utf8"); return /CREATE TABLE IF NOT EXISTS public\.train_kol \(/.test(f) && /public\.train_fare_kol \(/.test(f) && /public\.train_fare_leg_kol \(/.test(f); })());
console.log(`kolkataSet: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
