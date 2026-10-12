// src/lib/ingestion/schedule/ingest.selftest.ts
// Run:  NL2SQL_TEST_ADMIN_URL=postgres://user:pass@host:5432/postgres npx tsx src/lib/ingestion/schedule/ingest.selftest.ts
//
// Needs a Postgres server it may create a SCRATCH database on (it creates "ingest_selftest" and drops it at the end). The page reading is a stand-in:
// what is tested here is everything AFTER the reading: checking against HR, the decision to store or not, storing (replacing), the time budget, the
// failure paths, the log, and what deleting a circular does.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import type { ExtractedSchedule, ScheduleRow } from "./extractSchedule";
import { ScheduleTimeBudgetError } from "./extractSchedule";
import { applyScheduleStage, loadHrContext, logIngest, prepareSchedule, runScheduleStage, scheduleVerdict, stageDetail, storeSchedule, type InTransaction, type ScheduleOcr, type Sql } from "./ingest";

const admin = process.env.NL2SQL_TEST_ADMIN_URL;
if (!admin) {
  console.log("ingest selftest SKIPPED: set NL2SQL_TEST_ADMIN_URL to a Postgres server (a scratch database is created and dropped).");
  process.exit(0);
}
let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};
const SQLDIR = join(__dirname, "..", "..", "nl2sql", "sql");

const row = (seq: number, ticket: string | null, name: string, code: string | null, department: string, date: string | null, page = 3, extra: Partial<ScheduleRow> = {}): ScheduleRow => ({
  page, seq, serial: seq, ticket, name, departmentCode: code, department, datePrinted: date ? date.split("-").reverse().join("-") : null, checkupDate: date, dateNote: null, dateFromOtherPage: false, ...extra,
});
const schedule = (rows: ScheduleRow[], over: Partial<ExtractedSchedule> = {}): ExtractedSchedule => ({
  scheduleMonth: { month: 1, year: 2025 },
  rows,
  warnings: [],
  info: [],
  groups: [{ date: "2025-01-15", rows: rows.length }],
  ...over,
});
const fakeOcr: ScheduleOcr = { deps: {} as ScheduleOcr["deps"], close: async () => undefined };

(async () => {
  const a = new Client({ connectionString: admin });
  await a.connect();
  await a.query("DROP DATABASE IF EXISTS ingest_selftest");
  await a.query("CREATE DATABASE ingest_selftest");
  await a.end();
  const url = new URL(admin);
  url.pathname = "/ingest_selftest";
  const pg = new Client({ connectionString: url.toString() });
  await pg.connect();
  const sql: Sql = async (text, params) => (await pg.query(text, params)).rows;
  const inTx: InTransaction = async (fn) => {
    await pg.query("BEGIN");
    try {
      const r = await fn(sql);
      await pg.query("COMMIT");
      return r;
    } catch (e) {
      await pg.query("ROLLBACK");
      throw e;
    }
  };

  await pg.query(readFileSync(join(SQLDIR, "99_local_test_standins.sql"), "utf8"));
  await pg.query(`INSERT INTO public.designation_grade VALUES (1, 401, 'S-1', 'nonexec', 24)`);
  for (const f of ["01_nlq_schema_views_role.sql", "02_nl2sql_log_tables.sql", "08_health_checkups.sql", "09_circular_ingest_log.sql"]) await pg.query(readFileSync(join(SQLDIR, f), "utf8"));
  // HR: four people in four departments
  const depts: Array<[number, number, string]> = [[1, 32001, "SMS-BOF (MECH)"], [2, 10001, "CO & CC (MECH)"], [3, 12000, "CO & CC (BATTERY)"], [4, 82100, "POWER PLANT (OPRN)"]];
  for (const [id, code, name] of depts) await pg.query(`INSERT INTO public.sail_department (id, code, name, cohort_scope) VALUES ($1,$2,$3,'shared')`, [id, code, name]);
  const people: Array<[string, string, number]> = [["241022", "AMIT BANERJEE", 1], ["266200", "ANATH BANDHU KARMAKAR", 2], ["242126", "SAMIRAN PATI", 3], ["329737", "ARUN GOSWAMI", 4]];
  let k = 0;
  for (const [t, nm, d] of people) await pg.query(`INSERT INTO public.employee_roster (ticket_no, name, designation_grade_id, sail_department_id, cohort, within_grade_position, global_seniority_rank) VALUES ($1,$2,1,$3,'nonexecutive',$4,$5)`, [t, nm, d, ++k, 240000 + k]);
  await pg.query(`INSERT INTO public.circulars (id, headline, "serialNumber", "publishedAt") VALUES (7,'CIRCULAR-HEALTH CHECK UP JAN-2025',3,'2024-12-28'),(8,'ANOTHER HEALTH CIRCULAR',4,'2024-12-29')`);

  const good = [
    row(1, "241022", "AMIT BANERJEE", "32001", "SMS-BOF (MECH)", "2025-01-15"),
    row(2, "266200", "ANATH BANDHU KARMAKAR", "10001", "CO & CC (MECH)", "2025-01-15"),
    row(3, "242126", "SAMIRAN PATI", "12000", "CO & CC (BATTERY)", "2025-01-15"),
    row(4, "329737", "ARUN GOSWAMI", "82100", "POWER PLANT (OPRN)", "2025-01-15"),
  ];

  // ================================================================== HR context
  const ctx = await loadHrContext(sql);
  check("the HR directory and the department list are loaded from the database (4 people, 4 department code -> name pairs)", ctx.hr.length === 4 && ctx.deptPairs.length === 4 && ctx.deptPairs.some((p) => p.code === "12000" && p.name === "CO & CC (BATTERY)"), JSON.stringify([ctx.hr.length, ctx.deptPairs.length]));

  // ================================================================== prepare and decide
  const ok = await prepareSchedule(schedule(good), ctx, sql);
  check("four people who are in HR with the right names: all verified, no problems, and the verdict is to store", ok.counts.verified === 4 && ok.counts.unverified === 0 && ok.problems.length === 0 && scheduleVerdict(ok).apply === true, JSON.stringify([ok.counts, ok.problems]));
  const misread = [row(1, "241022", "AMIT BANERJEE", "32004", "SMS-BOF (MECH)", "2025-01-15"), row(2, "999999", "NOBODY KNOWN", "44000", "SECTION MILL", "2025-01-15")];
  const mixed = await prepareSchedule(schedule(misread), ctx, sql);
  check("a department code that does not belong to the printed department is corrected (32004 -> 32001), and a person HR does not know stays UNVERIFIED (kept, flagged)", mixed.rows[0].departmentCode === "32001" && mixed.codeFixes.length === 1 && mixed.rows[1].status === "unverified" && mixed.counts.unverified === 1, JSON.stringify(mixed.counts));
  check("...an unverified person is NOT a problem: the schedule is still stored (it is flagged, not dropped)", scheduleVerdict(mixed).apply === true);
  const warned = await prepareSchedule(schedule(good, { warnings: ["a group of 7 rows (the others have 5)"] }), ctx, sql);
  check("a warning from the reading (a group of an odd size) is a problem: NOT stored", warned.problems.length === 1 && scheduleVerdict(warned).apply === false);
  const noMonth = await prepareSchedule(schedule(good, { scheduleMonth: null }), ctx, sql);
  check("a month that could not be read is a problem: NOT stored", scheduleVerdict(noMonth).apply === false && noMonth.problems.some((p) => /month/.test(p)));
  const empty = await prepareSchedule(schedule([]), ctx, sql);
  check("no rows at all is a problem: NOT stored", scheduleVerdict(empty).apply === false && empty.problems.some((p) => /no employee rows/.test(p)));

  // ================================================================== store (replacing)
  await storeSchedule(sql, 7, ok);
  const n1 = (await sql(`SELECT count(*)::int AS n FROM public.health_checkup_schedule WHERE circular_id = 7`))[0].n;
  await storeSchedule(sql, 7, ok);
  const n2 = (await sql(`SELECT count(*)::int AS n FROM public.health_checkup_schedule WHERE circular_id = 7`))[0].n;
  check("storing writes the rows; storing the SAME circular again REPLACES them (4, then still 4: never doubled)", n1 === 4 && n2 === 4, `${n1}, ${n2}`);
  const v = await sql(`SELECT ticket_no, name, department_code, department, checkup_date::text AS d, circular, circular_id, page_number, verified FROM nlq.health_checkups WHERE ticket_no = '242126'`);
  check("the stored row is what the answers read: ticket, name, code, department, date, circular label from the circular, id and page", v.length === 1 && v[0].name === "SAMIRAN PATI" && v[0].department_code === 12000 && v[0].d === "2025-01-15" && v[0].circular === "Circular 003 (2024)" && v[0].circular_id === 7 && v[0].page_number === 3 && v[0].verified === true, JSON.stringify(v));
  let threw = false;
  try {
    await storeSchedule(sql, 7, noMonth);
  } catch {
    threw = true;
  }
  check("a schedule whose month is unknown cannot be stored at all (and the earlier rows are untouched)", threw && (await sql(`SELECT count(*)::int AS n FROM public.health_checkup_schedule WHERE circular_id = 7`))[0].n === 4);

  // ================================================================== the stage (the upload's step), every outcome
  const future = Date.now() + 60_000;
  const stageOk = await runScheduleStage({ pages: [], sql, deadlineAt: future, ocr: fakeOcr, hr: ctx, extract: async () => schedule(good) });
  check("a good reading: status ready, with the prepared rows (nothing is stored yet)", stageOk.status === "ready" && stageOk.prepared?.rows.length === 4 && (await sql(`SELECT count(*)::int AS n FROM public.health_checkup_schedule WHERE circular_id = 8`))[0].n === 0);
  const stageWarn = await runScheduleStage({ pages: [], sql, deadlineAt: future, ocr: fakeOcr, hr: ctx, extract: async () => schedule(good, { warnings: ["dates out of order"] }) });
  check("a reading with a problem: status needs-review, the problems are listed, the rows are prepared but the stage says not to store", stageWarn.status === "needs-review" && stageWarn.problems.join() === "dates out of order" && stageWarn.prepared !== null);
  const stageLate = await runScheduleStage({ pages: [], sql, deadlineAt: future, ocr: fakeOcr, hr: ctx, extract: async () => { throw new ScheduleTimeBudgetError(); } });
  check("running out of time: status timeout, and it does not throw", stageLate.status === "timeout" && stageLate.prepared === null);
  const stageBoom = await runScheduleStage({ pages: [], sql, deadlineAt: future, ocr: fakeOcr, hr: ctx, extract: async () => { throw new Error("tesseract crashed\n   at somewhere"); } });
  check("any other failure: status failed with the first line of the error, and it does not throw", stageBoom.status === "failed" && stageBoom.error === "tesseract crashed");
  const sawStop: boolean[] = [];
  await runScheduleStage({ pages: [], sql, deadlineAt: Date.now() - 1, ocr: fakeOcr, hr: ctx, extract: async (_p, d) => { sawStop.push(!!d.shouldStop?.()); return schedule(good); } });
  await runScheduleStage({ pages: [], sql, deadlineAt: future, ocr: fakeOcr, hr: ctx, extract: async (_p, d) => { sawStop.push(!!d.shouldStop?.()); return schedule(good); } });
  check("the reading is told to stop once the deadline has passed (and not before)", JSON.stringify(sawStop) === "[true,false]");
  let closed = 0;
  const countingOcr: ScheduleOcr = { deps: {} as ScheduleOcr["deps"], close: async () => { closed++; } };
  await runScheduleStage({ pages: [], sql, deadlineAt: future, ocr: countingOcr, hr: ctx, extract: async () => schedule(good) });
  check("OCR engines handed in by the caller are NOT closed by the stage (the caller owns them)", closed === 0);

  // ================================================================== apply (in a transaction), and what a failure leaves
  const applied = await applyScheduleStage(inTx, 8, stageOk);
  check("a ready stage is stored in its own transaction: 4 rows for circular 8", applied.stored === 4 && (await sql(`SELECT count(*)::int AS n FROM public.health_checkup_schedule WHERE circular_id = 8`))[0].n === 4);
  let refused = "";
  try {
    await applyScheduleStage(inTx, 8, stageWarn);
  } catch (e) {
    refused = String((e as Error).message);
  }
  check("a stage that is not ready is REFUSED (never stored by accident)", /not stored|only a schedule that is ready/.test(refused) && /needs-review/.test(refused), refused);
  const broken: InTransaction = async (fn) => {
    await pg.query("BEGIN");
    try {
      const failing: Sql = async (text, params) => {
        if (/INSERT INTO public\.health_checkup_schedule/.test(text)) throw new Error("disk full");
        return sql(text, params);
      };
      const r = await fn(failing);
      await pg.query("COMMIT");
      return r;
    } catch (e) {
      await pg.query("ROLLBACK");
      throw e;
    }
  };
  let failedMsg = "";
  try {
    await applyScheduleStage(broken, 8, stageOk);
  } catch (e) {
    failedMsg = String((e as Error).message);
  }
  check("if storing fails half way (the delete happened, the insert did not) everything is rolled back: the earlier 4 rows are still there", failedMsg === "disk full" && (await sql(`SELECT count(*)::int AS n FROM public.health_checkup_schedule WHERE circular_id = 8`))[0].n === 4);

  // ================================================================== the log
  const detail = stageDetail(stageOk, [3, 4, 5]);
  check("the log detail is small and useful: roster pages, seconds, month, rows, days, counts, problems; and never the rows themselves", JSON.stringify(detail).length < 600 && detail.month === "2025-01" && detail.rows === 4 && detail.days === 1 && detail.verified === 4 && JSON.stringify(detail.rosterPages) === "[3,4,5]" && !("prepared" in detail));
  check("a stage that failed is logged with its error", stageDetail(stageBoom, []).error === "tesseract crashed");
  check("a log entry is written", (await logIngest(sql, 7, "health-schedule", "applied", detail)) === true && (await sql(`SELECT count(*)::int AS n FROM public.circular_ingest_log WHERE circular_id = 7`))[0].n === 1);
  const logRow = (await sql(`SELECT kind, status, detail FROM public.circular_ingest_log WHERE circular_id = 7`))[0];
  check("...with its kind, its status and its detail as JSON", logRow.kind === "health-schedule" && logRow.status === "applied" && logRow.detail.rows === 4);
  const failingSql: Sql = async () => {
    throw new Error('relation "public.circular_ingest_log" does not exist');
  };
  const quiet = console.warn;
  console.warn = () => undefined;
  const wrote = await logIngest(failingSql, 7, "general", "saved", {});
  console.warn = quiet;
  check("if the log table does not exist yet, logging returns false and throws nothing (an upload never fails because of its log)", wrote === false);

  // ================================================================== delete and re-upload
  await logIngest(sql, 8, "health-schedule", "applied", {});
  await pg.query("DELETE FROM public.circulars WHERE id = 7");
  check("deleting a circular deletes its schedule rows AND its log: a re-upload starts clean", (await sql(`SELECT count(*)::int AS n FROM public.health_checkup_schedule WHERE circular_id = 7`))[0].n === 0 && (await sql(`SELECT count(*)::int AS n FROM public.circular_ingest_log WHERE circular_id = 7`))[0].n === 0);
  check("...and another circular's rows and log are untouched", (await sql(`SELECT count(*)::int AS n FROM public.health_checkup_schedule WHERE circular_id = 8`))[0].n === 4 && (await sql(`SELECT count(*)::int AS n FROM public.circular_ingest_log WHERE circular_id = 8`))[0].n === 1);
  await pg.query(`INSERT INTO public.circulars (id, headline, "serialNumber", "publishedAt") VALUES (9,'CIRCULAR-HEALTH CHECK UP JAN-2025',3,'2024-12-28')`);
  const reStage = await runScheduleStage({ pages: [], sql, deadlineAt: future, ocr: fakeOcr, hr: ctx, extract: async () => schedule(good) });
  await applyScheduleStage(inTx, 9, reStage);
  const again = await sql(`SELECT circular, circular_id, count(*)::int AS n FROM nlq.health_checkups WHERE circular_id = 9 GROUP BY 1,2`);
  check("the same circular uploaded again (a new id, the same serial and year) is ready at once with the same label: 'Circular 003 (2024)', 4 rows", again.length === 1 && again[0].circular === "Circular 003 (2024)" && again[0].n === 4, JSON.stringify(again));

  await pg.end();
  const b = new Client({ connectionString: admin });
  await b.connect();
  await b.query("DROP DATABASE ingest_selftest");
  await b.end();
  console.log(`\ningest selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("ingest selftest crashed:", e);
  process.exit(1);
});
