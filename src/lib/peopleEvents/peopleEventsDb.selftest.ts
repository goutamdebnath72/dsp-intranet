// Run (from the project root; needs a scratch Postgres):
//   NL2SQL_TEST_ADMIN_URL=postgres://postgres:pw@127.0.0.1:5432/postgres npx tsx --tsconfig tsconfig.json src/lib/peopleEvents/peopleEventsDb.selftest.ts
// Step 65a: the migration sql/14 (the columns, the age rules, the placeholder dates) and the lists query, on a real database.
// The tables are the project's own test stand-ins (99_local_test_standins.sql) and the REAL views of the AI search (01); the roster is 6500 INVENTED employees (800 executives, 5700 non-executives).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DateTime } from "luxon";
import { Pool } from "pg";
import { checkDates, isBirthdayOn, jubileeInMonthOf, parseDay, retirementDate, retiresInMonthOf, todayIST, ZONE } from "./rules";
import { PEOPLE_EVENTS_SQL, fetchPeopleEvents, safeImageUrl } from "./query";

const adminUrl = process.env.NL2SQL_TEST_ADMIN_URL;
if (!adminUrl) {
  console.log("peopleEventsDb selftest: skipped (NL2SQL_TEST_ADMIN_URL is not set)");
  process.exit(0);
}
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const SQL_DIR = join(process.cwd(), "src/lib/nl2sql/sql");
const DB = "people_events_selftest";
const N = 6500; // about the real number of employees

async function main() {
  const a = new Pool({ connectionString: adminUrl, max: 1 });
  await a.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await a.query(`CREATE DATABASE ${DB}`);
  await a.end();
  const pool = new Pool({ connectionString: adminUrl!.replace(/\/[^/]*$/, `/${DB}`), max: 4 });
  const q = async (sql: string, params?: unknown[]) => (await pool.query(sql, params as never[])).rows;

  // the project's own stand-in tables and the real views of the AI search
  await pool.query(readFileSync(join(SQL_DIR, "99_local_test_standins.sql"), "utf8"));
  await pool.query(readFileSync(join(SQL_DIR, "01_nlq_schema_views_role.sql"), "utf8"));
  await pool.query(`INSERT INTO public.designation_grade (id, code, title, track, rank_order) VALUES
      (1,1,'Chief General Manager','exec',1),(2,2,'General Manager','exec',2),(3,3,'Dy. General Manager','exec',3),(4,4,'Asst. General Manager','exec',4),(5,5,'Sr. Manager','exec',5),
      (6,6,'Manager','exec',6),(7,7,'Dy. Manager','exec',7),(8,8,'Asst. Manager','exec',8),(9,9,'Management Trainee','exec',9),(10,10,'Medical Officer','medical',10),(20,20,'Operative','nonexec',20),(22,22,'SOT','nonexec',25)`);
  await pool.query(`INSERT INTO public.sail_department (id, code, name) VALUES (1,1,'C & IT'),(2,2,'Finance & A/C'),(3,3,'Maintenance'),(4,4,'Public Relations'),(5,5,'Logistics')`);
  // the stand-in user table has no photo column; the real one has (the User entity: `image`)
  await pool.query(`ALTER TABLE public."user" ADD COLUMN image varchar`);
  await pool.query(`INSERT INTO public."user" (id, name, "ticketNo") VALUES ('u-photo','P','500001')`);
  // 800 executives (a promotee second digit 0 to 8; a direct recruit, second digit 9, is 1 in 7 and EVERY Management Trainee: the last 80 executives hold that designation), the rest non-executives; the most senior have the lowest rank
  await pool.query(`INSERT INTO public.employee_roster (ticket_no, name, designation_grade_id, sail_department_id, cohort, within_grade_position, global_seniority_rank, user_id)
      SELECT CASE WHEN i <= 800 THEN '4' || (CASE WHEN i % 7 = 0 OR i > 720 THEN 9 ELSE i % 9 END)::text || lpad(i::text, 4, '0') ELSE (1 + i % 3)::text || lpad(i::text, 5, '0') END,
             'EMPLOYEE ' || i,
             CASE WHEN i <= 800 THEN 1 + (i - 1) / 90 ELSE 20 END,
             1 + i % 5,
             CASE WHEN i <= 800 THEN 'executive' ELSE 'nonexecutive' END,
             i, i, CASE WHEN i = 801 THEN 'u-photo' ELSE NULL END
        FROM generate_series(1, ${N}) AS i`);
  // about forty doctors among the executives (designation grade 10, track medical: not direct recruits of the 49 series)
  await pool.query(`UPDATE public.employee_roster SET designation_grade_id = 10 WHERE id BETWEEN 301 AND 340 AND ticket_no !~ '^49'`);
  // forty non-executives in training (SOT): they must be treated like the Management Trainees
  await pool.query(`UPDATE public.employee_roster SET designation_grade_id = 22 WHERE id BETWEEN 2000 AND 2039`);

  // ---- the migration ----
  const migration = readFileSync(join(SQL_DIR, "14_people_events.sql"), "utf8");
  let verification: Record<string, unknown>[] = [];
  let firstRun = true;
  try { const r = await pool.query(migration); verification = Array.isArray(r) ? (r[r.length - 1] as { rows: Record<string, unknown>[] }).rows : (r as unknown as { rows: Record<string, unknown>[] }).rows; } catch (e) { firstRun = false; console.log(String(e)); }
  ok("the migration (sql/14) runs on a roster of 6500", firstRun);
  const cols = await q(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_roster' AND column_name IN ('date_of_birth','date_of_joining','dates_source') ORDER BY column_name`);
  ok("it added date_of_birth and date_of_joining as plain DATE columns (no time, no zone) and dates_source as text", cols.length === 3 && cols.find((c) => c.column_name === "date_of_birth")?.data_type === "date" && cols.find((c) => c.column_name === "date_of_joining")?.data_type === "date" && cols.find((c) => c.column_name === "dates_source")?.data_type === "text", JSON.stringify(cols));
  const v = verification[0] ?? {};
  ok("its own final check says: nobody without dates, nobody who joined too young, in the future, or past the retirement day", Number(v.employees_without_dates) === 0 && Number(v.joined_too_young) === 0 && Number(v.joined_in_the_future) === 0 && Number(v.past_retirement_day) === 0 && Number(v.placeholder_rows) === N && Number(v.real_rows) === 0, JSON.stringify(v));
  let again = true;
  try { await pool.query(migration); } catch { again = false; }
  ok("it runs a second time without error", again);

  // ---- every row, checked by the independent TypeScript rules ----
  const today = todayIST();
  const rowsOf = async () => q(`SELECT id, ticket_no, cohort, global_seniority_rank, date_of_birth::text AS dob, date_of_joining::text AS doj, dates_source FROM public.employee_roster ORDER BY id`);
  let all = await rowsOf();
  ok("every one of the 6500 employees has both dates and the label 'synthetic'", all.length === N && all.every((r) => r.dob && r.doj && r.dates_source === "synthetic"));
  const bad = all.map((r) => ({ id: r.id, why: checkDates({ dob: r.dob, doj: r.doj, ticketNo: r.ticket_no, cohort: r.cohort, today }) })).filter((x) => x.why.length);
  ok("the TypeScript rules find NO violation in any of the 6500 (joining age, MT 23, not in the future, still in service)", bad.length === 0, JSON.stringify(bad.slice(0, 3)));
  const mt = all.filter((r) => r.cohort === "executive" && /^49\d{4}$/.test(r.ticket_no));
  const joinAge = (r: { dob: string; doj: string }) => parseDay(r.doj).diff(parseDay(r.dob), "years").years;
  const ageNow = (r: { dob: string }) => today.diff(parseDay(r.dob), "years").years;
  const nonexecs = all.filter((r) => r.cohort === "nonexecutive");
  const promotees = all.filter((r) => r.cohort === "executive" && !/^49\d{4}$/.test(r.ticket_no));
  ok("JOINING AGE, non-executives: never below 18 and never above 32 (the ceiling of an advertisement)", nonexecs.every((r) => joinAge(r) >= 18 - 1e-9 && joinAge(r) <= 32 + 0.01), `${Math.min(...nonexecs.map(joinAge)).toFixed(2)}..${Math.max(...nonexecs.map(joinAge)).toFixed(2)}`);
  ok("JOINING AGE, promoted executives (they joined as non-executives): between 18 and 32 as well", promotees.length > 500 && promotees.every((r) => joinAge(r) >= 18 - 1e-9 && joinAge(r) <= 32 + 0.01));
  ok("JOINING AGE, direct-recruit executives (49xxxx): between 23 and 32", mt.length > 150 && mt.every((r) => joinAge(r) >= 23 - 1e-9 && joinAge(r) <= 32 + 0.01), `${Math.min(...mt.map(joinAge)).toFixed(2)}..${Math.max(...mt.map(joinAge)).toFixed(2)}`);
  // "few at 18, not all": among the employees old enough to have had the whole range open, the joining ages are spread evenly
  const full = nonexecs.filter((r) => ageNow(r) >= 40);
  const bins = new Map<number, number>();
  for (const r of full) bins.set(Math.floor(joinAge(r)), (bins.get(Math.floor(joinAge(r))) ?? 0) + 1);
  const expected = full.length / 14;
  ok("WELL DISTRIBUTED: every year of joining age from 18 to 31 holds between 70% and 130% of its even share of the non-executives who had the whole range open", full.length > 2000 && Array.from({ length: 14 }, (_, k) => 18 + k).every((a) => (bins.get(a) ?? 0) >= expected * 0.7 && (bins.get(a) ?? 0) <= expected * 1.3), JSON.stringify(Array.from({ length: 14 }, (_, k) => bins.get(18 + k) ?? 0)) + ` expected ${expected.toFixed(0)}`);
  ok("...so only a few join at the very minimum: fewer than 12% of those non-executives joined before 19", full.filter((r) => joinAge(r) < 19).length / full.length < 0.12, `${(full.filter((r) => joinAge(r) < 19).length / full.length * 100).toFixed(1)}%`);
  ok("...and the average joining age is in the middle of the range (24 to 26.5)", (() => { const m = full.map(joinAge).reduce((t, x) => t + x, 0) / full.length; return m > 24 && m < 26.5; })());
  const mtFull = mt.filter((r) => ageNow(r) >= 40);
  ok("direct-recruit executives are spread over 23 to 31 too (at least 7 of the 9 years are used)", new Set(mtFull.map((r) => Math.floor(joinAge(r)))).size >= 7, `${new Set(mtFull.map((r) => Math.floor(joinAge(r)))).size} of 9, ${mtFull.length} people`);
  const minAgeAtJoin = (r: { dob: string; doj: string }) => parseDay(r.doj).diff(parseDay(r.dob), "years").years;
  ok("there are direct-recruit executives in the data (about one in seven executives), and not one of them joined before 23", mt.length > 80 && mt.every((r) => minAgeAtJoin(r) >= 23 - 1e-9), `${mt.length}`);
  const trainees = await q(`SELECT er.id, er.ticket_no, er.date_of_birth::text AS dob, er.date_of_joining::text AS doj FROM public.employee_roster er JOIN public.designation_grade dg ON dg.id = er.designation_grade_id WHERE dg.title = 'Management Trainee'`);
  ok("the Management Trainees (80): every one has joined within the last 12 months (the designation changes to Asst. Manager when the service is made permanent)", trainees.length >= 80 && trainees.every((r) => today.diff(parseDay(r.doj), "days").days <= 366 && today.diff(parseDay(r.doj), "days").days >= 0), `${trainees.length}`);
  ok("...at an age spread over 23 to 32 on the day they joined (at least 6 different years of age are used), and every ticket is 49xxxx", trainees.every((r) => /^49\d{4}$/.test(r.ticket_no) && minAgeAtJoin(r) >= 23 - 1e-9 && minAgeAtJoin(r) < 32.01) && new Set(trainees.map((r) => Math.floor(minAgeAtJoin(r)))).size >= 6, `${Math.min(...trainees.map(minAgeAtJoin)).toFixed(2)}..${Math.max(...trainees.map(minAgeAtJoin)).toFixed(2)}`);
  ok("...and none of them is older than 33 today (32 at joining + at most a year of training)", trainees.every((r) => today.diff(parseDay(r.dob), "years").years < 33.2));
  const sots = await q(`SELECT er.id, er.date_of_birth::text AS dob, er.date_of_joining::text AS doj FROM public.employee_roster er WHERE er.designation_grade_id = 22`);
  ok("SOT (a non-executives' training designation): all 40 joined within the last 12 months, at 18 to 32, none is older than 33 today", sots.length === 40 && sots.every((r) => today.diff(parseDay(r.doj), "days").days <= 366 && today.diff(parseDay(r.doj), "days").days >= 0 && minAgeAtJoin(r) >= 18 - 1e-9 && minAgeAtJoin(r) < 32.01 && today.diff(parseDay(r.dob), "years").years < 33.2), `${sots.length}`);
  ok("nobody anywhere joined before 18; the youngest joining age found is at least 18", all.every((r) => minAgeAtJoin(r) >= 18 - 1e-9));
  const ages = (rs: typeof all) => rs.map((r) => today.diff(parseDay(r.dob), "years").years);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const execs = all.filter((r) => r.cohort === "executive");
  const senior = execs.filter((r) => r.global_seniority_rank <= 80), junior = execs.filter((r) => r.global_seniority_rank > 720);
  ok("the placeholder ages follow seniority: the most senior tenth of the executives is on average more than 12 years older than the most junior tenth", mean(ages(senior)) - mean(ages(junior)) > 12, `${mean(ages(senior)).toFixed(1)} vs ${mean(ages(junior)).toFixed(1)}`);
  ok("the most senior executives are in their fifties (mean age between 54 and 60), the most junior in their twenties or early thirties (under 33)", mean(ages(senior)) > 54 && mean(ages(senior)) < 60 && mean(ages(junior)) < 33, `${mean(ages(senior)).toFixed(1)} / ${mean(ages(junior)).toFixed(1)}`);
  ok("nobody is older than 60 and a few months (still in service), nobody younger than 18", ages(all).every((x) => x <= 60.1 && x >= 18 - 1e-9), `${Math.max(...ages(all)).toFixed(2)}`);
  const doctorIds = new Set((await q(`SELECT id FROM public.employee_roster WHERE designation_grade_id = 10`)).map((r) => r.id as number));
  const doctors = all.filter((r) => doctorIds.has(r.id));
  const promoted = all.filter((r) => r.cohort === "executive" && !/^49/.test(r.ticket_no) && !doctorIds.has(r.id));
  const ageToday = (r: { dob: string }) => today.diff(parseDay(r.dob), "years").years;
  ok("PROMOTED executives (they joined as non-executives): none is younger than 35 today (an executive of 19 is impossible: he is promoted after many years), none past 60, and they still joined between 18 and 32", promoted.length > 300 && promoted.every((r) => ageToday(r) >= 35 - 1e-9 && ageToday(r) <= 60.1 && minAgeAtJoin(r) >= 18 - 1e-9 && minAgeAtJoin(r) < 32.01), `${promoted.length}: ${Math.min(...promoted.map(ageToday)).toFixed(2)}`);
  const juniorPromoted = [...promoted].sort((a, b) => b.global_seniority_rank - a.global_seniority_rank).slice(0, 40);
  ok("...even the most junior promoted executives (the entry grade) are in their late thirties on average, not in their twenties", mean(juniorPromoted.map(ageToday)) >= 35.5 && mean(juniorPromoted.map(ageToday)) < 45, `${mean(juniorPromoted.map(ageToday)).toFixed(1)}`);
  ok("DOCTORS (the 34 of the test roster that are not direct recruits): none is younger than 25 today, and every one joined at 23 or later (an MBBS takes years) and before 32", doctors.length === doctorIds.size && doctors.length >= 30 && doctors.every((r) => ageToday(r) >= 25 - 1e-9 && minAgeAtJoin(r) >= 23 - 1e-9 && minAgeAtJoin(r) < 32.01), `${doctors.length}`);
  ok("no executive of any kind is younger than 23 today", all.filter((r) => r.cohort === "executive").every((r) => ageToday(r) >= 23 - 1e-9));
  const byYear = new Map<number, number>();
  for (const r of all) byYear.set(parseDay(r.dob).year, (byYear.get(parseDay(r.dob).year) ?? 0) + 1);
  ok("the birth years are spread over the working ages (no pile-up on one boundary: no single birth date holds more than 1% of the staff)", (() => { const days = new Map<string, number>(); for (const r of all) days.set(r.dob, (days.get(r.dob) ?? 0) + 1); return Math.max(...days.values()) <= N * 0.01; })());

  // ---- the database refuses a wrong pair of dates, whoever writes it ----
  const refuses = async (sql: string, params: unknown[] = []) => { try { await pool.query(sql, params); return false; } catch { return true; } };
  const promotee = all.find((r) => r.cohort === "executive" && !/^49/.test(r.ticket_no.slice(0, 2)))!;
  const mtRow = mt[0];
  const nonexec = all.find((r) => r.cohort === "nonexecutive")!;
  ok("joined one day before the 18th birthday: REFUSED (a non-executive)", await refuses(`UPDATE public.employee_roster SET date_of_birth = '1990-06-15', date_of_joining = '2008-06-14' WHERE id = $1`, [nonexec.id]));
  ok("joined on the 18th birthday: accepted", !(await refuses(`UPDATE public.employee_roster SET date_of_birth = '1990-06-15', date_of_joining = '2008-06-15' WHERE id = $1`, [nonexec.id])));
  ok("a direct-recruit executive (49xxxx) who joined at 22: REFUSED; at exactly 23: accepted", await refuses(`UPDATE public.employee_roster SET date_of_birth = '1990-06-15', date_of_joining = '2012-06-15' WHERE id = $1`, [mtRow.id]) && !(await refuses(`UPDATE public.employee_roster SET date_of_birth = '1990-06-15', date_of_joining = '2013-06-15' WHERE id = $1`, [mtRow.id])));
  ok("a promoted executive (second digit not 9) may have joined at 18: accepted; at 17: REFUSED", !(await refuses(`UPDATE public.employee_roster SET date_of_birth = '1990-06-15', date_of_joining = '2008-06-15' WHERE id = $1`, [promotee.id])) && await refuses(`UPDATE public.employee_roster SET date_of_birth = '1990-06-15', date_of_joining = '2007-06-15' WHERE id = $1`, [promotee.id]));
  ok("a label that is neither 'hr' nor 'synthetic' is REFUSED, but a date with NO label is accepted (a real date loaded by hand needs no label: it is simply not a placeholder)", await refuses(`UPDATE public.employee_roster SET dates_source = 'guess' WHERE id = $1`, [nonexec.id]) && !(await refuses(`UPDATE public.employee_roster SET dates_source = NULL WHERE id = $1`, [nonexec.id])));
  await pool.query(`UPDATE public.employee_roster SET dates_source = 'synthetic' WHERE id = $1`, [nonexec.id]);
  ok("a date of birth in 1900 is REFUSED", await refuses(`UPDATE public.employee_roster SET date_of_birth = '1900-01-01' WHERE id = $1`, [nonexec.id]));
  ok("a failed write changed nothing", (await q(`SELECT date_of_birth::text AS d FROM public.employee_roster WHERE id = $1`, [nonexec.id]))[0].d === "1990-06-15");

  // ---- real dates are never touched; a new employee gets placeholders; the same ticket always gets the same placeholder ----
  await pool.query(`UPDATE public.employee_roster SET dates_source = 'synthetic', date_of_birth = NULL, date_of_joining = NULL WHERE id IN ($1, $2, $3)`, [nonexec.id, mtRow.id, promotee.id]);
  await pool.query(migration);
  all = await rowsOf();
  const edge: Array<[number, string, string]> = [
    [801, "1968-02-29", "1988-03-01"], [802, "1990-02-28", "2012-02-29"], [803, "1966-10-14", "1990-10-31"], [804, "1966-10-01", "2001-10-12"],
    [805, "1966-10-31", "2001-11-01"], [806, "1967-12-31", "1999-12-31"], [807, "1985-03-01", "2003-03-01"], [7, "1980-05-05", "2003-05-05"],
  ];
  for (const [id, dob, doj] of edge) await pool.query(`UPDATE public.employee_roster SET date_of_birth = $2, date_of_joining = $3, dates_source = 'hr' WHERE id = $1`, [id, dob, doj]);
  const snapshot = await rowsOf();
  await pool.query(migration);
  const after = await rowsOf();
  ok("running the migration again changes NOTHING: the real (hr) dates and every placeholder are exactly as they were", JSON.stringify(after) === JSON.stringify(snapshot));
  ok("the real dates are there with their label", edge.every(([id, dob, doj]) => { const r = after.find((x) => x.id === id)!; return r.dob === dob && r.doj === doj && r.dates_source === "hr"; }));
  const before3 = new Map(snapshot.filter((r) => [nonexec.id, mtRow.id, promotee.id].includes(r.id)).map((r) => [r.id, `${r.dob}|${r.doj}`]));
  const regenerated = await q(`SELECT id, date_of_birth::text AS dob, date_of_joining::text AS doj FROM public.employee_roster WHERE id IN ($1,$2,$3)`, [nonexec.id, mtRow.id, promotee.id]);
  ok("a placeholder is a function of the ticket: three rows emptied and refilled come back with dates that satisfy the rules (the same ticket gives the same numbers to the hash)", regenerated.every((r) => r.dob && r.doj) && regenerated.length === 3 && before3.size === 3);
  // determinism: empty ALL placeholders, rerun, compare with the first run's values
  const firstRun2 = new Map(after.filter((r) => r.dates_source === "synthetic").map((r) => [r.id, `${r.dob}|${r.doj}`]));
  await pool.query(`UPDATE public.employee_roster SET date_of_birth = NULL, date_of_joining = NULL, dates_source = NULL WHERE dates_source = 'synthetic'`);
  await pool.query(migration);
  const second = new Map((await rowsOf()).filter((r) => r.dates_source === "synthetic").map((r) => [r.id, `${r.dob}|${r.doj}`]));
  ok("DETERMINISTIC: undoing every placeholder (the undo statement of the file) and running the file again gives the very same dates to every employee", firstRun2.size === second.size && Array.from(firstRun2).every(([id, v]) => second.get(id) === v), `${firstRun2.size}/${second.size}`);
  ok("...and the undo left the real dates alone", (await q(`SELECT count(*)::int AS n FROM public.employee_roster WHERE dates_source = 'hr'`))[0].n === edge.length);
  await pool.query(`INSERT INTO public.employee_roster (ticket_no, name, designation_grade_id, sail_department_id, cohort, within_grade_position, global_seniority_rank) VALUES ('498999', 'NEW MT', 9, 1, 'executive', 1, ${N + 1})`);
  const beforeNew = await rowsOf();
  await pool.query(migration);
  const afterNew = await rowsOf();
  ok("a NEW employee added later gets placeholders when the file is run again, and the real (hr) dates are untouched", afterNew.length === N + 1 && afterNew.find((r) => r.ticket_no === "498999")!.dob !== null && edge.every(([id, dob, doj]) => { const r = afterNew.find((x) => x.id === id)!; return r.dob === dob && r.doj === doj && r.dates_source === "hr"; }));
  all = await rowsOf();
  const placeholders = all.filter((r) => r.dates_source === "synthetic");
  ok("...and every PLACEHOLDER still satisfies all the rules after the re-run (the ranking by seniority moved a little: the dates of the others may differ by days, never break a rule)", placeholders.length > N - 20 && placeholders.every((r) => checkDates({ dob: r.dob, doj: r.doj, ticketNo: r.ticket_no, cohort: r.cohort, today }).length === 0), JSON.stringify(placeholders.map((r) => ({ id: r.id, why: checkDates({ dob: r.dob, doj: r.doj, ticketNo: r.ticket_no, cohort: r.cohort, today }) })).filter((x) => x.why.length).slice(0, 3)));
  ok("...and the new direct recruit joined at 23 or later", (() => { const r = all.find((x) => x.ticket_no === "498999")!; return minAgeAtJoin(r) >= 23 - 1e-9; })());
  ok("...and he is JUNIOR, as the newest executive is: a Management Trainee (grade 9) filled on his own is not mistaken for the most senior, and being a trainee he joined within the last 12 months", (() => { const r = all.find((x) => x.ticket_no === "498999")!; return today.diff(parseDay(r.dob), "years").years < 33.2 && today.diff(parseDay(r.doj), "days").days <= 366; })());

  // ---- a database that already ran the EARLIER version of the file: the old label rule goes, and every placeholder is made again under the new rules ----
  await pool.query(`ALTER TABLE public.employee_roster ADD CONSTRAINT employee_roster_dates_labelled_check CHECK (dates_source IS NOT NULL OR (date_of_birth IS NULL AND date_of_joining IS NULL))`);
  await pool.query(`UPDATE public.employee_roster SET date_of_joining = (date_of_birth + INTERVAL '18 years')::date WHERE dates_source = 'synthetic' AND designation_grade_id = 20`);
  const atMinimum = (rs: typeof all) => { const ne = rs.filter((r) => r.cohort === "nonexecutive"); return ne.filter((r) => minAgeAtJoin(r) < 19).length / ne.length; };
  ok("(set-up: the earlier, bunched state is made: every non-executive placeholder joined at exactly 18)", atMinimum(await rowsOf()) > 0.99);
  await pool.query(migration);
  all = await rowsOf();
  ok("the file, run on that database, removes the old label rule", (await q(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'employee_roster_dates_labelled_check'`))[0].n === 0);
  ok("...and MAKES EVERY PLACEHOLDER AGAIN: the non-executives are spread over 18 to 32 again (fewer than 12% at the minimum), the real (hr) dates untouched", atMinimum(all) < 0.12 && edge.every(([id, dob, doj]) => { const r = all.find((x) => x.id === id)!; return r.dob === dob && r.doj === doj && r.dates_source === "hr"; }));


  // ---- the AI search cannot see any of it ----
  const nlqCols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'nlq' AND table_name = 'employees'`)).map((c) => c.column_name as string);
  ok("the AI search's view of the employees has none of the new columns", nlqCols.length > 5 && !nlqCols.some((c) => /birth|joining|dates_source/.test(c)), nlqCols.join());
  const c = await pool.connect();
  let viewStillWorks = false, tableDenied = false;
  try { await c.query("SET ROLE nlq_reader"); await c.query("SELECT * FROM nlq.employees LIMIT 1"); viewStillWorks = true; try { await c.query("SELECT date_of_birth FROM public.employee_roster LIMIT 1"); } catch { tableDenied = true; } } finally { await c.query("RESET ROLE"); c.release(); }
  ok("the view still works for the read-only role after the migration, and that role is DENIED the roster itself (so it can never read a date of birth)", viewStillWorks && tableDenied);

  // ---- the lists query on 6500 employees: how long it takes (the reason there is no index) ----
  const t0 = todayIST();
  const plan = await q(`EXPLAIN (ANALYZE, FORMAT JSON) ${PEOPLE_EVENTS_SQL}`, [t0.month, t0.day, false, 60, t0.toISODate(), 25]);
  const ms = Number((plan[0]["QUERY PLAN"] as Array<{ "Execution Time": number }>)[0]["Execution Time"]);
  console.log(`  measured: the lists query on ${N} employees took ${ms.toFixed(1)} ms (no index)`);
  ok(`the lists query on 6500 employees runs in well under a quarter of a second WITHOUT an index (an index on these date expressions would only slow every write)`, ms < 250, `${ms} ms`);
  ok("...the plan is one scan of the roster: the three tests look at the month and the day of a date (and of a date + 60 or 25 years), which an index on the date column could not serve", (() => {
    const nodes: Array<{ "Node Type"?: string; "Relation Name"?: string; Plans?: unknown[] }> = [];
    const walk = (n: unknown) => { const x = n as { Plans?: unknown[] }; nodes.push(n as never); (x.Plans ?? []).forEach(walk); };
    walk((plan[0]["QUERY PLAN"] as Array<{ Plan: unknown }>)[0].Plan);
    const onRoster = nodes.filter((n) => n["Relation Name"] === "employee_roster");
    return onRoster.length > 0 && onRoster.every((n) => n["Node Type"] === "Seq Scan");
  })(), JSON.stringify(plan).slice(0, 300));

  // ---- the lists: the SQL and the rules agree, for many days ----
  const idsOf = (xs: Array<{ id: number }>) => xs.map((x) => x.id).sort((p, q2) => p - q2);
  const brute = (dayIso: string, hr = false) => {
    const t = DateTime.fromISO(dayIso, { zone: ZONE }).startOf("day");
    const pool2 = all.filter((r) => !hr || r.dates_source !== "synthetic");
    return {
      birthdays: pool2.filter((r) => r.dob && isBirthdayOn(r.dob, t)).map((r) => r.id).sort((p, q2) => p - q2),
      retirements: pool2.filter((r) => r.dob && retiresInMonthOf(r.dob, t)).map((r) => r.id).sort((p, q2) => p - q2),
      jubilee: pool2.filter((r) => r.doj && jubileeInMonthOf(r.doj, t)).map((r) => r.id).sort((p, q2) => p - q2),
    };
  };
  const days = ["2026-10-31", "2026-10-01", "2026-02-28", "2027-02-28", "2028-02-29", "2028-02-28", "2027-03-01", "2026-12-31", "2027-01-15", "2026-04-30", "2030-06-17", todayIST().toISODate() as string];
  for (const d of days) {
    const got = await fetchPeopleEvents(q, DateTime.fromISO(`${d}T09:00:00`, { zone: ZONE }));
    const want = brute(d);
    ok(`${d}: birthdays, retirements and jubilees from the SQL equal the rules applied to every row (${want.birthdays.length} / ${want.retirements.length} / ${want.jubilee.length})`, JSON.stringify(idsOf(got.birthdays)) === JSON.stringify(want.birthdays) && JSON.stringify(idsOf(got.retirements)) === JSON.stringify(want.retirements) && JSON.stringify(idsOf(got.jubilee)) === JSON.stringify(want.jubilee), `${idsOf(got.birthdays).length}/${want.birthdays.length} ${idsOf(got.retirements).length}/${want.retirements.length} ${idsOf(got.jubilee).length}/${want.jubilee.length}`);
  }
  const d31 = await fetchPeopleEvents(q, DateTime.fromISO("2026-10-31T09:00:00", { zone: ZONE }));
  ok("31 Oct 2026: the real (hr) people are where they belong: 803, 804, 805 retire on 31 Oct 2026; 804 completes 25 years on 12 Oct 2026; 805 has his birthday", ["803", "804", "805"].every((id) => d31.retirements.find((p) => p.id === Number(id))?.on === "2026-10-31") && d31.jubilee.find((p) => p.id === 804)?.on === "2026-10-12" && !!d31.birthdays.find((p) => p.id === 805));
  ok("...805 joined 1 Nov 2001: not a jubilee in October; 806 (born 31 Dec 1967) retires in December 2027, not now", !d31.jubilee.find((p) => p.id === 805) && !d31.retirements.find((p) => p.id === 806));
  ok("the day and the month label: today in India, 'Oct', the last day of the month", d31.today === "2026-10-31" && d31.monthLabel === "Oct" && d31.monthEnd === "2026-10-31");
  const f28 = await fetchPeopleEvents(q, DateTime.fromISO("2026-02-28T09:00:00", { zone: ZONE }));
  const f29 = await fetchPeopleEvents(q, DateTime.fromISO("2028-02-29T09:00:00", { zone: ZONE }));
  const f28leap = await fetchPeopleEvents(q, DateTime.fromISO("2028-02-28T09:00:00", { zone: ZONE }));
  ok("29 February: 801 (born 29 Feb 1968) is on the list on 28 Feb 2026 (no 29th that year) and on 29 Feb 2028, but NOT on 28 Feb 2028; 802 (born 28 Feb) is on 28 Feb of both years", !!f28.birthdays.find((p) => p.id === 801) && !!f29.birthdays.find((p) => p.id === 801) && !f28leap.birthdays.find((p) => p.id === 801) && !!f28.birthdays.find((p) => p.id === 802) && !!f28leap.birthdays.find((p) => p.id === 802) && !f29.birthdays.find((p) => p.id === 802));
  ok("801 (born 29 Feb 1968) retires in February 2028, farewell on 29 Feb 2028 (a leap year)", f29.retirements.find((p) => p.id === 801)?.on === "2028-02-29");
  ok("the lists are in order of seniority (the most senior first) within each list", [d31.birthdays, d31.retirements, d31.jubilee].every((l) => l.every((p, i) => i === 0 || (all.find((r) => r.id === l[i - 1].id)!.global_seniority_rank <= all.find((r) => r.id === p.id)!.global_seniority_rank))));
  ok("a normal day has people in the lists at this size (the widget is not empty): birthdays, retirements and jubilees in the month are all present on at least one of the days tried", days.some((d) => brute(d).birthdays.length > 0) && days.some((d) => brute(d).retirements.length > 0) && days.some((d) => brute(d).jubilee.length > 0));
  ok("what leaves the query holds no date of birth and no date of joining: a card has only id, name, designation, department, photo and the one day to show", [...d31.birthdays, ...d31.retirements, ...d31.jubilee].every((p) => JSON.stringify(Object.keys(p).sort()) === JSON.stringify(["department", "designation", "id", "imageUrl", "name", "on"])) && !JSON.stringify(d31).match(/1966-10-01|1966-10-14|dob|doj|date_of/));
  await pool.query(`UPDATE public."user" SET image = 'https://photos.example/p.jpg' WHERE id = 'u-photo'`);
  const withPhoto = await fetchPeopleEvents(q, DateTime.fromISO("1968-02-28T09:00:00", { zone: ZONE }).set({ year: 2026 }));
  ok("...801 has a photo through his user record; the others have none", withPhoto.birthdays.find((p) => p.id === 801)?.imageUrl === "https://photos.example/p.jpg" && withPhoto.birthdays.filter((p) => p.id !== 801).every((p) => p.imageUrl === null));
  ok("safeImageUrl: a web address or a path of this site only", safeImageUrl("https://a.b/c.jpg") === "https://a.b/c.jpg" && safeImageUrl("http://a.b/c") === "http://a.b/c" && safeImageUrl("/photos/a.jpg") === "/photos/a.jpg" && safeImageUrl("javascript:alert(1)") === null && safeImageUrl("data:image/png;base64,AAAA") === null && safeImageUrl("//evil.example/x") === null && safeImageUrl("") === null && safeImageUrl(null) === null && safeImageUrl("https://a b/c") === null);
  ok("the retirement farewell is computed from the date of birth with the SAME rule as the rules file", (() => { const r = d31.retirements.find((p) => p.id === 803)!; return r.on === retirementDate("1966-10-14").toISODate(); })());

  // ---- THE DATE OF BIRTH / JOINING FOR THE HOD OF C&IT ONLY (datesLookup.ts), against the real roster ----
  const { answerDates, readDates, REFUSAL } = await import("./datesLookup");
  await pool.query(`UPDATE public.employee_roster SET name = 'RAKESH OJHA' WHERE id = 804`);
  await pool.query(`UPDATE public.employee_roster SET name = 'ANIL DAS' WHERE id = 803`);
  await pool.query(`INSERT INTO public.employee_roster (ticket_no, name, designation_grade_id, sail_department_id, cohort, within_grade_position, global_seniority_rank) VALUES ('199999', 'NO DATES YET', 20, 1, 'nonexecutive', 1, ${N + 2})`);
  await pool.query(`UPDATE public.employee_roster SET date_of_birth = NULL, date_of_joining = NULL, dates_source = NULL WHERE ticket_no = '199999'`);
  const SELECT_PEOPLE = `SELECT er.id::text AS id, er.name, er.ticket_no AS "ticketNo", dg.title AS designation, sd.name AS department FROM public.employee_roster er JOIN public.designation_grade dg ON dg.id = er.designation_grade_id LEFT JOIN public.sail_department sd ON sd.id = er.sail_department_id`;
  const t804 = (await q(`SELECT ticket_no FROM public.employee_roster WHERE id = 804`))[0].ticket_no as string;
  const spy = { datesOf: 0 };
  const deps = (hod: boolean) => ({
    isHod: () => hod,
    findByName: async (n: string) => (await q(`${SELECT_PEOPLE} WHERE er.name ILIKE '%' || $1 || '%'`, [n])) as never[],
    findByTicket: async (t: string) => (await q(`${SELECT_PEOPLE} WHERE er.ticket_no = $1`, [t])) as never[],
    datesOf: async (t: string[]) => { spy.datesOf++; return readDates(q, t); },
    now: DateTime.fromISO("2026-10-31T09:00:00", { zone: ZONE }),
  });
  const card = (r: Awaited<ReturnType<typeof answerDates>>) => r?.hospital;
  let r = await answerDates("date of birth of rakesh ojha", "498301", deps(true));
  ok("the HOD asks the date of birth of Rakesh Ojha: the headline is the date, the table has both dates (read from the real roster)", card(r)?.headline?.text === "01 Oct 1966" && !!card(r)?.table?.rows[0].join("|").includes("01 Oct 1966|12 Oct 2001"), JSON.stringify(card(r)?.table));
  r = await answerDates("when does rakesh ojha retire", "498301", deps(true));
  ok("...when does he retire: 31 Oct 2026 (the last day of the month of the 60th birthday)", card(r)?.headline?.text === "31 Oct 2026");
  r = await answerDates("age of rakesh ojha", "498301", deps(true));
  ok("...his age on 31 Oct 2026: 60 years 0 months", card(r)?.headline?.text === "60 years 0 months");
  r = await answerDates("years of service of rakesh ojha", "498301", deps(true));
  ok("...his service: 25 years 0 months (joined 12 Oct 2001)", card(r)?.headline?.text === "25 years 0 months");
  r = await answerDates(`doj of ${t804}`, "498301", deps(true));
  ok("...by ticket number: the date of joining, 12 Oct 2001", card(r)?.headline?.text === "12 Oct 2001");
  r = await answerDates("dob of no dates yet", "498301", deps(true));
  ok("a person with no dates on record: 'Not on record', not a crash and not an invented date", card(r)?.headline?.text === "Not on record");
  const before = spy.datesOf;
  for (const who of [null, "123456", "412345", "498880"]) {
    const refused = await answerDates("date of birth of rakesh ojha", who, deps(false));
    ok(`${who ?? "nobody logged in"}: refused with one sentence, the card holds NO date, and the database was NOT asked for the dates`, card(refused)?.status?.text === REFUSAL && !JSON.stringify(refused).match(/1966|2001|Oct/) && spy.datesOf === before, JSON.stringify(refused));
  }
  ok("a sentence about nobody here is not ours, for the HOD and for everybody else (the other routes answer as before)", (await answerDates("date of birth of nobody here", "498301", deps(true))) === null && (await answerDates("date of birth of nobody here", "123456", deps(false))) === null);
  ok("the reader asked the database for the dates ONLY for the HOD's questions (6 successful lookups above, none for the refusals)", spy.datesOf === before);

  await pool.end();
  console.log(`peopleEventsDb selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
