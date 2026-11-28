// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/snapshotStore.selftest.ts
// I test the saved last good answer of a live card: the table is made once, an answer is written and read back, a row that is not the shape written is not shown, database trouble never breaks the card, and a route that opts in
// (liveRoute's `persist`) saves every fresh answer and, when the source fails with nothing in memory, shows the saved one marked stale with its own time.
import { readFileSync } from "node:fs";
import { SNAPSHOT_TABLE_STATEMENTS, NO_SNAPSHOT_STORE, snapshotFromRow, typeormSnapshotStore, type SnapshotStore } from "./snapshotStore";
import { liveRoute, liveValue, seedFromSaved } from "./envelope";
import { clearMemo, recall, remember } from "./memo";
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
  clearMemo(); // I simulate a restart: the memory is empty
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


  // ---- SEEDING (28 Nov 2026): a server that starts empty takes the saved copy of a news tab, and the first asking is answered at once
  const good = { lang: "en", items: [{ title: "A story", link: "https://x.org/a", source: "P", publishedAt: "2026-11-28T06:00:00Z", summary: "", image: "https://img.x.org/a.jpg" }], used: ["P"], failed: [] };
  const isGood = (x: unknown): x is typeof good => !!x && typeof x === "object" && Array.isArray((x as typeof good).items) && (x as typeof good).items.length > 0;
  const saved = (value: unknown, ageMs: number): SnapshotStore & { puts: number } => { const st = { puts: 0, async get() { return { value, at: Date.now() - ageMs }; }, async put() { st.puts++; } }; return st; };
  clearMemo();
  let builds = 0;
  const build = async () => { builds++; return { ...good, items: [{ ...good.items[0], title: "Built now" }] }; };
  const fresh = saved(good, 5 * 60 * 1000);
  const v1 = await liveValue({ key: "seed-1", ttlMs: 30 * 60 * 1000, load: build, persist: { store: async () => fresh, check: isGood, seed: true }, swr: {} });
  ok("an empty server takes the saved copy: answered at once from it (nothing built), with the time it was saved, and not written back", builds === 0 && v1.value.items[0].title === "A story" && Date.now() - v1.at >= 5 * 60 * 1000 - 50 && fresh.puts === 0);
  clearMemo();
  const old = saved(good, 4 * 60 * 60 * 1000);
  const v2 = await liveValue({ key: "seed-2", ttlMs: 30 * 60 * 1000, load: build, persist: { store: async () => old, check: isGood, seed: true }, swr: {} });
  ok("a copy older than the three hours an old answer may be served is not taken: the tab is built, and the new one is saved", builds === 1 && v2.value.items[0].title === "Built now" && old.puts === 1);
  clearMemo();
  const badCopy = saved({ ...good, items: [] }, 1000);
  const v3 = await liveValue({ key: "seed-3", ttlMs: 30 * 60 * 1000, load: build, persist: { store: async () => badCopy, check: isGood, seed: true }, swr: {} });
  ok("a copy that is not the shape expected is not taken", builds === 2 && v3.value.items[0].title === "Built now");
  clearMemo();
  remember("seed-4", { ...good, items: [{ ...good.items[0], title: "In memory" }] });
  const memCopy = saved(good, 1000);
  const v4 = await liveValue({ key: "seed-4", ttlMs: 30 * 60 * 1000, load: build, persist: { store: async () => memCopy, check: isGood, seed: true }, swr: {} });
  ok("what the server already keeps is never replaced by the saved copy", v4.value.items[0].title === "In memory");
  clearMemo();
  let reads = 0;
  const counting: SnapshotStore = { async get() { reads++; await new Promise((r) => setTimeout(r, 20)); return { value: good, at: Date.now() - 1000 }; }, async put() {} };
  await Promise.all([1, 2, 3].map(() => seedFromSaved("seed-5", { store: async () => counting, check: isGood })));
  ok("many asking together read the database once for the key", reads === 1 && !!recall("seed-5"));
  clearMemo();
  const none: SnapshotStore = { async get() { throw new Error("no database"); }, async put() { throw new Error("no database"); } };
  const v6 = await liveValue({ key: "seed-6", ttlMs: 30 * 60 * 1000, load: build, persist: { store: async () => none, check: isGood, seed: true }, swr: {} });
  ok("no database: the tab is simply built (the card never fails because of its saved copy)", v6.value.items[0].title === "Built now");
  clearMemo();
  const jobs: Promise<unknown>[] = [];
  const slow: SnapshotStore = { async get() { return null; }, async put() { await new Promise((r) => setTimeout(r, 50)); } };
  const t0 = Date.now();
  await liveValue({ key: "seed-7", ttlMs: 30 * 60 * 1000, load: build, persist: { store: async () => slow, check: isGood, seed: true }, swr: { schedule: (j) => { jobs.push(j); } } });
  ok("a card with serve-then-refresh does not wait for the write of its saved copy (it is handed to the host to finish)", Date.now() - t0 < 45 && jobs.length === 1);
  await Promise.all(jobs);
  const route = readFileSync("src/app/api/live/news/route.ts", "utf8");
  ok("the news route saves and seeds its tabs (looksLikeNewsAnswer, seed), and warms the other four after answering, two at a time, at most every 20 seconds, with the same options as serving", /persist: \{ store: savedAnswers, check: looksLikeNewsAnswer, seed: true \}/.test(route) && /function warmOthers/.test(route) && /ALL_TABS\.filter\(\(t\) => t !== lang\)/.test(route) && /\[0, 1\]\.map/.test(route) && /WARM_EVERY_MS = 20 \* 1000/.test(route) && /liveValue<NewsData>\(tabOptions\(t\)\)/.test(route) && /liveRoute<NewsData>\(tabOptions\(lang\)\)/.test(route) && /warmOthers\(lang\)/.test(route));
  ok("every picture shown has been looked at: the route looks at the pictures of a tab (rejectLogos), makes the list again without a logo, drops a story whose picture could not be looked at in time (isInspected), and marks the tab verified; a saved copy without that mark is not taken", /rejectLogos\(data\.items\.map\(\(i\) => i\.image\), 4000\)/.test(route) && /isInspected\(i\.image\)/.test(route) && /verified: true/.test(route) && /d\.verified !== true/.test(readFileSync("src/lib/live/news.ts", "utf8")));

  console.log(`snapshotStore selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
