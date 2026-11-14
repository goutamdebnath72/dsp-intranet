// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/fareStore.selftest.ts
// The saved fares: the table is made once, a train's fares are written and read back with the time they were received, a row that is not the shape written is not shown, and database trouble never breaks a card.
import { DateTime } from "luxon";
import { FARE_TABLE_STATEMENTS, fareFromRow, typeormFareStore } from "./fareStore";
import type { FareSet } from "./fare";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const SET: FareSet = { train: "12019", trainName: "Howrah - Ranchi Shatabdi Express", from: "DGR", to: "RNC", journeyDate: "2026-11-16", distanceKm: 268, classes: [{ code: "CC", name: "Chair car", total: 1005, parts: [{ label: "Basic fare", amount: 425 }] }, { code: "EC", name: "Executive chair car", total: 1505, parts: [{ label: "Basic fare", amount: 931 }] }] };

/** a tiny stand-in for the database: it understands the five statements the store sends */
function fakeDb(opts: { tableExists?: boolean; failCreate?: boolean; failRead?: boolean } = {}) {
  const log: string[] = [];
  const rows = new Map<string, any>();
  let exists = opts.tableExists ?? false;
  return {
    log, rows,
    async query(sql: string, p: unknown[] = []) {
      log.push(sql.replace(/\s+/g, " ").trim().slice(0, 40));
      if (/to_regclass/.test(sql)) return [{ t: exists ? "train_fare" : null }];
      if (/^\s*CREATE TABLE/.test(sql)) { if (opts.failCreate) throw new Error("permission denied"); exists = true; return []; }
      if (/ENABLE ROW LEVEL|REVOKE/.test(sql)) return [];
      if (/^\s*INSERT INTO public\.train_fare/.test(sql)) { rows.set(String(p[0]), { train_number: p[0], train_name: p[1], to_code: p[2], journey_date: p[3], distance_km: p[4], classes: p[5], fetched_at: DateTime.fromISO(String(p[6])).toJSDate() }); return []; }
      if (/FROM public\.train_fare WHERE train_number/.test(sql)) { if (opts.failRead) throw new Error("connection lost"); const r = rows.get(String(p[0])); return r ? [r] : []; }
      throw new Error("unexpected " + sql);
    },
  };
}

(async () => {
  const db = fakeDb();
  const store = typeormFareStore(db);
  ok("nothing is saved at first, and the table is made on first use", (await store.get("12019")) === null && db.log.some((l) => /CREATE TABLE/.test(l)));
  await store.put(SET, DateTime.fromISO("2026-11-14T05:40:00Z").toJSDate());
  const back = await store.get("12019");
  ok("fares written come back the same, with the time they were received", !!back && back.receivedAt === "2026-11-14T05:40:00.000Z" && JSON.stringify(back.set) === JSON.stringify(SET), JSON.stringify(back));
  await store.put({ ...SET, classes: [SET.classes[0]] }, DateTime.fromISO("2026-11-20T05:40:00Z").toJSDate());
  const again = await store.get("12019");
  ok("a train has one row: saving it again replaces the old fares and the time", !!again && again.set.classes.length === 1 && again.receivedAt === "2026-11-20T05:40:00.000Z" && db.rows.size === 1);
  ok("the table is checked once, not at every request", db.log.filter((l) => /to_regclass/.test(l)).length === 1 && db.log.filter((l) => /CREATE TABLE/.test(l)).length === 1);
  const db2 = fakeDb({ tableExists: true });
  await typeormFareStore(db2).get("12019");
  ok("a table that exists is not made again", !db2.log.some((l) => /CREATE TABLE/.test(l)));
  ok("the table statements close it to the public roles (row-level security on, rights revoked from anon and authenticated)", FARE_TABLE_STATEMENTS.some((s) => /ROW LEVEL SECURITY/.test(s)) && FARE_TABLE_STATEMENTS.some((s) => /REVOKE ALL ON public\.train_fare FROM anon, authenticated/.test(s)));

  // trouble never breaks a card
  const warn = console.warn; console.warn = () => undefined;
  const bad = typeormFareStore(fakeDb({ failCreate: true }));
  ok("if the table cannot be made, get says 'nothing saved' and put does nothing, without an error", (await bad.get("12019")) === null && (await bad.put(SET, DateTime.now().toJSDate())) === undefined);
  ok("a failed read says 'nothing saved'", (await typeormFareStore(fakeDb({ tableExists: true, failRead: true })).get("12019")) === null);
  console.warn = warn;

  // a row that is not the shape written
  const good = { train_number: "12019", train_name: "x", to_code: "RNC", journey_date: "2026-11-16", distance_km: "268", classes: JSON.stringify(SET.classes), fetched_at: "2026-11-14T05:40:00Z" };
  ok("a row is read (classes as text or as data; distance as text or number)", fareFromRow(good)?.set.distanceKm === 268 && fareFromRow({ ...good, classes: SET.classes })?.set.classes.length === 2);
  ok("a row with a broken time, a broken class, a wrong number or day, or no classes list is not shown", fareFromRow({ ...good, fetched_at: "garbage" }) === null && fareFromRow({ ...good, classes: [{ code: "CC" }] }) === null && fareFromRow({ ...good, train_number: "12" }) === null && fareFromRow({ ...good, journey_date: "16/11/2026" }) === null && fareFromRow({ ...good, classes: "null" }) === null && fareFromRow({ ...good, distance_km: "abc" }) === null);
  console.log(`fareStore: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
