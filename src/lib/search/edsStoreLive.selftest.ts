// src/lib/search/edsStoreLive.selftest.ts
//
// LIVE test of the briefing store's real SQL against the real schema, in a transaction that is ALWAYS rolled back (the table it creates and the rows it
// writes are not kept). Skipped unless ADMIN_LIVE_TEST_URL is set:
//   ADMIN_LIVE_TEST_URL="$DATABASE_URL" npx tsx src/lib/search/edsStoreLive.selftest.ts

export {}; // a module: the live tests share local names

const url = process.env.ADMIN_LIVE_TEST_URL;
if (!url) {
  console.log("edsStoreLive selftest: skipped (ADMIN_LIVE_TEST_URL not set)");
  process.exit(0);
}

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${name} ${extra}`);
  }
};

async function main() {
  const { Client } = await import("pg");
  const { typeormEdsStore } = await import("./edsStore");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query("BEGIN");
  const ds = { query: async (sql: string, params?: unknown[]) => (await client.query(sql, params as unknown[])).rows };
  try {
    const had = (await client.query(`SELECT to_regclass('public.eds_briefing') AS t`)).rows[0].t;
    const store = typeormEdsStore(ds);

    const f1 = await store.fingerprint();
    const f2 = await store.fingerprint();
    ok("the archive fingerprint is a stable text", typeof f1 === "string" && f1.split(".").length === 5 && f1 === f2, f1);

    // first use creates the table when it is missing (and does nothing when it exists)
    const none = await store.get("k-live-1");
    ok("an unknown question has no stored briefing (and the table is there)", none === null);
    const now = (await client.query(`SELECT to_regclass('public.eds_briefing') AS t, relrowsecurity AS rls FROM pg_class WHERE oid = to_regclass('public.eds_briefing')`)).rows[0];
    ok("the table exists after first use, with row-level security on (no public API reads)", !!now?.t && now.rls === true, JSON.stringify(now));

    // jsonb keeps the same data but not the order of an object's keys: compare by content
    const canon = (v: any): any => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
    const same = (x: unknown, y: unknown) => JSON.stringify(canon(x)) === JSON.stringify(canon(y));
    const result: any = { overview: "o", keyFindings: [{ text: "t", sources: [6] }], table: { columns: ["a", "b"], rows: [["1", "2"]] }, charts: [], citations: [] };
    const a = await store.put({ key: "k-live-1", fingerprint: "FP-A", result, score: 90, query: "the question", engine: "test" });
    ok("a briefing is stored and read back exactly (jsonb round trip)", same(a.result, result) && a.score === 90 && a.fingerprint === "FP-A");
    const b = await store.put({ key: "k-live-1", fingerprint: "FP-A", result: { ...result, overview: "SECOND" }, score: 99, query: "the question", engine: "test" });
    ok("the FIRST briefing of the current archive stands: a later one never overwrites it", b.result.overview === "o" && b.score === 90, b.result.overview);
    const got = await store.get("k-live-1");
    ok("get returns the standing one", got?.result.overview === "o" && got.fingerprint === "FP-A");
    const c = await store.put({ key: "k-live-1", fingerprint: "FP-B", result: { ...result, overview: "NEW ARCHIVE" }, score: 85, query: "the question", engine: "test" });
    ok("a briefing made for an OLDER archive is replaced by one for the new archive", c.result.overview === "NEW ARCHIVE" && c.fingerprint === "FP-B");
    const d = await store.put({ key: "k-live-1", fingerprint: "FP-B", result: { ...result, overview: "again" }, score: 95, query: "the question", engine: "test" });
    ok("...and that one then stands", d.result.overview === "NEW ARCHIVE");
    // dead rows (another engine version) are removed when a current briefing is stored
    await store.put({ key: "k-old-engine", fingerprint: "FP-B", result, score: 80, query: "an older question", engine: "OLD-ENGINE" });
    const beforeTidy = Number((await client.query(`SELECT count(*)::int n FROM public.eds_briefing WHERE engine = 'OLD-ENGINE'`)).rows[0].n);
    await store.put({ key: "k-live-3", fingerprint: "FP-B", result, score: 90, query: "a current question", engine: "test" });
    const afterTidy = Number((await client.query(`SELECT count(*)::int n FROM public.eds_briefing WHERE engine = 'OLD-ENGINE'`)).rows[0].n);
    ok("a row made by another engine version is removed when a current briefing is stored", beforeTidy === 1 && afterTidy === 0, `${beforeTidy} -> ${afterTidy}`);
    let bad = false;
    try {
      await client.query("SAVEPOINT s1");
      await store.put({ key: "k-live-2", fingerprint: "x", result, score: 150, query: "q", engine: "t" });
    } catch {
      bad = true;
      await client.query("ROLLBACK TO SAVEPOINT s1");
    }
    ok("a score outside 0..100 is refused by the table", bad);
    console.log(`(the table ${had ? "already existed" : "did not exist yet: this run created it inside the rolled-back transaction"})`);
  } finally {
    await client.query("ROLLBACK");
    const after = (await client.query(`SELECT to_regclass('public.eds_briefing') AS t`)).rows[0].t;
    await client.end();
    console.log(`edsStoreLive selftest: ${pass} passed, ${fail} failed (rolled back, nothing saved; table afterwards: ${after ?? "not created"})`);
  }
  if (fail > 0) process.exit(1);
}
main().catch((e) => {
  console.error("edsStoreLive selftest crashed:", e?.message || e);
  process.exit(1);
});
