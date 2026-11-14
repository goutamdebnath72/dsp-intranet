// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/fare.selftest.ts
// The fares of a train from Durgapur: the reading of RailRadar's answers (the real replies of 14 Nov 2026 are below), the choice of the day, and the asking of all classes.
import { DateTime } from "luxon";
import { askFares, askLeg, askLocalFare, CLASSES, localLegs, parseSchedule, FARE_KEPT_S, journeyDateFor, LOCAL_CLASS, parseClassFare, parseLocalDistance, type Fetcher } from "./fare";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const throwsAsync = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch { return true; } };
const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };

const reply = (number: string, name: string, distance: number, b: Record<string, number>) => ({ success: true, data: { trainNumber: number, trainName: name, distance, breakdown: { baseFare: 0, reservationCharge: 0, superfastCharge: 0, tatkalFare: 0, goodsServiceTax: 0, cateringCharge: 0, dynamicFare: 0, otherCharge: 0, totalFare: 0, fuelAmount: 0, totalConcession: 0, wpServiceTax: 0, ...b } }, meta: { source: "prs" } });
// real replies (Durgapur to the end of the run)
const SHATABDI_CC = reply("12019", "Howrah - Ranchi Shatabdi Express", 268, { baseFare: 425, reservationCharge: 40, superfastCharge: 45, goodsServiceTax: 34, cateringCharge: 290, dynamicFare: 170, totalFare: 1005 });
const MAIL = { SL: reply("13005", "Amritsar Mail", 1752, { baseFare: 730, reservationCharge: 20, totalFare: 750 }), "3A": reply("13005", "Amritsar Mail", 1752, { baseFare: 1793, reservationCharge: 40, goodsServiceTax: 92, totalFare: 1925 }), "2A": reply("13005", "Amritsar Mail", 1752, { baseFare: 2573, reservationCharge: 50, goodsServiceTax: 132, totalFare: 2755 }), "1A": reply("13005", "Amritsar Mail", 1752, { baseFare: 4354, reservationCharge: 60, goodsServiceTax: 221, totalFare: 4635 }) } as Record<string, unknown>;
const NOT_AVAILABLE = { success: false, error: { code: "API:DATA_NOT_AVAILABLE", message: "The requested railway information is unavailable." } };
const cls = (c: string) => CLASSES.find((x) => x.code === c)!;

// reading one class
const cc = parseClassFare(200, SHATABDI_CC, "12019", cls("CC"));
ok("a real Shatabdi chair-car fare is read: total 1005 as the railway gives it, distance 268 km, the parts above zero in print order", cc.kind === "fare" && cc.fare.total === 1005 && cc.distance === 268 && cc.fare.parts.map((p) => p.label).join() === "Basic fare,Reservation,Superfast,Catering,Dynamic pricing,GST" && cc.fare.parts.find((p) => p.label === "Catering")?.amount === 290);
ok("the total is the railway's own (1005), not our sum of the rounded parts (1004)", cc.kind === "fare" && cc.fare.total === 1005);
ok("a sleeper fare has no zero parts: basic and reservation only", (() => { const r = parseClassFare(200, MAIL.SL, "13005", cls("SL")); return r.kind === "fare" && r.fare.parts.length === 2 && r.fare.total === 750; })());
ok("404 'data not available' means the train has no such class: absent, not an error", parseClassFare(404, NOT_AVAILABLE, "13005", cls("2S")).kind === "absent");
ok("an answer for another train, a failure body with 200, a missing total or distance, an unreadable part, or parts that do not add up is refused", throws(() => parseClassFare(200, SHATABDI_CC, "99999", cls("CC"))) && throws(() => parseClassFare(200, { success: false }, "12019", cls("CC"))) && throws(() => parseClassFare(200, reply("12019", "x", 268, { totalFare: 0 }), "12019", cls("CC"))) && throws(() => parseClassFare(200, reply("12019", "x", 0, { baseFare: 100, totalFare: 100 }), "12019", cls("CC"))) && throws(() => parseClassFare(200, reply("12019", "x", 268, { baseFare: 100, totalFare: 900 }), "12019", cls("CC"))) && throws(() => parseClassFare(200, reply("12019", "x", 268, { baseFare: 100, totalFare: 106 }), "12019", cls("CC"))) && throws(() => parseClassFare(200, reply("12019", "x", 268, { baseFare: 100, totalFare: 97 }), "12019", cls("CC"))) && throws(() => parseClassFare(200, null, "12019", cls("CC"))) && throws(() => parseClassFare(200, { success: true, data: { trainNumber: "12019", trainName: "x", distance: 10, breakdown: { baseFare: "100", totalFare: 100 } } }, "12019", cls("CC"))));

ok("a total up to 4 rupees above the sum of its parts is accepted (non-AC totals are rounded UP to the next 5 rupees: parts 101 give 105, 251 give 255, 106 give 110 on 14 Nov 2026), and one rupee below (rounded parts)", ["101:105", "251:255", "106:110", "350:350", "369:370", "100:104", "100:99"].every((x) => { const [p, t] = x.split(":").map(Number); return parseClassFare(200, reply("12340", "x", 100, { baseFare: p, totalFare: t }), "12340", cls("SL")).kind === "fare"; }));
// the day
const sat = DateTime.fromISO("2026-11-14T10:00:00", { zone: "Asia/Kolkata" });
ok("the day is the first one from TOMORROW on that the train is at Durgapur: Sunday train on Saturday 14 Nov = 15 Nov; Saturday train = 21 Nov (not today)", journeyDateFor(["sun"], sat) === "2026-11-15" && journeyDateFor(["sat"], sat) === "2026-11-21" && journeyDateFor(["mon", "wed"], sat) === "2026-11-16");
ok("a daily train gets tomorrow, and a train with no running day gets none", journeyDateFor(["mon", "tue", "wed", "thu", "fri", "sat", "sun"], sat) === "2026-11-15" && journeyDateFor([], sat) === null);
ok("it is the day in India, not the server's: 11 pm in London on Fri 13 Nov is already Sat 14 Nov in India, so tomorrow is Sunday", journeyDateFor(["sat", "sun"], DateTime.fromISO("2026-11-13T23:00:00", { zone: "Europe/London" })) === "2026-11-15");

// asking all the classes
const calls: string[] = [];
const fake = (table: Record<string, unknown>, status: Record<string, number> = {}): Fetcher => async (url) => { calls.push(url); const c = new URL(url).searchParams.get("classCode")!; return table[c] ? { status: status[c] ?? 200, json: table[c] } : { status: 404, json: NOT_AVAILABLE }; };

// the local trains: the schedule of 63505 Barddhaman - Asansol MEMU (real, 14 Nov 2026, trimmed to the stops that matter)
const stop = (seq: number, code: string, distance: number, extra: Record<string, unknown> = {}) => ({ sequence: seq, station: { code }, distance, isReversal: false, ...extra });
const SCHED = (route: unknown[], train: Record<string, unknown> = {}) => ({ success: true, data: { train: { number: "63505", name: "Barddhaman - Asansol MEMU", type: "MEMU", category: "Local", hasReversal: false, isPrsBookable: false, ...train }, route } });
const S63505 = SCHED([stop(1, "BWN", 0), stop(9, "RBH", 55.4), stop(10, "DGR", 63.8), stop(16, "UDL", 80.7), stop(22, "ASN", 106.1)]);
ok("the distance from Durgapur to Asansol on 63505 is 106.1 - 63.8 = 42.3 km", parseLocalDistance(S63505, "63505", "ASN") === 42.3 && parseLocalDistance(S63505, "63505", "UDL") === 16.9);
ok("a schedule of another train, without Durgapur or the end, running the other way, with a reversal, or with unreadable distances is refused", throws(() => parseLocalDistance(S63505, "99999", "ASN")) && throws(() => parseLocalDistance(S63505, "63505", "XXX")) && throws(() => parseLocalDistance(S63505, "63505", "BWN")) && throws(() => parseLocalDistance(SCHED([stop(1, "BWN", 0), stop(10, "DGR", 63.8), stop(22, "ASN", 106.1)], { hasReversal: true }), "63505", "ASN")) && throws(() => parseLocalDistance(SCHED([stop(1, "BWN", 0), stop(10, "DGR", 63.8), stop(22, "ASN", 106.1, { isReversal: true })]), "63505", "ASN")) && throws(() => parseLocalDistance(SCHED([stop(10, "DGR", 63.8), stop(22, "ASN", 0)]), "63505", "ASN")) && throws(() => parseLocalDistance({ success: false }, "63505", "ASN")));
const local = (status: number, json: unknown): Fetcher => async () => ({ status, json });

(async () => {
  const L = await askLocalFare("63505", "ASN", local(200, S63505), "2026-11-14");
  ok("the hint for Durgapur to Asansol: one class 'UR', an estimate from the table ('table'), Rs 10, 42.3 km, with the two slabs the 2 km tolerance touches (36-40 and 41-45, both Rs 10) and no range", L.classes.length === 1 && L.classes[0].code === LOCAL_CLASS.code && L.classes[0].basis === "table" && L.classes[0].total === 10 && L.classes[0].high === undefined && L.distanceKm === 42.3 && L.classes[0].parts.map((x) => x.label).join() === "Fare table, 36\u201340 km,Fare table, 41\u201345 km" && L.trainName === "Barddhaman - Asansol MEMU" && L.from === "DGR" && L.to === "ASN" && L.journeyDate === "2026-11-14");
  const edge = SCHED([stop(1, "AAA", 0), stop(10, "DGR", 10), stop(20, "ZZZ", 170.5)]);
  const R = await askLocalFare("63505", "ZZZ", local(200, edge), "2026-11-14");
  ok("when the distance's uncertainty crosses a fare step the hint is a range with both slabs named: 160.5 km is Rs 35 to 40", R.classes[0].total === 35 && R.classes[0].high === 40 && R.classes[0].parts.length === 2);
  const far = SCHED([stop(1, "AAA", 0), stop(10, "DGR", 10), stop(20, "ZZZ", 600)]);
  ok("a distance beyond the table (500 km) gets no hint: an empty list, not a guess", (await askLocalFare("63505", "ZZZ", local(200, far), "2026-11-14")).classes.length === 0);
  const revSched = SCHED([stop(1, "AAA", 0), stop(10, "DGR", 10), stop(20, "BBB", 50, { isReversal: true }), stop(30, "CCC", 20)], { number: "13503", name: "Hatia MEMU Express", hasReversal: true });
  const NH = await askLocalFare("13503", "CCC", local(200, revSched), "2026-11-14");
  ok("a local train that reverses gives an EMPTY answer with its name (to be saved, so that it is not asked again), not an error; it has no hint", NH.classes.length === 0 && NH.trainName === "Hatia MEMU Express" && NH.distanceKm === 0 && NH.to === "CCC");
  ok("a refusal (429, 403, 500) or an unreadable schedule is an error, never a hint", await throwsAsync(() => askLocalFare("63505", "ASN", local(429, {}), "2026-11-14")) && await throwsAsync(() => askLocalFare("63505", "ASN", local(403, {}), "2026-11-14")) && await throwsAsync(() => askLocalFare("63505", "ASN", local(500, {}), "2026-11-14")) && await throwsAsync(() => askLocalFare("63505", "ASN", local(200, { success: true }), "2026-11-14")));
  const asked: string[] = [];
  await askLocalFare("63505", "ASN", async (u) => { asked.push(u); return { status: 200, json: S63505 }; }, "2026-11-14");
  ok("only ONE request is made for a local train (its schedule), not eight", asked.length === 1 && /\/v1\/trains\/63505\?haltsOnly=true$/.test(asked[0]));

  // the legs: every stop after Durgapur
  const S2 = SCHED([stop(1, "BWN", 0), stop(5, "PAN", 48), stop(10, "DGR", 63.8), { ...stop(12, "OYR", 72.5), station: { code: "OYR", name: "Waria" } }, { ...stop(16, "UDL", 80.7), station: { code: "UDL", name: "Andal Jn" } }, { ...stop(22, "ASN", 106.1), station: { code: "ASN", name: "Asansol Jn" } }]);
  const sch = parseSchedule(S2, "63505");
  ok("the schedule gives the halts after Durgapur with their distance FROM Durgapur, in order, and Durgapur's own distance from the start", sch.stops.map((x) => `${x.code}:${x.km}`).join() === "OYR:8.7,UDL:16.9,ASN:42.3" && sch.durgapurKm === 63.8 && !sch.reverses && sch.stops[0].name === "Waria" && sch.trainName === "Barddhaman - Asansol MEMU");
  const rev = parseSchedule(SCHED([stop(1, "AAA", 0), stop(10, "DGR", 10), { ...stop(12, "BBB", 40), station: { code: "BBB", name: "B" } }, { ...stop(14, "CCC", 80, { isReversal: true }), station: { code: "CCC", name: "C" } }, { ...stop(16, "DDD", 20), station: { code: "DDD", name: "D" } }]), "63505");
  ok("a reversal ends the list (its own stop is kept; what follows is not worked out) and says so", rev.stops.map((x) => x.code).join() === "BBB,CCC" && rev.reverses);
  ok("a schedule of another train, with no Durgapur, or with an unreadable stop is refused; a stop whose distance goes backwards ends the list", throws(() => parseSchedule(S2, "99999")) && throws(() => parseSchedule(SCHED([stop(1, "BWN", 0), stop(5, "PAN", 48)]), "63505")) && throws(() => parseSchedule(SCHED([stop(1, "AAA", 0), stop(10, "DGR", 10), stop(12, "BBB", null as never)]), "63505")) && parseSchedule(SCHED([stop(1, "AAA", 0), stop(10, "DGR", 10), { ...stop(12, "BBB", 40), station: { code: "BBB", name: "B" } }, { ...stop(14, "CCC", 30), station: { code: "CCC", name: "C" } }]), "63505").stops.length === 1);
  const hints = localLegs(sch, "2026-11-14");
  ok("a local train's legs are hints for every stop: Waria 8.7 km Rs 10, Andal 16.9 km Rs 10, Asansol 42.3 km Rs 10, each marked 'table'", hints.length === 3 && hints.every((h) => h.classes.length === 1 && h.classes[0].basis === "table" && h.classes[0].code === "UR" && h.classes[0].total === 10) && hints[2].distanceKm === 42.3 && hints[2].name === "Asansol Jn" && hints[0].journeyDate === "2026-11-14");
  const legCalls: string[] = [];
  const legFetch: Fetcher = async (u) => { legCalls.push(u); const c = new URL(u).searchParams.get("classCode")!; return c === "SL" ? { status: 200, json: reply("13005", "Amritsar Mail", 43, { baseFare: 130, reservationCharge: 20, totalFare: 150 }) } : c === "3A" ? { status: 200, json: reply("13005", "Amritsar Mail", 43, { baseFare: 455, reservationCharge: 40, goodsServiceTax: 25, totalFare: 520 }) } : { status: 404, json: NOT_AVAILABLE }; };
  const leg = await askLeg("13005", { code: "ASN", name: "Asansol Jn", seq: 22, km: 42.3 }, [cls("SL"), cls("3A"), cls("2A")], "2026-11-21", legFetch);
  ok("a stop's leg holds the classes that answer, with the railway's own distance (43 km, not 42.3), asked one after another: 3 requests for 3 classes", !!leg && leg.classes.map((c) => `${c.code}:${c.total}`).join() === "SL:150,3A:520" && leg.distanceKm === 43 && leg.to === "ASN" && leg.name === "Asansol Jn" && leg.seq === 22 && legCalls.length === 3 && legCalls.every((u) => /source=DGR&destination=ASN&journeyDate=2026-11-21/.test(u)));
  ok("a stop that no class answers (the train does not go, or sell, there) has no leg: null, not an empty leg", (await askLeg("13005", { code: "DHN", name: "Dhanbad", seq: 30, km: 90 }, [cls("2A")], "2026-11-21", legFetch)) === null);
  ok("a refusal while asking a stop's classes is an error (429, 403)", await throwsAsync(() => askLeg("13005", { code: "ASN", name: "A", seq: 1, km: 1 }, [cls("SL")], "2026-11-21", async () => ({ status: 429, json: {} }))) && await throwsAsync(() => askLeg("13005", { code: "ASN", name: "A", seq: 1, km: 1 }, [cls("SL")], "2026-11-21", async () => ({ status: 403, json: {} }))));

  const set = await askFares("13005", "ASR", "2026-11-21", fake(MAIL));
  ok("a mail train with sleeper, 3A, 2A and 1A gets exactly those four, cheapest first, and the classes it lacks are left out", set.classes.map((c) => c.code).join() === "SL,3A,2A,1A" && set.classes.map((c) => c.total).join() === "750,1925,2755,4635", set.classes.map((c) => c.code).join());
  ok("it carries the train, its name, the end station, the day asked for and the distance", set.train === "13005" && set.trainName === "Amritsar Mail" && set.from === "DGR" && set.to === "ASR" && set.journeyDate === "2026-11-21" && set.distanceKm === 1752);
  ok("it asked each of the eight classes once, from Durgapur, with the day, and the key is nowhere in an address", calls.length === 8 && CLASSES.length === 8 && calls.every((u) => /source=DGR&destination=ASR&journeyDate=2026-11-21&classCode=/.test(u) && !/rg_/.test(u) && !/key/i.test(u)));
  const none = await askFares("63505", "ASN", "2026-11-15", fake({}));
  ok("a train with no fare in the reservation system (a local MEMU) gives an empty list, not an error", none.classes.length === 0 && none.distanceKm === 0);
  ok("a rate refusal (429), a key refusal (403, 401) or a failure (500) is an error for the whole set, never a half list", await throwsAsync(() => askFares("13005", "ASR", "2026-11-21", fake(MAIL, { SL: 429 }))) && await throwsAsync(() => askFares("13005", "ASR", "2026-11-21", fake(MAIL, { "3A": 403 }))) && await throwsAsync(() => askFares("13005", "ASR", "2026-11-21", fake(MAIL, { "2A": 401 }))) && await throwsAsync(() => askFares("13005", "ASR", "2026-11-21", fake(MAIL, { "1A": 500 }))));
  ok("two different distances for one train are refused", await throwsAsync(() => askFares("13005", "ASR", "2026-11-21", fake({ ...MAIL, "3A": reply("13005", "Amritsar Mail", 1700, { baseFare: 1000, totalFare: 1000 }) }))));
  ok("the fares are kept three days", FARE_KEPT_S === 3 * 24 * 60 * 60);
  console.log(`fare: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
