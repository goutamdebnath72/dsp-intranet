// src/lib/holidays/admin/holidayLive.selftest.ts
//
// LIVE test of the Holiday manager's real store code against the real schema, in a transaction that is ALWAYS rolled
// back. Uses the year 2099 (no real data). Skipped unless ADMIN_LIVE_TEST_URL is set:
//   ADMIN_LIVE_TEST_URL="$DATABASE_URL" npx tsx src/lib/holidays/admin/holidayLive.selftest.ts
// (needs GEMINI_API_KEY too: seeding a note makes a policy chunk, which is embedded.)

export {}; // a module (not a global script): the live tests share local names

const url = process.env.ADMIN_LIVE_TEST_URL;
if (!url) {
  console.log("holidayLive selftest: skipped (ADMIN_LIVE_TEST_URL not set)");
  process.exit(0);
}
process.env.SUPERADMIN_TICKETS = "498301";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${name} ${extra}`);
  }
};

const FILE = JSON.stringify({
  year: 2099,
  holidays: [
    { name: "ZZ Test Day One", date: "2099-01-26", type: "ch", categories: null, note: null },
    { name: "ZZ Test Festival", date: "2099-03-14", type: "FH", categories: "A,B", note: "ZZ test: promoted to an extra festival holiday this year." },
    { name: "ZZ Test Restricted", date: "2099-04-02", type: "RH" },
  ],
  rhQuota: [{ category: "A", quota: 2 }, { category: "B", quota: 3 }],
  policyNotes: [{ topic: "ZZ test policy", text: "ZZ test policy note: a new joiner gets the full quota." }],
});

async function main() {
  const { Client } = await import("pg");
  const { rollbackDb } = await import("../../facility/rollbackDb");
  const store = await import("./store");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const h = rollbackDb(client);
  await h.start();
  const actor = { ticket: "498301", name: "TEST HOD" };
  try {
    const v0 = await store.getYearView(h.db, 2099);
    ok("empty year has a view with a version", !!v0 && v0.totalHolidays === 0 && v0.version.length > 10);

    const noVer = await store.seedYear(h.db, actor, { rawContent: FILE, expectedYear: 2099 });
    ok("seed with NO version is stale (the guard is not optional)", noVer.status === "stale", noVer.status);
    const forged = await store.seedYear(h.db, actor, { rawContent: FILE, expectedYear: 2099, sentVersion: "f".repeat(64) });
    ok("seed with a forged version is stale", forged.status === "stale");

    const wrongYear = await store.seedYear(h.db, actor, { rawContent: FILE, expectedYear: 2098, sentVersion: v0!.version });
    ok("file says 2099 but 2098 selected: refused", wrongYear.status === "invalid");
    const bareOldDates = JSON.stringify([{ name: "ZZ Old", date: "2025-05-05", type: "CH" }]);
    const mism = await store.seedYear(h.db, actor, { rawContent: bareOldDates, expectedYear: 2099, sentVersion: v0!.version });
    ok("a file without a year field with 2025 dates, uploaded to 2099: refused", mism.status === "invalid", JSON.stringify(mism));
    const badType = JSON.stringify([{ name: "ZZ T", date: "2099-05-05", type: "XX" }]);
    const bt = await store.seedYear(h.db, actor, { rawContent: badType, expectedYear: 2099, sentVersion: v0!.version });
    ok("unknown type: a clear refusal, not a 500", bt.status === "invalid");

    const seeded = await store.seedYear(h.db, actor, { rawContent: FILE, expectedYear: 2099, sentVersion: v0!.version });
    ok("seed with the version seen: ok", seeded.status === "ok", JSON.stringify(seeded).slice(0, 200));
    if (seeded.status !== "ok") throw new Error("seed failed");
    ok("3 holidays, 2 quota rows, 2 policy chunks (1 note + 1 reclassification)", seeded.holidayCount === 3 && seeded.rhQuotaCount === 2 && seeded.policyChunkCount === 2, JSON.stringify(seeded));

    const v1 = await store.getYearView(h.db, 2099);
    ok("lower-case type 'ch' was stored as CH", v1!.chCount === 1 && v1!.fhCount === 1 && v1!.rhCount === 1);
    ok("the version changed", v1!.version !== v0!.version);
    ok("the chunks are really in the table", v1!.policyChunkCount === 2);

    const again = await store.seedYear(h.db, actor, { rawContent: FILE, expectedYear: 2099, sentVersion: v0!.version });
    ok("seeding again with the OLD version: stale, and it names who changed it last", again.status === "stale" && (again as any).last?.actorTicket === "498301", JSON.stringify((again as any).last));

    // a file without rhQuota keeps the year's quota (re-seed with the current version)
    const noQuota = JSON.stringify({ year: 2099, holidays: [{ name: "ZZ Test Day One", date: "2099-01-26", type: "CH" }] });
    const re = await store.seedYear(h.db, actor, { rawContent: noQuota, expectedYear: 2099, sentVersion: v1!.version });
    ok("re-seed without rhQuota: ok", re.status === "ok");
    const v2 = await store.getYearView(h.db, 2099);
    ok("...the existing RH quota is kept", v2!.rhQuotaCount === 2, String(v2!.rhQuotaCount));
    ok("...and the policy chunks were replaced by the (empty) new set", v2!.policyChunkCount === 0, String(v2!.policyChunkCount));

    // a change of a NOTE or a quota VALUE (not date/name/type) must change the version
    await h.q(`UPDATE public.holiday_rh_quota SET quota = quota + 1 WHERE year = 2099 AND category = 'A'`);
    const v3 = await store.getYearView(h.db, 2099);
    ok("a quota value edit changes the version (it used to be invisible)", v3!.version !== v2!.version);

    const clearStale = await store.clearYear(h.db, actor, { year: 2099, sentVersion: v2!.version });
    ok("clear with an out-of-date version: stale", clearStale.status === "stale");
    const clearNone = await store.clearYear(h.db, actor, { year: 2099 });
    ok("clear with NO version: stale", clearNone.status === "stale");
    const cleared = await store.clearYear(h.db, actor, { year: 2099, sentVersion: v3!.version });
    ok("clear with the current version: ok", cleared.status === "ok", JSON.stringify(cleared));
    const v4 = await store.getYearView(h.db, 2099);
    ok("year is empty again (holidays, quota, chunks)", v4!.totalHolidays === 0 && v4!.rhQuotaCount === 0 && v4!.policyChunkCount === 0);

    const audit = await h.q(`SELECT action FROM public.facility_audit WHERE facility = 'holiday' AND target_id = 2099 ORDER BY id`);
    ok("audit has seed, seed, clear", audit.map((r) => r.action).join(",") === "seed,seed,clear", audit.map((r) => r.action).join(","));
  } finally {
    await h.finish();
    await client.end();
  }
  console.log(`holidayLive selftest: ${pass} passed, ${fail} failed (rolled back, nothing saved)`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => {
  console.error("holidayLive selftest crashed:", e?.message || e);
  process.exit(1);
});
