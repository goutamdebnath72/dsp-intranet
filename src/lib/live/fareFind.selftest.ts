// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/fareFind.selftest.ts
// "Find a fare": the trains that go from Durgapur to a station, from the saved fares and the timetable.
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { buildFind, cheapest } from "./fareFind";
import { parseRailway } from "./railway";
import type { StopTrainRow } from "./fareLegStore";
import type { ClassFare } from "./fare";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const rw = parseRailway(JSON.parse(readFileSync("src/lib/live/fixtures/railradar-dgr-sample.json", "utf8")), { min: 1 });
const now = DateTime.fromISO("2026-11-20T12:00:00", { zone: "Asia/Kolkata" });
const cl = (code: string, total: number, basis?: "table"): ClassFare => ({ code, name: code, total, ...(basis ? { basis } : {}), parts: [] });
const row = (number: string, name: string, classes: ClassFare[], at = "2026-11-14T08:00:00.000Z"): StopTrainRow => ({ number, trainName: name, receivedAt: at, leg: { to: "ASN", name: "Asansol Jn", seq: 22, distanceKm: 43, journeyDate: "2026-11-21", classes } });
const rows = [row("13005", "Amritsar Mail (saved)", [cl("SL", 150), cl("3A", 520)]), row("22303", "Vande saved", [cl("CC", 500)], "2026-11-12T08:00:00.000Z"), row("63505", "MEMU saved", [cl("UR", 10, "table")], "2026-11-14T09:00:00.000Z"), row("12019", "Shatabdi saved", [cl("CC", 400), cl("EC", 800)])];
const cov = { withFares: 220, withLegs: 40 };
const a = buildFind({ code: "ASN", name: "Asansol Junction" }, rows, rw, cov, now)!;

ok("the trains to a station come in the order they are at Durgapur (the departure, else the arrival), joined with the timetable: names, class words, kinds, days, where each run ends", !!a && a.trains.length === 4 && a.trains.every((t, i, arr) => i === 0 || (arr[i - 1].departure ?? arr[i - 1].arrival ?? "") <= (t.departure ?? t.arrival ?? "")) && a.trains.find((t) => t.number === "12019")!.label === "Shatabdi" && a.trains.find((t) => t.number === "22303")!.label === "Vande Bharat" && a.trains.find((t) => t.number === "63505")!.kind === "local" && a.trains.find((t) => t.number === "13005")!.endsAt!.code === "ASR" && a.trains.find((t) => t.number === "13005")!.name === "Amritsar Mail" && a.trains.find((t) => t.number === "12019")!.days.length >= 1);
ok("a local train's fare is flagged a hint, the others are not", a.trains.find((t) => t.number === "63505")!.hint && !a.trains.find((t) => t.number === "13005")!.hint);
ok("the stop, the coverage and the DATE OF THE OLDEST fare (12 Nov) are carried; the paid month is open, so not frozen", a.stop.code === "ASN" && a.coverage.withLegs === 40 && a.receivedAt === "2026-11-12T08:00:00.000Z" && !a.frozen);
ok("after the paid month the answer is frozen", buildFind({ code: "ASN", name: "A" }, rows, rw, cov, DateTime.fromISO("2026-12-20T12:00:00", { zone: "Asia/Kolkata" }))!.frozen);
const noTable = buildFind({ code: "ASN", name: "A" }, [row("13005", "Amritsar Mail (saved)", [cl("SL", 150)]), row("12019", "Shatabdi saved", [cl("CC", 400)]), row("22303", "Vande saved", [cl("CC", 500)])], null, cov, now)!;
ok("with no timetable the trains still show with the names saved with their fares, without times, in number order", noTable.trains.map((t) => t.number).join() === "12019,13005,22303" && noTable.trains[1].name === "Amritsar Mail (saved)" && noTable.trains.every((t) => t.departure === null && t.label === "" && t.endsAt === null));
ok("a station nobody has a saved fare to has no answer", buildFind({ code: "XXX", name: "X" }, [], rw, cov, now) === null);
ok("the cheapest fare of a train is its lowest class; a train with none sorts last (Infinity)", cheapest(a.trains.find((t) => t.number === "12019")!) === 400 && cheapest(a.trains.find((t) => t.number === "13005")!) === 150 && cheapest({ ...a.trains[0], classes: [] }) === Infinity);
console.log(`fareFind: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
