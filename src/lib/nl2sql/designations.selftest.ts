// Run (from the project root; needs a scratch Postgres):
//   NL2SQL_TEST_ADMIN_URL=postgres://postgres:pw@127.0.0.1:5432/postgres npx tsx --tsconfig tsconfig.json src/lib/nl2sql/designations.selftest.ts
// Step 66c: sql/16_designations.sql on a copy of the OWNER'S OWN table: the 30 designations exactly as he pasted them (1 Nov 2026) and the number of people on each (6484 in all), with the live foreign key and an id sequence
// that is BEHIND the rows (they were loaded with fixed ids). The people are invented.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";

const adminUrl = process.env.NL2SQL_TEST_ADMIN_URL;
if (!adminUrl) { console.log("designations selftest: skipped (NL2SQL_TEST_ADMIN_URL is not set)"); process.exit(0); }
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const SQL = readFileSync(join(process.cwd(), "src/lib/nl2sql/sql/16_designations.sql"), "utf8");

// [id, code, title, track, rank_order, people] exactly as in the owner's screenshots
const ROWS: Array<[number, number, string, string, number, number]> = [
  [1, 227, "Director In-charge", "managerial", 1, 1], [2, 223, "Executive Director", "managerial", 2, 6], [3, 222, "Chief General Manager", "managerial", 3, 30], [5, 221, "General Manager", "managerial", 4, 232],
  [7, 216, "Dy. General Manager", "managerial", 5, 118], [10, 212, "Asst.General Manager", "managerial", 7, 247], [12, 211, "Sr. Manager", "managerial", 8, 85], [13, 208, "Manager", "managerial", 9, 36],
  [14, 207, "Dy. Manager", "managerial", 10, 127], [16, 204, "Asst. Manager", "managerial", 12, 149], [18, 201, "Asst. Manager", "managerial", 13, 95], [19, 201, "Junior Manager", "managerial", 13, 1],
  [4, 222, "Director(M&HS)", "medical", 3, 1], [6, 221, "Joint Director", "medical", 4, 9], [8, 216, "Sr. Deputy Director", "medical", 5, 12], [9, 213, "DMO/Consultant", "medical", 6, 3],
  [11, 212, "Asst. Director/Sr. Consultant", "medical", 7, 4], [15, 206, "ADMO/Specialist", "medical", 11, 1], [17, 204, "Medical Officer", "medical", 12, 7],
  [20, 415, "S-11", "nonexec", 14, 1853], [21, 414, "S-10", "nonexec", 15, 1063], [22, 409, "S-9", "nonexec", 16, 112], [23, 408, "S-8", "nonexec", 17, 147], [24, 407, "S-7", "nonexec", 18, 618],
  [25, 406, "S-6", "nonexec", 19, 541], [26, 405, "S-5", "nonexec", 20, 301], [27, 404, "S-4", "nonexec", 21, 260], [28, 403, "S-3", "nonexec", 22, 196], [29, 402, "S-2", "nonexec", 23, 114], [30, 401, "S-1", "nonexec", 24, 115],
];

async function build(adm: Pool, name: string): Promise<Pool> {
  await adm.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await adm.query(`CREATE DATABASE ${name}`);
  const pool = new Pool({ connectionString: adminUrl!.replace(/\/[^/]*$/, `/${name}`), max: 3 });
  await pool.query(`CREATE TABLE public.designation_grade (id serial PRIMARY KEY, code int NOT NULL, title text NOT NULL, track text NOT NULL, rank_order int NOT NULL);
    CREATE TABLE public.employee_roster (id serial PRIMARY KEY, ticket_no text NOT NULL, name text NOT NULL, designation_grade_id int NOT NULL, cohort text NOT NULL, within_grade_position int NOT NULL, global_seniority_rank int NOT NULL,
      CONSTRAINT employee_roster_designation_grade_id_fkey FOREIGN KEY (designation_grade_id) REFERENCES public.designation_grade(id));
    CREATE TABLE public."user" (id text PRIMARY KEY, "ticketNo" text, designation text);`);
  for (const [id, code, title, track, rank] of ROWS) await pool.query(`INSERT INTO public.designation_grade (id, code, title, track, rank_order) VALUES ($1,$2,$3,$4,$5)`, [id, code, title, track, rank]); // fixed ids: the sequence stays at 1
  let n = 0;
  for (const [id, , , track, rank, people] of ROWS) {
    // the two "Asst. Manager" rows: 54 / 1 direct recruits (ticket 49xxxx), the rest promotees, as the owner's second query showed
    const direct = id === 16 ? 54 : id === 18 ? 1 : 0;
    await pool.query(
      `INSERT INTO public.employee_roster (ticket_no, name, designation_grade_id, cohort, within_grade_position, global_seniority_rank)
       SELECT CASE WHEN $4 = 'nonexec' THEN (1 + (${n} + i) % 3)::text || lpad((${n} + i)::text, 5, '0') WHEN i <= $5 THEN '49' || lpad((${n} + i)::text, 4, '0') ELSE '4' || ((${n} + i) % 9)::text || lpad((${n} + i)::text, 4, '0') END,
              'PERSON ' || (${n} + i), $1, CASE WHEN $4 = 'nonexec' THEN 'nonexecutive' ELSE 'executive' END, i, $2 * 10000 + i
         FROM generate_series(1, $3) AS i`, [id, rank, people, track, direct]);
    n += people;
  }
  await pool.query(`INSERT INTO public."user" (id, "ticketNo", designation) SELECT 'u' || er.id, er.ticket_no, dg.title FROM public.employee_roster er JOIN public.designation_grade dg ON dg.id = er.designation_grade_id WHERE dg.id IN (3, 10, 19, 18) AND er.within_grade_position <= 3`);
  return pool;
}
async function run(pool: Pool): Promise<void> {
  const c: PoolClient = await pool.connect();
  try { await c.query(SQL); } catch (e) { try { await c.query("ROLLBACK"); } catch { /* none open */ } throw e; } finally { c.release(); }
}

async function main() {
  const adm = new Pool({ connectionString: adminUrl, max: 1 });
  const pool = await build(adm, "designations_selftest");
  const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p as never[])).rows;
  const n = async (sql: string, p: unknown[] = []) => Number((await q(sql, p))[0].n);
  const grades = async () => q(`SELECT dg.id, dg.code, dg.title, dg.track, dg.rank_order, count(er.id)::int AS people FROM public.designation_grade dg LEFT JOIN public.employee_roster er ON er.designation_grade_id = dg.id GROUP BY dg.id ORDER BY dg.id`);

  ok("(set-up) the copy of the owner's table: 30 designations, 6484 people, the two duplicates and 'Junior Manager' with 95 + 1 people, code 201 on both", (await grades()).length === 30 && (await n(`SELECT count(*) AS n FROM public.employee_roster`)) === 6484 && (await n(`SELECT count(*) AS n FROM public.employee_roster WHERE designation_grade_id IN (18, 19)`)) === 96);
  const beforeRoster = await q(`SELECT id, ticket_no, designation_grade_id, within_grade_position AS p, global_seniority_rank AS r FROM public.employee_roster ORDER BY id`);
  const old18 = beforeRoster.filter((r) => r.designation_grade_id === 18).sort((a, b) => a.p - b.p).map((r) => r.id);
  let insertFailsWithoutFix = false;
  try { await pool.query(`INSERT INTO public.designation_grade (code, title, track, rank_order) VALUES (1, 'x', 'managerial', 1)`); } catch { insertFailsWithoutFix = true; }
  ok("(set-up) the id sequence is BEHIND the rows, as in a table loaded with fixed ids: a plain INSERT without an id fails", insertFailsWithoutFix);

  await run(pool);
  const g = await grades();
  const byTitle = (t: string, track?: string) => g.filter((x) => x.title === t && (!track || x.track === track));

  // ---- 1. the spelling ----
  ok("the spelling: 'Asst. General Manager' (a space after the dot) in the list; the old text is gone; the 247 people are still on it", byTitle("Asst. General Manager").length === 1 && byTitle("Asst. General Manager")[0].id === 10 && byTitle("Asst.General Manager").length === 0 && byTitle("Asst. General Manager")[0].people === 247);
  ok("...and in the login accounts that carried the old text", (await n(`SELECT count(*) AS n FROM public."user" WHERE designation = 'Asst.General Manager'`)) === 0 && (await n(`SELECT count(*) AS n FROM public."user" WHERE designation = 'Asst. General Manager'`)) === 3);

  // ---- 2. ONE Asst. Manager ----
  ok("ONE 'Asst. Manager' in the executives' list (code 204, id 16): the duplicate (id 18) and 'Junior Manager' (id 19) are GONE", byTitle("Asst. Manager", "managerial").length === 1 && byTitle("Asst. Manager", "managerial")[0].id === 16 && byTitle("Asst. Manager", "managerial")[0].code === 204 && !g.some((x) => x.id === 18 || x.id === 19) && byTitle("Junior Manager").length === 0);
  ok("...it holds 149 + 95 + 1 = 245 people; nobody was lost: 6484 people still, each on an existing designation (the foreign key holds)", byTitle("Asst. Manager", "managerial")[0].people === 245 && (await n(`SELECT count(*) AS n FROM public.employee_roster`)) === 6484 && (await n(`SELECT count(*) AS n FROM public.employee_roster er LEFT JOIN public.designation_grade dg ON dg.id = er.designation_grade_id WHERE dg.id IS NULL`)) === 0);
  const after = await q(`SELECT id, ticket_no, designation_grade_id, within_grade_position AS p, global_seniority_rank AS r FROM public.employee_roster ORDER BY id`);
  const moved = after.filter((r) => beforeRoster.find((b) => b.id === r.id)!.designation_grade_id !== r.designation_grade_id);
  ok("exactly the 96 people of the two old rows moved, and nobody else changed (not one other designation, position or rank)", moved.length === 96 && after.filter((r) => !moved.some((m) => m.id === r.id)).every((r) => { const b = beforeRoster.find((x) => x.id === r.id)!; return b.designation_grade_id === r.designation_grade_id && b.p === r.p && b.r === r.r; }));
  ok("the 149 who were there keep positions 1 to 149; the 96 who came have positions 150 to 245, all different", (() => { const on16 = after.filter((r) => r.designation_grade_id === 16); const pos = on16.map((r) => r.p).sort((a, b) => a - b); return pos.length === 245 && pos.every((p, i) => p === i + 1) && moved.every((m) => m.p >= 150 && m.p <= 245); })());
  ok("the HR formula holds for every one of them: rank = 12 x 10000 + position (the grade's order is 12)", after.filter((r) => r.designation_grade_id === 16).every((r) => r.r === 120000 + r.p));
  ok("their relative ORDER is kept: the people of the old 201 'Asst. Manager' row stay in the order they had", (() => { const np = (id: number) => after.find((r) => r.id === id)!.p; return old18.every((id, i) => i === 0 || np(old18[i - 1]) < np(id)); })());

  // ---- 3. the training designations ----
  const want: Array<[string, string, number, number]> = [["Management Trainee", "managerial", 201, 13], ["Junior Officer", "managerial", 201, 13], ["DNB Doctor", "medical", 201, 13], ["SOT", "nonexec", 400, 25], ["JOT", "nonexec", 399, 26], ["TA", "nonexec", 398, 27]];
  ok("the six training designations are there, EMPTY, with the codes and ranks said (the last four codes are placeholders)", want.every(([t, tr, c, r]) => { const x = byTitle(t, tr); return x.length === 1 && x[0].code === c && x[0].rank_order === r && x[0].people === 0; }));
  ok("...each has its own new id (no clash with the rows loaded with fixed ids), and the id sequence has caught up, so a normal insert works afterwards", new Set(g.map((x) => x.id)).size === g.length && (await n(`SELECT min(id) AS n FROM public.designation_grade WHERE title IN ('Management Trainee','Junior Officer','DNB Doctor','SOT','JOT','TA')`)) > 30 && await (async () => { try { await pool.query(`INSERT INTO public.designation_grade (code, title, track, rank_order) VALUES (1, 'sequence check', 'managerial', 1)`); await pool.query(`DELETE FROM public.designation_grade WHERE title = 'sequence check'`); return true; } catch { return false; } })());
  ok("every OTHER designation is untouched (title, code, track, order, head-count), the spelling aside", ROWS.filter(([id]) => ![16, 18, 19, 10].includes(id)).every(([id, code, title, track, rank, people]) => { const x = g.find((y) => y.id === id)!; return x && x.code === code && x.title === title && x.track === track && x.rank_order === rank && x.people === people; }));
  ok("in the order the employee form lists them (by rank, then id): the executives' entry grade shows 'Management Trainee', 'Junior Officer' after 'Asst. Manager'; the non-executives' list ends with S-1, SOT, JOT, TA", (() => { const ex = g.filter((x) => x.track !== "nonexec").sort((a, b) => a.rank_order - b.rank_order || a.id - b.id).map((x) => x.title); const ne = g.filter((x) => x.track === "nonexec").sort((a, b) => a.rank_order - b.rank_order || a.id - b.id).map((x) => x.title); return ex.indexOf("Asst. Manager") < ex.indexOf("Management Trainee") && ex.indexOf("Management Trainee") < ex.indexOf("Junior Officer") && ne.slice(-4).join() === "S-1,SOT,JOT,TA"; })());
  ok("the new rows have their ids in the order of the list (Management Trainee, Junior Officer, DNB Doctor, SOT, JOT, TA): always the same", (() => { const ids = ["Management Trainee", "Junior Officer", "DNB Doctor", "SOT", "JOT", "TA"].map((t) => g.find((y) => y.title === t)!.id); return ids.every((id, i) => i === 0 || id === ids[i - 1] + 1); })());
  ok("the executives' designation list is now complete and clean: no duplicate title in a track, no 'Junior Manager'", (() => { const seen = new Set<string>(); for (const x of g) { const k = `${x.track}|${x.title}`; if (seen.has(k)) return false; seen.add(k); } return !g.some((x) => x.title === "Junior Manager"); })());

  // ---- safe to run again, and it never touches somebody in training ----
  const snapG = JSON.stringify(await grades()), snapR = JSON.stringify(await q(`SELECT id, designation_grade_id, within_grade_position, global_seniority_rank FROM public.employee_roster ORDER BY id`));
  await run(pool);
  ok("a SECOND run changes nothing (no duplicate rows, no moves, no new ids)", JSON.stringify(await grades()) === snapG && JSON.stringify(await q(`SELECT id, designation_grade_id, within_grade_position, global_seniority_rank FROM public.employee_roster ORDER BY id`)) === snapR);
  const mt = byTitle("Management Trainee", "managerial")[0];
  await pool.query(`UPDATE public.employee_roster SET designation_grade_id = $1, within_grade_position = 1, global_seniority_rank = 130001 WHERE id = (SELECT min(id) FROM public.employee_roster WHERE designation_grade_id = 16)`, [mt.id]);
  await run(pool);
  ok("somebody who IS a Management Trainee afterwards is not touched by a later run (the script moves only the people of the two old rows)", (await n(`SELECT count(*) AS n FROM public.employee_roster WHERE designation_grade_id = $1`, [mt.id])) === 1 && (await grades()).filter((x) => x.title === "Management Trainee").length === 1);

  // ---- all or nothing ----
  const pool2 = await build(adm, "designations_selftest2");
  await pool2.query(`ALTER TABLE public.designation_grade ADD COLUMN must_have text NOT NULL DEFAULT 'x'; ALTER TABLE public.designation_grade ALTER COLUMN must_have DROP DEFAULT;`);
  let failed = false; try { await run(pool2); } catch { failed = true; }
  const q2 = async (sql: string) => (await pool2.query(sql)).rows;
  ok("if the real table has a column the script does not know (a NOT NULL one), the script FAILS and NOTHING is kept: the spelling is unchanged, no row added, no person moved, the duplicate rows still there", failed && (await q2(`SELECT title FROM public.designation_grade WHERE id = 10`))[0].title === "Asst.General Manager" && Number((await q2(`SELECT count(*) AS n FROM public.designation_grade`))[0].n) === 30 && Number((await q2(`SELECT count(*) AS n FROM public.employee_roster WHERE designation_grade_id IN (18, 19)`))[0].n) === 96 && Number((await q2(`SELECT count(*) AS n FROM public."user" WHERE designation = 'Asst.General Manager'`))[0].n) === 3);
  await pool2.end();

  // ---- a table that is already right: nothing to do ----
  const pool3 = await build(adm, "designations_selftest3");
  await pool3.query(`DELETE FROM public."user"`);
  await run(pool3); await run(pool3);
  ok("the script runs on the fixed table again and again without harm", Number((await pool3.query(`SELECT count(*) AS n FROM public.designation_grade`)).rows[0].n) === 34 && Number((await pool3.query(`SELECT count(*) AS n FROM public.employee_roster`)).rows[0].n) === 6484);
  await pool3.end(); await pool.end(); await adm.end();
  console.log(`designations selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
