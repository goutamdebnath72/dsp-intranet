// src/lib/accessLog/admin/accessLogLive.selftest.ts
//
// LIVE test of the Contact Access Log's real store and API code against the real schema, in a transaction that is ALWAYS
// rolled back (the "view" audit rows it writes are not kept). Skipped unless ADMIN_LIVE_TEST_URL is set:
//   ADMIN_LIVE_TEST_URL="$DATABASE_URL" npx tsx src/lib/accessLog/admin/accessLogLive.selftest.ts

export {}; // a module (not a global script): the live tests share local names

const url = process.env.ADMIN_LIVE_TEST_URL;
if (!url) {
  console.log("accessLogLive selftest: skipped (ADMIN_LIVE_TEST_URL not set)");
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

async function main() {
  const { Client } = await import("pg");
  const { rollbackDb } = await import("../../facility/rollbackDb");
  const store = await import("./store");
  const { handleAccessLogAdmin } = await import("./api");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const h = rollbackDb(client);
  await h.start();
  // queryAccessLogs only needs `ds.query(sql, params)`
  const ds: any = { query: async (sql: string, params?: unknown[]) => (await client.query(sql, params as unknown[])).rows };
  const actor = { ticket: "498301", name: "TEST HOD" };
  const ctx: any = { actor, db: h.db, ds, findByName: async () => [], findByTicket: async () => [] };
  try {
    const all = await store.queryAccessLogs(ds, { pageSize: 200 });
    const raw = await h.q(`SELECT count(*)::int n FROM public.contact_access_log`);
    ok("one result line per log line: no duplicates from the roster join", all.total === Number(raw[0].n) && all.rows.length === all.total, `${all.total} vs ${raw[0].n}`);
    ok("ids are unique strings (a uuid is not a number)", new Set(all.rows.map((r) => r.id)).size === all.rows.length && all.rows.every((r) => typeof r.id === "string" && r.id.length > 5));

    const frac = await store.queryAccessLogs(ds, { page: 1.5, pageSize: 2.7 });
    ok("a fractional page and page size no longer fail", frac.rows.length <= 2 && frac.page === 1);
    const huge = await store.queryAccessLogs(ds, { page: 1e12, pageSize: 5 });
    ok("a huge page number does not fail", Array.isArray(huge.rows));

    const wild = await store.queryAccessLogs(ds, { viewer: "%" });
    ok("a typed % is a letter, not 'everything'", wild.total < all.total || all.total === 0, `${wild.total} of ${all.total}`);
    const underscore = await store.queryAccessLogs(ds, { viewed: "_" });
    ok("a typed _ is a letter, not 'any character'", underscore.total < all.total || all.total === 0);

    // IST day bounds: a line at 23:30 IST on 3 Oct is "3 Oct", not "4 Oct"
    await h.q(`INSERT INTO public.contact_access_log (id, "viewerTicketNo", "viewedUserId", "viewedTicketNo", field, "ipAddress", "userAgent", "accessedAt", action)
               VALUES ('zz-test-ist-1', '498301', 'x', '498301', 'mobile', '0', 'test', '2099-10-03 23:30:00+05:30', 'reveal')`);
    const d3 = await store.queryAccessLogs(ds, { from: "2099-10-03", to: "2099-10-03" });
    const d4 = await store.queryAccessLogs(ds, { from: "2099-10-04", to: "2099-10-04" });
    ok("23:30 IST on the 3rd is found on the 3rd", d3.rows.some((r) => r.id === "zz-test-ist-1"));
    ok("...and NOT on the 4th (it was, with UTC day bounds)", !d4.rows.some((r) => r.id === "zz-test-ist-1"));

    // the API
    const bad = await handleAccessLogAdmin({ op: "logs", from: "2026-13-45" }, ctx);
    ok("a bad date is a clear 400, not a 500", bad.status === 400, String(bad.status));
    const bad2 = await handleAccessLogAdmin({ op: "logs", to: "yesterday" }, ctx);
    ok("a non-date string is a 400", bad2.status === 400);

    const before = await h.q(`SELECT count(*)::int n FROM public.facility_audit WHERE facility = 'access_log' AND action = 'view'`);
    const r1 = await handleAccessLogAdmin({ op: "logs", viewer: "a" }, ctx);
    ok("viewing works", r1.status === 200);
    const r2 = await handleAccessLogAdmin({ op: "logs", viewer: "a", page: 2 }, ctx);
    ok("paging works", r2.status === 200);
    const r3 = await handleAccessLogAdmin({ op: "logs", viewer: "b" }, ctx);
    ok("a different filter works", r3.status === 200);
    const after = await h.q(`SELECT count(*)::int n, max(note) AS note FROM public.facility_audit WHERE facility = 'access_log' AND action = 'view'`);
    ok("VIEWING IS AUDITED: one row per distinct look (same filters + paging = one row; a new filter = another)", Number(after[0].n) - Number(before[0].n) === 2, `${before[0].n} -> ${after[0].n}`);
    const row = await h.q(`SELECT actor_ticket, after FROM public.facility_audit WHERE facility = 'access_log' AND action = 'view' ORDER BY id DESC LIMIT 1`);
    ok("the audit row names who looked and the filters, and holds no log lines", row[0].actor_ticket === "498301" && !JSON.stringify(row[0].after).includes("accessedAt"));

    // somebody with no authority sees nothing and leaves no 'view' row
    const stranger = await handleAccessLogAdmin({ op: "logs" }, { ...ctx, actor: { ticket: "412345", name: "NOBODY" } });
    ok("no authority: 403", stranger.status === 403);
  } finally {
    await h.finish();
    await client.end();
  }
  console.log(`accessLogLive selftest: ${pass} passed, ${fail} failed (rolled back, nothing saved)`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => {
  console.error("accessLogLive selftest crashed:", e?.message || e);
  process.exit(1);
});
