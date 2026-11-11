// src/lib/announcements/admin/announcementLive.selftest.ts
//
// LIVE test of the Announcement Manager's real store code against the real schema, inside a transaction that is
// ALWAYS rolled back (nothing is saved). Skipped unless ADMIN_LIVE_TEST_URL is set:
//   ADMIN_LIVE_TEST_URL="$DATABASE_URL" npx tsx src/lib/announcements/admin/announcementLive.selftest.ts
// It exists because the fake-database test of this tool could not see two bugs that broke edit and delete on every
// call (a wrong table name, and FOR UPDATE on the nullable side of a LEFT JOIN).

export {}; // a module (not a global script): the live tests share local names

const url = process.env.ADMIN_LIVE_TEST_URL;
if (!url) {
  console.log("announcementLive selftest: skipped (ADMIN_LIVE_TEST_URL not set)");
  process.exit(0);
}
process.env.SUPERADMIN_TICKETS = "498301"; // before the facility code is loaded (it reads this once)

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

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const h = rollbackDb(client);
  await h.start();
  const actor = { ticket: "498301", name: "TEST HOD" };
  try {
    const pub = await store.publishAnnouncement(h.db, actor, { title: "ROLLBACK TEST announcement", content: "<p>hello <b>world</b></p>" });
    ok("publish ok", pub.status === "ok", JSON.stringify(pub));
    if (pub.status !== "ok") throw new Error("publish failed");
    const id = pub.id;

    const bad = await store.publishAnnouncement(h.db, actor, { title: "x", date: "not-a-date" });
    ok("publish with a bad date is refused (not a 500)", bad.status === "invalid");

    let list = await store.listRecentAnnouncements(h.db, actor, 5);
    let mine = list.find((a) => a.id === id);
    ok("listed after publish", !!mine && mine.title === "ROLLBACK TEST announcement");
    ok("list limit is clamped (1e9 and -3 both work)", (await store.listRecentAnnouncements(h.db, actor, 1e9)).length >= 1 && (await store.listRecentAnnouncements(h.db, actor, -3)).length === 1);

    const mod = await store.modifyAnnouncement(h.db, actor, { id, title: "ROLLBACK TEST edited", content: "<p>edited</p>", sentVersion: mine!.version });
    ok("modify with the version seen: ok", mod.status === "ok", JSON.stringify(mod).slice(0, 200));

    const stale = await store.modifyAnnouncement(h.db, actor, { id, title: "second writer", content: "<p>x</p>", sentVersion: mine!.version });
    ok("modify with the OLD version: stale", stale.status === "stale", JSON.stringify(stale).slice(0, 200));
    const noVer = await store.modifyAnnouncement(h.db, actor, { id, title: "no version", content: "<p>x</p>" });
    ok("modify with NO version: stale (forged/missing version is never trusted)", noVer.status === "stale");

    list = await store.listRecentAnnouncements(h.db, actor, 5);
    mine = list.find((a) => a.id === id);
    ok("edit visible", mine?.title === "ROLLBACK TEST edited");

    const delStale = await store.deleteAnnouncement(h.db, actor, { id, sentVersion: "0".repeat(64) });
    ok("delete with a wrong version: stale, row stays", delStale.status === "stale");
    const del = await store.deleteAnnouncement(h.db, actor, { id, sentVersion: mine!.version });
    ok("delete with the current version: ok", del.status === "ok", JSON.stringify(del).slice(0, 200));
    const gone = await h.q(`SELECT 1 FROM public.announcement WHERE id = $1`, [id]);
    ok("row is gone", gone.length === 0);
    const again = await store.deleteAnnouncement(h.db, actor, { id, sentVersion: mine!.version });
    ok("delete of a missing row: not-found", again.status === "not-found");

    const audit = await h.q(`SELECT action FROM public.facility_audit WHERE facility = 'announcement' AND target_id = $1 ORDER BY id`, [id]);
    ok("audit has add, modify, delete for the record", audit.map((r) => r.action).join(",") === "add,modify,delete", audit.map((r) => r.action).join(","));
  } finally {
    await h.finish(); // ROLLBACK: nothing is kept
    await client.end();
  }
  console.log(`announcementLive selftest: ${pass} passed, ${fail} failed (rolled back, nothing saved)`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => {
  console.error("announcementLive selftest crashed:", e?.message || e);
  process.exit(1);
});
