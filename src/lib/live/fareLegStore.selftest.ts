// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/fareLegStore.selftest.ts
// The saved fares to every stop: written and read back in route order with the time received, a row that is not the shape written is not shown, and database trouble never breaks a card.
import { DateTime } from "luxon";
import { LEG_TABLE_STATEMENTS, legFromRow, typeormLegStore } from "./fareLegStore";
import type { LegFare } from "./fare";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const leg = (to: string, seq: number, km: number, total: number): LegFare => ({ to, name: to + " Jn", seq, distanceKm: km, journeyDate: "2026-11-21", classes: [{ code: "SL", name: "Sleeper", total, parts: [{ label: "Basic fare", amount: total - 20 }] }] });

function fakeDb(o: { exists?: boolean; failCreate?: boolean; failRead?: boolean } = {}) {
  const rows = new Map<string, any>();
  const log: string[] = [];
  let exists = o.exists ?? false;
  return {
    rows, log,
    async query(sql: string, p: unknown[] = []) {
      log.push(sql.replace(/\s+/g, " ").trim().slice(0, 36));
      if (/to_regclass/.test(sql)) return [{ t: exists ? "x" : null }];
      if (/^\s*CREATE TABLE/.test(sql)) { if (o.failCreate) throw new Error("permission denied"); exists = true; return []; }
      if (/ENABLE ROW LEVEL|REVOKE/.test(sql)) return [];
      if (/^\s*INSERT INTO public\.train_fare_leg/.test(sql)) { rows.set(`${p[0]}|${p[1]}`, { train_number: p[0], to_code: p[1], to_name: p[2], seq: p[3], distance_km: p[4], journey_date: p[5], classes: p[6], fetched_at: DateTime.fromISO(String(p[7])).toJSDate() }); return []; }
      if (/FROM public\.train_fare_leg WHERE train_number/.test(sql)) { if (o.failRead) throw new Error("connection lost"); return [...rows.values()].filter((r) => r.train_number === p[0]).sort((a, b) => a.seq - b.seq); }
      if (/GROUP BY to_code/.test(sql)) { const m = new Map<string, { to_code: string; to_name: string; trains: number }>(); for (const r of rows.values()) { const x = m.get(r.to_code) ?? { to_code: r.to_code, to_name: r.to_name, trains: 0 }; x.trains++; m.set(r.to_code, x); } return [...m.values()].sort((a, b) => a.to_name.localeCompare(b.to_name)); }
      if (/LEFT JOIN public\.train_fare f/.test(sql)) { return [...rows.values()].filter((r) => r.to_code === p[0]).map((r) => ({ ...r, train_name: "Name " + r.train_number })); }
      if (/with_fares/.test(sql)) return [{ with_fares: 7, with_legs: rows.size ? new Set([...rows.values()].map((r) => r.train_number)).size : 0 }];
      throw new Error("unexpected " + sql);
    },
  };
}

(async () => {
  const db = fakeDb();
  const st = typeormLegStore(db);
  ok("nothing is saved at first, and the table is made on first use", (await st.list("13005")).length === 0 && db.log.some((l) => /CREATE TABLE/.test(l)));
  const at = DateTime.fromISO("2026-11-14T08:00:00Z").toJSDate();
  await st.put("13005", leg("DHN", 30, 90, 300), at);
  await st.put("13005", leg("ASN", 22, 43, 150), at);
  await st.put("12019", leg("RNC", 9, 268, 1005), at);
  const l = await st.list("13005");
  ok("the stops of a train come back in ROUTE order (not the order saved), with the time received, and not those of another train", l.length === 2 && l[0].leg.to === "ASN" && l[1].leg.to === "DHN" && l[0].receivedAt === "2026-11-14T08:00:00.000Z" && l[0].leg.classes[0].total === 150 && l[0].leg.distanceKm === 43 && l[0].leg.name === "ASN Jn");
  await st.put("13005", leg("ASN", 22, 43, 160), DateTime.fromISO("2026-11-20T08:00:00Z").toJSDate());
  const again = await st.list("13005");
  ok("a train's stop has one row: saving it again replaces the fares and the time", again.length === 2 && again[0].leg.classes[0].total === 160 && again[0].receivedAt === "2026-11-20T08:00:00.000Z" && db.rows.size === 3);
  ok("the table is checked once, not at every request", db.log.filter((x) => /to_regclass/.test(x)).length === 1);
  ok("the table statements close it to the public roles", LEG_TABLE_STATEMENTS.some((x) => /ROW LEVEL SECURITY/.test(x)) && LEG_TABLE_STATEMENTS.some((x) => /REVOKE ALL ON public\.train_fare_leg FROM anon, authenticated/.test(x)) && LEG_TABLE_STATEMENTS[0].includes("PRIMARY KEY (train_number, to_code)"));
  const sp = await st.stops();
  ok("the stations with saved fares come back with their names and how many trains go there (for the search)", sp.length === 3 && sp.find((x) => x.code === "ASN")?.trains === 1 && sp.find((x) => x.code === "RNC")?.name === "RNC Jn" && sp.every((x) => /^[A-Z0-9]{1,8}$/.test(x.code)));
  await st.put("12019", leg("ASN", 22, 43, 190), at);
  const to = await st.toStop("ASN");
  ok("the fares to one station: every train that goes there, with its name, its fare, the time received", to.length === 2 && to.map((x) => x.number).sort().join() === "12019,13005" && to[0].trainName.startsWith("Name ") && to[0].leg.to === "ASN" && to.every((x) => x.receivedAt.startsWith("2026-11-")));
  ok("the coverage says how many trains have fares and how many have fares to their stops", JSON.stringify(await st.coverage()) === JSON.stringify({ withFares: 7, withLegs: 2 }));
  const warn = console.warn; console.warn = () => undefined;
  ok("if the table cannot be made or read, list says nothing is saved and put does nothing, without an error", (await typeormLegStore(fakeDb({ failCreate: true })).list("13005")).length === 0 && (await typeormLegStore(fakeDb({ failCreate: true })).put("13005", leg("ASN", 22, 43, 150), at)) === undefined && (await typeormLegStore(fakeDb({ exists: true, failRead: true })).list("13005")).length === 0 && (await typeormLegStore(fakeDb({ failCreate: true })).stops()).length === 0 && (await typeormLegStore(fakeDb({ failCreate: true })).toStop("ASN")).length === 0 && (await typeormLegStore(fakeDb({ failCreate: true })).coverage()).withLegs === 0);
  console.warn = warn;
  const good = { to_code: "ASN", to_name: "Asansol Jn", seq: 22, distance_km: "43", journey_date: "2026-11-21", classes: JSON.stringify(leg("ASN", 22, 43, 150).classes), fetched_at: "2026-11-14T08:00:00Z" };
  ok("a row is read (classes as text or data, numbers as text)", legFromRow(good)?.leg.distanceKm === 43 && legFromRow({ ...good, classes: leg("ASN", 22, 43, 150).classes })?.leg.seq === 22);
  ok("a row with a broken time, no classes, a broken class, a bad code or day, or a fractional place is not shown", legFromRow({ ...good, fetched_at: "x" }) === null && legFromRow({ ...good, classes: "[]" }) === null && legFromRow({ ...good, classes: [{ code: "SL" }] }) === null && legFromRow({ ...good, to_code: "asn jn" }) === null && legFromRow({ ...good, journey_date: "21/11/2026" }) === null && legFromRow({ ...good, seq: 2.5 }) === null && legFromRow({ ...good, distance_km: "abc" }) === null);
  console.log(`fareLegStore: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
