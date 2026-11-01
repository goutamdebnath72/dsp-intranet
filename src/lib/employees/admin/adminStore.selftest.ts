// Run (from the project root; needs a scratch Postgres):
//   NL2SQL_TEST_ADMIN_URL=postgres://postgres:pw@127.0.0.1:5432/postgres npx tsx --tsconfig tsconfig.json src/lib/employees/admin/adminStore.selftest.ts
// Step 66a: the employee manager against a real database: who may do what, every rule of a record, the dates that only the HOD sees, who may delete, two people at the same moment, a history that cannot be altered, and a roster
// whose optional columns differ. The roster is the project's stand-in made to follow the LIVE rules the handoff describes (UNIQUE (ticket_no, cohort), user_id -> user ON DELETE SET NULL, a NOT NULL snapshot date, the doctor flag).
// The migrations are the REAL files (sql/14, sql/15). The people are INVENTED.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const adminUrl = process.env.NL2SQL_TEST_ADMIN_URL;
if (!adminUrl) {
  console.log("employee admin store selftest: skipped (NL2SQL_TEST_ADMIN_URL is not set)");
  process.exit(0);
}
process.env.SUPERADMIN_TICKETS = "400001"; // the HOD is known by ticket from the environment, read when superAdmin.ts is first loaded
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const SQL_DIR = join(process.cwd(), "src/lib/nl2sql/sql");
const DB = "employee_admin_selftest";

async function main() {
  const store = await import("./store");
  const { handleEmployeeAdmin, errorReply } = await import("./api");
  const a = new Pool({ connectionString: adminUrl, max: 1 });
  await a.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await a.query(`CREATE DATABASE ${DB}`);
  await a.end();
  const pool = new Pool({ connectionString: adminUrl!.replace(/\/[^/]*$/, `/${DB}`), max: 8 });
  const q = async (sql: string, params?: unknown[]) => (await pool.query(sql, params as never[])).rows;
  for (const role of ["anon", "authenticated"]) await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
  await pool.query(readFileSync(join(SQL_DIR, "99_local_test_standins.sql"), "utf8"));
  await pool.query(readFileSync(join(SQL_DIR, "01_nlq_schema_views_role.sql"), "utf8"));
  // the LIVE rules of the roster (handoff section 6.3): unique (ticket, cohort), the login link that becomes empty when the login goes, a snapshot date that must be given, the doctor flag
  await pool.query(`ALTER TABLE public.employee_roster ADD CONSTRAINT employee_roster_ticket_cohort_key UNIQUE (ticket_no, cohort);
    ALTER TABLE public.employee_roster ADD CONSTRAINT employee_roster_user_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE SET NULL;
    ALTER TABLE public.employee_roster ADD COLUMN doctor_override boolean;
    ALTER TABLE public.employee_roster ADD COLUMN source_snapshot_date date NOT NULL DEFAULT '2026-09-26';
    ALTER TABLE public.employee_roster ALTER COLUMN source_snapshot_date DROP DEFAULT;`);
  await pool.query(`INSERT INTO public.designation_grade (id, code, title, track, rank_order) VALUES (1,222,'Chief General Manager','managerial',3),(2,212,'Dy. General Manager','managerial',5),(9,204,'Asst. Manager','managerial',12),(10,204,'Medical Officer','medical',12),(20,409,'S-11','nonexec',14),(21,408,'S-10','nonexec',15)`);
  await pool.query(`INSERT INTO public.sail_department (id, code, name, cohort_scope) VALUES (1,100,'C & IT','shared'),(2,107,'L & D','executive'),(3,9003,'L & D OFFICE','nonexecutive'),(4,40017,'FIRE SERVICE','shared')`);
  await pool.query(`INSERT INTO public."user" (id, name, "ticketNo", email) VALUES ('u-rakesh','RAKESH OJHA','412345','r@x.in'),('u-goutam','GOUTAM DEBNATH','342461','g@x.in')`);
  const seed = (ticket: string, name: string, grade: number, dept: number, cohort: string, pos: number, rank: number, pno: string | null, user: string | null) =>
    pool.query(`INSERT INTO public.employee_roster (ticket_no, name, designation_grade_id, sail_department_id, cohort, within_grade_position, global_seniority_rank, sail_pno, user_id, source_snapshot_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'2026-09-26')`, [ticket, name, grade, dept, cohort, pos, rank, pno, user]);
  await seed("400001", "HOD C&IT TEST", 1, 1, "executive", 1, 30001, "A000001", null);
  await seed("412345", "RAKESH OJHA", 2, 1, "executive", 1, 50001, "D107659", "u-rakesh");
  await seed("412346", "ANIL DAS", 9, 1, "executive", 1, 120001, null, null);
  await seed("498880", "MEENA GUPTA", 9, 2, "executive", 2, 120002, null, null);
  await seed("342461", "GOUTAM DEBNATH", 20, 3, "nonexecutive", 1, 140001, null, "u-goutam");
  await seed("342462", "SUMIT BASU", 21, 4, "nonexecutive", 1, 150001, null, null);
  await pool.query(readFileSync(join(SQL_DIR, "14_people_events.sql"), "utf8")); // sample dates for the seven, as in the live database
  const m15 = readFileSync(join(SQL_DIR, "15_employee_admin.sql"), "utf8");
  await pool.query(m15);
  let again = true; try { await pool.query(m15); } catch { again = false; }
  ok("the migration sql/15 runs twice without error", again);

  const db: import("./store").EmpDb = {
    run: async (fn) => {
      const c = await pool.connect();
      try { await c.query("BEGIN"); const out = await fn(async (sql, params) => (await c.query(sql, params as never[])).rows); await c.query("COMMIT"); return out; }
      catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
    },
  };
  const HOD = { ticket: "400001", name: "HOD C&IT TEST" }, RAKESH = { ticket: "412345", name: "RAKESH OJHA" }, ANIL = { ticket: "412346", name: "ANIL DAS" }, NOBODY = { ticket: "342462", name: "SUMIT BASU" };
  const rows = (sql: string, p: unknown[] = []) => q(sql, p);
  const count = async (sql: string, p: unknown[] = []) => Number((await q(sql, p))[0].n);

  // ---- the tables ----
  ok("both tables are closed to the public API roles, with row level security on", (await count(`SELECT count(*) AS n FROM pg_tables WHERE schemaname='public' AND tablename IN ('employee_admin_delegate','employee_admin_audit') AND rowsecurity`)) === 2 && !(await q(`SELECT has_table_privilege('anon','public.employee_admin_audit','SELECT') AS x`))[0].x && !(await q(`SELECT has_table_privilege('authenticated','public.employee_admin_delegate','SELECT') AS x`))[0].x);

  // ---- who is who ----
  ok("the HOD (by the environment) is the HOD; nobody else is anything yet", (await db.run((x) => store.authorityOf(x, "400001"))) === "hod" && (await db.run((x) => store.authorityOf(x, "412345"))) === null && (await db.run((x) => store.authorityOf(x, ""))) === null && (await db.run((x) => store.authorityOf(x, null))) === null);
  ok("a person who is not authorised cannot add (nothing is written, not even a history line)", (await store.addEmployee(db, NOBODY, { ticketNo: "412399", name: "X Y Z", gradeId: 9, departmentId: 1 })).status === "forbidden" && (await count(`SELECT count(*) AS n FROM public.employee_admin_audit`)) === 0 && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='412399'`)) === 0);
  ok("only the HOD authorises: a stranger and a would-be delegate are refused", (await store.grantDelegate(db, NOBODY, { ticket: "412345", name: "RAKESH OJHA" })).status === "forbidden");
  ok("the HOD authorises RAKESH OJHA: he is a delegate, and the history says who and when", (await store.grantDelegate(db, HOD, { ticket: "412345", name: "RAKESH OJHA" })).status === "ok" && (await db.run((x) => store.authorityOf(x, "412345"))) === "delegate" && (await store.listDelegates(db)).some((d) => d.ticket === "412345" && d.grantedByTicket === "400001"));
  ok("a second authorisation of the same person: 'already'; a non-executive, the HOD himself, a missing name: refused in words", (await store.grantDelegate(db, HOD, { ticket: "412345", name: "RAKESH OJHA" })).status === "already" && (await store.grantDelegate(db, HOD, { ticket: "342461", name: "X" })).status === "invalid" && (await store.grantDelegate(db, HOD, { ticket: "400001", name: "HOD" })).status === "invalid" && (await store.grantDelegate(db, HOD, { ticket: "412346", name: " " })).status === "invalid");
  ok("a delegate cannot authorise another executive", (await store.grantDelegate(db, RAKESH, { ticket: "412346", name: "ANIL DAS" })).status === "forbidden");

  // ---- the lookups and the search ----
  const lk = await store.lookups(db);
  ok("the lookups: the designations with their track and order, the departments with the cohort they are reserved to", lk.grades.length === 6 && lk.grades.find((g) => g.id === 20)?.track === "nonexec" && lk.departments.find((d) => d.id === 2)?.scope === "executive" && lk.departments.find((d) => d.id === 1)?.scope === "shared");
  const s1 = await store.searchEmployees(db, "goutam deb", true);
  ok("search by words of the name; the HOD sees the dates (a sample date, labelled)", s1.length === 1 && s1[0].ticketNo === "342461" && s1[0].dateOfBirth.length === 10 && s1[0].datesVisible === true && s1[0].hasLogin === true && s1[0].gradeTitle === "S-11" && s1[0].departmentName === "L & D OFFICE");
  const s2 = await store.searchEmployees(db, "goutam", false);
  ok("...a delegate's search shows NO date (empty, and the record says so)", s2.length === 1 && s2[0].dateOfBirth === "" && s2[0].dateOfJoining === "" && s2[0].datesVisible === false);
  ok("search by ticket (whole and the first digits) and by SAIL P.No.", (await store.searchEmployees(db, "498880", true)).length === 1 && (await store.searchEmployees(db, "4123", true)).length === 2 && (await store.searchEmployees(db, "d107659", true))[0]?.ticketNo === "412345");
  ok("search is safe against SQL and against % and _ wildcards; an empty search finds nothing", (await store.searchEmployees(db, "'; DROP TABLE public.employee_roster; --", true)).length === 0 && (await count(`SELECT count(*) AS n FROM public.employee_roster`)) === 6 && (await store.searchEmployees(db, "%", true)).length === 0 && (await store.searchEmployees(db, "_____", true)).length === 0 && (await store.searchEmployees(db, "   ", true)).length === 0);

  // ---- adding (the HOD) ----
  const NEW = { ticketNo: "498999", name: "  ravi   kumar ", gradeId: 9, departmentId: 2, sailPno: "b002233", address: "Sector 2, Durgapur", emailNic: "Ravi@NIC.in", webmail: "", dateOfBirth: "2001-03-10", dateOfJoining: "2025-07-01" };
  const added = await store.addEmployee(db, HOD, NEW);
  ok("the HOD adds a direct recruit: ok, in capitals, cohort from the ticket, placed LAST in his grade, the HR formula for the rank", added.status === "ok" && added.employee.name === "RAVI KUMAR" && added.employee.cohort === "executive" && added.employee.position === 3 && added.employee.sailPno === "B002233" && added.employee.emailNic === "ravi@nic.in", JSON.stringify(added));
  const rowAdded = (await rows(`SELECT * FROM public.employee_roster WHERE ticket_no='498999'`))[0];
  ok("...stored: the rank is order x 10000 + position (12 x 10000 + 3), empty fields are true NULLs, the snapshot date (NOT NULL in this table) is today in India, no login", rowAdded.global_seniority_rank === 120003 && rowAdded.webmail_saildsp === null && rowAdded.cohort === "executive" && rowAdded.user_id === null && String(rowAdded.source_snapshot_date).length > 0, JSON.stringify(rowAdded));
  ok("...the dates the HOD typed are marked as REAL (hr), no longer samples", rowAdded.dates_source === "hr" && String(rowAdded.date_of_birth).includes("2001") && String(rowAdded.date_of_joining).includes("2025"));
  const au = await rows(`SELECT * FROM public.employee_admin_audit WHERE action='add'`);
  ok("...ONE history line, in the same commit: who (ticket, name, role), whom, and the record after", au.length === 1 && au[0].actor_ticket === "400001" && au[0].actor_role === "hod" && au[0].target_ticket === "498999" && au[0].before === null && au[0].after.name === "RAVI KUMAR" && au[0].after.dateOfBirth === "2001-03-10");
  ok("the new person is found by the people search of the whole application (the AI search's own view of the roster)", (await q(`SELECT 1 FROM nlq.employees WHERE ticket_no = '498999'`)).length === 1);

  // ---- every rule of a record, refused in words and nothing written ----
  const bad = async (over: Record<string, unknown>, field: string) => { const r = await store.addEmployee(db, HOD, { ...NEW, ticketNo: "498998", sailPno: "", ...over }); return r.status === "invalid" && !!(r.errors as Record<string, string>)[field] && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='498998'`)) === 0; };
  ok("a duplicate ticket number is refused and says whose it is", await (async () => { const r = await store.addEmployee(db, HOD, { ...NEW, sailPno: "" }); return r.status === "invalid" && /RAVI KUMAR/.test((r.errors as Record<string, string>).ticketNo); })());
  ok("a duplicate SAIL P.No. is refused and says whose it is", await (async () => { const r = await store.addEmployee(db, HOD, { ...NEW, ticketNo: "498998", sailPno: "d107659" }); return r.status === "invalid" && /RAKESH OJHA/.test((r.errors as Record<string, string>).sailPno); })());
  ok("an executive with a non-executive grade, a non-executive with an executive grade: refused", await bad({ gradeId: 20 }, "gradeId") && await bad({ ticketNo: "198998", gradeId: 9, departmentId: 1 }, "gradeId"));
  ok("a department reserved to the other cohort, an unknown department: refused", await bad({ departmentId: 3 }, "departmentId") && await bad({ departmentId: 99 }, "departmentId"));
  ok("a ticket of 5 digits, a name with a digit, an e-mail that is none: refused", await bad({ ticketNo: "49899" }, "ticketNo") && await bad({ name: "R2D2 KUMAR" }, "name") && await bad({ emailNic: "nope" }, "emailNic"));
  ok("a direct recruit who joined at 22, a person past the retirement day, a date that is not a date: refused", await bad({ dateOfBirth: "2001-03-10", dateOfJoining: "2022-03-09" }, "dateOfJoining") && await bad({ dateOfBirth: "1960-01-01", dateOfJoining: "" }, "dateOfBirth") && await bad({ dateOfBirth: "31/12/2000" }, "dateOfBirth"));
  const dupName = await store.addEmployee(db, HOD, { ticketNo: "412398", name: "anil das", gradeId: 9, departmentId: 1 });
  ok("the same name in the same department asks first ('is this another person?'): nothing written until the person says so", dupName.status === "conflict" && dupName.conflicts[0].with.ticketNo === "412346" && dupName.acknowledgeable[0] === "same-name" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='412398'`)) === 0);
  ok("...and with the answer 'yes, another person' it is saved", (await store.addEmployee(db, HOD, { ticketNo: "412398", name: "anil das", gradeId: 9, departmentId: 1 }, ["same-name"])).status === "ok");

  // ---- the delegate adds: no dates, ever ----
  const byDelegate = await store.addEmployee(db, RAKESH, { ticketNo: "342470", name: "Tapan Roy", gradeId: 21, departmentId: 4, dateOfBirth: "1990-01-01", dateOfJoining: "2010-01-01" });
  const rowDel = (await rows(`SELECT * FROM public.employee_roster WHERE ticket_no='342470'`))[0];
  ok("a delegate adds a non-executive: ok; the two dates he sent are IGNORED (nothing stored, no label)", byDelegate.status === "ok" && rowDel.date_of_birth === null && rowDel.date_of_joining === null && rowDel.dates_source === null && byDelegate.status === "ok" && byDelegate.employee.datesVisible === false, JSON.stringify(rowDel));
  ok("...the history line says role 'delegate'", (await count(`SELECT count(*) AS n FROM public.employee_admin_audit WHERE action='add' AND actor_role='delegate' AND target_ticket='342470'`)) === 1);

  // ---- changing ----
  const goutam = (await store.searchEmployees(db, "342461", true))[0];
  const mod = await store.modifyEmployee(db, HOD, goutam.id, { name: "goutam kumar debnath", gradeId: 20, departmentId: 4, sailPno: "", address: "New address", emailNic: "", webmail: "", dateOfBirth: goutam.dateOfBirth, dateOfJoining: goutam.dateOfJoining, ticketNo: "999999" });
  ok("the HOD changes a name and a department: ok; a ticket typed in the form is IGNORED (the ticket is fixed)", mod.status === "ok" && mod.employee.name === "GOUTAM KUMAR DEBNATH" && mod.employee.departmentName === "FIRE SERVICE" && mod.employee.ticketNo === "342461" && mod.employee.address === "New address", JSON.stringify(mod));
  const ma = (await rows(`SELECT * FROM public.employee_admin_audit WHERE action='modify' ORDER BY id DESC LIMIT 1`))[0];
  ok("...the history keeps the record BEFORE and AFTER", ma.before.name === "GOUTAM DEBNATH" && ma.after.name === "GOUTAM KUMAR DEBNATH" && ma.before.departmentName === "L & D OFFICE" && ma.after.departmentName === "FIRE SERVICE");
  ok("changing nothing is 'unchanged' and writes no history", (await store.modifyEmployee(db, HOD, goutam.id, { name: "goutam kumar debnath", gradeId: 20, departmentId: 4, address: "New address", dateOfBirth: goutam.dateOfBirth, dateOfJoining: goutam.dateOfJoining })).status === "unchanged" && (await count(`SELECT count(*) AS n FROM public.employee_admin_audit WHERE action='modify'`)) === 1);
  const promoted = await store.modifyEmployee(db, HOD, goutam.id, { name: "goutam kumar debnath", gradeId: 21, departmentId: 4, address: "New address", dateOfBirth: goutam.dateOfBirth, dateOfJoining: goutam.dateOfJoining });
  const rGr = (await rows(`SELECT within_grade_position AS p, global_seniority_rank AS r FROM public.employee_roster WHERE id=$1`, [goutam.id]))[0];
  ok("a change of designation puts him LAST in the new grade and the rank follows the formula (15 x 10000 + position)", promoted.status === "ok" && rGr.r === 150000 + rGr.p && rGr.p >= 3, JSON.stringify(rGr));
  const wrong = await store.modifyEmployee(db, HOD, goutam.id, { name: "goutam kumar debnath", gradeId: 1, departmentId: 4 });
  ok("a designation that does not fit the ticket is refused when changing too", wrong.status === "invalid" && !!wrong.errors.gradeId);
  ok("a change of a person who is not on the roll: 'missing'", (await store.modifyEmployee(db, HOD, 999999, { name: "Nobody Here", gradeId: 9, departmentId: 1 })).status === "missing");
  const hodDates = await store.modifyEmployee(db, HOD, goutam.id, { name: "goutam kumar debnath", gradeId: 21, departmentId: 4, address: "New address", dateOfBirth: "1990-05-05", dateOfJoining: "2012-06-01" });
  const rDs = (await rows(`SELECT dates_source, date_of_birth::text AS dob FROM public.employee_roster WHERE id=$1`, [goutam.id]))[0];
  ok("the HOD changes the dates: they become REAL (hr), replacing the sample", hodDates.status === "ok" && rDs.dates_source === "hr" && rDs.dob === "1990-05-05");
  const delMod = await store.modifyEmployee(db, RAKESH, goutam.id, { name: "goutam k debnath", gradeId: 21, departmentId: 4, address: "New address", dateOfBirth: "1970-01-01", dateOfJoining: "1990-01-01" });
  const rDs2 = (await rows(`SELECT date_of_birth::text AS dob, date_of_joining::text AS doj FROM public.employee_roster WHERE id=$1`, [goutam.id]))[0];
  ok("a delegate changes the name: ok; the dates he sent are IGNORED, the stored ones stay", delMod.status === "ok" && rDs2.dob === "1990-05-05" && rDs2.doj === "2012-06-01" && delMod.status === "ok" && delMod.employee.name === "GOUTAM K DEBNATH" && delMod.employee.dateOfBirth === "");
  const clear = await store.modifyEmployee(db, HOD, goutam.id, { name: "goutam k debnath", gradeId: 21, departmentId: 4, address: "New address", dateOfBirth: "", dateOfJoining: "" });
  const rDs3 = (await rows(`SELECT date_of_birth, date_of_joining, dates_source FROM public.employee_roster WHERE id=$1`, [goutam.id]))[0];
  ok("the HOD clears both dates: they go, and so does the label", clear.status === "ok" && rDs3.date_of_birth === null && rDs3.date_of_joining === null && rDs3.dates_source === null);
  ok("a person's name typed again with the name of another in the same department asks first (a change too)", await (async () => { const r = await store.modifyEmployee(db, HOD, (await store.searchEmployees(db, "412346", true))[0].id, { name: "rakesh ojha", gradeId: 9, departmentId: 1 }); return r.status === "conflict" && r.conflicts[0].with.ticketNo === "412345"; })());

  // ---- deleting: the HOD alone ----
  const tapan = (await store.searchEmployees(db, "342470", true))[0];
  ok("a delegate cannot delete", (await store.deleteEmployee(db, RAKESH, tapan.id, { confirmTicket: "342470", removeLogin: false })).status === "forbidden" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='342470'`)) === 1);
  ok("the ticket must be typed back: a wrong one is refused", (await store.deleteEmployee(db, HOD, tapan.id, { confirmTicket: "342471", removeLogin: false })).status === "invalid" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='342470'`)) === 1);
  const hodRow = (await store.searchEmployees(db, "400001", true))[0];
  ok("the HOD cannot delete himself, and nobody can delete a record whose ticket is the HOD's", (await store.deleteEmployee(db, HOD, hodRow.id, { confirmTicket: "400001", removeLogin: false })).status === "protected" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='400001'`)) === 1);
  const d1 = await store.deleteEmployee(db, HOD, tapan.id, { confirmTicket: "342470", removeLogin: false });
  ok("the HOD deletes an employee: gone from the roster, ONE history line with the whole record before", d1.status === "ok" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='342470'`)) === 0 && (await count(`SELECT count(*) AS n FROM public.employee_admin_audit WHERE action='delete' AND target_ticket='342470' AND before->>'name' = 'TAPAN ROY'`)) === 1);
  const rak = (await store.searchEmployees(db, "412345", true))[0];
  const d2 = await store.deleteEmployee(db, HOD, rak.id, { confirmTicket: "412345", removeLogin: true });
  ok("deleting an employee with a login account and the box 'remove his login too': both gone; the history says so", d2.status === "ok" && d2.loginRemoved === true && (await count(`SELECT count(*) AS n FROM public."user" WHERE id='u-rakesh'`)) === 0 && (await count(`SELECT count(*) AS n FROM public.employee_admin_audit WHERE action='delete' AND after->>'loginRemoved' = 'true'`)) === 1);
  ok("...he was a delegate: the authority went with him (a 'withdrawn' history line, with the reason)", (await db.run((x) => store.authorityOf(x, "412345"))) === null && (await count(`SELECT count(*) AS n FROM public.employee_admin_audit WHERE action='revoke' AND target_ticket='412345' AND note LIKE 'deleted%'`)) === 1);
  const gout = (await store.searchEmployees(db, "342461", true))[0];
  const d3 = await store.deleteEmployee(db, HOD, gout.id, { confirmTicket: "342461", removeLogin: false });
  ok("without the box the login account STAYS (and the roster's link to it simply goes with the row)", d3.status === "ok" && d3.loginRemoved === false && (await count(`SELECT count(*) AS n FROM public."user" WHERE id='u-goutam'`)) === 1);
  ok("deleting somebody not on the roll: 'missing'", (await store.deleteEmployee(db, HOD, 999999, { confirmTicket: "111111", removeLogin: false })).status === "missing");

  // ---- the history ----
  const hist = await store.recentAudit(db, 100, true);
  ok("the history lists what was done, newest first (never out of order), every kind of action present, each with who did it (ticket, name, role)", hist.length >= 12 && hist.every((h, i) => i === 0 || hist[i - 1].at >= h.at) && ["add", "modify", "delete", "grant", "revoke"].every((k) => hist.some((h) => h.action === k)) && hist.every((h) => h.actorTicket && h.actorName && (h.actorRole === "hod" || h.actorRole === "delegate")), JSON.stringify(hist.map((h) => h.action)));
  ok("...the HOD sees a change field by field, dates included (old to new)", hist.some((h) => h.action === "modify" && h.changes.some((c) => c.field === "dateOfBirth" && c.to === "1990-05-05")));
  const histD = await store.recentAudit(db, 100, false);
  ok("...a delegate sees the same change, but a date reads 'hidden' (never its value)", histD.some((h) => h.action === "modify" && h.changes.some((c) => c.field === "dateOfBirth" && c.from === "hidden" && c.to === "hidden")) && !JSON.stringify(histD).match(/1990-05-05|2012-06-01|2001-03-10/));
  ok("the history cannot be altered or erased, not even by the application's own connection", await (async () => { let a1 = false, a2 = false; try { await pool.query(`UPDATE public.employee_admin_audit SET actor_name='x'`); } catch { a1 = true; } try { await pool.query(`DELETE FROM public.employee_admin_audit`); } catch { a2 = true; } return a1 && a2; })());

  // ---- all or nothing ----
  await pool.query(`ALTER TABLE public.employee_admin_audit RENAME TO employee_admin_audit_x`);
  let threw = false; try { await store.addEmployee(db, HOD, { ticketNo: "412390", name: "Atomic Test", gradeId: 9, departmentId: 1 }); } catch { threw = true; }
  await pool.query(`ALTER TABLE public.employee_admin_audit_x RENAME TO employee_admin_audit`);
  ok("if the history line cannot be written, the change is NOT saved either (one transaction)", threw && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='412390'`)) === 0);
  const missingTables = errorReply(Object.assign(new Error('relation "public.employee_admin_audit" does not exist'), { code: "42P01" }));
  ok("a missing admin table is named in the reply (503 and the file to run)", missingTables.status === 503 && /15_employee_admin\.sql/.test(JSON.stringify(missingTables.body)) && errorReply(new Error("secret-host password=x")).status === 500 && !JSON.stringify(errorReply(new Error("secret-host password=x")).body).includes("secret"));

  // ---- two people at the same moment ----
  const race = await Promise.all([store.addEmployee(db, HOD, { ticketNo: "412391", name: "Race One", gradeId: 9, departmentId: 1 }), store.addEmployee(db, HOD, { ticketNo: "412391", name: "Race Two", gradeId: 9, departmentId: 1 })]);
  ok("two additions of the same ticket at the same moment: exactly one is saved, the other is told the ticket is taken", race.filter((r) => r.status === "ok").length === 1 && race.filter((r) => r.status === "invalid").length === 1 && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='412391'`)) === 1);
  const race2 = await Promise.all(Array.from({ length: 5 }, (_, i) => store.addEmployee(db, HOD, { ticketNo: `4123${50 + i}`, name: `Parallel ${"ABCDE"[i]}${"ABCDE"[i]}`, gradeId: 2, departmentId: 1 })));
  const positions = (await rows(`SELECT within_grade_position AS p FROM public.employee_roster WHERE ticket_no LIKE '41235_' AND designation_grade_id = 2`)).map((r) => Number(r.p));
  ok("five people added at once to one grade get five DIFFERENT positions (the lock)", race2.every((r) => r.status === "ok") && new Set(positions).size === 5, JSON.stringify(positions));

  // ---- the name-search helper tables ----
  await pool.query(`ALTER FUNCTION nlq.refresh_name_codes() RENAME TO refresh_name_codes_x`);
  const noFn = await store.addEmployee(db, HOD, { ticketNo: "412394", name: "Helper Missing", gradeId: 9, departmentId: 1 });
  await pool.query(`ALTER FUNCTION nlq.refresh_name_codes_x() RENAME TO refresh_name_codes`);
  ok("a database without the name-search refresh function does not stop an addition (a savepoint)", noFn.status === "ok" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='412394'`)) === 1);

  // ---- the handler: the person is the login's, whatever the browser says ----
  const ctxFor = (actor: { ticket: string; name: string } | null) => ({ actor, db, findByName: async () => [], findByTicket: async (t: string) => (await q(`SELECT er.id::text AS id, er.ticket_no AS "ticketNo", er.name, dg.title AS designation FROM public.employee_roster er JOIN public.designation_grade dg ON dg.id = er.designation_grade_id WHERE er.ticket_no = $1`, [t])) as never[] });
  ok("logged out: 401 for every request", (await handleEmployeeAdmin({ op: "search", q: "x" }, ctxFor(null))).status === 401);
  ok("an unknown request is 400; a body that is not an object is 400", (await handleEmployeeAdmin({ op: "drop" }, ctxFor(HOD))).status === 400 && (await handleEmployeeAdmin("x", ctxFor(HOD))).status === 400 && (await handleEmployeeAdmin(null, ctxFor(HOD))).status === 400);
  ok("somebody with no authority: 'me' tells his role (null), everything else is 403", (await handleEmployeeAdmin({ op: "me" }, ctxFor(NOBODY))).body.role === null && (await handleEmployeeAdmin({ op: "search", q: "anil" }, ctxFor(NOBODY))).status === 403 && (await handleEmployeeAdmin({ op: "add", fields: {} }, ctxFor(NOBODY))).status === 403);
  const ANIL_D = { ticket: "412346", name: "ANIL DAS" };
  await store.grantDelegate(db, HOD, { ticket: "412346", name: "ANIL DAS" });
  ok("a delegate: can look up, add, change and read the history; 403 for delete, authorise, withdraw, the list of delegates", (await handleEmployeeAdmin({ op: "search", q: "meena" }, ctxFor(ANIL_D))).status === 200 && (await handleEmployeeAdmin({ op: "audit" }, ctxFor(ANIL_D))).status === 200 && (await handleEmployeeAdmin({ op: "delete", id: 1, confirmTicket: "1" }, ctxFor(ANIL_D))).status === 403 && (await handleEmployeeAdmin({ op: "grant", ticket: "412399" }, ctxFor(ANIL_D))).status === 403 && (await handleEmployeeAdmin({ op: "revoke", ticket: "412346" }, ctxFor(ANIL_D))).status === 403 && (await handleEmployeeAdmin({ op: "delegates" }, ctxFor(ANIL_D))).status === 403 && (await handleEmployeeAdmin({ op: "find-executive", q: "x" }, ctxFor(ANIL_D))).status === 403);
  const sDel = await handleEmployeeAdmin({ op: "search", q: "meena" }, ctxFor(ANIL_D));
  const sHod = await handleEmployeeAdmin({ op: "search", q: "meena" }, ctxFor(HOD));
  ok("the dates: the HOD's search carries them, a delegate's reply has NONE in it (not even as a hidden field)", /\d{4}-\d{2}-\d{2}/.test(JSON.stringify(sHod.body)) && !/\d{4}-\d{2}-\d{2}/.test(JSON.stringify(sDel.body)) && (await handleEmployeeAdmin({ op: "lookups" }, ctxFor(ANIL_D))).body.datesVisible === false);
  const meena = ((sHod.body.employees as Array<{ id: number }>)[0]);
  ok("'get' by id: the HOD with the dates, a delegate without; a missing person is 404", /\d{4}-\d{2}-\d{2}/.test(JSON.stringify((await handleEmployeeAdmin({ op: "get", id: meena.id }, ctxFor(HOD))).body)) && !/\d{4}-\d{2}-\d{2}/.test(JSON.stringify((await handleEmployeeAdmin({ op: "get", id: meena.id }, ctxFor(ANIL_D))).body)) && (await handleEmployeeAdmin({ op: "get", id: 987654 }, ctxFor(HOD))).status === 404 && (await handleEmployeeAdmin({ op: "get" }, ctxFor(HOD))).status === 400);
  ok("a delegate's change through the handler leaves the dates alone even when the browser sends some, and a ticket sent by the browser as 'actor' changes nothing", await (async () => {
    const before = (await rows(`SELECT date_of_birth::text AS d FROM public.employee_roster WHERE id=$1`, [meena.id]))[0].d;
    const r = await handleEmployeeAdmin({ op: "modify", id: meena.id, actor: { ticket: "400001" }, ticket: "400001", role: "hod", fields: { name: "Meena Gupta Sen", gradeId: 9, departmentId: 2, dateOfBirth: "1960-01-01" } }, ctxFor(ANIL_D));
    const after = (await rows(`SELECT date_of_birth::text AS d FROM public.employee_roster WHERE id=$1`, [meena.id]))[0].d;
    return r.status === 200 && (r.body.result as { status: string }).status === "ok" && before === after && (await count(`SELECT count(*) AS n FROM public.employee_admin_audit WHERE actor_ticket='412346' AND actor_role='delegate' AND action='modify'`)) === 1;
  })());
  ok("the 'grant' request looks the executive up by ticket in the people directory (a typed name is never trusted): a non-executive and an unknown ticket are refused", (await handleEmployeeAdmin({ op: "grant", ticket: "342462" }, ctxFor(HOD))).body.result !== undefined && ((await handleEmployeeAdmin({ op: "grant", ticket: "342462" }, ctxFor(HOD))).body.result as { status: string }).status === "invalid" && ((await handleEmployeeAdmin({ op: "grant", ticket: "499999" }, ctxFor(HOD))).body.result as { status: string }).status === "invalid");
  const histApi = await handleEmployeeAdmin({ op: "audit" }, ctxFor(HOD));
  ok("the history through the handler carries each editor's post from the people directory", (histApi.body.history as Array<{ actorTicket: string; actorDesignation: string }>).some((h) => h.actorTicket === "400001" && h.actorDesignation === "Chief General Manager"));
  ok("fields the browser adds beyond the form are dropped (an 'id', a 'cohort', a 'dates_source' cannot be set from outside)", await (async () => {
    const r = await handleEmployeeAdmin({ op: "add", fields: { ticketNo: "412395", name: "Extra Fields", gradeId: 9, departmentId: 1, cohort: "nonexecutive", id: 5, global_seniority_rank: 1, dates_source: "synthetic", user_id: "u-goutam" } }, ctxFor(HOD));
    const row = (await rows(`SELECT cohort, user_id, global_seniority_rank AS r FROM public.employee_roster WHERE ticket_no='412395'`))[0];
    return (r.body.result as { status: string }).status === "ok" && row.cohort === "executive" && row.user_id === null && row.r === 120000 + Number((await rows(`SELECT within_grade_position AS p FROM public.employee_roster WHERE ticket_no='412395'`))[0].p);
  })());

  // ---- a roster whose optional columns differ ----
  await pool.query(`ALTER TABLE public.employee_roster DROP COLUMN address CASCADE, DROP COLUMN webmail_saildsp CASCADE, DROP COLUMN doctor_override CASCADE`);
  const slim = await store.addEmployee(db, HOD, { ticketNo: "412392", name: "Slim Table", gradeId: 9, departmentId: 1, address: "ignored", webmail: "a@b.in", doctor: true });
  ok("a roster WITHOUT the address, web-mail and doctor columns: add still works (those fields are simply not stored), the record shows them empty", slim.status === "ok" && slim.employee.address === "" && slim.employee.webmail === "" && slim.employee.doctor === null);
  const slimMod = slim.status === "ok" ? await store.modifyEmployee(db, HOD, slim.employee.id, { name: "Slim Table Two", gradeId: 9, departmentId: 1 }) : null;
  ok("...and a change still works", slimMod?.status === "ok");
  await pool.query(`ALTER TABLE public.employee_roster ADD COLUMN address text, ADD COLUMN webmail_saildsp text, ADD COLUMN doctor_override boolean`);
  const withDoc = await store.addEmployee(db, HOD, { ticketNo: "412393", name: "Doc Tor", gradeId: 10, departmentId: 1, doctor: true });
  ok("with the doctor column back, the flag is stored (a doctor with an ordinary designation)", withDoc.status === "ok" && withDoc.employee.doctor === true);

  await pool.end();
  console.log(`employee admin store selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
