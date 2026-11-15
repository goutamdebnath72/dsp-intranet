// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/fareService.selftest.ts
// What the card is told about fares: the SAVED ones only, with the date received. The app never asks RailRadar's fare service (the plant's paid month ends on 13 Dec 2026): not for an old row, not for a missing one, not before or after the month.
import { readdirSync, readFileSync } from "node:fs";
import { DateTime } from "luxon";
import type { FareSet } from "./fare";
import { fareAnswer, fareServiceOpen, FARES_LIVE_UNTIL, legsAnswer, type FareDeps } from "./fareService";
import type { LegRow } from "./fareLegStore";
import type { FareRow, FareStore } from "./fareStore";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const at = (iso: string) => DateTime.fromISO(iso, { zone: "Asia/Kolkata" });

const SET = (n = "12019", total = 1005): FareSet => ({ train: n, trainName: "T " + n, from: "DGR", to: "RNC", journeyDate: "2026-11-16", distanceKm: 268, classes: [{ code: "CC", name: "Chair car", total, parts: [] }] });
function setup(row: FareRow | null, o: { now?: string; until?: string; storeFails?: boolean } = {}) {
  const saved = new Map<string, FareRow>(row ? [[row.set.train, row]] : []);
  const c = { puts: 0 };
  const store: FareStore = { async get(n) { if (o.storeFails) throw new Error("db down"); return saved.get(n) ?? null; }, async put(set, when) { c.puts++; saved.set(set.train, { set, receivedAt: DateTime.fromJSDate(when).toUTC().toISO() ?? "" }); } };
  const deps: FareDeps = { store, now: () => at(o.now ?? "2026-11-14T12:00:00"), until: o.until };
  return { deps, saved, c };
}
const row = (iso: string, total = 1005): FareRow => ({ set: SET("12019", total), receivedAt: DateTime.fromISO(iso).toUTC().toISO() ?? "" });
const throwsAsync = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch { return true; } };

(async () => {
  ok("the paid fare service is open to the end of 13 Dec 2026 (Indian time) and closed from 14 Dec; the renewal day is never relied on", FARES_LIVE_UNTIL === "2026-12-13" && fareServiceOpen(at("2026-12-13T23:59:00")) && !fareServiceOpen(at("2026-12-14T00:01:00")) && fareServiceOpen(at("2026-11-14T10:00:00")));
  ok("the day is the Indian day: 11 pm on 13 Dec in London is already 14 Dec in India, so closed", !fareServiceOpen(DateTime.fromISO("2026-12-13T23:00:00", { zone: "Europe/London" })));

  let s = setup(row("2026-11-13T06:00:00Z"));
  let r = await fareAnswer("12019", s.deps);
  ok("fares saved a day ago are shown as they are with the time received; the database is read and nothing is written", r.data.receivedAt === "2026-11-13T06:00:00.000Z" && r.data.classes[0].total === 1005 && !r.data.frozen && !r.stale && s.c.puts === 0);

  s = setup(row("2026-11-01T06:00:00Z"));
  r = await fareAnswer("12019", s.deps);
  ok("OLD fares (two weeks) are NOT refreshed by the app while the paid month is open: the saved fares are shown with their OWN time, and nothing is saved", r.data.classes[0].total === 1005 && r.data.receivedAt === "2026-11-01T06:00:00.000Z" && s.c.puts === 0 && s.saved.get("12019")?.set.classes[0].total === 1005);

  s = setup(null);
  ok("a train with no saved fares is an error that says so (no invented fare, no request)", await throwsAsync(() => fareAnswer("12019", s.deps)) && s.c.puts === 0);
  s = setup(null, { storeFails: true });
  let msg = ""; try { await fareAnswer("12019", s.deps); } catch (e) { msg = (e as Error).message; }
  ok("a database failure is a plain message, without the database's own words", /could not be read/.test(msg) && !/db down/.test(msg));

  // after the paid month: the same, shown frozen
  s = setup(row("2026-11-20T06:00:00Z"), { now: "2026-12-20T12:00:00" });
  r = await fareAnswer("12019", s.deps);
  ok("AFTER the month the fares are shown frozen with their time", r.data.frozen && r.stale && r.data.receivedAt === "2026-11-20T06:00:00.000Z" && s.c.puts === 0);
  s = setup(row("2026-11-08T06:00:00Z"), { now: "2026-12-14T00:30:00" });
  r = await fareAnswer("12019", s.deps);
  ok("from the first minute of 14 Dec the fares are frozen, even those a week old", r.data.frozen);

  // the app has no way to ask RailRadar for a fare: the service takes the store and nothing else
  const src = readFileSync("src/lib/live/fareService.ts", "utf8") + readFileSync("src/app/api/live/railway-fare/route.ts", "utf8");
  ok("neither the fare service nor the fare route can reach RailRadar: no ask, no target, no fetcher, no timetable load", !/askFares|askLocalFare|railRadarFetch|loadRailway|deps\.ask|deps\.target/.test(src.replace(/\/\/.*$/gm, "")));
  // the whole app: only fare.ts defines the asking functions, and nothing in src but its own test uses them (the collection scripts in scripts/ do)
  const files: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = `${d}/${e.name}`; if (e.isDirectory()) walk(f); else if (/\.(ts|tsx)$/.test(e.name) && !/\.selftest\./.test(e.name)) files.push(f); } };
  walk("src");
  const users = files.filter((f) => f !== "src/lib/live/fare.ts" && /\b(askFares|askLocalFare|askLeg|readClass|FARE_BASE_URL)\b/.test(readFileSync(f, "utf8")));
  ok("nothing in the app (src) asks RailRadar for a fare: the asking functions are used only by the collection scripts", users.length === 0, users.join());

  // the legs as one answer
  const lr = (to: string, seq: number, iso: string, basis?: "table"): LegRow => ({ receivedAt: iso, leg: { to, name: to, seq, distanceKm: seq * 10, journeyDate: "2026-11-21", classes: [{ code: basis ? "UR" : "SL", name: "x", total: 100, ...(basis ? { basis } : {}), parts: [] }] } });
  const la = legsAnswer("13005", [lr("DHN", 30, "2026-11-20T08:00:00.000Z"), lr("ASN", 22, "2026-11-14T08:00:00.000Z"), lr("UDL", 16, "2026-11-17T08:00:00.000Z")], at("2026-11-21T12:00:00"));
  ok("the legs of a train are one answer in route order, dated by the OLDEST stop (none is older), with the newest too; open service means not frozen; reservation fares are not hints", !!la && la.legs.map((l) => l.to).join() === "UDL,ASN,DHN" && la.receivedAt === "2026-11-14T08:00:00.000Z" && la.newestAt === "2026-11-20T08:00:00.000Z" && !la.frozen && !la.hint);
  ok("after the paid month the legs are frozen; legs that are all table hints make a hint answer; a mix is not a hint; no rows is no answer", legsAnswer("13005", [lr("ASN", 22, "2026-11-14T08:00:00.000Z")], at("2026-12-20T12:00:00"))!.frozen && legsAnswer("63505", [lr("ASN", 22, "2026-11-14T08:00:00.000Z", "table")], at("2026-11-21T12:00:00"))!.hint && !legsAnswer("63505", [lr("ASN", 22, "2026-11-14T08:00:00.000Z", "table"), lr("DHN", 30, "2026-11-14T08:00:00.000Z")], at("2026-11-21T12:00:00"))!.hint && legsAnswer("13005", [], at("2026-11-21T12:00:00")) === null);
  console.log(`fareService: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
