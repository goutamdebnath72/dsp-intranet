// Run (from the project root; needs a scratch Postgres):
//   NL2SQL_TEST_ADMIN_URL=postgres://postgres:pw@127.0.0.1:5432/postgres npx tsx --tsconfig tsconfig.json src/lib/facility/facility.selftest.ts
// Step 68a: the shared "who may use which tool" and "what was done" (src/lib/facility/*, sql/17) against a real database: the copy of what the two tools already hold (once, and repeatable), who is the HOD, a delegate or
// nobody for each tool separately, authorising and withdrawing (same words and same rules as before), two people at the same moment, a history that cannot be altered, and the lock words of the two tools unchanged.
// The migrations are the REAL files (sql/13, sql/15, sql/17). The people are INVENTED.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const adminUrl = process.env.NL2SQL_TEST_ADMIN_URL;
if (!adminUrl) {
  console.log("facility kit selftest: skipped (NL2SQL_TEST_ADMIN_URL is not set)");
  process.exit(0);
}
process.env.SUPERADMIN_TICKETS = "400001"; // the HOD is known by ticket from the environment, read when superAdmin.ts is first loaded
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const SQL_DIR = join(process.cwd(), "src/lib/nl2sql/sql");
const DB = "facility_kit_selftest";

async function main() {
  const auth = await import("./authority");
  const audit = await import("./audit");
  const iso = (await import("@/lib/dates")).toIsoInstant;
  const reg = await import("./registry");
  const a = new Pool({ connectionString: adminUrl, max: 1 });
  await a.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await a.query(`CREATE DATABASE ${DB}`);
  await a.end();
  const pool = new Pool({ connectionString: adminUrl!.replace(/\/[^/]*$/, `/${DB}`), max: 8 });
  const rows = async (sql: string, params?: unknown[]) => (await pool.query(sql, params as never[])).rows;
  const count = async (sql: string) => Number((await rows(sql))[0].n);
  for (const role of ["anon", "authenticated"]) await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
  // the stand-in of the live PAX table, only so that sql/13 can run as it does live
  await pool.query(`CREATE TABLE IF NOT EXISTS public.pax_directory (id serial PRIMARY KEY, dept_name text, location text, "number" text, label text, note text, source text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
  await pool.query(readFileSync(join(SQL_DIR, "13_pax_admin.sql"), "utf8"));
  await pool.query(readFileSync(join(SQL_DIR, "15_employee_admin.sql"), "utf8"));

  // ---- what the two tools already hold (the OLD tables) ----
  await rows(`INSERT INTO public.employee_admin_delegate (ticket_no, name, granted_by_ticket, granted_by_name, granted_at) VALUES ('412345', 'RAKESH OJHA', '400001', 'HOD', '2026-10-30 10:00+00')`);
  await rows(`INSERT INTO public.employee_admin_delegate (ticket_no, name, granted_by_ticket, granted_by_name, granted_at, revoked_at, revoked_by_ticket, revoked_by_name) VALUES ('412346', 'ANIL DAS', '400001', 'HOD', '2026-10-30 11:00+00', '2026-10-31 09:00+00', '400001', 'HOD')`);
  await rows(`INSERT INTO public.pax_delegate (ticket_no, name, granted_by_ticket, granted_by_name, granted_at) VALUES ('412345', 'RAKESH OJHA', '400001', 'HOD', '2026-10-29 10:00+00')`);
  await rows(`INSERT INTO public.employee_admin_audit (at, actor_ticket, actor_name, actor_role, action, employee_id, target_ticket, target_name, before, after, note) VALUES
    ('2026-10-30 10:00+00', '400001', 'HOD', 'hod', 'grant', NULL, '412345', 'RAKESH OJHA', NULL, '{"ticket":"412345"}', NULL),
    ('2026-10-30 12:00+00', '412345', 'RAKESH OJHA', 'delegate', 'add', 6494, '399901', 'TEST PERSON ALPHA', NULL, '{"name":"TEST PERSON ALPHA"}', NULL),
    ('2026-10-30 12:30+00', '400001', 'HOD', 'hod', 'modify', 6494, '399901', 'TEST PERSON ALPHA', '{"address":""}', '{"address":"Ranchi Road"}', 'x')`);
  await rows(`INSERT INTO public.pax_directory_audit (at, actor_ticket, actor_name, actor_role, action, pax_id, target_ticket, before, after, note) VALUES
    ('2026-10-29 10:00+00', '400001', 'HOD', 'hod', 'grant', NULL, '412345', NULL, '{"ticket":"412345"}', NULL),
    ('2026-10-29 11:00+00', '412345', 'RAKESH OJHA', 'delegate', 'add', 77, NULL, NULL, '{"number":"43901"}', NULL)`);

  // ---- sql/17: created, and the old rows copied ONCE ----
  const m17 = readFileSync(join(SQL_DIR, "17_facility_kit.sql"), "utf8");
  await pool.query(m17);
  let again = true; try { await pool.query(m17); await pool.query(m17); } catch { again = false; }
  ok("the migration sql/17 runs three times without error", again);
  ok("the delegates were copied: 2 of the employee manager (one withdrawn) and 1 of the PAX editor, each exactly once", (await count(`SELECT count(*) AS n FROM public.facility_delegate WHERE facility='employee'`)) === 2 && (await count(`SELECT count(*) AS n FROM public.facility_delegate WHERE facility='pax'`)) === 1);
  ok("the history was copied: 3 lines of the employee manager and 2 of the PAX editor, each exactly once", (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee'`)) === 3 && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='pax'`)) === 2);
  const withdrawn = (await rows(`SELECT * FROM public.facility_delegate WHERE facility='employee' AND ticket_no='412346'`))[0];
  ok("a withdrawn authorisation keeps its dates and who withdrew it", !!withdrawn.revoked_at && withdrawn.revoked_by_ticket === '400001' && iso(withdrawn.granted_at) === '2026-10-30T11:00:00.000Z');
  const modLine = (await rows(`SELECT * FROM public.facility_audit WHERE facility='employee' AND action='modify'`))[0];
  ok("a history line keeps its time, who, the record's id, the person's name and the before and after", modLine.target_id === 6494 && modLine.target_name === 'TEST PERSON ALPHA' && modLine.actor_name === 'HOD' && JSON.stringify(modLine.after) === '{"address":"Ranchi Road"}' && iso(modLine.at) === '2026-10-30T12:30:00.000Z');
  const paxAdd = (await rows(`SELECT * FROM public.facility_audit WHERE facility='pax' AND action='add'`))[0];
  ok("a PAX line of history keeps the PAX line's id as the record's id (the PAX table had no name column: empty)", paxAdd.target_id === 77 && paxAdd.target_name === null && paxAdd.legacy_ref !== null);
  const order = (await rows(`SELECT action FROM public.facility_audit WHERE facility='employee' ORDER BY id`)).map((r) => r.action).join();
  ok("the copied lines are in the order they happened (grant, add, modify)", order === "grant,add,modify");
  await rows(`INSERT INTO public.pax_delegate (ticket_no, name, granted_by_ticket, granted_by_name) VALUES ('412399', 'LATE PERSON', '400001', 'HOD')`);
  await rows(`INSERT INTO public.pax_directory_audit (actor_ticket, actor_name, actor_role, action, pax_id, target_ticket) VALUES ('400001', 'HOD', 'hod', 'grant', NULL, '412399')`);
  await pool.query(m17);
  ok("what an old table gets AFTER the first copy is copied by the next run (and only that: nothing twice)", (await count(`SELECT count(*) AS n FROM public.facility_delegate WHERE facility='pax'`)) === 2 && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='pax'`)) === 3);
  const check = await rows(`SELECT count(*) FILTER (WHERE true) AS n FROM public.facility_delegate`);
  ok("the check at the end of sql/17 can be read: it ran (the SELECT's counts of old and new match)", Number(check[0].n) === 4);

  // ---- the rules of the tables ----
  const tryIt = async (sql: string, params: unknown[] = []) => { try { await pool.query(sql, params as never[]); return true; } catch { return false; } };
  ok("a tool name must be lowercase words (a bad one is refused)", !(await tryIt(`INSERT INTO public.facility_delegate (facility, ticket_no, name, granted_by_ticket, granted_by_name) VALUES ('Bad Name', '412111', 'X', '1', '1')`)) && !(await tryIt(`INSERT INTO public.facility_audit (facility, actor_ticket, actor_name, actor_role, action) VALUES ('Bad Name', '1', 'x', 'hod', 'add')`)));
  ok("only an executive (a six-digit ticket that starts with 4) can be a delegate", !(await tryIt(`INSERT INTO public.facility_delegate (facility, ticket_no, name, granted_by_ticket, granted_by_name) VALUES ('pax', '342461', 'X', '1', '1')`)));
  ok("one ACTIVE authorisation per person and tool: a second one is refused; the same person for ANOTHER tool is fine", !(await tryIt(`INSERT INTO public.facility_delegate (facility, ticket_no, name, granted_by_ticket, granted_by_name) VALUES ('employee', '412345', 'X', '1', '1')`)) && (await tryIt(`INSERT INTO public.facility_delegate (facility, ticket_no, name, granted_by_ticket, granted_by_name) VALUES ('holiday', '412345', 'X', '1', '1')`)));
  await rows(`DELETE FROM public.facility_delegate WHERE facility = 'holiday'`);
  ok("the history cannot be changed or deleted (append only)", !(await tryIt(`UPDATE public.facility_audit SET note = 'x'`)) && !(await tryIt(`DELETE FROM public.facility_audit`)));
  ok("both tables have row level security and the two public API roles have no privilege", (await count(`SELECT count(*) AS n FROM pg_tables WHERE schemaname='public' AND tablename IN ('facility_delegate','facility_audit') AND rowsecurity`)) === 2 && (await count(`SELECT (has_table_privilege('anon','public.facility_delegate','SELECT')::int + has_table_privilege('authenticated','public.facility_audit','SELECT')::int) AS n`)) === 0);

  // ---- the shared code: who is who ----
  const db = {
    run: async <T,>(fn: (q: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) => Promise<T>): Promise<T> => {
      const c = await pool.connect();
      try { await c.query("BEGIN"); const out = await fn(async (sql, params) => (await c.query(sql, params as never[])).rows); await c.query("COMMIT"); return out; }
      catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
    },
  };
  const who = (facility: "employee" | "pax", ticket: string | null | undefined) => db.run((q) => auth.authorityOf(q, facility, ticket));
  ok("the HOD (known by ticket) is the HOD of every tool", (await who("employee", "400001")) === "hod" && (await who("pax", "400001")) === "hod");
  ok("an executive the HOD authorised is a delegate, and only of the tool he was authorised for", (await who("employee", "412345")) === "delegate" && (await who("pax", "412345")) === "delegate" && (await who("pax", "412399")) === "delegate" && (await who("employee", "412399")) === null);
  ok("a withdrawn authorisation gives nothing; nobody, an empty or a blank ticket gives nothing", (await who("employee", "412346")) === null && (await who("pax", "999999")) === null && (await who("pax", "")) === null && (await who("pax", "  ")) === null && (await who("pax", null)) === null && (await who("pax", undefined)) === null);
  ok("an unknown tool name is refused, never silently allowed", await db.run((q) => auth.authorityOf(q, "nothing" as never, "400001")).then(() => false, () => true));
  const HOD = { ticket: "400001", name: "HOD C&IT TEST" }, RAKESH = { ticket: "412345", name: "RAKESH OJHA" };

  // ---- authorising and withdrawing (the rules and the words of the two old copies) ----
  const g = (f: "employee" | "pax", actor: { ticket: string; name: string }, ticket: string, name: string) => auth.grantDelegate(db, f, actor, { ticket, name });
  ok("only an executive can be authorised (words unchanged)", JSON.stringify(await g("pax", HOD, "342461", "GOUTAM")) === JSON.stringify({ status: "invalid", reason: "Only an executive (a six-digit ticket number that starts with 4) can be authorised." }));
  ok("a name is needed (words unchanged)", JSON.stringify(await g("pax", HOD, "412500", "   ")) === JSON.stringify({ status: "invalid", reason: "The executive's name is missing." }));
  ok("the HOD cannot be authorised: he already has it (words unchanged)", JSON.stringify(await g("pax", HOD, "400001", "HOD")) === JSON.stringify({ status: "invalid", reason: "The HOD of C&IT already has this authority." }));
  ok("a delegate cannot authorise anybody", (await g("pax", RAKESH, "412500", "NEW PERSON")).status === "forbidden" && (await g("employee", RAKESH, "412500", "NEW PERSON")).status === "forbidden");
  ok("a stranger cannot authorise anybody", (await g("pax", { ticket: "999999", name: "X" }, "412500", "NEW PERSON")).status === "forbidden");
  ok("the HOD authorises: ok; again: already; the other tool is separate", (await g("pax", HOD, "412500", "  NEW   PERSON ")).status === "ok" && (await g("pax", HOD, "412500", "NEW PERSON")).status === "already" && (await who("employee", "412500")) === null && (await who("pax", "412500")) === "delegate");
  ok("...the name is stored tidy and the grant is in the history of THAT tool only, with who did it", (await rows(`SELECT name FROM public.facility_delegate WHERE facility='pax' AND ticket_no='412500'`))[0].name === "NEW PERSON" && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='pax' AND action='grant' AND target_ticket='412500' AND actor_ticket='400001' AND actor_role='hod'`)) === 1 && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee' AND target_ticket='412500'`)) === 0);
  const list = await auth.listDelegates(db, "pax");
  ok("the list shows the active people of that tool only, by name, with who authorised and when", list.map((d) => d.ticket).join() === "412399,412500,412345".split(",").sort((x, y) => (list.find((d) => d.ticket === x)!.name < list.find((d) => d.ticket === y)!.name ? -1 : 1)).join() && list.every((d) => d.grantedByName && d.grantedAt.endsWith("Z")) && !list.some((d) => d.ticket === "412346"));
  ok("withdrawing: a delegate cannot; the HOD can; the row stays as history; the person has nothing any more; withdrawing twice says he is not a delegate", (await auth.revokeDelegate(db, "pax", RAKESH, "412500")).status === "forbidden" && (await auth.revokeDelegate(db, "pax", HOD, "412500")).status === "ok" && (await who("pax", "412500")) === null && (await count(`SELECT count(*) AS n FROM public.facility_delegate WHERE facility='pax' AND ticket_no='412500'`)) === 1 && (await auth.revokeDelegate(db, "pax", HOD, "412500")).status === "not-delegate");
  ok("...withdrawn from one tool only: the other tool still has him", (await g("employee", HOD, "412500", "NEW PERSON")).status === "ok" && (await auth.revokeDelegate(db, "pax", HOD, "412500")).status === "not-delegate" && (await who("employee", "412500")) === "delegate");
  ok("a person can be authorised again after a withdrawal (a new row; the old one stays)", (await g("pax", HOD, "412500", "NEW PERSON")).status === "ok" && (await count(`SELECT count(*) AS n FROM public.facility_delegate WHERE facility='pax' AND ticket_no='412500'`)) === 2);
  ok("the HOD cannot be withdrawn (he is not a delegate)", (await auth.revokeDelegate(db, "pax", HOD, "400001")).status === "not-delegate");
  const twice = await Promise.all([g("employee", HOD, "412600", "TWIN"), g("employee", HOD, "412600", "TWIN")]);
  ok("two authorisations of one person at the same moment: one is ok, the other says already, one row", twice.filter((r) => r.status === "ok").length === 1 && twice.filter((r) => r.status === "already").length === 1 && (await count(`SELECT count(*) AS n FROM public.facility_delegate WHERE facility='employee' AND ticket_no='412600'`)) === 1);
  const bothTools = await Promise.all([g("employee", HOD, "412601", "BOTH"), g("pax", HOD, "412601", "BOTH")]);
  ok("one person authorised for two tools at the same moment: both are ok (the tools do not wait for each other)", bothTools.every((r) => r.status === "ok"));
  const race = await Promise.all([auth.revokeDelegate(db, "employee", HOD, "412600"), auth.revokeDelegate(db, "employee", HOD, "412600")]);
  ok("two withdrawals of one person at the same moment: one is ok, the other says he is not a delegate", race.filter((r) => r.status === "ok").length === 1 && race.filter((r) => r.status === "not-delegate").length === 1);

  // ---- begin: the start of every write of a tool ----
  ok("begin lets the HOD and a delegate through and says which; a stranger and a withdrawn person get Forbidden; needHod refuses a delegate", (await db.run((q) => auth.begin(q, "employee", HOD))) === "hod" && (await db.run((q) => auth.begin(q, "employee", RAKESH))) === "delegate" && await db.run((q) => auth.begin(q, "employee", { ticket: "412346", name: "ANIL" })).then(() => false, (e) => e instanceof auth.Forbidden) && await db.run((q) => auth.begin(q, "employee", RAKESH, true)).then(() => false, (e) => e instanceof auth.Forbidden));
  { // begin really HOLDS the tool's lock until the transaction ends, and only that tool's
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await auth.begin(async (sql, params) => (await c.query(sql, params as never[])).rows, "employee", HOD);
      const employeeFree = (await rows(`SELECT pg_try_advisory_xact_lock(hashtext('employee_roster')::bigint) AS got`))[0].got;
      const paxFree = (await rows(`SELECT pg_try_advisory_xact_lock(hashtext('pax_directory')::bigint) AS got`))[0].got;
      ok("begin holds the tool's global write lock (nobody else can take it meanwhile) and no other tool's lock", employeeFree === false && paxFree === true);
    } finally { await c.query("ROLLBACK"); c.release(); }
    ok("...and the lock is let go when the transaction ends", (await rows(`SELECT pg_try_advisory_xact_lock(hashtext('employee_roster')::bigint) AS got`))[0].got === true);
  }
  const L = (f: string, file: string, re: RegExp) => { const m = readFileSync(join(process.cwd(), file), "utf8").match(re); return m ? m[1] : null; };
  const empLock = L("employee", "src/lib/employees/admin/store.ts", /const LOCK = "([^"]+)"/);
  const paxLock = L("pax", "src/lib/pax/admin/store.ts", /const LOCK = "([^"]+)"/);
  ok("the lock words of the two tools are EXACTLY what the employee manager and the PAX editor already use (moving onto the kit changes nothing about how they lock)", empLock === reg.lockSql("employee") && paxLock === reg.lockSql("pax"), `${empLock} | ${paxLock}`);
  ok("the registry knows the two tools and nothing else", reg.isFacilityKey("employee") && reg.isFacilityKey("pax") && !reg.isFacilityKey("holiday") && !reg.isFacilityKey("") && !reg.isFacilityKey(undefined) && !reg.isFacilityKey("toString"));

  // ---- the history ----
  await db.run((q) => audit.writeAudit(q, "pax", HOD, "hod", "modify", { targetId: 77, targetTicket: null, targetName: null, before: { number: "43901" }, after: { number: "43902" }, note: "n" }));
  await db.run((q) => audit.writeAudit(q, "pax", RAKESH, "delegate", "modify", { targetId: 77, after: { number: "43903" } }));
  await db.run((q) => audit.writeAudit(q, "employee", RAKESH, "delegate", "modify", { targetId: 77, after: { address: "other tool, same id" } }));
  const recent = await audit.recentAuditRows(db, "pax", 3);
  ok("the recent lines of a tool are its own, newest first, as the tool will need them (who, when in UTC, role, action, record, before and after)", recent.length === 3 && recent[0].actorName === "RAKESH OJHA" && recent[0].actorRole === "delegate" && recent[0].action === "modify" && recent[0].targetId === 77 && recent[0].at.endsWith("Z") && JSON.stringify(recent[1].before) === '{"number":"43901"}' && recent[1].note === "n" && recent.every((r) => r.targetTicket !== "other tool, same id"));
  ok("the number of recent lines is limited (1 to 200) and the lines of another tool never appear", (await audit.recentAuditRows(db, "pax", 0)).length === 1 && (await audit.recentAuditRows(db, "pax", 9999)).length <= 200 && (await audit.recentAuditRows(db, "employee", 200)).every((r) => r.targetId !== 77 || (r.after as { address?: string })?.address === "other tool, same id"));
  const last = await db.run((q) => audit.lastChangeOf(q, "pax", 77));
  ok("the last change of a record: who, when, what kind, and only of THIS tool's record (another tool's record with the same number is not mixed in)", last?.actorName === "RAKESH OJHA" && last.actorTicket === "412345" && last.action === "modify" && last.at.endsWith("Z"));
  ok("a record nobody ever added or changed has no last change; a grant is not a change of a record", (await db.run((q) => audit.lastChangeOf(q, "pax", 99999))) === null);
  ok("a line without a before or an after is stored as empty, and a bad action word is refused by the table", (await rows(`SELECT before, after FROM public.facility_audit WHERE facility='employee' AND actor_ticket='412345' AND target_id = 77 AND note IS NULL`)).length === 1 && await db.run((q) => audit.writeAudit(q, "pax", HOD, "hod", "Bad Action")).then(() => false, () => true));

  await pool.end();
  const b = new Pool({ connectionString: adminUrl, max: 1 });
  await b.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await b.end();
  console.log(`facility kit selftest: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
