// Run (from the project root; needs a scratch Postgres):
//   NL2SQL_TEST_ADMIN_URL=postgres://postgres:pw@127.0.0.1:5432/postgres npx tsx --tsconfig tsconfig.json src/lib/employees/admin/adminStore.selftest.ts
// Step 66a: the employee manager against a real database: who may do what, every rule of a record, the dates that only the HOD sees, who may delete, two people at the same moment, a history that cannot be altered, and a roster
// whose optional columns differ. The roster is the project's stand-in made to follow the LIVE rules the handoff describes (UNIQUE (ticket_no, cohort), user_id -> user ON DELETE SET NULL, a NOT NULL snapshot date, the doctor flag).
// The migrations are the REAL files (sql/14, sql/15). The people are INVENTED.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
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
  await pool.query(`DO $$ BEGIN ALTER TABLE public."user" ADD CONSTRAINT user_email_uq UNIQUE (email); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$; DO $$ BEGIN ALTER TABLE public."user" ADD CONSTRAINT user_ticket_uq UNIQUE ("ticketNo"); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;`);
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
  // step 68b: the authorisations and the history live in the SHARED tables (sql/17); its closing check reads the PAX editor's two old tables too, so sql/13 runs here as it did live
  await pool.query(`CREATE TABLE IF NOT EXISTS public.pax_directory (id serial PRIMARY KEY, dept_name text, location text, "number" text, label text, note text, source text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
  await pool.query(readFileSync(join(SQL_DIR, "13_pax_admin.sql"), "utf8"));
  const m17 = readFileSync(join(SQL_DIR, "17_facility_kit.sql"), "utf8");
  await pool.query(m17);
  let again = true; try { await pool.query(m15); } catch { again = false; }
  ok("the migration sql/15 runs twice without error", again);
  let again17 = true; try { await pool.query(m17); } catch { again17 = false; }
  ok("the migration sql/17 runs twice without error", again17);
  const m18 = readFileSync(join(SQL_DIR, "18_facility_nonexecutive.sql"), "utf8");
  await pool.query(m18);
  let again18 = true; try { await pool.query(m18); } catch { again18 = false; }
  ok("the migration sql/18 runs twice without error", again18);
  const m19 = readFileSync(join(SQL_DIR, "19_employee_photo.sql"), "utf8");
  await pool.query(m19);
  let again19 = true; try { await pool.query(m19); } catch { again19 = false; }
  ok("the migration sql/19 (the photo table) runs twice without error", again19);

  const db: import("./store").EmpDb = {
    run: async (fn) => {
      const c = await pool.connect();
      try { await c.query("BEGIN"); const out = await fn(async (sql, params) => (await c.query(sql, params as never[])).rows); await c.query("COMMIT"); return out; }
      catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
    },
  };
  const full = (f: Record<string, unknown>) => ({ sailPno: `PN${f.ticketNo}`, mobile: /^4/.test(String(f.ticketNo)) ? "9434791234" : "", ...f });
  // a person LOADS the record and then saves what he typed WITH THE VERSION HE SAW (src/lib/concurrency/version.ts); the HOD sees the dates, the others do not
  const seen = async (actor: { ticket: string }, id: number) => (await store.getEmployee(db, id, actor.ticket === "400001"))?.version;
  const modX = async (actor: { ticket: string; name: string }, id: number, fields: Record<string, unknown>, acks: Array<"same-name"> = []) => store.modifyEmployee(db, actor, id, fields, acks, await seen(actor, id));
  const delX = async (actor: { ticket: string; name: string }, id: number, opts: { confirmTicket: string; removeLogin: boolean }) => store.deleteEmployee(db, actor, id, { ...opts, version: (await store.getEmployee(db, id, true))?.version });
  const addX = (actor: { ticket: string; name: string }, f: Record<string, unknown>, acks: Array<"same-name"> = []) => store.addEmployee(db, actor, full(f), acks);
  const HOD = { ticket: "400001", name: "HOD C&IT TEST" }, RAKESH = { ticket: "412345", name: "RAKESH OJHA" }, ANIL = { ticket: "412346", name: "ANIL DAS" }, NOBODY = { ticket: "342462", name: "SUMIT BASU" };
  const rows = (sql: string, p: unknown[] = []) => q(sql, p);
  const count = async (sql: string, p: unknown[] = []) => Number((await q(sql, p))[0].n);

  // ---- the tables ----
  ok("both tables are closed to the public API roles, with row level security on", (await count(`SELECT count(*) AS n FROM pg_tables WHERE schemaname='public' AND tablename IN ('facility_delegate','facility_audit') AND rowsecurity`)) === 2 && !(await q(`SELECT has_table_privilege('anon','public.facility_audit','SELECT') AS x`))[0].x && !(await q(`SELECT has_table_privilege('authenticated','public.facility_delegate','SELECT') AS x`))[0].x);

  // ---- who is who ----
  ok("the HOD (by the environment) is the HOD; nobody else is anything yet", (await db.run((x) => store.authorityOf(x, "400001"))) === "hod" && (await db.run((x) => store.authorityOf(x, "412345"))) === null && (await db.run((x) => store.authorityOf(x, ""))) === null && (await db.run((x) => store.authorityOf(x, null))) === null);
  ok("a person who is not authorised cannot add (nothing is written, not even a history line)", (await store.addEmployee(db, NOBODY, { ticketNo: "412399", name: "X Y Z", gradeId: 9, departmentId: 1 })).status === "forbidden" && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee'`)) === 0 && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='412399'`)) === 0);
  ok("only the HOD authorises: a stranger and a would-be delegate are refused", (await store.grantDelegate(db, NOBODY, { ticket: "412345", name: "RAKESH OJHA" })).status === "forbidden");
  ok("the HOD authorises RAKESH OJHA: he is a delegate, and the history says who and when", (await store.grantDelegate(db, HOD, { ticket: "412345", name: "RAKESH OJHA" })).status === "ok" && (await db.run((x) => store.authorityOf(x, "412345"))) === "delegate" && (await store.listDelegates(db)).some((d) => d.ticket === "412345" && d.grantedByTicket === "400001"));
  ok("a second authorisation of the same person: 'already'; a non-executive asks for the confirmation first; a bad ticket, the HOD himself, a missing name: refused in words", (await store.grantDelegate(db, HOD, { ticket: "412345", name: "RAKESH OJHA" })).status === "already" && (await store.grantDelegate(db, HOD, { ticket: "342461", name: "X" })).status === "needs-confirmation" && (await store.grantDelegate(db, HOD, { ticket: "34246", name: "X" })).status === "invalid" && (await store.grantDelegate(db, HOD, { ticket: "400001", name: "HOD" })).status === "invalid" && (await store.grantDelegate(db, HOD, { ticket: "412346", name: " " })).status === "invalid");
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
  const NEW = { ticketNo: "498999", name: "  ravi   kumar ", gradeId: 9, departmentId: 2, sailPno: "b002233", address: "Sector 2, Durgapur", emailNic: "Ravi@SAIL.in", webmail: "", mobile: "9434791234", dateOfBirth: "2001-03-10", dateOfJoining: "2025-07-01" };
  const added = await store.addEmployee(db, HOD, NEW);
  ok("the HOD adds a direct recruit: ok, in capitals, cohort from the ticket, placed LAST in his grade, the HR formula for the rank", added.status === "ok" && added.employee.name === "RAVI KUMAR" && added.employee.cohort === "executive" && added.employee.position === 3 && added.employee.sailPno === "B002233" && added.employee.emailNic === "xxxxxx@sail.in", JSON.stringify(added));
  const rowAdded = (await rows(`SELECT * FROM public.employee_roster WHERE ticket_no='498999'`))[0];
  ok("...stored: the rank is order x 10000 + position (12 x 10000 + 3), empty fields are true NULLs, the snapshot date (NOT NULL in this table) is today in India, and his login account is linked", rowAdded.global_seniority_rank === 120003 && rowAdded.webmail_saildsp === null && rowAdded.cohort === "executive" && rowAdded.user_id !== null && String(rowAdded.source_snapshot_date).length > 0, JSON.stringify(rowAdded));
  ok("...the dates the HOD typed are marked as REAL (hr), no longer samples", rowAdded.dates_source === "hr" && String(rowAdded.date_of_birth).includes("2001") && String(rowAdded.date_of_joining).includes("2025"));
  const au = await rows(`SELECT * FROM public.facility_audit WHERE facility='employee' AND action='add'`);
  ok("...ONE history line, in the same commit: who (ticket, name, role), whom, and the record after", au.length === 1 && au[0].actor_ticket === "400001" && au[0].actor_role === "hod" && au[0].target_ticket === "498999" && au[0].before === null && au[0].after.name === "RAVI KUMAR" && au[0].after.dateOfBirth === "2001-03-10");
  ok("the new person is found by the people search of the whole application (the AI search's own view of the roster)", (await q(`SELECT 1 FROM nlq.employees WHERE ticket_no = '498999'`)).length === 1);

  // ---- every rule of a record, refused in words and nothing written ----
  const bad = async (over: Record<string, unknown>, field: string) => { const r = await store.addEmployee(db, HOD, { ...NEW, ticketNo: "498998", sailPno: "ZZ998", ...over }); return r.status === "invalid" && !!(r.errors as Record<string, string>)[field] && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='498998'`)) === 0; };
  ok("a duplicate ticket number is refused and says whose it is", await (async () => { const r = await store.addEmployee(db, HOD, { ...NEW, sailPno: "ZZ997" }); return r.status === "invalid" && /RAVI KUMAR/.test((r.errors as Record<string, string>).ticketNo); })());
  ok("a duplicate SAIL P.No. is refused and says whose it is", await (async () => { const r = await store.addEmployee(db, HOD, { ...NEW, ticketNo: "498998", sailPno: "d107659" }); return r.status === "invalid" && /RAKESH OJHA/.test((r.errors as Record<string, string>).sailPno); })());
  ok("an executive with a non-executive grade, a non-executive with an executive grade: refused", await bad({ gradeId: 20 }, "gradeId") && await bad({ ticketNo: "198998", gradeId: 9, departmentId: 1 }, "gradeId"));
  ok("a department reserved to the other cohort, an unknown department: refused", await bad({ departmentId: 3 }, "departmentId") && await bad({ departmentId: 99 }, "departmentId"));
  ok("a ticket of 5 digits, a name with a digit, an e-mail that is none: refused", await bad({ ticketNo: "49899" }, "ticketNo") && await bad({ name: "R2D2 KUMAR" }, "name") && await bad({ emailNic: "nope" }, "emailNic"));
  ok("a direct recruit who joined at 22, a person past the retirement day, a date that is not a date: refused", await bad({ dateOfBirth: "2001-03-10", dateOfJoining: "2022-03-09" }, "dateOfJoining") && await bad({ dateOfBirth: "1960-01-01", dateOfJoining: "" }, "dateOfBirth") && await bad({ dateOfBirth: "31/12/2000" }, "dateOfBirth"));
  const dupName = await addX(HOD, { ticketNo: "412398", name: "anil das", gradeId: 9, departmentId: 1 });
  ok("the same name in the same department asks first ('is this another person?'): nothing written until the person says so", dupName.status === "conflict" && dupName.conflicts[0].with.ticketNo === "412346" && dupName.acknowledgeable[0] === "same-name" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='412398'`)) === 0);
  ok("...and with the answer 'yes, another person' it is saved", (await addX(HOD, { ticketNo: "412398", name: "anil das", gradeId: 9, departmentId: 1 }, ["same-name"])).status === "ok");

  // ---- the delegate adds: no dates, ever ----
  const byDelegate = await addX(RAKESH, { ticketNo: "342470", name: "Tapan Roy", gradeId: 21, departmentId: 4, dateOfBirth: "1990-01-01", dateOfJoining: "2010-01-01" });
  const rowDel = (await rows(`SELECT * FROM public.employee_roster WHERE ticket_no='342470'`))[0];
  ok("a delegate adds a non-executive: ok; the two dates he sent are IGNORED (nothing stored, no label)", byDelegate.status === "ok" && rowDel.date_of_birth === null && rowDel.date_of_joining === null && rowDel.dates_source === null && byDelegate.status === "ok" && byDelegate.employee.datesVisible === false, JSON.stringify(rowDel));
  ok("...the history line says role 'delegate'", (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee' AND action='add' AND actor_role='delegate' AND target_ticket='342470'`)) === 1);

  // ---- changing ----
  const goutam = (await store.searchEmployees(db, "342461", true))[0];
  const mod = await modX(HOD, goutam.id, { name: "goutam kumar debnath", gradeId: 20, departmentId: 4, sailPno: "", address: "New address", emailNic: "", webmail: "", dateOfBirth: goutam.dateOfBirth, dateOfJoining: goutam.dateOfJoining, ticketNo: "999999" });
  ok("the HOD changes a name and a department: ok; a ticket typed in the form is IGNORED (the ticket is fixed)", mod.status === "ok" && mod.employee.name === "GOUTAM KUMAR DEBNATH" && mod.employee.departmentName === "FIRE SERVICE" && mod.employee.ticketNo === "342461" && mod.employee.address === "New address", JSON.stringify(mod));
  const ma = (await rows(`SELECT * FROM public.facility_audit WHERE facility='employee' AND action='modify' ORDER BY id DESC LIMIT 1`))[0];
  ok("...the history keeps the record BEFORE and AFTER", ma.before.name === "GOUTAM DEBNATH" && ma.after.name === "GOUTAM KUMAR DEBNATH" && ma.before.departmentName === "L & D OFFICE" && ma.after.departmentName === "FIRE SERVICE");
  ok("changing nothing is 'unchanged' and writes no history", (await modX(HOD, goutam.id, { name: "goutam kumar debnath", gradeId: 20, departmentId: 4, address: "New address", dateOfBirth: goutam.dateOfBirth, dateOfJoining: goutam.dateOfJoining })).status === "unchanged" && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee' AND action='modify'`)) === 1);
  const promoted = await modX(HOD, goutam.id, { name: "goutam kumar debnath", gradeId: 21, departmentId: 4, address: "New address", dateOfBirth: goutam.dateOfBirth, dateOfJoining: goutam.dateOfJoining });
  const rGr = (await rows(`SELECT within_grade_position AS p, global_seniority_rank AS r FROM public.employee_roster WHERE id=$1`, [goutam.id]))[0];
  ok("a change of designation puts him LAST in the new grade and the rank follows the formula (15 x 10000 + position)", promoted.status === "ok" && rGr.r === 150000 + rGr.p && rGr.p >= 3, JSON.stringify(rGr));
  const wrong = await modX(HOD, goutam.id, { name: "goutam kumar debnath", gradeId: 1, departmentId: 4 });
  ok("a designation that does not fit the ticket is refused when changing too", wrong.status === "invalid" && !!wrong.errors.gradeId);
  ok("a change of a person who is not on the roll: 'missing'", (await modX(HOD, 999999, { name: "Nobody Here", gradeId: 9, departmentId: 1 })).status === "missing");
  const hodDates = await modX(HOD, goutam.id, { name: "goutam kumar debnath", gradeId: 21, departmentId: 4, address: "New address", dateOfBirth: "1990-05-05", dateOfJoining: "2012-06-01" });
  const rDs = (await rows(`SELECT dates_source, date_of_birth::text AS dob FROM public.employee_roster WHERE id=$1`, [goutam.id]))[0];
  ok("the HOD changes the dates: they become REAL (hr), replacing the sample", hodDates.status === "ok" && rDs.dates_source === "hr" && rDs.dob === "1990-05-05");
  const delMod = await modX(RAKESH, goutam.id, { name: "goutam k debnath", gradeId: 21, departmentId: 4, address: "New address", dateOfBirth: "1970-01-01", dateOfJoining: "1990-01-01" });
  const rDs2 = (await rows(`SELECT date_of_birth::text AS dob, date_of_joining::text AS doj FROM public.employee_roster WHERE id=$1`, [goutam.id]))[0];
  ok("a delegate changes the name: ok; the dates he sent are IGNORED, the stored ones stay", delMod.status === "ok" && rDs2.dob === "1990-05-05" && rDs2.doj === "2012-06-01" && delMod.status === "ok" && delMod.employee.name === "GOUTAM K DEBNATH" && delMod.employee.dateOfBirth === "");
  const clear = await modX(HOD, goutam.id, { name: "goutam k debnath", gradeId: 21, departmentId: 4, address: "New address", dateOfBirth: "", dateOfJoining: "" });
  const rDs3 = (await rows(`SELECT date_of_birth, date_of_joining, dates_source FROM public.employee_roster WHERE id=$1`, [goutam.id]))[0];
  ok("the HOD clears both dates: they go, and so does the label", clear.status === "ok" && rDs3.date_of_birth === null && rDs3.date_of_joining === null && rDs3.dates_source === null);
  ok("a person's name typed again with the name of another in the same department asks first (a change too)", await (async () => { const r = await modX(HOD, (await store.searchEmployees(db, "412346", true))[0].id, { name: "rakesh ojha", gradeId: 9, departmentId: 1, mobile: "9434791234" }); return r.status === "conflict" && r.conflicts[0].with.ticketNo === "412345"; })());

  // ---- deleting: the HOD alone ----
  const tapan = (await store.searchEmployees(db, "342470", true))[0];
  ok("a delegate cannot delete", (await delX(RAKESH, tapan.id, { confirmTicket: "342470", removeLogin: false })).status === "forbidden" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='342470'`)) === 1);
  ok("the ticket must be typed back: a wrong one is refused", (await delX(HOD, tapan.id, { confirmTicket: "342471", removeLogin: false })).status === "invalid" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='342470'`)) === 1);
  const hodRow = (await store.searchEmployees(db, "400001", true))[0];
  ok("the HOD cannot delete himself, and nobody can delete a record whose ticket is the HOD's", (await delX(HOD, hodRow.id, { confirmTicket: "400001", removeLogin: false })).status === "protected" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='400001'`)) === 1);
  const d1 = await delX(HOD, tapan.id, { confirmTicket: "342470", removeLogin: false });
  ok("the HOD deletes an employee: gone from the roster, ONE history line with the whole record before", d1.status === "ok" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='342470'`)) === 0 && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee' AND action='delete' AND target_ticket='342470' AND before->>'name' = 'TAPAN ROY'`)) === 1);
  const rak = (await store.searchEmployees(db, "412345", true))[0];
  const d2 = await delX(HOD, rak.id, { confirmTicket: "412345", removeLogin: true });
  ok("deleting an employee with a login account and the box 'remove his login too': both gone; the history says so", d2.status === "ok" && d2.loginRemoved === true && (await count(`SELECT count(*) AS n FROM public."user" WHERE id='u-rakesh'`)) === 0 && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee' AND action='delete' AND after->>'loginRemoved' = 'true'`)) === 1);
  ok("...he was a delegate: the authority went with him (a 'withdrawn' history line, with the reason)", (await db.run((x) => store.authorityOf(x, "412345"))) === null && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee' AND action='revoke' AND target_ticket='412345' AND note LIKE 'deleted%'`)) === 1);
  const gout = (await store.searchEmployees(db, "342461", true))[0];
  const d3 = await delX(HOD, gout.id, { confirmTicket: "342461", removeLogin: false });
  ok("without the box the login account STAYS (and the roster's link to it simply goes with the row)", d3.status === "ok" && d3.loginRemoved === false && (await count(`SELECT count(*) AS n FROM public."user" WHERE id='u-goutam'`)) === 1);
  ok("deleting somebody not on the roll: 'missing'", (await delX(HOD, 999999, { confirmTicket: "111111", removeLogin: false })).status === "missing");

  // ---- the history ----
  const hist = await store.recentAudit(db, 100, true);
  ok("the history lists what was done, newest first (never out of order), every kind of action present, each with who did it (ticket, name, role)", hist.length >= 12 && hist.every((h, i) => i === 0 || hist[i - 1].at >= h.at) && ["add", "modify", "delete", "grant", "revoke"].every((k) => hist.some((h) => h.action === k)) && hist.every((h) => h.actorTicket && h.actorName && (h.actorRole === "hod" || h.actorRole === "delegate")), JSON.stringify(hist.map((h) => h.action)));
  ok("...the HOD sees a change field by field, dates included (old to new)", hist.some((h) => h.action === "modify" && h.changes.some((c) => c.field === "dateOfBirth" && c.to === "1990-05-05")));
  const histD = await store.recentAudit(db, 100, false);
  ok("...a delegate sees the same change, but a date reads 'hidden' (never its value)", histD.some((h) => h.action === "modify" && h.changes.some((c) => c.field === "dateOfBirth" && c.from === "hidden" && c.to === "hidden")) && !JSON.stringify(histD).match(/1990-05-05|2012-06-01|2001-03-10/));
  ok("the history cannot be altered or erased, not even by the application's own connection", await (async () => { let a1 = false, a2 = false; try { await pool.query(`UPDATE public.facility_audit SET actor_name='x'`); } catch { a1 = true; } try { await pool.query(`DELETE FROM public.facility_audit WHERE facility='employee'`); } catch { a2 = true; } return a1 && a2; })());

  // ---- all or nothing ----
  await pool.query(`ALTER TABLE public.facility_audit RENAME TO facility_audit_x`);
  let threw = false; try { await addX(HOD, { ticketNo: "412390", name: "Atomic Test", gradeId: 9, departmentId: 1 }); } catch { threw = true; }
  await pool.query(`ALTER TABLE public.facility_audit_x RENAME TO facility_audit`);
  ok("if the history line cannot be written, the change is NOT saved either (one transaction)", threw && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='412390'`)) === 0);
  const missingTables = errorReply(Object.assign(new Error('relation "public.facility_audit" does not exist'), { code: "42P01" }));
  ok("a missing shared table is named in the reply (503 and the file to run)", missingTables.status === 503 && /17_facility_kit\.sql/.test(JSON.stringify(missingTables.body)) && errorReply(new Error("secret-host password=x")).status === 500 && !JSON.stringify(errorReply(new Error("secret-host password=x")).body).includes("secret"));
  ok("a non-executive confirmed before sql/18 was run: a reply that NAMES the file to run (503, setupNeeded), not a bare failure", await (async () => { const r = errorReply(Object.assign(new Error('new row for relation "facility_delegate" violates check constraint "facility_delegate_ticket_no_check"'), { code: "23514" })); return r.status === 503 && /18_facility_nonexecutive\.sql/.test(JSON.stringify(r.body)) && (r.body as { setupNeeded?: boolean }).setupNeeded === true && errorReply(Object.assign(new Error('violates check constraint "something_else"'), { code: "23514" })).status === 500; })());

  // ---- two people at the same moment ----
  const race = await Promise.all([addX(HOD, { ticketNo: "412391", name: "Race One", gradeId: 9, departmentId: 1 }), addX(HOD, { ticketNo: "412391", name: "Race Two", gradeId: 9, departmentId: 1 })]);
  ok("two additions of the same ticket at the same moment: exactly one is saved, the other is told the ticket is taken", race.filter((r) => r.status === "ok").length === 1 && race.filter((r) => r.status === "invalid").length === 1 && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='412391'`)) === 1);
  const race2 = await Promise.all(Array.from({ length: 5 }, (_, i) => addX(HOD, { ticketNo: `4123${50 + i}`, name: `Parallel ${"ABCDE"[i]}${"ABCDE"[i]}`, gradeId: 2, departmentId: 1 })));
  const positions = (await rows(`SELECT within_grade_position AS p FROM public.employee_roster WHERE ticket_no LIKE '41235_' AND designation_grade_id = 2`)).map((r) => Number(r.p));
  ok("five people added at once to one grade get five DIFFERENT positions (the lock)", race2.every((r) => r.status === "ok") && new Set(positions).size === 5, JSON.stringify(positions));

  // ---- the name-search helper tables ----
  await pool.query(`ALTER FUNCTION nlq.refresh_name_codes() RENAME TO refresh_name_codes_x`);
  const noFn = await addX(HOD, { ticketNo: "412394", name: "Helper Missing", gradeId: 9, departmentId: 1 });
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
    const r = await handleEmployeeAdmin({ op: "modify", id: meena.id, version: await seen(ANIL_D, meena.id), actor: { ticket: "400001" }, ticket: "400001", role: "hod", fields: { name: "Meena Gupta Sen", gradeId: 9, departmentId: 2, mobile: "9434791235", sailPno: "PN498880", dateOfBirth: "1960-01-01" } }, ctxFor(ANIL_D));
    const after = (await rows(`SELECT date_of_birth::text AS d FROM public.employee_roster WHERE id=$1`, [meena.id]))[0].d;
    return r.status === 200 && (r.body.result as { status: string }).status === "ok" && before === after && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee' AND actor_ticket='412346' AND actor_role='delegate' AND action='modify'`)) === 1;
  })());
  ok("the 'grant' request looks the person up by ticket in the people directory (a typed name is never trusted): a non-executive asks for the confirmation, an unknown ticket is refused", ((await handleEmployeeAdmin({ op: "grant", ticket: "342462" }, ctxFor(HOD))).body.result as { status: string }).status === "needs-confirmation" && ((await handleEmployeeAdmin({ op: "grant", ticket: "499999" }, ctxFor(HOD))).body.result as { status: string }).status === "invalid");
  const histApi = await handleEmployeeAdmin({ op: "audit" }, ctxFor(HOD));
  ok("the history through the handler carries each editor's post from the people directory", (histApi.body.history as Array<{ actorTicket: string; actorDesignation: string }>).some((h) => h.actorTicket === "400001" && h.actorDesignation === "Chief General Manager"));
  ok("fields the browser adds beyond the form are dropped (an 'id', a 'cohort', a 'dates_source' cannot be set from outside)", await (async () => {
    const r = await handleEmployeeAdmin({ op: "add", fields: { ticketNo: "412395", name: "Extra Fields", gradeId: 9, departmentId: 1, sailPno: "PN412395", mobile: "9434791234", cohort: "nonexecutive", id: 5, global_seniority_rank: 1, dates_source: "synthetic", user_id: "u-goutam" } }, ctxFor(HOD));
    const row = (await rows(`SELECT cohort, user_id, global_seniority_rank AS r FROM public.employee_roster WHERE ticket_no='412395'`))[0];
    return (r.body.result as { status: string }).status === "ok" && row.cohort === "executive" && row.user_id !== null && row.user_id !== "u-goutam" && row.r === 120000 + Number((await rows(`SELECT within_grade_position AS p FROM public.employee_roster WHERE ticket_no='412395'`))[0].p);
  })());

  // ---- THE LOGIN ACCOUNT AND THE CONTACT (step 66b) ----
  const userOf = async (t: string) => (await rows(`SELECT * FROM public."user" WHERE "ticketNo" = $1`, [t]))[0];
  const ravi = await userOf("498999");
  ok("adding an executive made his LOGIN ACCOUNT: his ticket, his name, his CUG mobile and his NIC mail in it, linked to the roster row", !!ravi && ravi.name === "RAVI KUMAR" && ravi.contactNo === "9434791234" && ravi.email === "ravi@sail.in" && (await rows(`SELECT user_id FROM public.employee_roster WHERE ticket_no='498999'`))[0].user_id === ravi.id, JSON.stringify(ravi));
  ok("...his first password is his SAIL P.No., hashed like the others (bcrypt): the P.No. opens it, anything else does not, and it is NOT stored as typed", await bcrypt.compare("B002233", ravi.password) && !(await bcrypt.compare("b002233", ravi.password)) && ravi.password !== "B002233" && /^\$2[aby]\$/.test(ravi.password));
  ok("...the stand-in login table has no sailPNo, designation or role column: only the columns that exist were written (the discovery works for the login table too)", !("sailPNo" in ravi) && !("designation" in ravi));
  const raviRec = (await store.searchEmployees(db, "498999", true))[0];
  ok("the record shows the mobile and e-mail ONLY as the search cards do (first six digits; xxxxxx and the domain), never whole", raviRec.mobileMasked === "943479xxxx" && raviRec.emailMasked === "xxxxxx@sail.in" && raviRec.hasLogin === true && !JSON.stringify(raviRec).includes("9434791234") && !JSON.stringify(raviRec).includes("ravi@sail.in"));
  const auAll = JSON.stringify(await rows(`SELECT before, after, note FROM public.facility_audit WHERE facility='employee'`));
  ok("...and the history keeps no whole mobile number or e-mail either", !auAll.includes("9434791234") && !auAll.includes("9434791235") && !auAll.includes("ravi@sail.in"));
  { // step 69b: an executive's CUG mobile is OPTIONAL when he is added (it arrives later) and in every change
    const Fm = (r: import("./types").EmployeeRecord, over: Record<string, unknown> = {}) => ({ name: r.name, gradeId: r.gradeId, departmentId: r.departmentId, sailPno: r.sailPno, address: r.address, dateOfBirth: r.dateOfBirth, dateOfJoining: r.dateOfJoining, ...over });
    const nm = await addX(HOD, { ticketNo: "412500", name: "No Mobile", gradeId: 9, departmentId: 1, mobile: "" });
    ok("an executive WITHOUT a mobile is added (it is optional; it arrives later); a non-executive without one is fine as well", nm.status === "ok" && (await addX(HOD, { ticketNo: "342500", name: "Plain Person", gradeId: 21, departmentId: 4 })).status === "ok", JSON.stringify(nm));
    if (nm.status === "ok") {
      const row = (await rows(`SELECT u."contactNo" AS c FROM public.employee_roster er JOIN public."user" u ON u.id = er.user_id WHERE er.ticket_no = '412500'`))[0];
      ok("...his login account is made with no number (empty, not a blank text), and the record shows no mobile", row && (row.c === null || row.c === "") && nm.employee.mobileMasked === "");
      const addr = await store.modifyEmployee(db, HOD, nm.employee.id, Fm(nm.employee, { address: "Ranchi Road" }), [], nm.employee.version);
      ok("...a change of another field is NOT blocked by the missing mobile; and the mobile can be added later, in a change", addr.status === "ok" && (await store.modifyEmployee(db, HOD, nm.employee.id, Fm(addr.employee, { mobile: "9434791290" }), [], addr.employee.version)).status === "ok");
      ok("...only letters typed as the mobile is refused (never silently dropped), and nothing is saved", await (async () => { const cur = (await store.getEmployee(db, nm.employee.id, true))!; const r = await store.modifyEmployee(db, HOD, nm.employee.id, Fm(cur, { mobile: "abc" }), [], cur.version); return r.status === "invalid" && !!r.errors.mobile; })());
    }
  }
  ok("an executive's mobile that is not a CUG number, a NIC mail with another domain: refused, and nothing is saved (no roster row, no login)", await (async () => { const a1 = await addX(HOD, { ticketNo: "412501", name: "Bad Mobile", gradeId: 9, departmentId: 1, mobile: "9876543210" }); const a2 = await addX(HOD, { ticketNo: "412502", name: "Bad Mail", gradeId: 9, departmentId: 1, emailNic: "x@gmail.com" }); return a1.status === "invalid" && a2.status === "invalid" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no IN ('412501','412502')`)) === 0 && (await count(`SELECT count(*) AS n FROM public."user" WHERE "ticketNo" IN ('412501','412502')`)) === 0; })());
  ok("a non-executive's ONE e-mail may be any domain: it is kept in his login account and in neither roster mail column", await (async () => { const r = await addX(HOD, { ticketNo: "342501", name: "Gmail Person", gradeId: 21, departmentId: 4, email: "Gmail.Person@gmail.com", mobile: "9876543210" }); const row = (await rows(`SELECT email_nic, webmail_saildsp FROM public.employee_roster WHERE ticket_no='342501'`))[0]; const u = await userOf("342501"); return r.status === "ok" && u.email === "gmail.person@gmail.com" && u.contactNo === "9876543210" && row.email_nic === null && row.webmail_saildsp === null; })());
  ok("...when a non-executive has the rare privilege (his one e-mail IS a SAIL address) it is also kept in the roster's NIC or web-mail column", await (async () => { await addX(HOD, { ticketNo: "342502", name: "Sail Mail One", gradeId: 21, departmentId: 4, email: "one@sail.in" }); await addX(HOD, { ticketNo: "342503", name: "Sail Mail Two", gradeId: 21, departmentId: 4, email: "two@saildsp.co.in" }); const a1 = (await rows(`SELECT email_nic, webmail_saildsp FROM public.employee_roster WHERE ticket_no='342502'`))[0], a2 = (await rows(`SELECT email_nic, webmail_saildsp FROM public.employee_roster WHERE ticket_no='342503'`))[0]; return a1.email_nic === "one@sail.in" && a1.webmail_saildsp === null && a2.webmail_saildsp === "two@saildsp.co.in" && a2.email_nic === null; })());
  ok("an e-mail that is ANOTHER login's is refused under the e-mail field and NOTHING of the addition is kept", await (async () => { const r = await addX(HOD, { ticketNo: "342504", name: "Clash Person", gradeId: 21, departmentId: 4, email: "gmail.person@gmail.com" }); return r.status === "invalid" && !!r.errors.email && /another login/.test(r.errors.email) && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='342504'`)) === 0 && (await count(`SELECT count(*) AS n FROM public."user" WHERE "ticketNo"='342504'`)) === 0; })());
  await pool.query(`INSERT INTO public."user" (id, name, "ticketNo", password, contactNo_x) VALUES ('u-old','OLD LOGIN','342505','$2a$10$existinghashexistinghashexistinghashexistinghashexistingh', 'x')`).catch(async () => { await pool.query(`INSERT INTO public."user" (id, name, "ticketNo", password) VALUES ('u-old','OLD LOGIN','342505','$2a$10$existinghashexistinghashexistinghashexistinghashexistingh')`); });
  ok("a login account that already exists for the same ticket is LINKED, not duplicated, and its password is left exactly as it was", await (async () => { const r = await addX(HOD, { ticketNo: "342505", name: "Old Login", gradeId: 21, departmentId: 4, mobile: "9123456780" }); const u = await rows(`SELECT * FROM public."user" WHERE "ticketNo"='342505'`); return r.status === "ok" && u.length === 1 && u[0].id === "u-old" && u[0].password.startsWith("$2a$10$existinghash") && u[0].contactNo === "9123456780" && (await rows(`SELECT user_id FROM public.employee_roster WHERE ticket_no='342505'`))[0].user_id === "u-old"; })());
  // changing the contact
  const ravId = raviRec.id, pwBefore = (await userOf("498999")).password;
  const mc = await modX(HOD, ravId, { name: "ravi kumar", gradeId: 9, departmentId: 2, sailPno: "B002233", emailNic: "ravi@sail.in", mobile: "9434721111", dateOfBirth: "2001-03-10", dateOfJoining: "2025-07-01" });
  ok("the HOD types a NEW mobile: the login account has it, the history says 'mobile number replaced' (and keeps no number), the password is untouched", mc.status === "ok" && (await userOf("498999")).contactNo === "9434721111" && (await userOf("498999")).password === pwBefore && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee' AND action='modify' AND note = 'mobile number replaced' AND target_ticket='498999'`)) === 1);
  ok("...an empty mobile field in a change means KEEP what is there (an executive may leave it empty when he has one)", (await modX(HOD, ravId, { name: "ravi kumar sen", gradeId: 9, departmentId: 2, sailPno: "B002233", emailNic: "ravi@sail.in", mobile: "", dateOfBirth: "2001-03-10", dateOfJoining: "2025-07-01" })).status === "ok" && (await userOf("498999")).contactNo === "9434721111");
  ok("...his login account's name follows the roster's (a change of name), the password still untouched", (await userOf("498999")).name === "RAVI KUMAR SEN" && (await userOf("498999")).password === pwBefore);
  ok("changing ONLY the mobile is a change (not 'unchanged'); typing the same number again is 'unchanged'", (await modX(HOD, ravId, { name: "ravi kumar sen", gradeId: 9, departmentId: 2, sailPno: "B002233", emailNic: "ravi@sail.in", mobile: "9434731111", dateOfBirth: "2001-03-10", dateOfJoining: "2025-07-01" })).status === "ok" && (await modX(HOD, ravId, { name: "ravi kumar sen", gradeId: 9, departmentId: 2, sailPno: "B002233", emailNic: "ravi@sail.in", mobile: "9434731111", dateOfBirth: "2001-03-10", dateOfJoining: "2025-07-01" })).status === "unchanged");
  ok("an executive's web-mail with the wrong domain in a change is refused", (await modX(HOD, ravId, { name: "ravi kumar sen", gradeId: 9, departmentId: 2, sailPno: "B002233", emailNic: "ravi@sail.in", webmail: "ravi@sail.in", mobile: "", dateOfBirth: "2001-03-10", dateOfJoining: "2025-07-01" })).status === "invalid");
  ok("an executive's NIC mail is shown masked; an EMPTY field keeps it, a typed one replaces it (the roster column and the history note 'NIC mail replaced')", (await modX(HOD, ravId, { name: "ravi kumar sen", gradeId: 9, departmentId: 2, sailPno: "B002233", emailNic: "", mobile: "", dateOfBirth: "2001-03-10", dateOfJoining: "2025-07-01" })).status === "unchanged" && (await rows(`SELECT email_nic FROM public.employee_roster WHERE id=$1`, [ravId]))[0].email_nic === "ravi@sail.in" && (await modX(HOD, ravId, { name: "ravi kumar sen", gradeId: 9, departmentId: 2, sailPno: "B002233", emailNic: "r.kumar@sail.in", mobile: "", dateOfBirth: "2001-03-10", dateOfJoining: "2025-07-01" })).status === "ok" && (await rows(`SELECT email_nic FROM public.employee_roster WHERE id=$1`, [ravId]))[0].email_nic === "r.kumar@sail.in" && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee' AND action='modify' AND note LIKE '%NIC mail replaced%'`)) === 1);
  ok("a person with NO login who is given a mobile gets one (it needs his P.No.): a change without a P.No. is refused in words", await (async () => { const p = (await store.searchEmployees(db, "342500", true))[0]; const noP = await modX(HOD, p.id, { name: "plain person", gradeId: 21, departmentId: 4, mobile: "9876500000" }); return noP.status === "invalid" && !!noP.errors.sailPno && (await count(`SELECT count(*) AS n FROM public."user" WHERE "ticketNo"='342500'`)) === 1; })());

  // ---- TWO PEOPLE AT ONCE: the guard against a LOST UPDATE (step 67b, src/lib/concurrency/version.ts) ----
  type Rec = NonNullable<Awaited<ReturnType<typeof store.getEmployee>>>;
  const F = (r: Rec, over: Record<string, unknown> = {}) => ({ name: r.name, gradeId: r.gradeId, departmentId: r.departmentId, sailPno: r.sailPno, address: r.address, dateOfBirth: r.dateOfBirth, dateOfJoining: r.dateOfJoining, ...over });
  const person = async (ticket: string, name: string, over: Record<string, unknown> = {}): Promise<Rec> => { const r = await addX(HOD, { ticketNo: ticket, name, gradeId: 9, departmentId: 1, ...over }); if (r.status !== "ok") throw new Error(`could not add ${name}: ${JSON.stringify(r)}`); return (await store.getEmployee(db, r.employee.id, true))!; };
  const addressOf = async (id: number) => (await rows(`SELECT address FROM public.employee_roster WHERE id=$1`, [id]))[0]?.address as string | null;
  const modifies = async (id: number) => count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee' AND target_id = ${id} AND action = 'modify'`);

  // the lost update that used to happen
  const P1 = await person("412601", "Conc Person One");
  const a1 = await store.modifyEmployee(db, HOD, P1.id, F(P1, { address: "A's address", gradeId: 10 }), [], P1.version);
  ok("A changes the record (a new designation and an address): it is saved, and the record has a NEW version", a1.status === "ok" && a1.employee.version !== P1.version && a1.employee.gradeId === 10);
  const bStale = await store.modifyEmployee(db, HOD, P1.id, F(P1, { address: "B's address" }), [], P1.version);
  ok("B, whose form is out of date (it still holds the OLD designation), saves: REFUSED as stale, with the record as it is now", bStale.status === "stale" && bStale.current.gradeId === 10 && bStale.current.address === "A's address" && bStale.current.version === (a1.status === "ok" ? a1.employee.version : ""));
  ok("...NOTHING of B's was written: A's designation and address are exactly as A left them (B's save used to put the old designation back)", (await store.getEmployee(db, P1.id, true))!.gradeId === 10 && (await addressOf(P1.id)) === "A's address");
  ok("...and no history line was written for B (only A's change is there)", (await modifies(P1.id)) === 1);
  ok("...the answer says WHO changed it and WHEN (the last change the manager recorded), and tells no value", bStale.status === "stale" && bStale.last?.actorName === HOD.name && bStale.last?.actorTicket === "400001" && bStale.last?.action === "modify" && !Number.isNaN(Date.parse(bStale.last?.at ?? "")) && Object.keys(bStale.last ?? {}).sort().join() === "action,actorName,actorTicket,at");
  const reloaded = (await store.getEmployee(db, P1.id, true))!;
  const bOk = await store.modifyEmployee(db, HOD, P1.id, F(reloaded, { address: "B's address" }), [], reloaded.version);
  ok("B loads the record again and saves: it works, A's designation is kept, and the version moves on", bOk.status === "ok" && bOk.employee.gradeId === 10 && bOk.employee.address === "B's address" && bOk.employee.version !== reloaded.version);
  ok("a save with NO version, or a made-up one, is refused the same way and writes nothing", await (async () => { const cur = (await store.getEmployee(db, P1.id, true))!; const r1 = await store.modifyEmployee(db, HOD, P1.id, F(cur, { address: "no version" }), []); const r2 = await store.modifyEmployee(db, HOD, P1.id, F(cur, { address: "made up" }), [], "AAAAAAAAAAAAAAAAAAAAAA"); const r3 = await store.modifyEmployee(db, HOD, P1.id, F(cur, { address: "other kind" }), [], "' OR 1=1 --"); return r1.status === "stale" && r2.status === "stale" && r3.status === "stale" && (await addressOf(P1.id)) === "B's address"; })());

  // the delete
  const P2 = await person("412602", "Conc Person Two");
  await store.modifyEmployee(db, HOD, P2.id, F(P2, { address: "changed meanwhile" }), [], P2.version);
  const dStale = await store.deleteEmployee(db, HOD, P2.id, { confirmTicket: "412602", removeLogin: true, version: P2.version });
  ok("a DELETE of a person who was changed since the HOD saw him is refused (stale): he is still on the roll and still has his login, and the HOD is shown him as he is now", dStale.status === "stale" && dStale.current.address === "changed meanwhile" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE id=${P2.id}`)) === 1 && (await count(`SELECT count(*) AS n FROM public."user" WHERE "ticketNo"='412602'`)) === 1);
  ok("...after looking again (the current version) the delete goes through", (await store.deleteEmployee(db, HOD, P2.id, { confirmTicket: "412602", removeLogin: true, version: dStale.status === "stale" ? dStale.current.version : "" })).status === "ok");
  ok("a delete with no version is refused too", await (async () => { const p = await person("412603", "Conc Person Three"); const r = await store.deleteEmployee(db, HOD, p.id, { confirmTicket: "412603", removeLogin: false }); return r.status === "stale" && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE id=${p.id}`)) === 1; })());

  // the very same moment
  const P3 = await person("412604", "Conc Person Four");
  const sameMoment = await Promise.all([
    store.modifyEmployee(db, HOD, P3.id, F(P3, { address: "first writer" }), [], P3.version),
    store.modifyEmployee(db, ANIL_D, P3.id, F(P3, { address: "second writer" }), [], (await store.getEmployee(db, P3.id, false))!.version),
  ]);
  const winners = sameMoment.filter((r) => r.status === "ok").length, losers = sameMoment.filter((r) => r.status === "stale").length;
  ok("TWO saves of the same version at the very same moment (two connections): exactly ONE is saved, the other is refused as stale", winners === 1 && losers === 1, JSON.stringify(sameMoment.map((r) => r.status)));
  ok("...the record holds the winner's text whole (never a mixture), and exactly one history line was written", (await addressOf(P3.id)) === (sameMoment[0].status === "ok" ? "first writer" : "second writer") && (await modifies(P3.id)) === 1);
  const P4 = await person("412605", "Conc Person Five");
  const raceDel = await Promise.all([
    store.modifyEmployee(db, HOD, P4.id, F(P4, { address: "late edit" }), [], P4.version),
    store.deleteEmployee(db, HOD, P4.id, { confirmTicket: "412605", removeLogin: false, version: P4.version }),
  ]);
  const left = await count(`SELECT count(*) AS n FROM public.employee_roster WHERE id=${P4.id}`);
  ok("a change and a delete at the same moment: one wins and the other is told (a delete first, then 'missing'; a change first, then 'stale'): never both", (raceDel[1].status === "ok" && raceDel[0].status === "missing" && left === 0) || (raceDel[0].status === "ok" && raceDel[1].status === "stale" && left === 1), JSON.stringify(raceDel.map((r) => r.status)));
  const WORDS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
  const fivePeople: Rec[] = [];
  for (let i = 0; i < 5; i++) fivePeople.push(await person(`41262${i + 1}`, `Parallel Person ${WORDS[i]}`));
  const five = await Promise.all(fivePeople.map((p) => store.modifyEmployee(db, HOD, p.id, F(p, { address: `parallel ${p.ticketNo}` }), [], p.version)));
  ok("five DIFFERENT people changed at the same moment: all five are saved (the guard makes only the same record wait), and none is lost", five.every((r) => r.status === "ok") && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE address LIKE 'parallel 41262%'`)) === 5);

  // a writer that does not know our lock (a SQL script)
  const P5 = await person("412606", "Conc Person Six");
  const script = await pool.connect();
  await script.query("BEGIN"); await script.query(`UPDATE public.employee_roster SET address = 'sql script' WHERE id = $1`, [P5.id]);
  let settled = false;
  const blocked = store.modifyEmployee(db, HOD, P5.id, F(P5, { address: "my edit" }), [], P5.version).then((r) => { settled = true; return r; });
  await new Promise((r) => setTimeout(r, 400));
  const stillWaiting = !settled;
  await script.query("COMMIT"); script.release();
  const afterScript = await blocked;
  ok("a writer that does NOT know our lock (a SQL script with a change not yet committed): the save WAITS for it (the row is locked), and when the script has committed the save is refused as stale: the script's change is NOT overwritten", stillWaiting && afterScript.status === "stale" && (await addressOf(P5.id)) === "sql script", `${stillWaiting} ${afterScript.status}`);
  ok("...and the version now reflects the script's change (the token is of the CONTENT, so a change by anything is seen)", afterScript.status === "stale" && afterScript.current.address === "sql script");

  // what the token covers
  const P6 = await person("412607", "Conc Person Seven", { mobile: "9434791500" });
  await rows(`UPDATE public."user" SET "contactNo" = '9434791501' WHERE "ticketNo" = '412607'`);
  ok("a change of the LOGIN account's mobile (shown only masked) by another route makes the version stale: the token covers the real number", (await store.modifyEmployee(db, HOD, P6.id, F(P6, { address: "x" }), [], P6.version)).status === "stale");
  const P7 = await person("412608", "Conc Person Eight");
  const hodDate = await store.modifyEmployee(db, HOD, P7.id, F(P7, { dateOfBirth: "1980-05-05" }), [], P7.version);
  const delegateSaw = (await store.getEmployee(db, P7.id, false))!;
  ok("the HOD changes ONLY a date: an executive who opened the record WITHOUT dates still has a valid version (he cannot see it, it does not concern him)", hodDate.status === "ok" && delegateSaw.dateOfBirth === "" && delegateSaw.version === (await store.getEmployee(db, P7.id, false))!.version);
  const P8 = await person("412609", "Conc Person Nine");
  const delegateV = (await store.getEmployee(db, P8.id, false))!.version;
  await store.modifyEmployee(db, HOD, P8.id, F(P8, { dateOfBirth: "1981-06-06" }), [], P8.version);
  const delegateSave = await store.modifyEmployee(db, ANIL_D, P8.id, { name: P8.name, gradeId: P8.gradeId, departmentId: P8.departmentId, sailPno: P8.sailPno, address: "delegate's address" }, [], delegateV);
  ok("...so the executive's save, made after the HOD changed only a date, goes through and does not touch the date; the HOD's own old version would have been refused", delegateSave.status === "ok" && (await rows(`SELECT date_of_birth::text AS d FROM public.employee_roster WHERE id=$1`, [P8.id]))[0].d === "1981-06-06" && (await store.modifyEmployee(db, HOD, P8.id, F(P8, { address: "hod late" }), [], P8.version)).status === "stale");
  ok("what a refused DELEGATE is shown has no date at all (the record as HE may see it), only who and when", await (async () => { const p = await person("412610", "Conc Person Ten", {}); await store.modifyEmployee(db, HOD, p.id, F(p, { address: "x1", dateOfBirth: "1979-07-07" }), [], p.version); const r = await store.modifyEmployee(db, ANIL_D, p.id, { name: p.name, gradeId: p.gradeId, departmentId: p.departmentId, sailPno: p.sailPno, address: "y" }, [], (await store.getEmployee(db, p.id, false))!.version.replace(/.$/, "A")); return r.status === "stale" && r.current.dateOfBirth === "" && r.current.datesVisible === false && !JSON.stringify(r).includes("1979-07-07"); })());
  ok("the version is NOT in the history: only the person's own values are (nothing to replay)", !JSON.stringify(await rows(`SELECT before, after FROM public.facility_audit WHERE facility='employee'`)).includes(P1.version));

  // two people adding the same person at the same moment
  const twins = await Promise.all([
    addX(HOD, { ticketNo: "412630", name: "Twin Person", gradeId: 9, departmentId: 1 }),
    addX(ANIL_D, { ticketNo: "412631", name: "Twin Person", gradeId: 9, departmentId: 1 }),
  ]);
  ok("two people add the SAME name in the SAME department at the same moment: one is saved and the other is asked 'is this a different person?' (the check and the write cannot be separated)", twins.filter((r) => r.status === "ok").length === 1 && twins.filter((r) => r.status === "conflict").length === 1 && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE name = 'TWIN PERSON'`)) === 1, JSON.stringify(twins.map((r) => r.status)));

  // ---- A ROSTER WHOSE id HAS NO AUTOMATIC NUMBERING, as the live one (owner's log, 1 Nov 2026: "null value in column id ... violates not-null constraint") ----
  const idDefault = (await rows(`SELECT column_default AS d FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_roster' AND column_name='id'`))[0].d as string | null;
  await rows(`ALTER TABLE public.employee_roster ALTER COLUMN id DROP DEFAULT`);
  const maxId = async () => Number((await rows(`SELECT max(id) AS m FROM public.employee_roster`))[0].m);
  const before0 = await maxId();
  const noDef = await addX(HOD, { ticketNo: "342701", name: "No Default One", gradeId: 21, departmentId: 4 });
  ok("a roster whose id has NO default: the person is added (it used to fail with 'null value in column id'), with the NEXT id (highest plus one)", noDef.status === "ok" && noDef.employee.id === before0 + 1, JSON.stringify(noDef));
  const twoAtOnce = await Promise.all([addX(HOD, { ticketNo: "342702", name: "No Default Two", gradeId: 21, departmentId: 4 }), addX(ANIL_D, { ticketNo: "342703", name: "No Default Three", gradeId: 21, departmentId: 4 })]);
  ok("...two people added at the same moment both succeed and get DIFFERENT ids, one after the other", twoAtOnce.every((r) => r.status === "ok") && new Set(twoAtOnce.map((r) => (r.status === "ok" ? r.employee.id : 0))).size === 2, JSON.stringify(twoAtOnce.map((r) => r.status)));
  const scriptRow = await pool.connect();
  const nextForScript = (await maxId()) + 1;
  await scriptRow.query("BEGIN");
  await scriptRow.query(`INSERT INTO public.employee_roster (id, ticket_no, name, designation_grade_id, sail_department_id, cohort, within_grade_position, global_seniority_rank, source_snapshot_date) VALUES ($1, '342799', 'SCRIPT PERSON', 21, 4, 'nonexecutive', 9000, 159000, '2026-09-26')`, [nextForScript]);
  let addDone = false;
  const addWaiting = addX(HOD, { ticketNo: "342704", name: "No Default Four", gradeId: 21, departmentId: 4 }).then((r) => { addDone = true; return r; });
  await new Promise((r) => setTimeout(r, 400));
  const waited = !addDone;
  await scriptRow.query("COMMIT"); scriptRow.release();
  const afterScriptAdd = await addWaiting;
  ok("a SQL script inserting a row at the same moment (its row not yet committed): the add WAITS for it and then takes the NEXT id after it: no collision, nothing lost", waited && afterScriptAdd.status === "ok" && afterScriptAdd.employee.id === nextForScript + 1 && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no = '342799'`)) === 1, `${waited} ${JSON.stringify(afterScriptAdd)}`);
  ok("...and the new person's login is linked as usual", noDef.status === "ok" && (await rows(`SELECT user_id FROM public.employee_roster WHERE id = $1`, [noDef.employee.id]))[0].user_id !== null);
  if (idDefault) await rows(`ALTER TABLE public.employee_roster ALTER COLUMN id SET DEFAULT ${idDefault}`);
  if (idDefault) await rows(`SELECT setval(pg_get_serial_sequence('public.employee_roster', 'id'), (SELECT max(id) FROM public.employee_roster))`); // the counter moves past the ids made by hand, as a real restore would
  const withDef = await addX(HOD, { ticketNo: "342705", name: "With Default Five", gradeId: 21, departmentId: 4 });
  ok("a roster whose id DOES number itself is left alone: the add takes the id the table gives (no table lock, no hand-made id)", idDefault !== null && withDef.status === "ok");

  // ---- REMEMBERING THE TABLE LAYOUT AND THE CODE LISTS (step 67d) ----
  // a database wrapper that COUNTS what it sends: the layout reads (information_schema) and the reads of the designations and departments
  const counting = (key?: object) => {
    const n = { all: 0, layout: 0, lists: 0 };
    const d: import("./store").EmpDb = { ...(key ? { cacheKey: key } : {}), run: (fn) => db.run((q) => fn(async (sql, params) => { n.all++; if (/information_schema\.columns/.test(sql)) n.layout++; if (/FROM public\.(designation_grade|sail_department)\b/.test(sql)) n.lists++; return q(sql, params); })) };
    return { n, d };
  };
  const snapshot = (n: { all: number; layout: number; lists: number }) => ({ ...n });
  const saveAs = async (d: import("./store").EmpDb, p: Rec, over: Record<string, unknown>, version: string) => store.modifyEmployee(d, HOD, p.id, F(p, over), [], version);
  const KEY = {}, c1 = counting(KEY);
  const M1 = await person("412801", "Memory Person One");
  const memSave1 = await saveAs(c1.d, M1, { address: "first save" }, M1.version);
  const after1 = snapshot(c1.n);
  const memSave2 = memSave1.status === "ok" ? await saveAs(c1.d, M1, { address: "second save" }, memSave1.employee.version) : memSave1;
  const after2 = snapshot(c1.n);
  ok("the FIRST save reads the table layout and the two code lists from the database", memSave1.status === "ok" && after1.layout >= 1 && after1.lists === 2, JSON.stringify(after1));
  ok("the SECOND save reads NEITHER (they are remembered): no layout read, no read of the designations or departments", memSave2.status === "ok" && after2.layout === after1.layout && after2.lists === after1.lists, JSON.stringify(after2));
  ok("...so it sends at least THREE queries fewer to the database than the first (one for the layout, two for the lists)", after1.all - (after2.all - after1.all) >= 3 && (after2.all - after1.all) < after1.all, `${after1.all} then ${after2.all - after1.all}`);
  ok("...and the save is right all the same (both texts were saved in turn)", (await addressOf(M1.id)) === "second save");
  const c0 = counting();
  const M2 = await person("412802", "Memory Person Two");
  await saveAs(c0.d, M2, { address: "a" }, M2.version); const z1 = c0.n.layout;
  await saveAs(c0.d, M2, { address: "b" }, (await store.getEmployee(db, M2.id, true))!.version); const z2 = c0.n.layout;
  ok("a wrapper WITHOUT a key remembers nothing: every call reads the layout again (so the other tests, and any other use, are unchanged)", z1 >= 1 && z2 > z1);
  const c2 = counting({});
  await store.searchEmployees(c2.d, "412801", true); await store.searchEmployees(c2.d, "412801", true); await store.getEmployee(c2.d, M1.id, true);
  ok("the memory is PER DATABASE (a connection of its own has its own): a second key reads the layout itself, once; a search and a read afterwards use it", c2.n.layout === 1, JSON.stringify(c2.n));

  // it expires
  const realNow = store.schemaMemory.now;
  store.schemaMemory.now = () => realNow() + 6 * 60 * 1000;
  const beforeExpiry = snapshot(c1.n);
  const cur1 = (await store.getEmployee(db, M1.id, true))!;
  await saveAs(c1.d, M1, { address: "after expiry" }, cur1.version);
  store.schemaMemory.now = realNow;
  ok("after FIVE minutes the memory has expired: the next save reads the layout and the lists again", c1.n.layout === beforeExpiry.layout + 1 && c1.n.lists === beforeExpiry.lists + 2, JSON.stringify([beforeExpiry, c1.n]));
  ok("...and then it is remembered again (the save after that reads nothing)", await (async () => { const b = snapshot(c1.n); const cur = (await store.getEmployee(db, M1.id, true))!; await saveAs(c1.d, M1, { address: "again" }, cur.version); return c1.n.layout === b.layout && c1.n.lists === b.lists; })());
  const bForget = snapshot(c1.n);
  store.schemaMemory.clear(c1.d);
  await saveAs(c1.d, M1, { address: "after clear" }, (await store.getEmployee(db, M1.id, true))!.version);
  ok("the memory can be cleared by hand (clear): the next save reads again", c1.n.layout === bForget.layout + 1 && c1.n.lists === bForget.lists + 2);

  // opening a panel always reads fresh
  await saveAs(c1.d, M1, { address: "warm" }, (await store.getEmployee(db, M1.id, true))!.version);
  await rows(`INSERT INTO public.designation_grade (id, code, title, track, rank_order) VALUES (977, 410, 'Memory Probe', 'nonexec', 30)`);
  const bOpen = snapshot(c1.n);
  const listed = await store.lookups(c1.d);
  ok("opening a panel (the lookups request) reads the lists FRESH even while the memory is valid: a designation added a moment ago by a script is on the screen at once", listed.grades.some((g) => g.title === "Memory Probe") && c1.n.layout === bOpen.layout + 1 && c1.n.lists === bOpen.lists + 2, JSON.stringify([bOpen, c1.n]));
  ok("...and what that read found is what the saves use afterwards (nothing more to read)", await (async () => { const b = snapshot(c1.n); await saveAs(c1.d, M1, { address: "after open" }, (await store.getEmployee(db, M1.id, true))!.version); return c1.n.layout === b.layout && c1.n.lists === b.lists; })());

  // a designation added behind the memory's back
  await rows(`INSERT INTO public.designation_grade (id, code, title, track, rank_order) VALUES (978, 411, 'Memory Probe Two', 'nonexec', 31)`);
  const healed = await store.addEmployee(c1.d, HOD, full({ ticketNo: "342811", name: "Healed Person", gradeId: 978, departmentId: 4 }));
  ok("a designation ADDED by a script after the lists were remembered: a save using it is NOT refused (the refusal is checked against the real list once): the person is added", healed.status === "ok" && healed.employee.gradeId === 978, JSON.stringify(healed));
  ok("...and the real list is remembered from then on (the next save with it reads nothing)", await (async () => { const b = snapshot(c1.n); const r = await store.addEmployee(c1.d, HOD, full({ ticketNo: "342812", name: "Healed Person Two", gradeId: 978, departmentId: 4 })); return r.status === "ok" && c1.n.lists === b.lists; })());
  ok("a designation that does NOT exist anywhere is still refused (the check against the real list does not let anything through): it says so, and nothing is written", await (async () => { const r = await store.addEmployee(c1.d, HOD, full({ ticketNo: "342813", name: "Nobody Grade", gradeId: 9999, departmentId: 4 })); return r.status === "invalid" && !!r.errors.gradeId && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='342813'`)) === 0; })());

  // a designation removed behind the memory's back
  await rows(`DELETE FROM public.employee_roster WHERE ticket_no IN ('342811', '342812')`);
  await rows(`DELETE FROM public.designation_grade WHERE id = 978`);
  const gone = await store.addEmployee(c1.d, HOD, full({ ticketNo: "342814", name: "Gone Grade", gradeId: 978, departmentId: 4 }));
  ok("a designation REMOVED after the lists were remembered: the database refuses it, and the answer is a clear message (not a crash), and nothing is half written", gone.status === "invalid" && /has just changed/.test(gone.errors.form ?? "") && (await count(`SELECT count(*) AS n FROM public.employee_roster WHERE ticket_no='342814'`)) === 0 && (await count(`SELECT count(*) AS n FROM public."user" WHERE "ticketNo"='342814'`)) === 0, JSON.stringify(gone));
  ok("...the memory was cleared by that: the same try again is now an ordinary refusal against the real list", await (async () => { const r = await store.addEmployee(c1.d, HOD, full({ ticketNo: "342814", name: "Gone Grade", gradeId: 978, departmentId: 4 })); return r.status === "invalid" && !!r.errors.gradeId; })());
  await rows(`DELETE FROM public.designation_grade WHERE id = 977`);
  store.schemaMemory.clear(c1.d);
  const nodeFs = await import("node:fs");
  const accessSrc = nodeFs.readFileSync("src/lib/employees/admin/access.ts", "utf8");
  ok("the production wrapper carries the shared database connection as the memory's key (a new wrapper is made for every request, the connection is what stays), and it is the employee manager's own (the PAX editor's is not touched)", /export const typeormEmpDb = \(ds: DataSource\): EmpDb => \(\{\s*cacheKey: ds,/.test(accessSrc) && !/typeormPaxDb as typeormEmpDb/.test(accessSrc));
  ok("only the layout and the codes and titles are remembered, never anything about a person (the memory holds nothing but the table layout and the two lists)", /interface Remembered \{ cols\?: \{ v: Cols; at: number \}; lookups\?: \{ v: Lookups; at: number \} \}/.test(nodeFs.readFileSync("src/lib/employees/admin/store.ts", "utf8")));

  // ---- a roster whose optional columns differ ----
  await pool.query(`ALTER TABLE public.employee_roster DROP COLUMN address CASCADE, DROP COLUMN webmail_saildsp CASCADE, DROP COLUMN doctor_override CASCADE`);
  const slim = await addX(HOD, { ticketNo: "412392", name: "Slim Table", gradeId: 9, departmentId: 1, address: "ignored", webmail: "a@saildsp.co.in", doctor: true });
  ok("a roster WITHOUT the address, web-mail and doctor columns: add still works (those fields are simply not stored), the record shows them empty", slim.status === "ok" && slim.employee.address === "" && slim.employee.webmail === "" && slim.employee.doctor === null);
  const slimMod = slim.status === "ok" ? await modX(HOD, slim.employee.id, { name: "Slim Table Two", gradeId: 9, departmentId: 1, sailPno: "PN412392" }) : null;
  ok("...and a change still works", slimMod?.status === "ok");
  await pool.query(`ALTER TABLE public.employee_roster ADD COLUMN address text, ADD COLUMN webmail_saildsp text, ADD COLUMN doctor_override boolean`);
  const withDoc = await addX(HOD, { ticketNo: "412393", name: "Doc Tor", gradeId: 10, departmentId: 1, doctor: true });
  ok("with the doctor column back, the flag is stored (a doctor with an ordinary designation)", withDoc.status === "ok" && withDoc.employee.doctor === true);

  // ---- STEP 68b: the employee manager lives on the shared kit (src/lib/facility) ----
  ok("the employee manager no longer writes to its OLD tables: after everything above they hold nothing, and the shared tables hold the history", (await count(`SELECT count(*) AS n FROM public.employee_admin_delegate`)) === 0 && (await count(`SELECT count(*) AS n FROM public.employee_admin_audit`)) === 0 && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee'`)) > 10);
  await rows(`INSERT INTO public.facility_delegate (facility, ticket_no, name, granted_by_ticket, granted_by_name) VALUES ('employee', '412777', 'SQL GRANTED', '400001', 'HOD'), ('pax', '412778', 'ONLY PAX', '400001', 'HOD')`);
  ok("a row in the shared table is enough: an executive authorised there for the employee manager IS a delegate at once; one authorised only for the PAX editor is NOT", (await db.run((x) => store.authorityOf(x, "412777"))) === "delegate" && (await db.run((x) => store.authorityOf(x, "412778"))) === null);
  await rows(`UPDATE public.facility_delegate SET revoked_at = now(), revoked_by_ticket = '400001', revoked_by_name = 'HOD' WHERE ticket_no = '412777'`);
  ok("...and withdrawn there is withdrawn at once", (await db.run((x) => store.authorityOf(x, "412777"))) === null);
  const storeSrc = readFileSync(join(process.cwd(), "src/lib/employees/admin/store.ts"), "utf8");
  ok("the store names no old table, keeps no lock words of its own, and takes its lock, its authority and the withdrawal on deletion through the shared kit (one Forbidden for all)", !/employee_admin_(delegate|audit)/.test(storeSrc) && !/const LOCK\b/.test(storeSrc) && /sharedBegin\(q, "employee", actor, needHod\)/.test(storeSrc) && /sharedAuthorityOf\(q, "employee", ticket\)/.test(storeSrc) && /export \{ Forbidden \}/.test(storeSrc) && /revokeEverywhere\(q, actor, role, cur\.ticketNo/.test(storeSrc));
  { // deleting a delegate withdraws his authority in EVERY tool (owner's decision, 2 Nov 2026; step 68d): one history line in each tool
    const dd = await addX(HOD, { ticketNo: "412880", name: "Double Delegate", gradeId: 9, departmentId: 1 });
    ok("(set-up) an executive is added, authorised for the employee manager (by the HOD) and for the PAX editor (by a script)", dd.status === "ok" && (await store.grantDelegate(db, HOD, { ticket: "412880", name: "DOUBLE DELEGATE" })).status === "ok" && (await rows(`INSERT INTO public.facility_delegate (facility, ticket_no, name, granted_by_ticket, granted_by_name) VALUES ('pax', '412880', 'DOUBLE DELEGATE', '400001', 'HOD') RETURNING id`)).length === 1);
    if (dd.status === "ok") {
      const del = await delX(HOD, dd.employee.id, { confirmTicket: "412880", removeLogin: true });
      ok("deleting him withdraws his authority in the employee manager AND in the PAX editor, with a history line in EACH tool saying why", del.status === "ok" && (await db.run((x) => store.authorityOf(x, "412880"))) === null && (await count(`SELECT count(*) AS n FROM public.facility_delegate WHERE ticket_no='412880' AND revoked_at IS NULL`)) === 0 && (await count(`SELECT count(*) AS n FROM public.facility_delegate WHERE ticket_no='412880' AND revoked_at IS NOT NULL`)) === 2 && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee' AND action='revoke' AND target_ticket='412880' AND note LIKE 'deleted%'`)) === 1 && (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='pax' AND action='revoke' AND target_ticket='412880' AND note LIKE 'deleted%'`)) === 1);
      ok("...and a delegate of a tool who is NOT deleted keeps every authority he has (only the deleted person's go)", (await db.run((x) => store.authorityOf(x, "412777"))) === null && (await count(`SELECT count(*) AS n FROM public.facility_delegate WHERE ticket_no='412778' AND revoked_at IS NULL`)) === 1);
    }
  }
  // ---- STEP 69c: authorising a NON-EXECUTIVE through the request (the HOD confirms) ----
  { const target = (await rows(`SELECT ticket_no, name FROM public.employee_roster WHERE ticket_no = '342500'`))[0];
    const n0 = await count(`SELECT count(*) AS n FROM public.facility_delegate WHERE facility='employee'`);
    const ask = await handleEmployeeAdmin({ op: "grant", ticket: "342500" }, ctxFor(HOD));
    ok("a request to authorise a non-executive WITHOUT the confirmation gets the question back and writes nothing", !!target && ask.status === 200 && (ask.body.result as { status: string }).status === "needs-confirmation" && (await count(`SELECT count(*) AS n FROM public.facility_delegate WHERE facility='employee'`)) === n0);
    const yes = await handleEmployeeAdmin({ op: "grant", ticket: "342500", confirmNonExecutive: true }, ctxFor(HOD));
    ok("...WITH the confirmation he is authorised (his name from the roster), the list marks him, and he can add employees at once", (yes.body.result as { status: string }).status === "ok" && ((await handleEmployeeAdmin({ op: "delegates" }, ctxFor(HOD))).body.delegates as Array<{ ticket: string; nonExecutive?: boolean }>).some((d) => d.ticket === "342500" && d.nonExecutive === true) && (await addX({ ticket: "342500", name: "PLAIN PERSON" }, { ticketNo: "342951", name: "Added By Nonexec", gradeId: 21, departmentId: 4 })).status === "ok");
    const hs = (await store.recentAudit(db, 8)).find((x) => /Authorised PLAIN PERSON/.test(x.summary));
    ok("...the history says so in words ('non-executive, confirmed')", !!hs && /\(non-executive, confirmed\)$/.test(hs.summary), JSON.stringify(hs));
    ok("a non-executive delegate cannot delete, authorise or see dates, like any delegate (the HOD's requests give 403)", (await handleEmployeeAdmin({ op: "grant", ticket: "412346", confirmNonExecutive: true }, ctxFor({ ticket: "342500", name: "PLAIN PERSON" }))).status === 403 && (await handleEmployeeAdmin({ op: "revoke", ticket: "342500" }, ctxFor({ ticket: "342500", name: "PLAIN PERSON" }))).status === 403);
    ok("withdrawing him works like anybody's", ((await handleEmployeeAdmin({ op: "revoke", ticket: "342500" }, ctxFor(HOD))).body.result as { status: string }).status === "ok" && (await db.run((x) => store.authorityOf(x, "342500"))) === null);
  }
  // ---- STEP 70: the photo (requests, storage, history, deletion) ----
  { const { handlePhotoPost, handlePhotoGet } = await import("../photo/api");
    const { memoryStorage } = await import("../photo/storage");
    const sharp = (await import("sharp")).default;
    const storage = memoryStorage();
    const pctx = (actor: { ticket: string; name: string } | null, st = storage) => ({ actor, db, storage: st });
    const target = await addX(HOD, { ticketNo: "342700", name: "Photo Person", gradeId: 21, departmentId: 4 });
    const pid = target.status === "ok" ? target.employee.id : 0;
    const jpeg = await sharp({ create: { width: 700, height: 700, channels: 3, background: { r: 120, g: 90, b: 70 } } }).jpeg().toBuffer();
    const form = (fields: Record<string, string>, file?: Buffer) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); if (file) f.set("file", new Blob([new Uint8Array(file)], { type: "image/jpeg" }), "p.jpg"); return f; };
    const rowsOfPhoto = async () => rows(`SELECT * FROM public.employee_photo WHERE employee_id = ${pid}`);
    const STRANGER = { ticket: "999999", name: "STRANGER" };
    ok("(set-up) a person is added", target.status === "ok" && pid > 0);
    ok("nobody logged in: 401; a stranger with no authority: 403; nothing is stored in either case", (await handlePhotoPost(form({ op: "upload", id: String(pid) }, jpeg), pctx(null))).status === 401 && (await handlePhotoPost(form({ op: "upload", id: String(pid) }, jpeg), pctx(STRANGER))).status === 403 && storage.urls().length === 0 && (await rowsOfPhoto()).length === 0);
    ok("a bad request (no id, a wrong op, no form) is 400", (await handlePhotoPost(form({ op: "upload" }, jpeg), pctx(HOD))).status === 400 && (await handlePhotoPost(form({ op: "explode", id: String(pid) }), pctx(HOD))).status === 400 && (await handlePhotoPost(null, pctx(HOD))).status === 400);
    const up = await handlePhotoPost(form({ op: "upload", id: String(pid) }, jpeg), pctx(HOD));
    ok("the HOD uploads: ok, version 1; two pictures in the store (large and small); one row; the addresses are NOT in the reply", up.status === 200 && (up.body.result as { status: string; version: number }).status === "ok" && (up.body.result as { version: number }).version === 1 && storage.urls().length === 2 && (await rowsOfPhoto()).length === 1 && !JSON.stringify(up.body).includes("memory://"));
    ok("...the history has a 'photo' line of the employee manager with who did it, whom it is about and 'changed' (never a picture)", (await count(`SELECT count(*) AS n FROM public.facility_audit WHERE facility='employee' AND action='photo' AND target_id = ${pid} AND target_ticket='342700' AND note='changed' AND actor_ticket='400001' AND before IS NULL AND after IS NULL`)) === 1);
    const meta = await handlePhotoGet(new URLSearchParams({ id: String(pid), meta: "1" }), pctx(STRANGER));
    ok("ANYBODY logged in may ask for the version and see the picture (owner's decision), even with no authority; not logged in: 401", (meta.json as { version: number }).version === 1 && (await handlePhotoGet(new URLSearchParams({ id: String(pid), size: "thumb" }), pctx(STRANGER))).status === 200 && (await handlePhotoGet(new URLSearchParams({ id: String(pid), size: "thumb" }), pctx(null))).status === 401);
    const thumb = await handlePhotoGet(new URLSearchParams({ id: String(pid), size: "thumb" }), pctx(STRANGER));
    const master = await handlePhotoGet(new URLSearchParams({ id: String(pid), size: "master" }), pctx(STRANGER));
    ok("the small picture is 160 x 160 and the large one 700 (not enlarged), both JPEG; the browser may keep them for good (immutable) and the version is the tag", thumb.bytes !== undefined && (await sharp(thumb.bytes!).metadata()).width === 160 && (await sharp(master.bytes!).metadata()).width === 700 && /immutable/.test(thumb.headers["Cache-Control"]) && thumb.headers["Content-Type"] === "image/jpeg" && thumb.headers.ETag === `"${pid}-1-thumb"`);
    ok("asking again with the tag: 304 and no picture; a person with no photo: 404; no id: 400", (await handlePhotoGet(new URLSearchParams({ id: String(pid), size: "thumb" }), pctx(STRANGER), `"${pid}-1-thumb"`)).status === 304 && (await handlePhotoGet(new URLSearchParams({ id: "9999999" }), pctx(STRANGER))).status === 404 && (await handlePhotoGet(new URLSearchParams({}), pctx(STRANGER))).status === 400);
    await store.grantDelegate(db, HOD, { ticket: "412345", name: "RAKESH OJHA" }).catch(() => undefined);
    const again = await handlePhotoPost(form({ op: "upload", id: String(pid) }, jpeg), pctx({ ticket: "412345", name: "RAKESH OJHA" }));
    ok("an authorised delegate may replace it: version 2, and the old pictures are deleted from the store (two files, not four)", (again.body.result as { status: string; version: number }).status === "ok" && (again.body.result as { version: number }).version === 2 && storage.urls().length === 2);
    const before = storage.urls().length;
    const notPic = await handlePhotoPost(form({ op: "upload", id: String(pid) }, Buffer.from("this is not a picture")), pctx(HOD));
    const flat = await sharp({ create: { width: 800, height: 500, channels: 3, background: { r: 1, g: 1, b: 1 } } }).jpeg().toBuffer();
    const notSquare = await handlePhotoPost(form({ op: "upload", id: String(pid) }, flat), pctx(HOD));
    ok("a file that is not a picture, and one that is not square: refused with the reason; nothing stored, the photo still version 2", (notPic.body.result as { status: string }).status === "invalid" && (notSquare.body.result as { status: string; reason: string }).status === "invalid" && /square/.test((notSquare.body.result as { reason: string }).reason) && storage.urls().length === before && Number((await rowsOfPhoto())[0].version) === 2);
    ok("a photo for somebody who is not on the roll: 'missing', and the pictures just stored are taken back", (await handlePhotoPost(form({ op: "upload", id: "99999999" }, jpeg), pctx(HOD))).body.result !== undefined && ((await handlePhotoPost(form({ op: "upload", id: "99999999" }, jpeg), pctx(HOD))).body.result as { status: string }).status === "missing" && storage.urls().length === before);
    ok("a store that fails: 503 with the reason, and nothing saved", await (async () => { const broken = { ...memoryStorage(), put: async () => { throw new Error("blob down"); } }; const r = await handlePhotoPost(form({ op: "upload", id: String(pid) }, jpeg), pctx(HOD, broken)); return r.status === 503 && /photo store is not available/.test(String(r.body.error)) && Number((await rowsOfPhoto())[0].version) === 2; })());
    const hist = await store.recentAudit(db, 30);
    ok("the history of the employee manager SAYS it, in words: 'Changed the photo of PHOTO PERSON (342700)'", hist.some((x) => x.summary === "Changed the photo of PHOTO PERSON (342700)"));
    ok("remove: ok, the pictures are deleted from the store, the row is gone, the history says 'Removed the photo'; removing again says 'none'; a stranger cannot remove", (await handlePhotoPost(form({ op: "remove", id: String(pid) }), pctx(STRANGER))).status === 403 && ((await handlePhotoPost(form({ op: "remove", id: String(pid) }), pctx(HOD))).body.result as { status: string }).status === "ok" && storage.urls().length === 0 && (await rowsOfPhoto()).length === 0 && ((await handlePhotoPost(form({ op: "remove", id: String(pid) }), pctx(HOD))).body.result as { status: string }).status === "none" && (await store.recentAudit(db, 30)).some((x) => x.summary === "Removed the photo of PHOTO PERSON (342700)"));
    await handlePhotoPost(form({ op: "upload", id: String(pid) }, jpeg), pctx(HOD));
    const cur = (await store.getEmployee(db, pid, true))!;
    const del = await handleEmployeeAdmin({ op: "delete", id: pid, confirmTicket: "342700", removeLogin: true, version: cur.version }, { ...ctxFor(HOD), photos: storage });
    ok("deleting the employee takes his photo with him: the row and both pictures in the store", (del.body.result as { status: string }).status === "ok" && (await rowsOfPhoto()).length === 0 && storage.urls().length === 0);
  }
  await pool.end();
  console.log(`employee admin store selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
