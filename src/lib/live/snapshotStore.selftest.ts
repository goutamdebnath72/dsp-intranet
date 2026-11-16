// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/snapshotStore.selftest.ts
// The saved last good answer of a live card: the table is made once, an answer is written and read back, a row that is not the shape written is not shown, database trouble never breaks the card, and a route that opts in
// (liveRoute's `persist`) saves every fresh answer and, when the source fails with nothing in memory, shows the saved one marked stale with its own time.
import { readFileSync } from "node:fs";
import { SNAPSHOT_TABLE_STATEMENTS, NO_SNAPSHOT_STORE, snapshotFromRow, typeormSnapshotStore, type SnapshotStore } from "./snapshotStore";
import { liveRoute } from "./envelope";
import { clearMemo } from "./memo";
import { looksLikeGoldAnswer, parseIbja } from "./gold";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

function fakeDb(o: { tableExists?: boolean; failCreate?: boolean; failRead?: boolean; failWrite?: boolean } = {}) {
  const rows = new Map<string, { payload: string; fetched_at: string }>();
  let exists = o.tableExists ?? false;
  const log: string[] = [];
  return {
    rows, log,
    async query(sql: string, p: unknown[] = []) {
      log.push(sql.replace(/\s+/g, " ").trim().slice(0, 28));
      if (/to_regclass/.test(sql)) return [{ t: exists ? "live_snapshot" : null }];
      if (/^\s*CREATE TABLE/.test(sql)) { if (o.failCreate) throw new Error("permission denied"); exists = true; return []; }
      if (/ENABLE ROW LEVEL|REVOKE/.test(sql)) return [];
      if (/^\s*INSERT INTO public\.live_snapshot/.test(sql)) { if (o.failWrite) throw new Error("disk full"); const [k, v, at] = p as string[]; rows.set(k, { payload: v, fetched_at: at }); return []; }
      if (/FROM public\.live_snapshot WHERE key/.test(sql)) { if (o.failRead) throw new Error("connection lost"); const r = rows.get((p as string[])[0]); return r ? [r] : []; }
      throw new Error("unexpected " + sql);
    },
  };
}

(async () => {
  // ---- the store
  const db = fakeDb();
  const st = typeormSnapshotStore(db);
  ok("nothing saved: get answers null, and the table is made once", (await st.get("gold")) === null && (await st.get("gold")) === null && db.log.filter((l) => l.startsWith("CREATE TABLE")).length === 1 && SNAPSHOT_TABLE_STATEMENTS.length === 3);
  await st.put("gold", { a: 1, b: [1, 2] }, Date.UTC(2026, 10, 16, 4, 30));
  const back = await st.get("gold");
  ok("an answer written is read back with its time", !!back && JSON.stringify(back.value) === '{"a":1,"b":[1,2]}' && back.at === Date.UTC(2026, 10, 16, 4, 30));
  ok("a second answer replaces the first (one row for each key)", await (async () => { await st.put("gold", { a: 2 }, Date.UTC(2026, 10, 16, 5, 0)); const b = await st.get("gold"); return db.rows.size === 1 && (b!.value as { a: number }).a === 2; })());
  ok("a row that is not the shape written is dropped, never shown", snapshotFromRow({ payload: "not json", fetched_at: "2026-11-16T04:30:00Z" }) === null && snapshotFromRow({ payload: 5, fetched_at: "2026-11-16T04:30:00Z" }) === null && snapshotFromRow({ payload: { a: 1 }, fetched_at: "nonsense" }) === null && snapshotFromRow({ payload: '{"a":1}', fetched_at: "2026-11-16T04:30:00Z" })?.at === Date.UTC(2026, 10, 16, 4, 30));
  const bad = typeormSnapshotStore(fakeDb({ failCreate: true }));
  ok("database trouble never breaks the card: no table and no permission, the store answers 'nothing saved' and writes nothing", (await bad.get("gold")) === null && (await bad.put("gold", { a: 1 }, 1)) === undefined);
  ok("a failing read or write is swallowed", (await typeormSnapshotStore(fakeDb({ tableExists: true, failRead: true })).get("gold")) === null && (await typeormSnapshotStore(fakeDb({ tableExists: true, failWrite: true })).put("gold", { a: 1 }, 1)) === undefined);
  ok("the empty store holds nothing", (await NO_SNAPSHOT_STORE.get("x")) === null);

  // ---- a route that keeps its last good answer
  const answer = { gold24Per10g: 135809, gold22Per10g: 124401, silverPerKg: 178000, session: "PM", history: [{ date: "2026-11-12", gold24: 137000, gold22: 126000, silver: 180000 }, { date: "2026-11-13", gold24: 135809, gold22: 124401, silver: 178000 }], change: { gold24: null, gold22: null, silver: null }, rangeText: "x" };
  const mem = new Map<string, { value: unknown; at: number }>();
  const store: SnapshotStore = { get: async (k) => mem.get(k) ?? null, put: async (k, v, at) => { mem.set(k, { value: v, at }); } };
  const run = (load: () => Promise<unknown>) => liveRoute({ key: "t-gold", ttlMs: 1000, source: "S", sourceUrl: "http://s", load: load as () => Promise<typeof answer>, persist: { store: async () => store, check: looksLikeGoldAnswer as never } });
  clearMemo();
  const r1 = await run(async () => answer);
  const b1 = await r1.json();
  ok("a fresh answer is shown and saved", r1.status === 200 && b1.stale === false && mem.has("t-gold") && (mem.get("t-gold")!.value as typeof answer).gold24Per10g === 135809);
  clearMemo(); // a restart: the memory is empty
  const r2 = await run(async () => { throw new Error("The source did not answer."); });
  const b2 = await r2.json();
  ok("the source fails and the memory is empty (a restart): the saved answer is shown, marked stale, with the time it was received", r2.status === 200 && b2.ok === true && b2.stale === true && b2.data.gold24Per10g === 135809 && b2.fetchedAt === new Date(mem.get("t-gold")!.at).toISOString());
  mem.set("t-gold", { value: { nonsense: true }, at: Date.now() });
  clearMemo();
  const r3 = await run(async () => { throw new Error("The source did not answer."); });
  ok("a saved answer that is not the shape the card draws is never shown: a plain failure (503)", r3.status === 503 && (await r3.json()).ok === false);
  mem.clear(); clearMemo();
  const r4 = await run(async () => { throw new Error("The source did not answer."); });
  ok("nothing saved and nothing in memory: a plain failure (503), as before", r4.status === 503);
  const failing: SnapshotStore = { get: async () => { throw new Error("db down"); }, put: async () => { throw new Error("db down"); } };
  clearMemo();
  const r5 = await liveRoute({ key: "t-gold2", ttlMs: 1000, source: "S", sourceUrl: "http://s", load: async () => answer, persist: { store: async () => failing, check: looksLikeGoldAnswer as never } });
  ok("a database that fails never fails the card (the fresh answer is still shown)", r5.status === 200 && (await r5.json()).stale === false);

  // ---- the guard on a saved gold answer, with the real page of a morning
  const real = parseIbja(readFileSync("src/lib/live/fixtures/ibja-morning.html", "utf8"));
  ok("the guard accepts a real parsed answer and refuses a broken one", !!real && looksLikeGoldAnswer(real) && !looksLikeGoldAnswer({ ...real, history: [] }) && !looksLikeGoldAnswer({ ...real, gold24Per10g: "x" }) && !looksLikeGoldAnswer(null) && !looksLikeGoldAnswer("text"));
  ok("the gold route keeps its last good answer (it opts in, with the guard)", /persist: \{ store: savedAnswers, check: looksLikeGoldAnswer \}/.test(readFileSync("src/app/api/live/gold/route.ts", "utf8")));

  console.log(`snapshotStore selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
