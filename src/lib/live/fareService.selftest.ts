// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/fareService.selftest.ts
// What the card is told about fares: saved ones shown with the date received; RailRadar asked only while the paid month lasts; never asked after it; one request for two people at once.
import { DateTime } from "luxon";
import type { FareSet } from "./fare";
import { fareAnswer, fareServiceOpen, FARES_LIVE_UNTIL, legsAnswer, type FareDeps } from "./fareService";
import type { LegRow } from "./fareLegStore";
import type { FareRow, FareStore } from "./fareStore";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const at = (iso: string) => DateTime.fromISO(iso, { zone: "Asia/Kolkata" });

const SET = (n = "12019", total = 1005): FareSet => ({ train: n, trainName: "T " + n, from: "DGR", to: "RNC", journeyDate: "2026-11-16", distanceKm: 268, classes: [{ code: "CC", name: "Chair car", total, parts: [] }] });
function setup(row: FareRow | null, o: { askFails?: boolean; now?: string; until?: string; targetFails?: boolean; local?: boolean } = {}) {
  const saved = new Map<string, FareRow>(row ? [[row.set.train, row]] : []);
  const store: FareStore = { async get(n) { return saved.get(n) ?? null; }, async put(set, when) { saved.set(set.train, { set, receivedAt: DateTime.fromJSDate(when).toUTC().toISO() ?? "" }); } };
  const c = { asked: 0, targets: 0, local: null as boolean | null };
  const deps: FareDeps = {
    store,
    target: async () => { c.targets++; if (o.targetFails) throw new Error("not a train of Durgapur"); return { to: "RNC", date: "2026-11-16", local: o.local }; },
    ask: async (n, _to, _date, local) => { c.asked++; c.local = local; await new Promise((r) => setTimeout(r, 15)); if (o.askFails) throw new Error("RailRadar down"); return SET(n, 1111); },
    now: () => at(o.now ?? "2026-11-14T12:00:00"),
    until: o.until,
  };
  return { deps, saved, c };
}
const row = (iso: string, total = 1005): FareRow => ({ set: SET("12019", total), receivedAt: DateTime.fromISO(iso).toUTC().toISO() ?? "" });
const throwsAsync = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch { return true; } };

(async () => {
  ok("the paid fare service is open to the end of 13 Dec 2026 (Indian time) and closed from 14 Dec; the renewal day is never relied on", FARES_LIVE_UNTIL === "2026-12-13" && fareServiceOpen(at("2026-12-13T23:59:00")) && !fareServiceOpen(at("2026-12-14T00:01:00")) && fareServiceOpen(at("2026-11-14T10:00:00")));
  ok("the day is the Indian day: 11 pm on 13 Dec in London is already 14 Dec in India, so closed", !fareServiceOpen(DateTime.fromISO("2026-12-13T23:00:00", { zone: "Europe/London" })));

  let s = setup(row("2026-11-13T06:00:00Z"));
  let r = await fareAnswer("12019", s.deps);
  ok("fares saved a day ago are shown as they are with the time received, with no request and no timetable look-up", r.data.receivedAt === "2026-11-13T06:00:00.000Z" && r.data.classes[0].total === 1005 && !r.data.frozen && !r.stale && s.c.asked === 0 && s.c.targets === 0);

  s = setup(row("2026-11-08T06:00:00Z"));
  r = await fareAnswer("12019", s.deps);
  ok("fares saved six days ago are refreshed while the service is open: asked once, saved, shown with the NEW time", s.c.asked === 1 && r.data.classes[0].total === 1111 && r.data.receivedAt.startsWith("2026-11-14") && s.saved.get("12019")?.set.classes[0].total === 1111 && !r.stale);

  s = setup(row("2026-11-08T06:00:00Z"), { askFails: true });
  r = await fareAnswer("12019", s.deps);
  ok("if the refresh fails the saved fares are shown, with their OWN old time and the 'not answering' flag", r.data.classes[0].total === 1005 && r.data.receivedAt === "2026-11-08T06:00:00.000Z" && r.stale && s.saved.get("12019")?.set.classes[0].total === 1005);

  s = setup(null);
  r = await fareAnswer("12019", s.deps);
  ok("a train never saved is asked for and saved while the service is open", s.c.asked === 1 && s.saved.has("12019") && r.data.classes.length === 1);
  s = setup(null, { askFails: true });
  ok("a train never saved, whose request fails, is an error (no invented fare)", await throwsAsync(() => fareAnswer("12019", s.deps)));
  s = setup(null, { targetFails: true });
  ok("a number that is not a train of Durgapur is refused before RailRadar is asked", await throwsAsync(() => fareAnswer("99999", s.deps)) && s.c.asked === 0);

  s = setup(null, { local: true });
  await fareAnswer("63505", s.deps);
  ok("a local train is asked for as a local one (the hint from its schedule), an express as an express", s.c.local === true && (await (async () => { const e = setup(null); await fareAnswer("12019", e.deps); return e.c.local === false; })()));

  // after the paid month
  s = setup(row("2026-11-20T06:00:00Z"), { now: "2026-12-20T12:00:00" });
  r = await fareAnswer("12019", s.deps);
  ok("AFTER the month RailRadar is NEVER asked, however old the fares: they are shown frozen with their time", s.c.asked === 0 && s.c.targets === 0 && r.data.frozen && r.stale && r.data.receivedAt === "2026-11-20T06:00:00.000Z" && r.data.classes[0].total === 1005);
  s = setup(null, { now: "2026-12-20T12:00:00" });
  ok("after the month a train with no saved fares is an error that says so, and nothing is asked", await throwsAsync(() => fareAnswer("12019", s.deps)) && s.c.asked === 0);
  s = setup(row("2026-11-08T06:00:00Z"), { now: "2026-12-14T00:30:00" });
  r = await fareAnswer("12019", s.deps);
  ok("from the first minute of 14 Dec nothing is asked, even for fares a week old", s.c.asked === 0 && r.data.frozen);

  // two at once
  s = setup(null);
  const [a, b] = await Promise.all([fareAnswer("12019", s.deps), fareAnswer("12019", s.deps)]);
  ok("two people pressing the same train at once cost ONE request, and both get the fares", s.c.asked === 1 && a.data.classes.length === 1 && b.data.classes.length === 1);
  // the legs as one answer
  const lr = (to: string, seq: number, iso: string, basis?: "table"): LegRow => ({ receivedAt: iso, leg: { to, name: to, seq, distanceKm: seq * 10, journeyDate: "2026-11-21", classes: [{ code: basis ? "UR" : "SL", name: "x", total: 100, ...(basis ? { basis } : {}), parts: [] }] } });
  const la = legsAnswer("13005", [lr("DHN", 30, "2026-11-20T08:00:00.000Z"), lr("ASN", 22, "2026-11-14T08:00:00.000Z"), lr("UDL", 16, "2026-11-17T08:00:00.000Z")], at("2026-11-21T12:00:00"));
  ok("the legs of a train are one answer in route order, dated by the OLDEST stop (none is older), with the newest too; open service means not frozen; reservation fares are not hints", !!la && la.legs.map((l) => l.to).join() === "UDL,ASN,DHN" && la.receivedAt === "2026-11-14T08:00:00.000Z" && la.newestAt === "2026-11-20T08:00:00.000Z" && !la.frozen && !la.hint);
  ok("after the paid month the legs are frozen; legs that are all table hints make a hint answer; a mix is not a hint; no rows is no answer", legsAnswer("13005", [lr("ASN", 22, "2026-11-14T08:00:00.000Z")], at("2026-12-20T12:00:00"))!.frozen && legsAnswer("63505", [lr("ASN", 22, "2026-11-14T08:00:00.000Z", "table")], at("2026-11-21T12:00:00"))!.hint && !legsAnswer("63505", [lr("ASN", 22, "2026-11-14T08:00:00.000Z", "table"), lr("DHN", 30, "2026-11-14T08:00:00.000Z")], at("2026-11-21T12:00:00"))!.hint && legsAnswer("13005", [], at("2026-11-21T12:00:00")) === null);
  console.log(`fareService: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
