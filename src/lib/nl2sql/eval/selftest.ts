// src/lib/nl2sql/eval/selftest.ts
//
// Everything about the natural-language-to-SQL experiment that can be proven
// WITHOUT a live language model. Runs against a scratch local PostgreSQL
// (never your real database):
//
//   NL2SQL_TEST_ADMIN_URL=postgres://postgres:pw@127.0.0.1:5432/postgres \
//     npx tsx src/lib/nl2sql/eval/selftest.ts
//
// What it proves: the SQL guard, the database-level read-only security, the
// phonetic building blocks against the app's existing JavaScript engine, the
// prompt, the repair loop, logging and tick/cross, and -- with a stand-in
// "model" that replies with the reference SQL -- that every golden question
// runs through the full pipeline and matches. What it CANNOT prove: how well
// the REAL model writes SQL from new wordings. That is run-live.ts.

import { Client } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

import { guardSql } from "../guard";
import { runReadOnly } from "../executor";
import { answerQuestion } from "../pipeline";
import { groqLlm } from "../llm";
import { parsePlan } from "../generator";
import { buildPrompt } from "../prompt";
import { loadDynamicContext, clearContextCache, selectRelevantDepartments } from "../context";
import { SEED_EXAMPLES, pickExamples, similarity } from "../examples";
import { recordVerdict } from "../log";
import { extractQuotedTerms, checkQuotedTerms } from "../quoted";
import { checkDepartmentColumns, checkDepartmentIdentity } from "../deptColumns";
import { checkComparison, checkRankingAndOrder, comparisonVerdict } from "../rankingCheck";
import { checkHealthColumns, checkPersonIdentity } from "../identityCheck";
import { isHealthQuestion } from "../prompt";
import { isSingleRowTable } from "../display";
import { addCohortColumn, humanizeSeniority, presentPeople, withCohortInHint } from "../seniorityDisplay";
import { departmentScopeQueries, computeDepartmentScope, peopleFootprintQuery, departmentFilterInfo } from "../scope";
import { stableOrderSql, PAGE_SIZE } from "../paging";
import { pageProgress, mergePage, columnKind, formatCell, sortRows, toCsv, resolveDisplay, rowCountLabel, exportNote } from "../display";
import { runOmnibar, peopleFor, parseRetry, MAX_ATTEMPTS, withDisplayCodes, withExtraFields, type OmnibarDeps, peoplePage } from "../omnibar";
import { answerFromVerified } from "../pipeline";
import { parseFeedback, recordFeedback, undoFeedback, countRecentVotes, VOTES_PER_HOUR } from "../feedback";
import { findVerifiedSql, loadNegativeExamples, pickNegatives, retryHint, REASON_CODES } from "../learning";
import { loadRejectedSql } from "../log";
import { buildReport } from "./feedback-report";
import { vocabularyHits, vocabularyLine, checkVocabulary, checkNormPatterns } from "../vocabulary";
import { GOLDEN, compareResults } from "./golden";
import { GUARD_ACCEPT, GUARD_REJECT } from "./guard-cases";
import { buildSeedSql } from "./seed-local";
import type { LlmFn, SqlClient } from "../types";
import { evaluateNamePredicate, foldToken, type NamePredicate } from "../../employees/namePredicate";

const ADMIN_URL = process.env.NL2SQL_TEST_ADMIN_URL || "postgres://postgres:pw@127.0.0.1:5432/postgres";
const TEST_DB = "nl2sql_selftest";
const SQL_DIR = join(__dirname, "..", "sql");

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    failures.push(`${name}${detail ? " -- " + detail : ""}`);
    console.log(`  FAIL  ${name}${detail ? " -- " + detail : ""}`);
  }
}
function section(t: string) {
  console.log(`\n== ${t}`);
}

async function main() {
  // ---- scratch database ---------------------------------------------------
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = "/" + TEST_DB;
  const pg = new Client({ connectionString: url.toString() });
  await pg.connect();
  for (const f of ["99_local_test_standins.sql"]) await pg.query(readFileSync(join(SQL_DIR, f), "utf8"));
  await pg.query(buildSeedSql());
  for (const f of ["01_nlq_schema_views_role.sql", "02_nl2sql_log_tables.sql", "08_health_checkups.sql", "09_circular_ingest_log.sql"]) await pg.query(readFileSync(join(SQL_DIR, f), "utf8"));
  const db: SqlClient = { query: (t, p) => pg.query(t, p) as any };
  const withClient = async <T,>(fn: (c: SqlClient) => Promise<T>) => fn(db);
  const roster = (await pg.query(`SELECT ticket_no, name FROM public.employee_roster ORDER BY id`)).rows as { ticket_no: string; name: string }[];
  console.log(`scratch database ready: ${roster.length} employees`);

  // ==========================================================================
  section("A. SQL guard: must accept valid queries, reject every attack");
  for (const [n, s] of GUARD_ACCEPT) {
    const r = guardSql(s);
    check(`guard accepts: ${n}`, r.ok, r.ok ? "" : (r as any).reason);
  }
  for (const [n, s] of GUARD_REJECT) check(`guard rejects: ${n}`, !guardSql(s).ok);
  console.log(`  ${GUARD_ACCEPT.length} accept cases, ${GUARD_REJECT.length} reject cases`);

  // ==========================================================================
  section("B. Phonetic functions vs the app's JavaScript engine");
  const words = [
    "kumar", "kumer", "roy", "ray", "rai", "mazumdar", "majumdar", "majumder", "mazumder", "ghosh", "ghose", "basu", "bose", "bosu",
    "dutta", "dutt", "dut", "sinha", "singha", "singh", "debnath", "nath", "gopinath", "ramanath", "banerjee", "bandyopadhyay",
    "chattopadhyay", "mukhopadhyay", "gangopadhyay", "aggrawal", "aggarwal", "surinder", "surendra", "shivratri", "shivaratri",
    "pongal", "pongol", "mohammad", "mohammed", "bhatridwitiya", "sarkar", "sirkar", "chinmay", "sanjay", "kispotta", "phani", "bhaskar",
    "khan", "shekhar", "vishwakarma", "bishwakarma", "goutam", "gautam", "gautham", "amit", "rupak", "dilip", "alok", "yadav", "jha",
  ];
  let codeMismatch = 0;
  for (const w of words) {
    for (const isLast of [true, false]) {
      const r = await pg.query(`SELECT nlq.code($1, $2) AS c`, [w, isLast]);
      if (r.rows[0].c !== foldToken(w, isLast)) codeMismatch++;
    }
  }
  check(`nlq.code equals JavaScript foldToken for ${words.length * 2} word/position pairs`, codeMismatch === 0, `${codeMismatch} mismatches`);

  const jsCodes = (name: string) => {
    const toks = name.trim().split(/\s+/).filter((t) => t.replace(/[.,:]/g, "").length >= 2);
    return toks.map((t, i) => foldToken(t, i === toks.length - 1));
  };
  const viewCodes = (await pg.query(`SELECT name, name_codes FROM nlq.employees ORDER BY id`)).rows as { name: string; name_codes: string[] }[];
  const badCodes = viewCodes.filter((r) => JSON.stringify(r.name_codes) !== JSON.stringify(jsCodes(r.name))).length;
  check(`view name_codes equals JavaScript codes for all ${viewCodes.length} employees`, badCodes === 0, `${badCodes} differ`);

  // ==========================================================================
  section("C. The taught SQL building blocks vs the app's existing name engine");
  const W = (type: any, value: string, exact = false): NamePredicate => ({ type, value, ...(exact ? { exact: true } : {}) }) as NamePredicate;
  const N = (c: NamePredicate): NamePredicate => ({ type: "not", clause: c });
  const parity: [string, NamePredicate, string][] = [
    ["middle (similar)", { type: "and", clauses: [W("wordEquals", "kumar"), N(W("wordIsFirst", "kumar")), N(W("wordIsLast", "kumar"))] },
      `nlq.word_like(name_words,name_codes,'kumar') AND NOT nlq.first_word_like(name_words,name_codes,'kumar') AND NOT nlq.last_word_like(name_words,name_codes,'kumar')`],
    ["first similar arup", W("wordIsFirst", "arup"), `nlq.first_word_like(name_words,name_codes,'arup')`],
    ["last similar debnath", W("wordIsLast", "debnath"), `nlq.last_word_like(name_words,name_codes,'debnath')`],
    ["last similar nath", W("wordIsLast", "nath"), `nlq.last_word_like(name_words,name_codes,'nath')`],
    ["last similar roy", W("wordIsLast", "roy"), `nlq.last_word_like(name_words,name_codes,'roy')`],
    ["any similar majumdar", W("wordEquals", "majumdar"), `nlq.word_like(name_words,name_codes,'majumdar')`],
    ["any similar kumar", W("wordEquals", "kumar"), `nlq.word_like(name_words,name_codes,'kumar')`],
    ["exact any nath", W("wordEquals", "nath", true), `'NATH' = ANY(name_words)`],
    ["exact first kumar", W("wordIsFirst", "kumar", true), `name_words[1] = 'KUMAR'`],
    ["exact last kumar", W("wordIsLast", "kumar", true), `name_words[cardinality(name_words)] = 'KUMAR'`],
    ["exact last debnath and not exact nath", { type: "and", clauses: [W("wordIsLast", "debnath", true), N(W("wordEquals", "nath", true))] },
      `name_words[cardinality(name_words)] = 'DEBNATH' AND NOT ('NATH' = ANY(name_words))`],
    ["arup ... roy (similar)", { type: "and", clauses: [W("wordIsFirst", "arup"), W("wordIsLast", "roy")] },
      `nlq.first_word_like(name_words,name_codes,'arup') AND nlq.last_word_like(name_words,name_codes,'roy')`],
    ["first arup OR last kumar", { type: "or", clauses: [W("wordIsFirst", "arup"), W("wordIsLast", "kumar")] },
      `nlq.first_word_like(name_words,name_codes,'arup') OR nlq.last_word_like(name_words,name_codes,'kumar')`],
    ["not first similar singh", N(W("wordIsFirst", "singh")), `NOT nlq.first_word_like(name_words,name_codes,'singh')`],
  ];
  for (const [label, pred, sqlExpr] of parity) {
    const jsSet = new Set(roster.filter((r) => evaluateNamePredicate(pred, r.name, jsCodes(r.name))).map((r) => r.ticket_no));
    const sqlSet = new Set((await pg.query(`SELECT ticket_no FROM nlq.employees WHERE ${sqlExpr}`)).rows.map((r: any) => r.ticket_no));
    const same = jsSet.size === sqlSet.size && [...jsSet].every((x) => sqlSet.has(x));
    check(`SQL blocks equal the existing engine: ${label} (${jsSet.size} rows)`, same, `js ${jsSet.size} vs sql ${sqlSet.size}`);
  }
  // The specific separations from the real conversation:
  const sim = (await pg.query(`SELECT count(*)::int n FROM nlq.employees WHERE nlq.last_word_like(name_words,name_codes,'debnath')`)).rows[0].n;
  const exD = (await pg.query(`SELECT count(*)::int n FROM nlq.employees WHERE name_words[cardinality(name_words)]='DEBNATH'`)).rows[0].n;
  const exN = (await pg.query(`SELECT count(*)::int n FROM nlq.employees WHERE name_words[cardinality(name_words)]='NATH'`)).rows[0].n;
  check("similar 'debnath' = exact DEBNATH + exact NATH (glued by default, separable when exact)", sim === exD + exN, `${sim} vs ${exD}+${exN}`);

  // ==========================================================================
  section("D. Database-level security: hostile SQL run as the reader role");
  const asReader = async (sql: string, timeoutMs = 3000) => {
    await pg.query("BEGIN READ ONLY");
    try {
      await pg.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
      await pg.query("SET LOCAL ROLE nlq_reader");
      await pg.query("SET LOCAL search_path = nlq, pg_catalog");
      await pg.query(sql);
      return { ok: true as const, error: "" };
    } catch (e: any) {
      return { ok: false as const, error: String(e.message) };
    } finally {
      await pg.query("ROLLBACK").catch(() => {});
    }
  };
  const mustFail = async (label: string, sql: string, timeoutMs?: number) => {
    const r = await asReader(sql, timeoutMs);
    check(`reader cannot: ${label}`, !r.ok, "the statement SUCCEEDED");
  };
  await mustFail("read public.\"user\" (passwords)", `SELECT password FROM public."user"`);
  await mustFail("read public.employee_roster directly", `SELECT * FROM public.employee_roster`);
  await mustFail("read the query log", `SELECT * FROM public.nl2sql_log`);
  await mustFail("read pg_shadow", `SELECT * FROM pg_catalog.pg_shadow`);
  await mustFail("insert into a view", `INSERT INTO nlq.employees (id) VALUES (1)`);
  await mustFail("update a view", `UPDATE nlq.employees SET name = 'x'`);
  await mustFail("delete from a view", `DELETE FROM nlq.employees`);
  await mustFail("create a table", `CREATE TABLE nlq.pwn (a int)`);
  await mustFail("drop a view", `DROP VIEW nlq.employees`);
  await mustFail("truncate the roster", `TRUNCATE public.employee_roster`);
  await mustFail("read a server file", `SELECT pg_read_file('/etc/passwd')`);
  await mustFail("run past the timeout (pg_sleep 5 with 500 ms limit)", `SELECT pg_sleep(5)`, 500);
  const stillThere = (await pg.query(`SELECT count(*)::int n FROM public.employee_roster`)).rows[0].n;
  check("roster intact after every attack", stillThere === roster.length, `${stillThere} vs ${roster.length}`);
  const okRead = await asReader(`SELECT count(*) FROM nlq.employees`);
  check("reader CAN read the approved views", okRead.ok, okRead.error);
  const helpers = await asReader(`SELECT nlq.code('kumar', true), nlq.norm('C & IT'), nlq.word_like(name_words, name_codes, 'kumar') FROM nlq.employees LIMIT 1`);
  check("reader CAN call the helper functions", helpers.ok, helpers.error);

  // Documented residual risk: the one known way out of SET ROLE.
  const escape = await asReader(`SELECT set_config('role', 'postgres', true), (SELECT count(*) FROM public."user")`);
  check("role-escape + read of the user table in ONE statement fails", !escape.ok, "escape succeeded");
  console.log("  (note: set_config('role', ...) is refused by the guard; a dedicated login role, sql/03_*.sql, removes the risk entirely)");

  // The executor itself
  const ex = await runReadOnly(db, `SELECT count(*) AS count FROM nlq.employees`);
  check("executor returns rows and columns", ex.rows.length === 1 && ex.columns[0] === "count" && Number(ex.rows[0].count) === roster.length);
  const wrapperBreak = await runReadOnly(db, `SELECT 1) x; DROP TABLE public.employee_roster; --`).then(() => "ran", (e) => String(e.message));
  check("executor refuses a statement-breakout attempt", wrapperBreak !== "ran");
  const big = await runReadOnly(db, `SELECT ticket_no FROM nlq.employees ORDER BY global_seniority_rank`, { rowLimit: 50 });
  check("row cap applies and the true total is still reported", big.rows.length === 50 && big.truncated && big.total === roster.length, `${big.rows.length}/${big.total}`);
  const afterTxn = await pg.query(`SHOW transaction_read_only`);
  check("connection is left outside any read-only transaction", afterTxn.rows[0].transaction_read_only === "off");

  // ==========================================================================
  section("D2. Setup file 05 runs as ONE transaction (as the Supabase editor does), repeats safely, leaks no role");
  const file05 = readFileSync(join(SQL_DIR, "05_fast_name_codes.sql"), "utf8");
  for (const pass of [1, 2]) {
    let err = "";
    try {
      await pg.query(file05);
    } catch (e: any) {
      err = String(e.message);
    }
    check(`05 runs cleanly as a single query (run ${pass})`, err === "", err);
  }
  const roleAfter = (await pg.query(`SELECT current_user AS u`)).rows[0].u;
  check("no restricted role is left switched on after the file", roleAfter !== "nlq_reader", roleAfter);
  const afterRoster = (await pg.query(`SELECT count(*)::int n FROM public.employee_roster`)).rows[0].n;
  check("the connection can still read the roster after the file (role fully restored)", afterRoster === roster.length, String(afterRoster));

  // ==========================================================================
  section("D3. Spelling families: Mukhopadhya / Gangopadhya ... match their family (typed words AND stored names)");
  const sameCode = async (a2: string, b2: string) => (await pg.query(`SELECT nlq.code($1, true) = nlq.code($2, true) AS same`, [a2, b2])).rows[0].same === true;
  for (const [variant, family] of [
    ["gangopadhya", "ganguly"], ["gangopadhyay", "ganguly"], ["ganguli", "ganguly"], ["gangapadhyay", "ganguly"],
    ["mukhopadhya", "mukherjee"], ["mukhopadhayay", "mukherjee"], ["mukhopadhyaya", "mukherjee"], ["mukherji", "mukherjee"],
    ["bandyopadhya", "banerjee"], ["bandhopadhyay", "banerjee"], ["bandopadhyay", "banerjee"], ["banerji", "banerjee"],
    ["chattopadhya", "chatterjee"], ["chatopadhyay", "chatterjee"], ["chatterji", "chatterjee"],
  ]) check(`typed "${variant}" matches the ${family} family`, await sameCode(variant, family));
  for (const variant of ["bhattacharyya", "bhattacharyay", "bhattacharjee", "bhattacharji", "bhattacharjya", "bhattacharjyya", "bhatacharya", "bhattacharjeee"]) {
    check(`typed "${variant}" matches the bhattacharya family`, await sameCode(variant, "bhattacharya"));
  }
  for (const [x, y] of [["bhattacharya", "bhatia"], ["bhattacharya", "bhattar"], ["bhattacharya", "bhat"], ["bhattacharya", "mukherjee"], ["bhattacharjee", "banerjee"]]) {
    check(`different surnames stay different: ${x} / ${y}`, !(await sameCode(x, y)));
  }
  check("words that merely CONTINUE past the family are untouched (BHATTACHARJEEVAN, BHATIA)", (await pg.query(`SELECT nlq.spelling_fix('BHATTACHARJEEVAN') AS a, nlq.spelling_fix('BHATIA') AS b`)).rows[0].a === "BHATTACHARJEEVAN" && (await pg.query(`SELECT nlq.spelling_fix('BHATIA') AS b`)).rows[0].b === "BHATIA");
  for (const [x, y] of [["mukherjee", "banerjee"], ["mukherjee", "chatterjee"], ["banerjee", "chatterjee"], ["ganguly", "mukherjee"], ["upadhyay", "mukherjee"], ["gangadhar", "ganguly"], ["mukund", "mukherjee"]]) {
    check(`different surnames stay different: ${x} / ${y}`, !(await sameCode(x, y)));
  }
  check("Upadhyay is untouched by the -padhyay rule", (await pg.query(`SELECT nlq.spelling_fix('UPADHYAY') AS s`)).rows[0].s === "UPADHYAY");
  await pg.query("BEGIN");
  try {
    await pg.query(`INSERT INTO public.employee_roster (ticket_no,name,designation_grade_id,sail_department_id,cohort,within_grade_position,global_seniority_rank) VALUES
      ('990001','ZZ ONE MUKHOPADHYA',20,1,'nonexecutive',99001,990001), ('990002','ZZ TWO MUKHOPADHAYAY',20,1,'nonexecutive',99002,990002),
      ('990003','ZZ THREE GANGOPADHYA',20,1,'nonexecutive',99003,990003), ('990004','ZZ FOUR GANGULY',20,1,'nonexecutive',99004,990004)`);
    await pg.query(`SELECT nlq.refresh_name_codes()`);
    const mk = (await pg.query(`SELECT name FROM nlq.employees WHERE name LIKE 'ZZ %' AND nlq.word_like(name_words, name_codes, 'mukherjee') ORDER BY name`)).rows.map((r: any) => r.name);
    check("a search for 'mukherjee' now finds the Mukhopadhya and Mukhopadhayay spellings", mk.length === 2 && mk[0] === "ZZ ONE MUKHOPADHYA" && mk[1] === "ZZ TWO MUKHOPADHAYAY", JSON.stringify(mk));
    const gg = (await pg.query(`SELECT name FROM nlq.employees WHERE name LIKE 'ZZ %' AND nlq.last_word_like(name_words, name_codes, 'gangopadhya') ORDER BY name`)).rows.map((r: any) => r.name);
    check("typing 'gangopadhya' finds both GANGOPADHYA and GANGULY", gg.length === 2 && gg.includes("ZZ THREE GANGOPADHYA") && gg.includes("ZZ FOUR GANGULY"), JSON.stringify(gg));
    const exact = (await pg.query(`SELECT name FROM nlq.employees WHERE name LIKE 'ZZ %' AND 'MUKHOPADHYA' = ANY(name_words)`)).rows.map((r: any) => r.name);
    check("EXACT matching still sees the literal spelling only (the real words are never rewritten)", exact.length === 1 && exact[0] === "ZZ ONE MUKHOPADHYA", JSON.stringify(exact));
    const drift = (await pg.query(`SELECT count(*)::int n FROM nlq.employee_name_codes nc JOIN public.employee_roster er ON er.id = nc.id AND er.name = nc.name WHERE nc.codes IS DISTINCT FROM coalesce(nlq.name_codes_of(er.name), ARRAY[]::text[])`)).rows[0].n;
    check("stored codes equal live codes after the refresh", drift === 0, String(drift));

    // -- the Bhattacharya family: Bhattacharyya / Bhattacharjee / Bhattacharji / Bhattacharjya and the typo Bhattacharyay
    await pg.query(`INSERT INTO public.employee_roster (ticket_no,name,designation_grade_id,sail_department_id,cohort,within_grade_position,global_seniority_rank) VALUES
      ('990005','ZZ FIVE BHATTACHARJEE',20,1,'nonexecutive',99005,990005), ('990006','ZZ SIX BHATTACHARJYA',20,1,'nonexecutive',99006,990006),
      ('990007','ZZ SEVEN BHATTACHARYAY',20,1,'nonexecutive',99007,990007), ('990008','ZZ EIGHT BHATTACHARYYA',20,1,'nonexecutive',99008,990008),
      ('990009','ZZ BHATTACHARJI NINE',20,1,'nonexecutive',99009,990009), ('990010','ZZ TEN BHATIA',20,1,'nonexecutive',99010,990010)`);
    await pg.query(`SELECT nlq.refresh_name_codes()`);
    const bhLast = (await pg.query(`SELECT name FROM nlq.employees WHERE name LIKE 'ZZ %' AND nlq.last_word_like(name_words, name_codes, 'bhattacharya') ORDER BY name`)).rows.map((r: any) => r.name);
    check("surname 'bhattacharya' finds Bhattacharjee, Bhattacharjya, the typo Bhattacharyay and Bhattacharyya", bhLast.length === 4 && ["ZZ FIVE BHATTACHARJEE", "ZZ SIX BHATTACHARJYA", "ZZ SEVEN BHATTACHARYAY", "ZZ EIGHT BHATTACHARYYA"].every((n) => bhLast.includes(n)), JSON.stringify(bhLast));
    const bhAny = (await pg.query(`SELECT name FROM nlq.employees WHERE name LIKE 'ZZ %' AND nlq.word_like(name_words, name_codes, 'bhattacharjee') ORDER BY name`)).rows.map((r: any) => r.name);
    check("typing 'bhattacharjee' finds the whole family wherever the word sits, and not Bhatia", bhAny.length === 5 && bhAny.includes("ZZ BHATTACHARJI NINE") && !bhAny.includes("ZZ TEN BHATIA"), JSON.stringify(bhAny));
    const bhExact = (await pg.query(`SELECT name FROM nlq.employees WHERE name LIKE 'ZZ %' AND 'BHATTACHARJEE' = ANY(name_words)`)).rows.map((r: any) => r.name);
    check("EXACT matching still sees only the literal spelling", bhExact.length === 1 && bhExact[0] === "ZZ FIVE BHATTACHARJEE", JSON.stringify(bhExact));
    const drift2 = (await pg.query(`SELECT count(*)::int n FROM nlq.employee_name_codes nc JOIN public.employee_roster er ON er.id = nc.id AND er.name = nc.name WHERE nc.codes IS DISTINCT FROM coalesce(nlq.name_codes_of(er.name), ARRAY[]::text[])`)).rows[0].n;
    check("stored codes still equal live codes after the Bhattacharya rows", drift2 === 0, String(drift2));
  } finally {
    await pg.query("ROLLBACK");
  }
  const file06 = readFileSync(join(SQL_DIR, "06_spelling_families.sql"), "utf8");
  for (const pass of [1, 2]) {
    let err = "";
    try { await pg.query(file06); } catch (e: any) { err = String(e.message); }
    check(`06 runs cleanly as a single query (run ${pass})`, err === "", err);
  }
  check("no restricted role is left switched on after 06", (await pg.query(`SELECT current_user AS u`)).rows[0].u !== "nlq_reader");

  // ==========================================================================
  section("E. Seed examples shown to the model must be valid and runnable");
  for (const e of SEED_EXAMPLES) {
    if (!e.sql) continue;
    const g = guardSql(e.sql);
    let ran = false;
    let err = "";
    if (g.ok) {
      try {
        await runReadOnly(db, g.sql);
        ran = true;
      } catch (x: any) {
        err = x.message;
      }
    }
    check(`seed example runs: "${e.question.slice(0, 50)}"`, g.ok && ran, g.ok ? err : (g as any).reason);
  }

  // ==========================================================================
  section("F. Prompt assembly");
  clearContextCache();
  const ctx = await loadDynamicContext(db);
  check("live context loads 30 designations and the departments", ctx.designations.length === 30 && ctx.departments.length === 15);
  const prompt = buildPrompt({ question: "GMs in C&IT whose name ends with nath", context: ctx, examples: pickExamples("GMs in C&IT whose name ends with nath", []) });
  for (const must of ["nlq.employees", "global_seniority_rank", "word_like", "first_word_like", "last_word_like", "double quotes", "EXACT", "C & IT", "General Manager", "98500", "Return only the JSON object", "GMs in C&IT whose name ends with nath"]) {
    check(`prompt contains "${must}"`, prompt.includes(must));
  }
  check("prompt does not expose private columns", !/password|contactNo|email_nic\b.*@/.test(prompt.replace(/has_email_nic/g, "")));
  console.log(`  prompt size: ${prompt.length} characters (about ${Math.round(prompt.length / 4)} tokens)`);
  // Token budget: the model provider limits tokens per request/minute, so the prompt must stay small
  // even with the real ~300 departments. (Calibration from a real failure: 24,913 chars was counted as 8,284 tokens.)
  const padded = [...ctx.departments, ...Array.from({ length: 285 }, (_, i) => ({ id: 100 + i, code: 30000 + i, name: `SECTION ${i} MECHANICAL MAINTENANCE STAFF`, cohort_scope: "shared" }))];
  for (const qq of ["how many non executives are in plant garage", "how many executives have no NIC email", "GMs in C&IT whose name ends with nath"]) {
    const pp = buildPrompt({ question: qq, context: { ...ctx, departments: padded }, examples: pickExamples(qq, []) });
    check(`prompt stays under the token budget with 300 departments: "${qq.slice(0, 32)}"`, pp.length < 18500, `${pp.length} chars`);
  }
  const garage = selectRelevantDepartments("how many non executives are in plant garage", ctx.departments).map((d) => d.id).sort((x, y) => x - y);
  check("a named department brings in ALL its matching rows (plant garage = ids 4,5,6)", JSON.stringify(garage) === "[4,5,6]", JSON.stringify(garage));
  check("a question naming no department shows no department rows", selectRelevantDepartments("how many executives have no NIC email", ctx.departments).length === 0);
  check("a full department name is found", selectRelevantDepartments("people in electrical technical lab", ctx.departments).some((d) => d.id === 7));
  const picked = pickExamples("find names starting with sanj", []);
  check("example retrieval returns a bounded, valid set incl. the unanswerable exemplar", picked.length <= 6 && picked.some((e) => e.sql === null));
  check("similarity ranks a near-duplicate above an unrelated question", similarity("kumar at the middle", "find employees with kumar in the middle") > similarity("kumar at the middle", "how many executives in garage"));
  const repairPrompt = buildPrompt({ question: "q", context: ctx, examples: [], repair: { previousSql: "SELECT 1", problem: "Function \"x\" is not allowed." } });
  check("repair prompt carries the failed SQL and the exact problem", repairPrompt.includes("PREVIOUS ATTEMPT FAILED") && repairPrompt.includes('Function "x" is not allowed.'));
  const rejPrompt = buildPrompt({ question: "q", context: ctx, examples: [], rejectedSql: ["SELECT wrong"] });
  check("rejected SQL is passed back to the model", rejPrompt.includes("marked these SQL answers") && rejPrompt.includes("SELECT wrong"));

  // ==========================================================================
  section("G. Reply parsing");
  check("parses a clean object", parsePlan('{"sql":"SELECT 1","understood_as":"x","confidence":"high"}')?.sql === "SELECT 1");
  check("parses inside a markdown fence", parsePlan('```json\n{"sql":"SELECT 1","understood_as":"x"}\n```')?.sql === "SELECT 1");
  check("parses with prose around it", parsePlan('Sure! {"sql":"SELECT 1","understood_as":"x"} hope that helps')?.sql === "SELECT 1");
  check("rejects non-JSON", parsePlan("I cannot do that") === null);
  check("reads out_of_scope = true", parsePlan('{"sql":null,"understood_as":"a policy question","out_of_scope":true}')?.out_of_scope === true);
  check("out_of_scope defaults to false", parsePlan('{"sql":"SELECT 1","understood_as":"x"}')?.out_of_scope === false);
  check("rejects a query with no explanation", parsePlan('{"sql":"SELECT 1"}') === null);
  check("accepts null sql with a reason", parsePlan('{"sql":null,"understood_as":"salary","unanswerable_reason":"no salary data"}')?.unanswerable_reason === "no salary data");

  // ==========================================================================
  section("G2. The rule 'a name in double quotes means EXACT'");
  check("finds straight-quoted terms", JSON.stringify(extractQuotedTerms('end with "Debnath" but not "nath"')) === '["Debnath","nath"]');
  check("finds curly-quoted terms", JSON.stringify(extractQuotedTerms("ends with \u201Ckumar\u201D")) === '["kumar"]');
  check("no quotes -> no terms", extractQuotedTerms("ends with kumar").length === 0);
  const helperSql = `SELECT ticket_no FROM nlq.employees WHERE nlq.last_word_like(name_words, name_codes, 'debnath')`;
  const exactSql = `SELECT ticket_no FROM nlq.employees WHERE name_words[cardinality(name_words)] = 'DEBNATH'`;
  check("quoted name + similar-spelling helper is flagged", checkQuotedTerms('find names which end with "debnath"', helperSql) !== null);
  check("quoted name + nlq.code is flagged", checkQuotedTerms('names with "debnath"', `SELECT 1 FROM nlq.employees WHERE nlq.code('debnath', true) = ANY(name_codes)`) !== null);
  check("quoted name + exact SQL is accepted", checkQuotedTerms('find names which end with "debnath"', exactSql) === null);
  check("UNquoted name + helper is accepted (similar spelling is the default)", checkQuotedTerms("find names which end with debnath", helperSql) === null);
  check("helper on an UNquoted name is fine even when another name is quoted",
    checkQuotedTerms('first name arup and last word "roy"', `SELECT 1 FROM nlq.employees WHERE nlq.first_word_like(name_words, name_codes, 'arup') AND name_words[cardinality(name_words)] = 'ROY'`) === null);
  check("quoted non-name (a designation) is not flagged", checkQuotedTerms('"General Manager" in C&IT', `SELECT 1 FROM nlq.employees WHERE designation = 'General Manager'`) === null);

  // ==========================================================================
  section("G3. Cohort vocabulary (officer/executive/staff ...) and nlq.norm patterns");
  const phrases = [...ctx.departments.map((d) => d.name), ...ctx.designations.map((d) => d.title)];
  const hit = (q: string) => vocabularyHits(q, phrases).map((h) => `${h.word}:${h.cohort}`).join(",");
  check('"officers" -> executive', hit("count of officers in the C&IT department") === "officers:executive", hit("count of officers in the C&IT department"));
  check('"officer" (singular) -> executive', hit("number of officer in c and it") === "officer:executive");
  check('"executive" (singular) -> executive', hit("how many executive are working in C&IT") === "executive:executive");
  check('"staff" -> nonexecutive', hit("top 10 senior staff") === "staff:nonexecutive");
  check('"non executives" is non-executive and NOT also executive', hit("how many non executives are in plant garage") === "non executives:nonexecutive", hit("how many non executives are in plant garage"));
  check('"non-ex" -> nonexecutive', hit("top 10 senior non-ex") === "non ex:nonexecutive", hit("top 10 senior non-ex"));
  check('"workers" -> nonexecutive', hit("how many workers in blast furnace") === "workers:nonexecutive");
  check("both cohorts in one question are both found, each once", hit("executives and non-executives in c and it") === "non executives:nonexecutive,executives:executive", hit("executives and non-executives in c and it"));
  check('"staff" inside the department name COMPUTER and IT STAFF is NOT a cohort word', hit("how many people in computer and IT staff") === "", hit("how many people in computer and IT staff"));
  check('"Medical Officer" (title) is NOT a cohort word', hit("how many Medical Officer in blast furnace") === "", hit("how many Medical Officer in blast furnace"));
  check('"medical officers" (plural of the title) is NOT a cohort word', hit("how many medical officers in blast furnace") === "", hit("how many medical officers in blast furnace"));
  check('"officers" next to the title still counts when the title is NOT in the question', hit("officers in blast furnace") === "officers:executive");
  check("an ordinary question has no vocabulary line", vocabularyLine("find names that start with sanj", phrases) === null);
  check("the vocabulary line is produced for cohort words", (vocabularyLine("top 10 senior staff", phrases) || "").includes("cohort = 'nonexecutive'"));
  const bad1 = `SELECT count(*) AS count FROM nlq.employees WHERE upper(designation) LIKE '%OFFICER%'`;
  const bad2 = `SELECT ticket_no FROM nlq.employees ORDER BY global_seniority_rank LIMIT 10`;
  check("officers read as a designation word (no cohort) is flagged", checkVocabulary("count of officers in the C&IT department", bad1, phrases) !== null);
  check("staff with no cohort condition is flagged", checkVocabulary("top 10 senior staff", bad2, phrases) !== null);
  check("officers with cohort = 'executive' is accepted", checkVocabulary("count of officers in c and it", `SELECT count(*) FROM nlq.employees WHERE cohort = 'executive'`, phrases) === null);
  check("officers filtered as 'nonexecutive' is flagged", checkVocabulary("count of officers", `SELECT count(*) FROM nlq.employees WHERE cohort = 'nonexecutive'`, phrases) !== null);
  check("executives AND non-executives grouped by cohort is accepted", checkVocabulary("executives and non-executives in c and it", `SELECT cohort, count(*) FROM nlq.employees GROUP BY cohort`, phrases) === null);
  check("a question with no cohort words is never flagged", checkVocabulary("names ending with nath", bad2, phrases) === null);
  check("the department named COMPUTER and IT STAFF is not forced to a cohort", checkVocabulary("how many people in computer and IT staff", `SELECT count(*) FROM nlq.employees WHERE department_id = 2`, phrases) === null);
  check("norm pattern with brackets is flagged (the real failure)", checkNormPatterns(`SELECT 1 FROM nlq.departments WHERE nlq.norm(name) LIKE '%blast furnace (operation)%'`) !== null);
  check("norm pattern in normalized form is accepted", checkNormPatterns(`SELECT 1 FROM nlq.departments WHERE nlq.norm(name) LIKE '%blast furnace operation%'`) === null);
  check("capitals with LIKE are flagged (norm output is lowercase)", checkNormPatterns(`SELECT 1 FROM nlq.departments WHERE nlq.norm(name) LIKE '%BLAST%'`) !== null);
  check("capitals with ILIKE are fine", checkNormPatterns(`SELECT 1 FROM nlq.departments WHERE nlq.norm(name) ILIKE '%BLAST%'`) === null);
  check("wrapping the typed text in nlq.norm is accepted", checkNormPatterns(`SELECT 1 FROM nlq.departments WHERE nlq.norm(name) LIKE '%' || nlq.norm('BLAST FURNACE (OPERATION)') || '%'`) === null);
  check("equality with an un-normalized literal is flagged", checkNormPatterns(`SELECT 1 FROM nlq.departments WHERE nlq.norm(name) = 'C & IT'`) !== null);
  check("equality with a normalized literal is accepted", checkNormPatterns(`SELECT 1 FROM nlq.departments WHERE nlq.norm(name) = 'c and it'`) === null);
  const wrapped = await runReadOnly(db, `SELECT count(*) AS n FROM nlq.departments WHERE nlq.norm(name) LIKE '%' || nlq.norm('BLAST FURNACE (OPERATION)') || '%'`);
  check("the suggested wrapped form really matches in the database", Number(wrapped.rows[0].n) === 1, JSON.stringify(wrapped.rows));
  const dead = await runReadOnly(db, `SELECT count(*) AS n FROM nlq.departments WHERE nlq.norm(name) LIKE '%blast furnace (operation)%'`);
  check("and the original pattern really matches nothing (confirming the diagnosis)", Number(dead.rows[0].n) === 0);

  // ==========================================================================
  section("G4. Which departments an answer covered (computed from the SQL, not by the model)");
  const posQ = `SELECT count(*) FROM nlq.employees WHERE department_id IN (SELECT id FROM nlq.departments WHERE nlq.norm(name) LIKE '%garage%')`;
  check("a department sub-query yields one scope query", departmentScopeQueries(posQ).length === 1 && /nlq\.departments/i.test(departmentScopeQueries(posQ)[0]));
  check("NOT IN (an exclusion) yields no scope", departmentScopeQueries(`SELECT 1 FROM nlq.employees WHERE department_id NOT IN (SELECT id FROM nlq.departments WHERE nlq.norm(name) LIKE '%garage%')`).length === 0);
  check("NOT (...) around a department sub-query yields no scope", departmentScopeQueries(`SELECT 1 FROM nlq.employees WHERE NOT (department_id IN (SELECT id FROM nlq.departments WHERE code = 1))`).length === 0);
  check("a query with no department filter yields no scope", departmentScopeQueries(`SELECT count(*) FROM nlq.employees WHERE cohort = 'executive'`).length === 0);
  check("a question that IS about departments (top-level select) yields no scope", departmentScopeQueries(`SELECT code, name FROM nlq.departments WHERE nlq.norm(name) LIKE '%garage%'`).length === 0);
  check("two department sub-queries yield two scope queries", departmentScopeQueries(`SELECT 1 FROM nlq.employees WHERE department_id IN (SELECT id FROM nlq.departments WHERE code = 1) OR department_id IN (SELECT id FROM nlq.departments WHERE code = 2)`).length === 2);
  check("a department CTE counts", departmentScopeQueries(`WITH d AS (SELECT id FROM nlq.departments WHERE code IN (98500)) SELECT count(*) FROM nlq.employees WHERE department_id IN (SELECT id FROM d)`).length === 1);
  const gScope = await computeDepartmentScope(db, posQ);
  check("garage question covers exactly the 3 garage departments", gScope !== null && gScope.total === 3 && gScope.departments.every((d) => /GARAGE/.test(d.name)), JSON.stringify(gScope));
  const cScope = await computeDepartmentScope(db, `SELECT 1 FROM nlq.employees WHERE department_id IN (SELECT id FROM nlq.departments WHERE code IN (98500, 98530, 98540))`);
  check("a code-based filter lists the C&IT departments by name", cScope !== null && cScope.total === 3 && cScope.departments.some((d) => d.name === "C & IT"), JSON.stringify(cScope));
  const corr = await computeDepartmentScope(db, `SELECT 1 FROM nlq.employees WHERE department_id IN (SELECT id FROM nlq.departments WHERE department_code IN (85000, 85110))`);
  check("the correlated 'garage, no email' SQL now names the departments where those people actually work", corr !== null && corr.departments.map((d) => d.code).sort().join(",") === "85000,85110", JSON.stringify(corr));
  check("no department filter -> null", (await computeDepartmentScope(db, `SELECT count(*) FROM nlq.employees`)) === null);

  // -- only departments that really hold people in the answer. Fixture = the C&IT situation: executives sit under ONE department
  //    code, the granular sections hold only non-executives. (Removed again afterwards.)
  await pg.query(`INSERT INTO public.sail_department (id, code, name, cohort_scope) VALUES
    (29001, 970001, 'ZQ TESTDEPT', 'shared'), (29002, 970002, 'ZQ TESTDEPT (TECH)', 'shared'), (29003, 970003, 'ZQ TESTDEPT STAFF', 'shared')`);
  await pg.query(`INSERT INTO public.employee_roster (ticket_no,name,designation_grade_id,sail_department_id,cohort,within_grade_position,global_seniority_rank) VALUES
    ('980001','ZQ EXEC ONE',(SELECT id FROM public.designation_grade WHERE track <> 'nonexec' ORDER BY id LIMIT 1),29001,'executive',98001,980001),
    ('980002','ZQ EXEC TWO',(SELECT id FROM public.designation_grade WHERE track <> 'nonexec' ORDER BY id LIMIT 1),29001,'executive',98002,980002),
    ('980003','ZQ STAFF ONE',(SELECT id FROM public.designation_grade WHERE track = 'nonexec' ORDER BY id LIMIT 1),29002,'nonexecutive',98003,980003),
    ('980004','ZQ STAFF TWO',(SELECT id FROM public.designation_grade WHERE track = 'nonexec' ORDER BY id LIMIT 1),29002,'nonexecutive',98004,980004),
    ('980005','ZQ STAFF THREE',(SELECT id FROM public.designation_grade WHERE track = 'nonexec' ORDER BY id LIMIT 1),29003,'nonexecutive',98005,980005)`);
  try {
    const FX = `SELECT id FROM nlq.departments WHERE code IN (970001, 970002, 970003)`;
    const codesOf = (sc: any) => (sc ? sc.departments.map((d: any) => d.code).sort((a: number, b: number) => a - b) : null);
    const execScope = await computeDepartmentScope(db, `SELECT count(*) FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (${FX})`);
    check("EXECUTIVES in a department: only the department that has executives is named, not the empty sections", JSON.stringify(codesOf(execScope)) === "[970001]" && execScope!.total === 1, JSON.stringify(execScope));
    const nonexScope = await computeDepartmentScope(db, `SELECT count(*) FROM nlq.employees WHERE cohort = 'nonexecutive' AND department_id IN (${FX})`);
    check("NON-EXECUTIVES: only the sections that have non-executives, not the executive department", JSON.stringify(codesOf(nonexScope)) === "[970002,970003]", JSON.stringify(nonexScope));
    const bothScope = await computeDepartmentScope(db, `SELECT count(*) FROM nlq.employees WHERE department_id IN (${FX})`);
    check("both cohorts together: all three departments are named", JSON.stringify(codesOf(bothScope)) === "[970001,970002,970003]", JSON.stringify(bothScope));
    const listScope = await computeDepartmentScope(db, `SELECT ticket_no, name, designation, department FROM nlq.employees WHERE cohort = 'nonexecutive' AND department_id IN (${FX}) ORDER BY global_seniority_rank LIMIT 1`);
    check("a LIMITed, ordered list still reports where ALL matching people work", JSON.stringify(codesOf(listScope)) === "[970002,970003]", JSON.stringify(listScope));
    const groupScope = await computeDepartmentScope(db, `SELECT designation, count(*) AS n FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (${FX}) GROUP BY designation ORDER BY n DESC`);
    check("a breakdown (GROUP BY designation) reports the departments of the people counted", JSON.stringify(codesOf(groupScope)) === "[970001]", JSON.stringify(groupScope));
    const aliasScope = await computeDepartmentScope(db, `SELECT count(*) FROM nlq.employees e WHERE e.cohort = 'executive' AND e.department_id IN (${FX})`);
    check("a table alias in the answer's SQL is handled", JSON.stringify(codesOf(aliasScope)) === "[970001]", JSON.stringify(aliasScope));
    const nobody = await computeDepartmentScope(db, `SELECT count(*) FROM nlq.employees WHERE cohort = 'executive' AND designation = 'No Such Designation' AND department_id IN (${FX})`);
    check("an answer with nobody in it names no department (total 0, so no line is shown)", nobody !== null && nobody.total === 0, JSON.stringify(nobody));
    check("a CTE answer claims no scope (cannot be computed exactly)", (await computeDepartmentScope(db, `WITH d AS (${FX}) SELECT count(*) FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (SELECT id FROM d)`)) === null);
    check("a HAVING answer claims no scope", (await computeDepartmentScope(db, `SELECT designation FROM nlq.employees WHERE department_id IN (${FX}) GROUP BY designation HAVING count(*) > 1`)) === null);
    // the REAL SQL the model wrote for "list of employees in the C&IT department with department codes": a JOIN just to read the code
    const joinSql = (cohort: string) => `SELECT e.ticket_no, e.name, e.designation, d.code AS department_code FROM nlq.employees e JOIN nlq.departments d ON e.department_id = d.id WHERE ${cohort}e.department_id IN (${FX}) ORDER BY e.global_seniority_rank`;
    const joinBoth = await computeDepartmentScope(db, joinSql(""));
    check("a JOIN answer (the model's real 'with department codes' SQL) still reports the departments that hold its people", JSON.stringify(codesOf(joinBoth)) === "[970001,970002,970003]", JSON.stringify(joinBoth));
    const joinExec = await computeDepartmentScope(db, joinSql("e.cohort = 'executive' AND "));
    check("...and narrows to the executive department when only executives are asked for", JSON.stringify(codesOf(joinExec)) === "[970001]", JSON.stringify(joinExec));
    const joinNoAlias = await computeDepartmentScope(db, `SELECT employees.ticket_no, d.code FROM nlq.employees JOIN nlq.departments d ON employees.department_id = d.id WHERE employees.cohort = 'nonexecutive' AND employees.department_id IN (${FX})`);
    check("a JOIN without any alias on the person table is handled too", JSON.stringify(codesOf(joinNoAlias)) === "[970002,970003]", JSON.stringify(joinNoAlias));
    check("a self-join of the person table claims no scope (cannot tell which row is 'the person')", (await computeDepartmentScope(db, `SELECT a.ticket_no FROM nlq.employees a JOIN nlq.employees b ON a.department_id = b.department_id WHERE a.department_id IN (${FX})`)) === null);
    check("a sub-select in FROM claims no scope", (await computeDepartmentScope(db, `SELECT count(*) FROM (SELECT * FROM nlq.employees WHERE department_id IN (${FX})) x WHERE department_id IN (${FX})`)) === null);
    // -- the department line follows WHERE THE PEOPLE WORK, however the model worded the department filter
    const noSub = (cohort: string) => `SELECT e.ticket_no, e.name, e.designation, d.code AS department_code FROM nlq.employees e JOIN nlq.departments d ON e.department_id = d.id WHERE ${cohort}d.code IN (970001, 970002, 970003) ORDER BY e.global_seniority_rank`;
    check("JOIN + 'd.code IN (...)' with NO sub-query (the model's second real wording): all departments that hold people", JSON.stringify(codesOf(await computeDepartmentScope(db, noSub("")))) === "[970001,970002,970003]");
    check("...executives only: just the department that has executives", JSON.stringify(codesOf(await computeDepartmentScope(db, noSub("e.cohort = 'executive' AND ")))) === "[970001]");
    check("...non-executives only: just the sections that have non-executives", JSON.stringify(codesOf(await computeDepartmentScope(db, noSub("e.cohort = 'nonexecutive' AND ")))) === "[970002,970003]");
    check("a filter on the department NAME (e.department ILIKE ...) is a department filter too", JSON.stringify(codesOf(await computeDepartmentScope(db, `SELECT ticket_no, name FROM nlq.employees e WHERE e.department ILIKE 'ZQ TESTDEPT%' AND e.cohort = 'executive'`))) === "[970001]");
    check("a filter written with EXISTS is understood", JSON.stringify(codesOf(await computeDepartmentScope(db, `SELECT count(*) FROM nlq.employees e WHERE e.cohort = 'nonexecutive' AND EXISTS (SELECT 1 FROM nlq.departments d WHERE d.id = e.department_id AND d.code IN (970001, 970002, 970003))`))) === "[970002,970003]");
    check("the department filter inside the JOIN condition (ON ... AND d.code IN ...) is understood", JSON.stringify(codesOf(await computeDepartmentScope(db, `SELECT e.ticket_no FROM nlq.employees e JOIN nlq.departments d ON e.department_id = d.id AND d.code IN (970001)`))) === "[970001]");
    check("a JOIN used only to READ the department code (no filter) shows NO line", (await computeDepartmentScope(db, `SELECT e.ticket_no, d.code AS department_code FROM nlq.employees e JOIN nlq.departments d ON e.department_id = d.id WHERE e.cohort = 'executive'`)) === null);
    check("an organisation-wide list (no department filter at all) shows NO line", (await computeDepartmentScope(db, `SELECT ticket_no, name FROM nlq.employees WHERE cohort = 'executive' ORDER BY global_seniority_rank LIMIT 10`)) === null);
    for (const [label, cond] of [
      ["NOT IN", `department_id NOT IN (${FX})`],
      ["NOT ( ... IN ...)", `NOT (department_id IN (${FX}))`],
      ["d.code NOT IN", `department_id IN (SELECT id FROM nlq.departments d WHERE d.code NOT IN (970001))`],
      ["<> a department", `department_id <> 29001`],
      ["IS NULL", `department_id IS NULL`],
    ] as const) {
      check(`an EXCLUSION (${label}) shows NO line`, (await computeDepartmentScope(db, `SELECT count(*) FROM nlq.employees WHERE ${cond}`)) === null);
    }
    check("a JOIN with NOT IN on the joined table shows NO line", (await computeDepartmentScope(db, `SELECT e.ticket_no FROM nlq.employees e JOIN nlq.departments d ON e.department_id = d.id WHERE d.code NOT IN (970001)`)) === null);
    check("departmentFilterInfo: filter / no filter / exclusion / unreadable",
      departmentFilterInfo(`SELECT 1 FROM nlq.employees WHERE department_code IN (1)`)?.has === true &&
      departmentFilterInfo(`SELECT 1 FROM nlq.employees e JOIN nlq.departments d ON e.department_id = d.id`)?.has === false &&
      departmentFilterInfo(`SELECT 1 FROM nlq.employees WHERE department_code NOT IN (1)`)?.negated === true &&
      departmentFilterInfo(`this is not sql`) === null);
    check("a query that never touches the person table claims no scope", peopleFootprintQuery(`SELECT d.code FROM nlq.departments d JOIN nlq.departments d2 ON d.id = d2.id WHERE d.code = 1`) === null);
    check("peopleFootprintQuery: a plain employees query gives a query, anything else gives null",
      !!peopleFootprintQuery(`SELECT count(*) FROM nlq.employees WHERE cohort = 'executive'`) &&
      peopleFootprintQuery(`SELECT 1 FROM nlq.departments WHERE code = 1`) === null &&
      peopleFootprintQuery(`SELECT 1 FROM nlq.employees UNION SELECT 1 FROM nlq.employees`) === null &&
      peopleFootprintQuery(`this is not sql`) === null);
  } finally {
    await pg.query(`DELETE FROM public.employee_roster WHERE ticket_no LIKE '98000_'`);
    await pg.query(`DELETE FROM public.sail_department WHERE id IN (29001, 29002, 29003)`);
  }
  check("the scope fixture is removed again", (await pg.query(`SELECT count(*)::int n FROM public.sail_department WHERE id IN (29001,29002,29003)`)).rows[0].n === 0);

  const promptDept = buildPrompt({ question: "senior most DGM in electrical", context: ctx, examples: [] });
  check("the prompt explains abbreviated department words and the stem rule", promptDept.includes("ELECT") && promptDept.includes("LIKE '%elect%'") && promptDept.includes("SHORT STEM"));

  // ==========================================================================
  section("G5. A department is shown with BOTH its code and its name (checked from the SQL, not by the model)");
  // The SQL the real model wrote for the 10 database questions of the 8-9 Oct 2026 test sheet (see the test ledger).
  const modelWrote: [string, string, boolean][] = [
    ["D1 code only", "SELECT d.code AS department_code, e.cohort, COUNT(*) AS count FROM nlq.employees e JOIN nlq.departments d ON e.department_id = d.id WHERE d.code IN (98500,98530,98540) GROUP BY d.code, e.cohort ORDER BY d.code, e.cohort", true],
    ["D2 name only", "SELECT ticket_no, name, designation, department FROM (SELECT e.ticket_no, e.name, e.designation, d.name AS department, e.global_seniority_rank AS sr, row_number() OVER (PARTITION BY e.department_id ORDER BY e.global_seniority_rank) AS rn FROM nlq.employees e JOIN nlq.departments d ON e.department_id = d.id WHERE e.cohort = 'executive') sub WHERE rn <= 5 ORDER BY department, sr", true],
    ["D3 name only", "SELECT department, count(*) AS count FROM nlq.employees WHERE cohort = 'nonexecutive' GROUP BY department HAVING count(*) > 20", true],
    ["D4 both (already right)", "SELECT d.code AS department_code,d.name AS department_name,COUNT(*) FILTER (WHERE e.cohort='executive') AS exec_count FROM nlq.employees e JOIN nlq.departments d ON e.department_id=d.id GROUP BY d.code,d.name HAVING COUNT(*) FILTER (WHERE e.cohort='executive')>0 ORDER BY exec_count DESC LIMIT 10", false],
    ["D5 name only", "SELECT d.name AS department, count(*) AS count FROM nlq.employees e JOIN nlq.departments d ON e.department_id = d.id GROUP BY d.id, d.name ORDER BY count DESC LIMIT 1", true],
    ["E1 no department at all", "SELECT e.designation AS designation, count(*) AS count FROM nlq.employees e WHERE e.cohort='executive' GROUP BY e.designation ORDER BY count DESC LIMIT 1", false],
    ["E2 code only", "SELECT e.ticket_no, e.name, e.designation, d.code AS department_code FROM nlq.employees e JOIN nlq.departments d ON e.department_id = d.id WHERE e.cohort='executive' ORDER BY e.global_seniority_rank", true],
    ["E4 name only", "SELECT ticket_no, name, designation, department FROM nlq.employees WHERE name_words = ARRAY['RANA','SAHA'] ORDER BY global_seniority_rank LIMIT 1", true],
    ["E5 no department at all", "SELECT designation, count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND has_webmail GROUP BY designation ORDER BY rank_order", false],
  ];
  for (const [label, sqlText, expectProblem] of modelWrote) {
    const problem = checkDepartmentColumns(sqlText);
    check(`${label}: ${expectProblem ? "flagged" : "accepted"}`, expectProblem ? problem !== null : problem === null, String(problem));
  }
  check("the message names both columns", /department_code/.test(String(checkDepartmentColumns("SELECT department, count(*) AS count FROM nlq.employees GROUP BY department"))) && /JOIN nlq\.departments/.test(String(checkDepartmentColumns("SELECT department, count(*) AS count FROM nlq.employees GROUP BY department"))));
  check("people list with code AND name is accepted", checkDepartmentColumns("SELECT ticket_no, name, designation, department_code, department FROM nlq.employees ORDER BY global_seniority_rank") === null);
  check("a per-department count with both is accepted", checkDepartmentColumns("SELECT department_code, department, count(*) AS count FROM nlq.employees GROUP BY department_id, department_code, department") === null);
  check("aliases count (d.code AS dept_code + d.name AS dept_name)", checkDepartmentColumns("SELECT d.code AS dept_code, d.name AS dept_name FROM nlq.departments d") === null);
  check("a WITH query is judged by its final SELECT", checkDepartmentColumns("WITH t AS (SELECT department_code, department, ticket_no FROM nlq.employees) SELECT department FROM t") !== null);
  check("SELECT * cannot be judged -> accepted", checkDepartmentColumns("SELECT * FROM nlq.employees") === null);
  check("unparsable SQL cannot be judged -> accepted", checkDepartmentColumns("SELEKT department FROM") === null);
  check("a count with no department column -> accepted", checkDepartmentColumns("SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive'") === null);

  // -- Departments are compared by department ROW, not by number (six numbers belong to two different departments)
  const ident: [string, string, boolean][] = [
    ["D4 (10 Oct): NOT EXISTS matching ne.department_code = e.department_code -> flagged", "SELECT department_code, department, exec_count FROM (SELECT e.department_code, e.department, count(*) AS exec_count, rank() OVER (ORDER BY count(*) DESC) AS r FROM nlq.employees e WHERE e.cohort = 'executive' AND NOT EXISTS (SELECT 1 FROM nlq.employees ne WHERE ne.department_code = e.department_code AND ne.cohort = 'nonexecutive') GROUP BY e.department_code, e.department) sub WHERE r <= 10", true],
    ["the same question matched by department_id -> fine", "SELECT department_code, department, exec_count FROM (SELECT e.department_code, e.department, count(*) AS exec_count, rank() OVER (ORDER BY count(*) DESC) AS r FROM nlq.employees e WHERE e.cohort = 'executive' AND NOT EXISTS (SELECT 1 FROM nlq.employees ne WHERE ne.department_id = e.department_id AND ne.cohort = 'nonexecutive') GROUP BY e.department_id, e.department_code, e.department) sub WHERE r <= 10", false],
    ["JOIN nlq.departments ON e.department_code = d.code -> flagged", "SELECT e.ticket_no FROM nlq.employees e JOIN nlq.departments d ON e.department_code = d.code", true],
    ["JOIN nlq.departments ON e.department_id = d.id -> fine", "SELECT e.ticket_no FROM nlq.employees e JOIN nlq.departments d ON e.department_id = d.id", false],
    ["filtering on a LIST of codes -> fine", "SELECT count(*) AS count FROM nlq.employees WHERE department_code IN (85000, 85070, 85110)", false],
    ["filtering on one code -> fine", "SELECT count(*) AS count FROM nlq.employees WHERE department_code = 85110", false],
    ["conditional counts per department (the first, correct D4) -> fine", "SELECT department_code, department, count(*) FILTER (WHERE cohort = 'executive') AS exec_count FROM nlq.employees GROUP BY department_id, department_code, department HAVING count(*) FILTER (WHERE cohort = 'executive') > 0 AND count(*) FILTER (WHERE cohort = 'nonexecutive') = 0", false],
    ["unparsable -> cannot be judged -> fine", "SELEKT department_code = department_code", false],
  ];
  for (const [label, sqlText, expectProblem] of ident) {
    const problem = checkDepartmentIdentity(sqlText);
    check(label, expectProblem ? problem !== null : problem === null, String(problem));
  }
  check("the identity message names department_id and the six numbers", /department_id/.test(String(checkDepartmentIdentity(ident[0][1]))) && /21000/.test(String(checkDepartmentIdentity(ident[0][1]))));

  // PROOF on the database: when two departments share a number, matching by number and matching by department row GIVE DIFFERENT ANSWERS
  // (the BLAST FURNACE (OPERATION) / BLAST FURNACE (STOCK HOUSE & HL) situation). Rolled back afterwards.
  await pg.query("BEGIN");
  try {
    await pg.query(`INSERT INTO public.sail_department (id, code, name, cohort_scope) VALUES (29101, 970100, 'ZQ SHARED (EXEC DEPT)', 'executive'), (29102, 970100, 'ZQ SHARED (NONEXEC DEPT)', 'nonexecutive')`);
    await pg.query(`INSERT INTO public.employee_roster (ticket_no,name,designation_grade_id,sail_department_id,cohort,within_grade_position,global_seniority_rank) VALUES
      ('980101','ZQ BOSS ONE',(SELECT id FROM public.designation_grade WHERE track <> 'nonexec' ORDER BY id LIMIT 1),29101,'executive',98101,980101),
      ('980102','ZQ WORKER ONE',20,29102,'nonexecutive',98102,980102)`);
    const byNumber = (await pg.query(`SELECT DISTINCT department FROM nlq.employees e WHERE e.cohort = 'executive' AND e.department_code = 970100 AND NOT EXISTS (SELECT 1 FROM nlq.employees ne WHERE ne.department_code = e.department_code AND ne.cohort = 'nonexecutive')`)).rows;
    const byRow = (await pg.query(`SELECT DISTINCT department FROM nlq.employees e WHERE e.cohort = 'executive' AND e.department_code = 970100 AND NOT EXISTS (SELECT 1 FROM nlq.employees ne WHERE ne.department_id = e.department_id AND ne.cohort = 'nonexecutive')`)).rows;
    check("PROOF: matching by NUMBER drops the executive-only department (the Blast Furnace bug)", byNumber.length === 0, JSON.stringify(byNumber));
    check("...matching by department ROW keeps it", byRow.length === 1 && byRow[0].department === "ZQ SHARED (EXEC DEPT)", JSON.stringify(byRow));
  } finally {
    await pg.query("ROLLBACK");
  }

  // ==========================================================================
  section("G6. A percentage column is shown with a % sign (and still behaves as a number)");
  const kindOf = (key: string, vals: unknown[]) => columnKind(key, vals.map((v) => ({ [key]: v })));
  check("a numeric column named percentage is 'percent'", kindOf("percentage", ["57.56", "40.1"]) === "percent");
  check("percent_of_garage and pct_of_total are 'percent' too", kindOf("percent_of_garage", [57.6, 40.1]) === "percent" && kindOf("pct_of_total", ["1"]) === "percent");
  check("an ordinary count stays 'number'", kindOf("count", ["5", "6"]) === "number");
  check("'percentile' is NOT a percentage", kindOf("percentile", ["90"]) === "number");
  check("a TEXT column named percentage is not 'percent'", kindOf("percentage", ["high", "low"]) === "text");
  check("57.56 is shown as 57.56%", formatCell("57.56", "percent") === "57.56%");
  check("40.1 -> 40.1%, 100 -> 100%, 33.3333 -> 33.33%", formatCell(40.1, "percent") === "40.1%" && formatCell(100, "percent") === "100%" && formatCell(33.3333, "percent") === "33.33%");
  check("an empty percentage is a dash, a non-number is left alone", formatCell(null, "percent") === "\u2014" && formatCell("n/a", "percent") === "n/a");
  check("percentages sort as numbers (100 > 10 > 9), not as text", sortRows([{ p: "9" }, { p: "100" }, { p: "10" }], "p", "percent", "desc").map((r) => r.p).join(",") === "100,10,9");
  const csv = toCsv([{ key: "pc", label: "Share", kind: "percent" }], [{ pc: "57.56" }]);
  check("the CSV keeps the raw number and says % in the heading", /Share \(%\)/.test(csv) && /57\.56(\r|$)/.test(csv) && !/57\.56%/.test(csv));
  check("a heading that already says % is not changed", /% of garage/.test(toCsv([{ key: "pc", label: "% of garage", kind: "percent" }], [{ pc: "1" }])) && !/\(%\)/.test(toCsv([{ key: "pc", label: "% of garage", kind: "percent" }], [{ pc: "1" }])));
  const pctRows2 = [{ department: "A", percentage: "57.56" }, { department: "B", percentage: "40.1" }];
  const pctDisp = resolveDisplay({ view: "bar", bar: { label: "department", value: "percentage" } }, ["department", "percentage"], pctRows2, false);
  check("a bar chart of percentages is still allowed", pctDisp?.view === "bar" && pctDisp.bar?.value === "percentage");
  check("a list in one cell reads 'A, B, C' (with spaces), an empty list is a dash", formatCell(["A", "B", "C"], "text") === "A, B, C" && formatCell([], "text") === "\u2014");
  check("the CSV writes a list as one quoted cell 'A, B'", /"A, B"/.test(toCsv([{ key: "n", label: "Names", kind: "text" }], [{ n: ["A", "B"] }])));

  // ==========================================================================
  section("G7. Rankings keep ties, groups come in an order, people come in seniority order (read from the SQL)");
  // The SQL the real model wrote on the 8-9 Oct 2026 test sheet, and the right way to write each.
  const rk: [string, string, boolean][] = [
    ["D5 'which section has the most': ORDER BY count DESC LIMIT 1 over groups -> flagged", "SELECT e.department_code, e.department, COUNT(*) AS count FROM nlq.employees e WHERE e.cohort='nonexecutive' GROUP BY e.department_code, e.department ORDER BY count DESC LIMIT 1", true],
    ["E1 'which designation has the most': LIMIT 1 over groups -> flagged", "SELECT e.designation AS designation, count(*) AS count FROM nlq.employees e WHERE e.cohort='executive' GROUP BY e.designation ORDER BY count DESC LIMIT 1", true],
    ["D4 'top 10 departments': single count key + LIMIT 10 -> flagged", "SELECT department_code, department, COUNT(*) FILTER (WHERE cohort='executive') AS exec_count FROM nlq.employees GROUP BY department_code, department HAVING COUNT(*) FILTER (WHERE cohort='executive')>0 ORDER BY exec_count DESC LIMIT 10", true],
    ["D3 first run: grouped with no ORDER BY -> flagged", "SELECT department, count(*) AS count FROM nlq.employees WHERE cohort = 'nonexecutive' GROUP BY department HAVING count(*) > 20", true],
    ["D3 second run: grouped, ORDER BY count DESC, no LIMIT -> fine", "SELECT department_code, department, count(*) AS count FROM nlq.employees WHERE cohort = 'nonexecutive' GROUP BY department_id, department_code, department HAVING count(*) > 20 ORDER BY count DESC", false],
    ["E5 follow-up: people in grade order only -> flagged", "SELECT designation, count(*) OVER (PARTITION BY designation) AS count, ticket_no, name FROM nlq.employees WHERE cohort='executive' AND has_webmail ORDER BY rank_order, designation", true],
    ["E2 people list ordered by global_seniority_rank -> fine", "SELECT e.ticket_no, e.name, e.designation, e.department_code, e.department FROM nlq.employees e WHERE e.cohort='executive' AND e.has_email_nic AND NOT e.has_mobile ORDER BY e.global_seniority_rank", false],
    ["E3 CASE first, then global_seniority_rank -> fine", "SELECT e.ticket_no, e.name FROM nlq.employees e WHERE nlq.last_word_like(e.name_words, e.name_codes, 'roy') ORDER BY (CASE WHEN e.cohort='executive' THEN 0 ELSE 1 END), e.global_seniority_rank", false],
    ["people list ordered through an alias of global_seniority_rank -> fine", "SELECT e.ticket_no, e.name, e.global_seniority_rank AS sr FROM nlq.employees e ORDER BY sr", false],
    ["E4 single person with LIMIT 1 (no groups) -> fine", "SELECT ticket_no, name FROM nlq.employees WHERE name_words = ARRAY['RANA','SAHA'] ORDER BY global_seniority_rank LIMIT 1", false],
    ["people list with NO ORDER BY -> flagged", "SELECT ticket_no, name FROM nlq.employees WHERE cohort = 'executive'", true],
    ["D2 people list built on a sub-query: cannot be judged -> fine", "SELECT ticket_no, name FROM (SELECT e.ticket_no, e.name, row_number() OVER (PARTITION BY e.department_id ORDER BY e.global_seniority_rank) AS rn FROM nlq.employees e) sub WHERE rn <= 5", false],
    ["the rank() way: ties kept, top level not grouped -> fine", "SELECT designation, executives FROM (SELECT designation, count(*) AS executives, rank() OVER (ORDER BY count(*) DESC) AS r FROM nlq.employees WHERE cohort='executive' GROUP BY designation) t WHERE r = 1", false],
    ["a plain count -> fine", "SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive'", false],
    ["D5 (10 Oct): sum(cnt) OVER () in the OUTER query after WHERE r = 1 -> flagged (a share of the total becomes 100%)", "SELECT department_code, department, cnt AS nonexecutive_count, round(cnt * 100.0 / sum(cnt) OVER (), 2) AS percentage FROM (SELECT e.department_code, e.department, count(*) AS cnt, rank() OVER (ORDER BY count(*) DESC) AS r FROM nlq.employees e WHERE e.cohort = 'nonexecutive' GROUP BY e.department_id, e.department_code, e.department) s WHERE r = 1 ORDER BY department_code", true],
    ["D4 (10 Oct): rank over ALL departments, then WHERE nonexec_count = 0 AND r <= 10 -> flagged (only 8 rows come back)", "SELECT department_code, department, exec_count FROM ( SELECT e.department_code, e.department, count(*) FILTER (WHERE cohort='executive') AS exec_count, count(*) FILTER (WHERE cohort='nonexecutive') AS nonexec_count, rank() OVER (ORDER BY count(*) FILTER (WHERE cohort='executive') DESC) AS r FROM nlq.employees e GROUP BY e.department_code, e.department ) sub WHERE nonexec_count = 0 AND r <= 10 ORDER BY exec_count DESC, department_code", true],
    ["D4 done right: the condition is in HAVING, only r <= 10 outside -> fine", "SELECT department_code, department, exec_count FROM ( SELECT e.department_code, e.department, count(*) FILTER (WHERE cohort='executive') AS exec_count, rank() OVER (ORDER BY count(*) FILTER (WHERE cohort='executive') DESC) AS r FROM nlq.employees e GROUP BY e.department_id, e.department_code, e.department HAVING count(*) FILTER (WHERE cohort='nonexecutive') = 0 ) sub WHERE r <= 10 ORDER BY r, department_code", false],
    ["rank cut plus another population filter (r <= 5 AND exec_count > 0) -> flagged", "SELECT department_code, exec_count FROM (SELECT department_code, count(*) AS exec_count, rank() OVER (ORDER BY count(*) DESC) AS r FROM nlq.employees WHERE cohort = 'executive' GROUP BY department_id, department_code) t WHERE r <= 5 AND exec_count > 0", true],
    ["a sub-query filter with no window result involved -> fine", "SELECT department_code, department, c FROM (SELECT department_code, department, count(*) AS c FROM nlq.employees GROUP BY department_id, department_code, department) t WHERE c > 20 ORDER BY c DESC", false],
    ["D5 done right: the total is computed INSIDE, beside rank() -> fine", "SELECT department_code, department, cnt, round(cnt * 100.0 / total, 2) AS percentage FROM (SELECT department_code, department, count(*) AS cnt, sum(count(*)) OVER () AS total, rank() OVER (ORDER BY count(*) DESC) AS r FROM nlq.employees WHERE cohort = 'nonexecutive' GROUP BY department_id, department_code, department) s WHERE r = 1", false],
    ["an outer window with NO filter on a window result -> fine", "SELECT department_code, department, cnt, sum(cnt) OVER () AS total FROM (SELECT department_code, department, count(*) AS cnt FROM nlq.employees GROUP BY department_id, department_code, department) t WHERE cnt > 20 ORDER BY cnt DESC", false],
    ["E5 (10 Oct): array_agg(name) with no ORDER BY -> flagged", "SELECT designation, count(*) AS count, array_agg(name) AS names FROM nlq.employees WHERE cohort = 'executive' AND has_webmail AND NOT has_email_nic GROUP BY designation, rank_order ORDER BY rank_order, designation", true],
    ["array_agg(name ORDER BY global_seniority_rank) -> fine", "SELECT designation, count(*) AS count, array_agg(name ORDER BY global_seniority_rank) AS names FROM nlq.employees WHERE cohort = 'executive' GROUP BY designation, rank_order ORDER BY rank_order, designation", false],
    ["string_agg(name, ', ') with no ORDER BY -> flagged", "SELECT designation, string_agg(name, ', ') AS names FROM nlq.employees GROUP BY designation ORDER BY designation", true],
    ["string_agg(name, ', ' ORDER BY global_seniority_rank) -> fine", "SELECT designation, string_agg(name, ', ' ORDER BY global_seniority_rank) AS names FROM nlq.employees GROUP BY designation ORDER BY designation", false],
    ["12 Oct: ONE person by an exact ticket number, no ORDER BY -> fine (at most one row: no order to get wrong)", "SELECT e.ticket_no, e.name, e.department_code, e.department FROM nlq.employees e WHERE e.ticket_no = '228757'", false],
    ["the same with the literal on the left and an extra AND condition -> fine", "SELECT ticket_no, name FROM nlq.employees WHERE '228757' = ticket_no AND cohort = 'nonexecutive'", false],
    ["SEVERAL tickets (IN) with no ORDER BY -> still flagged", "SELECT ticket_no, name FROM nlq.employees WHERE ticket_no IN ('228757','241391')", true],
    ["a ticket OR another condition with no ORDER BY -> still flagged (can return many)", "SELECT ticket_no, name FROM nlq.employees WHERE ticket_no = '228757' OR cohort = 'executive'", true],
    ["a ticket compared with another column (not a literal) -> still flagged", "SELECT ticket_no, name FROM nlq.employees WHERE ticket_no = sail_pno", true],
    ["SELECT * / unparsable -> cannot be judged -> fine", "SELEKT nonsense FROM", false],
  ];
  for (const [label, sqlText, expectProblem] of rk) {
    const problem = checkRankingAndOrder(sqlText);
    check(label, expectProblem ? problem !== null : problem === null, String(problem));
  }
  check("the LIMIT message tells the model to use rank()", /rank\(\) OVER/.test(String(checkRankingAndOrder("SELECT designation, count(*) AS c FROM nlq.employees GROUP BY designation ORDER BY c DESC LIMIT 1"))));
  check("the seed example for the right pattern passes both soft checks", SEED_EXAMPLES.filter((e) => e.sql && /rank\(\) OVER/.test(e.sql)).every((e) => checkRankingAndOrder(e.sql!) === null && checkDepartmentColumns(e.sql!) === null) && SEED_EXAMPLES.some((e) => e.sql && /rank\(\) OVER/.test(e.sql)));
  // -- Step 7: comparing named people
  const e4Sql = "SELECT ticket_no, name, designation, department FROM nlq.employees WHERE name_words = ARRAY['MOHD','ANWAR','ULLAH'] OR name_words = ARRAY['RANA','SAHA'] ORDER BY global_seniority_rank LIMIT 1";
  const e4RevSql = "SELECT e.ticket_no, e.name, e.designation, e.department FROM nlq.employees e WHERE upper(e.name) LIKE '%MOHD ANWAR ULLAH%' OR upper(e.name) LIKE '%RANA SAHA%' ORDER BY e.global_seniority_rank DESC LIMIT 1";
  const cmpRight = "SELECT ticket_no, name, designation, department_code, department, global_seniority_rank FROM nlq.employees WHERE (nlq.word_like(name_words, name_codes, 'anwar') AND nlq.word_like(name_words, name_codes, 'ullah')) OR (nlq.word_like(name_words, name_codes, 'rana') AND nlq.word_like(name_words, name_codes, 'saha')) ORDER BY global_seniority_rank";
  const cmp: [string, string, string, boolean][] = [
    ["E4 (10 Oct): 'who is more senior, A or B' answered with LIMIT 1 -> flagged", "who is more senior, Mohd Anwar Ullah or Rana Saha", e4Sql, true],
    ["E4 reverse: 'who is junior, A or B' with ORDER BY ... DESC LIMIT 1 -> flagged", "who is junior, Mohd Anwar Ullah or Rana Saha", e4RevSql, true],
    ["both people returned with their ranks, no LIMIT -> fine", "who is more senior, Mohd Anwar Ullah or Rana Saha", cmpRight, false],
    ["'the most senior Roy or Ray' (a genuine LIMIT 1, no comparison cue) -> fine", "who is the most senior roy or ray", "SELECT ticket_no, name FROM nlq.employees WHERE nlq.last_word_like(name_words, name_codes, 'roy') OR nlq.last_word_like(name_words, name_codes, 'ray') ORDER BY global_seniority_rank LIMIT 1", false],
    ["'who is senior to X' (a list, no LIMIT 1) -> fine", "who is senior to sanjay debnath", "SELECT ticket_no, name FROM nlq.employees WHERE global_seniority_rank < (SELECT global_seniority_rank FROM nlq.employees WHERE name_words = ARRAY['SANJAY','DEBNATH']) ORDER BY global_seniority_rank", false],
    ["a comparison cue but no OR between names -> fine", "which of the two is more senior, the GM or the DGM", "SELECT ticket_no, name FROM nlq.employees WHERE designation = 'General Manager' ORDER BY global_seniority_rank LIMIT 1", false],
  ];
  for (const [label, qText, sqlText, expectProblem] of cmp) {
    const problem = checkComparison(qText, sqlText);
    check(label, expectProblem ? problem !== null : problem === null, String(problem));
  }

  // -- a lookup of specific people must say WHO (ticket_no AND name), counts and breakdowns need not
  const ID_TICKET_OK = "SELECT e.ticket_no, e.name, e.department_code, e.department FROM nlq.employees e WHERE e.ticket_no = '228757'";
  const idRules: [string, string, boolean][] = [
    ["12 Oct screenshot: department of ticket 228757 with NO ticket and NO name -> flagged", "SELECT e.department_code, e.department FROM nlq.employees e WHERE e.ticket_no = '228757'", true],
    ["the same lookup with ticket_no and name first -> fine", ID_TICKET_OK, false],
    ["ticket_no shown but not the name -> flagged", "SELECT ticket_no, department_code, department FROM nlq.employees WHERE ticket_no = '228757'", true],
    ["name shown but not the ticket number -> flagged", "SELECT name, department_code, department FROM nlq.employees WHERE ticket_no = '228757'", true],
    ["a list of tickets (IN) without who they are -> flagged", "SELECT designation FROM nlq.employees WHERE ticket_no IN ('228757','241391')", true],
    ["a list of tickets with ticket_no and name -> fine", "SELECT ticket_no, name, designation FROM nlq.employees WHERE ticket_no IN ('228757','241391') ORDER BY global_seniority_rank", false],
    ["a person looked up by a similar-spelling name, department only -> flagged", "SELECT department_code, department FROM nlq.employees WHERE nlq.word_like(name_words, name_codes, 'roy') AND nlq.first_word_like(name_words, name_codes, 'sanjay')", true],
    ["a person looked up by exact name words, designation only -> flagged", "SELECT designation FROM nlq.employees WHERE name_words = ARRAY['SANJAY','DEBNATH']", true],
    ["the exact-name lookup with ticket_no and name -> fine", "SELECT ticket_no, name, designation FROM nlq.employees WHERE name_words = ARRAY['SANJAY','DEBNATH']", false],
    ["SELECT DISTINCT of a department for a ticket -> flagged", "SELECT DISTINCT department_code, department FROM nlq.employees WHERE ticket_no = '228757'", true],
    ["aliases count (e.ticket_no AS ticket, e.name AS employee) -> fine", "SELECT e.ticket_no AS ticket, e.name AS employee, e.department FROM nlq.employees e WHERE e.ticket_no = '228757'", false],
    ["a COUNT of people matching a name -> fine (not a row per person)", "SELECT count(*) AS count FROM nlq.employees WHERE nlq.last_word_like(name_words, name_codes, 'roy')", false],
    ["a breakdown (GROUP BY) of people matching a name -> fine", "SELECT designation, count(*) AS count FROM nlq.employees WHERE nlq.word_like(name_words, name_codes, 'kumar') GROUP BY designation, rank_order ORDER BY rank_order", false],
    ["array_agg of the names in one cell -> fine", "SELECT designation, array_agg(name ORDER BY global_seniority_rank) AS names FROM nlq.employees WHERE nlq.word_like(name_words, name_codes, 'kumar') GROUP BY designation", false],
    ["no specific person involved (a department list of executives) -> fine", "SELECT department_code, department FROM nlq.employees WHERE cohort = 'executive' ORDER BY global_seniority_rank", false],
    ["'who is senior to X': the person X is found inside a sub-query, the list shows ticket_no and name -> fine", "SELECT ticket_no, name FROM nlq.employees WHERE global_seniority_rank < (SELECT global_seniority_rank FROM nlq.employees WHERE name_words = ARRAY['SANJAY','DEBNATH']) ORDER BY global_seniority_rank", false],
    ["...but a list without the names is flagged", "SELECT ticket_no FROM nlq.employees WHERE global_seniority_rank < (SELECT global_seniority_rank FROM nlq.employees WHERE ticket_no = '1') ORDER BY global_seniority_rank", true],
    ["SELECT * cannot be judged -> fine", "SELECT * FROM nlq.employees WHERE ticket_no = '228757'", false],
    ["unparsable SQL cannot be judged -> fine", "SELEKT nonsense FROM", false],
  ];
  for (const [label, sqlText, expectProblem] of idRules) {
    const problem = checkPersonIdentity(sqlText);
    check(label, expectProblem ? problem !== null : problem === null, String(problem));
  }
  check("the message says what is missing and what to write (both missing: 'ticket_no and name are missing')", /ticket_no and name are missing/.test(String(checkPersonIdentity("SELECT department FROM nlq.employees WHERE ticket_no = '1'"))) && /e\.ticket_no, e\.name/.test(String(checkPersonIdentity("SELECT department FROM nlq.employees WHERE ticket_no = '1'"))));
  check("...and names only the missing one when one is shown ('name is missing')", /name is missing/.test(String(checkPersonIdentity("SELECT ticket_no, department FROM nlq.employees WHERE ticket_no = '1'"))) && /: name is missing from the SELECT list/.test(String(checkPersonIdentity("SELECT ticket_no, department FROM nlq.employees WHERE ticket_no = '1'"))));

  // -- the sentence that STATES a comparison's answer, in plain words (grade level = rank / 10,000, position = rank % 10,000)
  const gm1 = { name: "MOHD ANWAR ULLAH", ticket_no: "T1", global_seniority_rank: 40121 };
  const gm2 = { name: "RANA SAHA", ticket_no: "T2", global_seniority_rank: 40186 };
  const peopleGM = [{ ticketNo: "T1", designation: "General Manager", isExecutive: true }, { ticketNo: "T2", designation: "General Manager", isExecutive: true }];
  const vSame = comparisonVerdict("who is more senior, Mohd Anwar Ullah or Rana Saha", [gm1, gm2], peopleGM);
  check("two executives of one grade: states it in words (grade, position in HR's list), no raw rank number", vSame === "MOHD ANWAR ULLAH (General Manager) is more senior than RANA SAHA (General Manager): at the same grade level, listed earlier in HR's seniority list for that grade (121st against 186th).", String(vSame));
  check("...the same sentence whichever order the rows come in", comparisonVerdict("who is more senior, Mohd Anwar Ullah or Rana Saha", [gm2, gm1], peopleGM) === vSame);
  check("ordinals read naturally (1st, 2nd, 3rd, 11th, 12th, 13th, 21st, 112th)", [1, 2, 3, 11, 12, 13, 21, 112].map((n) => String(comparisonVerdict("who is more senior, A or B", [{ name: "A", ticket_no: "T1", global_seniority_rank: 40000 + n }, { name: "B", ticket_no: "T2", global_seniority_rank: 49999 }], peopleGM)).match(/\((\S+) against/)?.[1]).join(" ") === "1st 2nd 3rd 11th 12th 13th 21st 112th");
  check("...and no internal number such as 40,121 ever appears", !/40,?121|40,?186|rank \d/.test(String(vSame)));
  const vJun = comparisonVerdict("who is junior, Mohd Anwar Ullah or Rana Saha", [gm1, gm2], peopleGM);
  check("'who is junior' names the junior, with the position the other way round", vJun === "RANA SAHA (General Manager) is junior to MOHD ANWAR ULLAH (General Manager): at the same grade level, listed later in HR's seniority list for that grade (186th against 121st).", String(vJun));
  const gmAgm = [{ name: "A GM", ticket_no: "T1", global_seniority_rank: 40010 }, { name: "B AGM", ticket_no: "T2", global_seniority_rank: 70020 }];
  const pGmAgm = [{ ticketNo: "T1", designation: "General Manager", isExecutive: true }, { ticketNo: "T2", designation: "Asst.General Manager", isExecutive: true }];
  check("different grades: 'a higher grade', the designations shown", comparisonVerdict("who is more senior, A GM or B AGM", gmAgm, pGmAgm) === "A GM (General Manager) is more senior than B AGM (Asst.General Manager): a higher grade.");
  check("different grades, 'who is junior': 'a lower grade'", comparisonVerdict("who is junior, A GM or B AGM", gmAgm, pGmAgm) === "B AGM (Asst.General Manager) is junior to A GM (General Manager): a lower grade.");
  const exNon = [{ name: "AN EXEC", ticket_no: "T1", global_seniority_rank: 130010 }, { name: "A STAFF", ticket_no: "T2", global_seniority_rank: 160020 }];
  check("an executive against a non-executive: decided by grade", /^AN EXEC \(Manager\) is more senior than A STAFF \(S-9\): a higher grade\.$/.test(String(comparisonVerdict("who is more senior, an exec or a staff", exNon, [{ ticketNo: "T1", designation: "Manager", isExecutive: true }, { ticketNo: "T2", designation: "S-9", isExecutive: false }]))));
  const nn = [{ name: "STAFF ONE", ticket_no: "T1", global_seniority_rank: 160100 }, { name: "STAFF TWO", ticket_no: "T2", global_seniority_rank: 160200 }];
  const vNon = comparisonVerdict("who is more senior, staff one or staff two", nn, [{ ticketNo: "T1", designation: "S-9", isExecutive: false }, { ticketNo: "T2", designation: "S-9", isExecutive: false }]);
  check("RULE: two non-executives of one grade are NOT ranked against each other", vNon === "STAFF ONE and STAFF TWO are in the same grade (S-9). Within a non-executive grade there is no individual seniority order, so neither is more senior.", String(vNon));
  check("...even when the question asks who is junior", comparisonVerdict("who is junior, staff one or staff two", nn, [{ ticketNo: "T1", designation: "S-9", isExecutive: false }, { ticketNo: "T2", designation: "S-9", isExecutive: false }]) === vNon);
  check("same grade but the cohort is unknown -> no sentence (it will not guess)", comparisonVerdict("who is more senior, staff one or staff two", nn, []) === null);
  check("ranks that arrive as text are handled", /is more senior than B/.test(String(comparisonVerdict("who is more senior, A or B", [{ name: "A", ticket_no: "T1", global_seniority_rank: "40121" }, { name: "B", ticket_no: "T2", global_seniority_rank: "40186" }], peopleGM))));
  check("'less senior' and 'which of ... is more junior' name the junior", /is junior to/.test(String(comparisonVerdict("who is less senior, Rana Saha or Mohd Anwar Ullah", [gm1, gm2], peopleGM))) && /is junior to/.test(String(comparisonVerdict("which of Rana Saha or Mohd Anwar Ullah is more junior", [gm1, gm2], peopleGM))));
  check("'less junior' and 'more senior or junior' state the senior one", /is more senior than RANA/.test(String(comparisonVerdict("who is less junior, Rana Saha or Mohd Anwar Ullah", [gm1, gm2], peopleGM))) && /is more senior than RANA/.test(String(comparisonVerdict("who is more senior or junior, Mohd Anwar Ullah or Rana Saha", [gm1, gm2], peopleGM))));
  check("one person found -> no sentence (the missing person stays visible)", comparisonVerdict("who is more senior, A or B", [gm1], peopleGM) === null);
  check("three people found -> no sentence (the ambiguity stays visible)", comparisonVerdict("who is more senior, A or B", [gm1, gm2, { name: "X", ticket_no: "T3", global_seniority_rank: 50000 }], peopleGM) === null);
  check("equal ranks, a missing rank or a missing name -> no sentence", comparisonVerdict("who is more senior, A or B", [{ name: "A", ticket_no: "T1", global_seniority_rank: 1 }, { name: "B", ticket_no: "T2", global_seniority_rank: 1 }], peopleGM) === null && comparisonVerdict("who is more senior, A or B", [{ name: "A", ticket_no: "T1" }, gm2], peopleGM) === null && comparisonVerdict("who is more senior, A or B", [{ ticket_no: "T1", global_seniority_rank: 1 }, gm2], peopleGM) === null);
  check("a question that is not a comparison -> no sentence", comparisonVerdict("who is the most senior roy or ray", [gm1, gm2], peopleGM) === null && comparisonVerdict("list the two most senior people", [gm1, gm2], peopleGM) === null);

  // -- the internal rank never reaches a screen, a card, a table or a CSV
  {
    const cols = ["ticket_no", "name", "global_seniority_rank"];
    const rowsC = [{ ticket_no: "T1", name: "EXEC", global_seniority_rank: 40121 }, { ticket_no: "T2", name: "STAFF", global_seniority_rank: 160100 }];
    const peopleC = [{ ticketNo: "T1", isExecutive: true }, { ticketNo: "T2", isExecutive: false }];
    const hz = humanizeSeniority(cols, rowsC, peopleC);
    check("the raw rank column is replaced, in the same place, by position_in_grade", hz.columns.join(",") === "ticket_no,name,position_in_grade", hz.columns.join(","));
    check("an executive gets the position in the grade (121); a non-executive gets nothing", hz.rows[0].position_in_grade === 121 && hz.rows[1].position_in_grade === null, JSON.stringify(hz.rows));
    check("no raw rank survives anywhere in the rows", hz.rows.every((r) => !("global_seniority_rank" in r)) && !JSON.stringify(hz.rows).includes("40121") && !JSON.stringify(hz.rows).includes("160100"));
    check("a person who cannot be identified gets nothing (never a guess)", humanizeSeniority(cols, rowsC, []).rows.every((r) => r.position_in_grade === null));
    check("nothing is changed without people, without ticket_no or without the rank column", humanizeSeniority(cols, rowsC, null).columns === cols && humanizeSeniority(["name", "global_seniority_rank"], rowsC, peopleC).columns[1] === "global_seniority_rank" && humanizeSeniority(["ticket_no", "name"], rowsC, peopleC).columns.length === 2);
    const dispC = resolveDisplay(undefined, hz.columns, hz.rows, true);
    check("the Table column is titled 'Position in grade'", !!dispC && dispC.columns.some((c) => c.key === "position_in_grade" && c.label === "Position in grade"), JSON.stringify(dispC?.columns));
    const outC = withExtraFields(peopleC as any, dispC, hz.rows);
    check("an executive's card shows 'Position in grade 121'; a non-executive's card shows no position", JSON.stringify(outC[0].extraFields) === JSON.stringify([{ label: "Position in grade", value: "121" }]) && (!outC[1].extraFields || outC[1].extraFields.length === 0), JSON.stringify(outC.map((x) => x.extraFields)));
    const csvC = toCsv(dispC!.columns, hz.rows);
    check("the CSV has 'Position in grade' and 121, and no 40,121 / 40121 / 160100", /Position in grade/.test(csvC) && /,121(\r|$)/m.test(csvC) && !/40,?121|160,?100/.test(csvC), csvC.slice(0, 160));
  }

  // -- Step 8: the cohort column, the headline number, honest labels
  {
    const cols = ["ticket_no", "name", "designation", "department_code", "department", "global_seniority_rank"];
    const rowsC = [{ ticket_no: "T1", name: "EXEC", designation: "General Manager", department_code: 1, department: "D", global_seniority_rank: 40121 }, { ticket_no: "T2", name: "STAFF", designation: "S-9", department_code: 2, department: "E", global_seniority_rank: 160100 }];
    const peopleC = [{ ticketNo: "T1", isExecutive: true }, { ticketNo: "T2", isExecutive: false }];
    const ch = addCohortColumn(cols, rowsC, peopleC);
    check("the cohort column goes right after 'designation'", ch.columns.join(",") === "ticket_no,name,designation,cohort,department_code,department,global_seniority_rank", ch.columns.join(","));
    check("Executive / Non-executive; a person who cannot be identified gets a blank (never a guess)", ch.rows[0].cohort === "Executive" && ch.rows[1].cohort === "Non-executive" && addCohortColumn(cols, rowsC, []).rows.every((r) => r.cohort === null));
    check("without 'designation' it goes after 'name'; with neither it goes last", addCohortColumn(["ticket_no", "name", "x"], [{ ticket_no: "T1", name: "A", x: 1 }], peopleC).columns.join(",") === "ticket_no,name,cohort,x" && addCohortColumn(["ticket_no", "x"], [{ ticket_no: "T1", x: 1 }], peopleC).columns.join(",") === "ticket_no,x,cohort");
    check("nothing is added when the SQL already returned 'cohort', has no ticket_no, or there are no people", addCohortColumn([...cols, "cohort"], rowsC, peopleC).columns.length === 7 && addCohortColumn(["name"], [{ name: "A" }], peopleC).columns.length === 1 && addCohortColumn(cols, rowsC, null).columns === cols);
    const pp = presentPeople(cols, rowsC, peopleC);
    check("presentPeople: no raw rank, a cohort column, a position for executives only", pp.columns.join(",") === "ticket_no,name,designation,cohort,department_code,department,position_in_grade" && pp.rows[0].position_in_grade === 121 && pp.rows[1].position_in_grade === null && pp.rows[0].cohort === "Executive" && !JSON.stringify(pp.rows).includes("40121"));
    const csvP = toCsv(resolveDisplay(undefined, pp.columns, pp.rows, true)!.columns, pp.rows);
    check("the CSV has a 'Cohort' column that tells executives from non-executives", /Cohort/.test(csvP) && /Executive/.test(csvP) && /Non-executive/.test(csvP), csvP.slice(0, 200));
    check("a row count says what is loaded and what is not (rowCountLabel)", rowCountLabel(2, 2, 2, false) === "2 rows" && rowCountLabel(1, 1, 1, false) === "1 row" && rowCountLabel(12, 100, 100, false) === "12 of 100 rows" && rowCountLabel(100, 100, 259, true) === "100 loaded rows (259 in all)" && rowCountLabel(12, 100, 259, true) === "12 of 100 loaded rows (259 in all)", [rowCountLabel(100, 100, 259, true), rowCountLabel(12, 100, 259, true)].join(" | "));
    check("Copy and CSV say what they cover only when the list is not fully loaded (exportNote)", exportNote(100, 259, true).suffix === " (100 of 259)" && /Show more/.test(exportNote(100, 259, true).title) && exportNote(2, 2, false).suffix === "" && exportNote(259, 259, true).suffix === "");
  }

  // -- the cohort column in the model's own column order
  {
    const colsH = ["ticket_no", "name", "designation", "cohort", "department_code", "department"];
    const keys = (h: any) => (h.columns as any[]).map((e) => (typeof e === "string" ? e : e.key)).join(",");
    check("a column hint gets 'cohort' right after 'designation'", keys(withCohortInHint({ columns: [{ key: "ticket_no" }, { key: "name" }, { key: "designation" }, { key: "department_code" }, { key: "department" }] }, colsH)) === "ticket_no,name,designation,cohort,department_code,department");
    check("...or after 'name' when designation is not listed; plain string entries work", keys(withCohortInHint({ columns: ["name", "department"] }, colsH)) === "name,cohort,department");
    check("a hint that already mentions cohort, names neither column, has no columns, or is not an object is left untouched", (() => { const h1 = { columns: ["name", "cohort"] }; const h2 = { columns: ["department"] }; return withCohortInHint(h1, colsH) === h1 && withCohortInHint(h2, colsH) === h2 && withCohortInHint({ title: "x" }, colsH) !== null && withCohortInHint(undefined, colsH) === undefined && withCohortInHint("x", colsH) === "x" && withCohortInHint({ columns: ["name"] }, ["name"]) !== null; })());
    check("nothing is added to a hint when the table has no cohort column", keys(withCohortInHint({ columns: ["name", "designation"] }, ["name", "designation"])) === "name,designation");
  }

  // PROOF on the database: the LIMIT 1 answer hides the other person and both ranks; the right form shows them. Rolled back.
  await pg.query("BEGIN");
  try {
    await pg.query(`INSERT INTO public.employee_roster (ticket_no,name,designation_grade_id,sail_department_id,cohort,within_grade_position,global_seniority_rank) VALUES
      ('970301','ZQ ALPHA ONE',20,1,'nonexecutive',97301,960001), ('970302','ZQ BETA TWO',20,1,'nonexecutive',97302,960002)`);
    const both = (a: string) => `(nlq.word_like(name_words, name_codes, 'alpha') AND nlq.word_like(name_words, name_codes, 'one')) OR (nlq.word_like(name_words, name_codes, '${a}') AND nlq.word_like(name_words, name_codes, '${a === "beta" ? "two" : "nobody"}'))`;
    const limitOne = (await pg.query(`SELECT ticket_no, name FROM nlq.employees WHERE ${both("beta")} ORDER BY global_seniority_rank LIMIT 1`)).rows;
    const shown = (await pg.query(`SELECT ticket_no, name, global_seniority_rank FROM nlq.employees WHERE ${both("beta")} ORDER BY global_seniority_rank`)).rows;
    check("PROOF: LIMIT 1 returns ONE person and no rank (the other person is invisible)", limitOne.length === 1 && !("global_seniority_rank" in limitOne[0]), JSON.stringify(limitOne));
    check("...the right form returns BOTH, most senior first, with their ranks", shown.length === 2 && shown[0].name === "ZQ ALPHA ONE" && Number(shown[0].global_seniority_rank) < Number(shown[1].global_seniority_rank), JSON.stringify(shown));
    const ghost = (await pg.query(`SELECT ticket_no, name, global_seniority_rank FROM nlq.employees WHERE ${both("ghost")} ORDER BY global_seniority_rank`)).rows;
    check("...and when the second person does not exist the answer visibly shows a single row", ghost.length === 1 && ghost[0].name === "ZQ ALPHA ONE", JSON.stringify(ghost));
  } finally {
    await pg.query("ROLLBACK");
  }

  // The worked examples must actually be CHOSEN for these questions, or they teach nothing.
  const pickedFor = (qText: string) => pickExamples(qText, []).map((x) => x.question);
  check("the comparison example is chosen for four different phrasings (more senior, junior, between, which of)", ["who is more senior, Mohd Anwar Ullah or Rana Saha", "who is junior, Mohd Anwar Ullah or Rana Saha", "who is senior between Rahul Roy and Tapan Das", "which of Amit Sen or Rana Saha is more junior"].every((qq) => pickedFor(qq).some((x) => x.startsWith("who is more senior or junior"))), JSON.stringify(pickedFor("who is junior, Mohd Anwar Ullah or Rana Saha")));
  check("the side-by-side example is chosen for the CO & CC question", pickedFor("how many executives and non-executives work in each section of CO & CC").slice(0, 2).some((x) => /each blast furnace section/.test(x)), JSON.stringify(pickedFor("how many executives and non-executives work in each section of CO & CC")));
  check("EVERY seed example passes all the soft checks (department code+name, department identity, ranking/order, comparison, person identity)", SEED_EXAMPLES.filter((e) => e.sql).every((e) => checkDepartmentColumns(e.sql!) === null && checkDepartmentIdentity(e.sql!) === null && checkRankingAndOrder(e.sql!) === null && checkComparison(e.question, e.sql!) === null && checkPersonIdentity(e.sql!) === null && checkHealthColumns(e.sql!) === null), JSON.stringify(SEED_EXAMPLES.filter((e) => e.sql && (checkDepartmentColumns(e.sql) !== null || checkDepartmentIdentity(e.sql) !== null || checkRankingAndOrder(e.sql) !== null)).map((e) => e.question)));
  // PROOF on the database: ranking BEFORE the population filter returns fewer rows than asked for. Rolled back afterwards.
  //   6 executive-only/mixed departments: A (6 executives + 1 non-executive), B (5 + 1), C 4, D 3, E 2, F 1 (executives only).
  //   "top 3 departments with executives but no non-executives" must be C, D, E.
  await pg.query("BEGIN");
  try {
    await pg.query(`INSERT INTO public.sail_department (id, code, name, cohort_scope) VALUES (29201,970201,'ZQ RANK A','shared'),(29202,970202,'ZQ RANK B','shared'),(29203,970203,'ZQ RANK C','shared'),(29204,970204,'ZQ RANK D','shared'),(29205,970205,'ZQ RANK E','shared'),(29206,970206,'ZQ RANK F','shared')`);
    await pg.query(`INSERT INTO public.employee_roster (ticket_no,name,designation_grade_id,sail_department_id,cohort,within_grade_position,global_seniority_rank)
      SELECT '97' || lpad(v.d::text,2,'0') || lpad(g::text,2,'0'), 'ZQ P ' || v.d || '-' || g, (SELECT id FROM public.designation_grade WHERE track <> 'nonexec' ORDER BY id LIMIT 1), 29200 + v.d, 'executive', 97000 + v.d*100 + g, 950000 + v.d*100 + g
      FROM (VALUES (1,6),(2,5),(3,4),(4,3),(5,2),(6,1)) v(d,n) CROSS JOIN LATERAL generate_series(1, v.n) g`);
    await pg.query(`INSERT INTO public.employee_roster (ticket_no,name,designation_grade_id,sail_department_id,cohort,within_grade_position,global_seniority_rank) VALUES
      ('979101','ZQ N A',20,29201,'nonexecutive',97901,959101), ('979201','ZQ N B',20,29202,'nonexecutive',97902,959201)`);
    const wrongSql = `SELECT department_code, exec_count FROM (SELECT department_code, count(*) FILTER (WHERE cohort='executive') AS exec_count, count(*) FILTER (WHERE cohort='nonexecutive') AS nonexec_count, rank() OVER (ORDER BY count(*) FILTER (WHERE cohort='executive') DESC) AS r FROM nlq.employees WHERE department_code BETWEEN 970201 AND 970206 GROUP BY department_code) sub WHERE nonexec_count = 0 AND r <= 3 ORDER BY exec_count DESC`;
    const rightSql = `SELECT department_code, exec_count FROM (SELECT department_code, count(*) FILTER (WHERE cohort='executive') AS exec_count, rank() OVER (ORDER BY count(*) FILTER (WHERE cohort='executive') DESC) AS r FROM nlq.employees WHERE department_code BETWEEN 970201 AND 970206 GROUP BY department_code HAVING count(*) FILTER (WHERE cohort='nonexecutive') = 0) sub WHERE r <= 3 ORDER BY exec_count DESC`;
    const wrongRows = (await pg.query(wrongSql)).rows.map((x: any) => Number(x.department_code));
    const rightRows = (await pg.query(rightSql)).rows.map((x: any) => Number(x.department_code));
    check("PROOF: ranking before filtering returns only 1 row where 3 were asked for (C)", wrongRows.length === 1 && wrongRows[0] === 970203, JSON.stringify(wrongRows));
    check("...filtering first returns the true top 3 (C, D, E)", rightRows.join(",") === "970203,970204,970205", JSON.stringify(rightRows));
    check("the check flags the wrong form and accepts the right one", checkRankingAndOrder(wrongSql) !== null && checkRankingAndOrder(rightSql) === null);
  } finally {
    await pg.query("ROLLBACK");
  }

  // ==========================================================================
  section("M. The model adapter: tokens logged, backup models, per-minute waits, the daily allowance (the network is stubbed)");
  {
    const realFetch = globalThis.fetch;
    const saved: Record<string, string | undefined> = { GROQ_API_KEY: process.env.GROQ_API_KEY, GROQ_MODEL: process.env.GROQ_MODEL, GROQ_FALLBACK_MODELS: process.env.GROQ_FALLBACK_MODELS, GROQ_REASONING_EFFORT: process.env.GROQ_REASONING_EFFORT };
    const quietInfo = console.info, quietWarn = console.warn;
    const lines: string[] = [];
    console.info = (...a: any[]) => { lines.push(a.join(" ")); };
    console.warn = (...a: any[]) => { lines.push(a.join(" ")); };
    const okRes = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 4400, completion_tokens: 600, total_tokens: 5000 } }), { status: 200, headers: { "x-ratelimit-remaining-tokens": "3000" } });
    const limited = (msg: string, retryAfter?: string) => new Response(JSON.stringify({ error: { message: msg } }), { status: 429, headers: retryAfter ? { "retry-after": retryAfter } : {} });
    const MIN = "Rate limit reached for model `x` on tokens per minute (TPM): Limit 8000, Used 6000, Requested 4400. Please try again in 20s.";
    const DAY = "Rate limit reached for model `x` on tokens per day (TPD): Limit 200000, Used 199000, Requested 4400. Please try again in 12m3s.";
    const calls: { model: string; effort?: string }[] = [];
    const stub = (script: Response[] | ((n: number) => Response)) => {
      calls.length = 0;
      let n = 0;
      (globalThis as any).fetch = async (_u: any, init: any) => {
        const b = JSON.parse(init.body);
        calls.push({ model: b.model, effort: b.reasoning_effort });
        const r = typeof script === "function" ? script(n) : script[Math.min(n, script.length - 1)];
        n++;
        return r;
      };
    };
    try {
      process.env.GROQ_API_KEY = "test-key";
      delete process.env.GROQ_MODEL; delete process.env.GROQ_FALLBACK_MODELS; delete process.env.GROQ_REASONING_EFFORT;

      stub([okRes('{"a":1}')]);
      let out = await groqLlm()("hi");
      check("default: the main model, no reasoning_effort sent, text returned", out === '{"a":1}' && calls.length === 1 && calls[0].model === "openai/gpt-oss-120b" && calls[0].effort === undefined);
      check("each call logs its tokens and the minute's remaining allowance", lines.some((l) => /openai\/gpt-oss-120b: 4400 prompt \+ 600 completion = 5000 tokens.*3000 tokens left this minute/.test(l)), lines.join(" | "));

      process.env.GROQ_REASONING_EFFORT = "low";
      stub([okRes("{}")]);
      await groqLlm()("hi");
      check("GROQ_REASONING_EFFORT=low is passed to the model", calls[0].effort === "low");
      delete process.env.GROQ_REASONING_EFFORT;

      process.env.GROQ_FALLBACK_MODELS = "openai/gpt-oss-20b, qwen/qwen3.8-27b";
      let t0 = Date.now();
      stub((n) => (n === 0 ? limited(MIN, "20") : okRes('{"b":2}')));
      out = await groqLlm()("hi");
      check("a 20 s per-minute limit switches to the backup model AT ONCE (no waiting)", out === '{"b":2}' && calls.length === 2 && calls[1].model === "openai/gpt-oss-20b" && Date.now() - t0 < 1500, JSON.stringify(calls));
      check("...and the log marks the answer as coming from the backup", lines.some((l) => /BACKUP MODEL/.test(l)));

      stub((n) => (n < 2 ? limited(MIN, "20") : okRes("{}")));
      await groqLlm()("hi");
      check("the second model limited too: the third is used", calls.map((c) => c.model).join(",") === "openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b", JSON.stringify(calls));

      stub((n) => (n === 0 ? limited(DAY) : okRes("{}")));
      await groqLlm()("hi");
      check("a DAILY limit on the main model moves to the backup immediately", calls.length === 2 && calls[1].model === "openai/gpt-oss-20b");

      t0 = Date.now();
      stub((n) => (n === 0 ? limited(MIN, "0.2") : okRes("{}")));
      await groqLlm()("hi");
      check("a 0.2 s wait is simply waited out on the SAME model (backups are for long waits)", calls.length === 2 && calls[1].model === "openai/gpt-oss-120b" && Date.now() - t0 >= 600, JSON.stringify(calls));
      delete process.env.GROQ_FALLBACK_MODELS;

      t0 = Date.now();
      stub([limited(DAY)]);
      let err = "";
      try { await groqLlm()("hi"); } catch (e: any) { err = String(e.message); }
      check("a daily limit with no backup stops at once with a plain explanation", /free daily allowance/.test(err) && calls.length === 1 && Date.now() - t0 < 800, err.slice(0, 100));

      stub((n) => (n === 0 ? limited(MIN, "0.1") : okRes('{"c":3}')));
      out = await groqLlm()("hi");
      check("per-minute limit, no backups: waits as told, then succeeds on the same model", out === '{"c":3}' && calls.length === 2 && calls[1].model === "openai/gpt-oss-120b");

      stub([limited(MIN, "20")]);
      err = "";
      try { await groqLlm({ maxWaitSeconds: 1 })("hi"); } catch (e: any) { err = String(e.message); }
      check("a wait longer than the maximum fails with the Groq message (no endless sleep)", /Groq API failed \(429\)/.test(err) && calls.length === 1, err.slice(0, 80));

      stub([new Response("boom", { status: 500 })]);
      err = "";
      try { await groqLlm()("hi"); } catch (e: any) { err = String(e.message); }
      check("a server error is reported, not retried", /Groq API failed \(500\)/.test(err) && calls.length === 1);
    } finally {
      (globalThis as any).fetch = realFetch;
      console.info = quietInfo;
      console.warn = quietWarn;
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  }

  // ==========================================================================
  section("H. Full pipeline with a scripted stand-in model");
  const json = (o: object) => JSON.stringify(o);
  const script = (replies: string[]): LlmFn => {
    let i = 0;
    return async () => {
      if (i >= replies.length) throw new Error("script exhausted");
      return replies[i++];
    };
  };
  const good = `SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE 'KUMAR' = ANY(name_words) ORDER BY global_seniority_rank`;
  const goodPlan = json({ sql: good, understood_as: "People with the word KUMAR.", confidence: "high" });

  let r = await answerQuestion("kumar anywhere", "T1", { llm: script([goodPlan]), withClient });
  check("happy path succeeds in 1 attempt", r.ok && r.attempts === 1);
  check("result reports a true total and is logged", r.ok && r.data.total > 100 && r.logId !== null);

  r = await answerQuestion("q1", "T1", { llm: script([json({ sql: "DROP TABLE nlq.employees", understood_as: "x" }), goodPlan]), withClient });
  check("a guard rejection is repaired on attempt 2", r.ok && r.attempts === 2);
  const nameOnly = `SELECT ticket_no, name, designation, department FROM nlq.employees WHERE 'KUMAR' = ANY(name_words) ORDER BY global_seniority_rank`;
  r = await answerQuestion("kumar department columns repair", "T1", { llm: script([json({ sql: nameOnly, understood_as: "x" }), goodPlan]), withClient });
  check("a department shown by name alone is sent back once: attempt 2 returns code AND name", r.ok && r.attempts === 2 && /department_code/.test(r.sql));
  r = await answerQuestion("kumar department columns stubborn", "T1", { llm: script([json({ sql: nameOnly, understood_as: "x" }), json({ sql: nameOnly, understood_as: "x" })]), withClient });
  check("a model that insists on the name alone is still answered (never fail a question over this)", r.ok && r.attempts === 2);
  const tieBlind = `SELECT department_code, department, count(*) AS count FROM nlq.employees WHERE cohort = 'executive' GROUP BY department_id, department_code, department ORDER BY count DESC LIMIT 1`;
  const tieSafe = `SELECT department_code, department, count FROM (SELECT department_code, department, count(*) AS count, rank() OVER (ORDER BY count(*) DESC) AS r FROM nlq.employees WHERE cohort = 'executive' GROUP BY department_id, department_code, department) t WHERE r = 1 ORDER BY department_code`;
  r = await answerQuestion("which department has the most executives repair", "T1", { llm: script([json({ sql: tieBlind, understood_as: "x" }), json({ sql: tieSafe, understood_as: "x" })]), withClient });
  check("a LIMIT over groups is sent back once; attempt 2 uses rank() and the answer ran", r.ok && r.attempts === 2 && /rank\(\) OVER/.test(r.sql));
  r = await answerQuestion("which department has the most executives stubborn", "T1", { llm: script([json({ sql: tieBlind, understood_as: "x" }), json({ sql: tieBlind, understood_as: "x" })]), withClient });
  check("a model that insists on LIMIT 1 is still answered (never fail a question over this)", r.ok && r.attempts === 2);
  const pctWrong = `SELECT department_code, department, cnt AS executives, round(cnt * 100.0 / sum(cnt) OVER (), 2) AS percentage FROM (SELECT department_code, department, count(*) AS cnt, rank() OVER (ORDER BY count(*) DESC) AS r FROM nlq.employees WHERE cohort = 'executive' GROUP BY department_id, department_code, department) s WHERE r = 1 ORDER BY department_code`;
  const pctRight = `SELECT department_code, department, executives, round(executives * 100.0 / total, 2) AS percentage FROM (SELECT department_code, department, count(*) AS executives, sum(count(*)) OVER () AS total, rank() OVER (ORDER BY count(*) DESC) AS r FROM nlq.employees WHERE cohort = 'executive' GROUP BY department_id, department_code, department) t WHERE r = 1 ORDER BY department_code`;
  const wrongRun: any = await runReadOnly(db, pctWrong);
  check("PROOF of the bug: the outer-window SQL really returns 100 on the database", wrongRun.rows.length >= 1 && wrongRun.rows.every((x: any) => Number(x.percentage) === 100), JSON.stringify(wrongRun.rows[0]));
  const rightRun: any = await runReadOnly(db, pctRight);
  check("...and the corrected SQL returns a true share (above 0, below 100)", rightRun.rows.length >= 1 && rightRun.rows.every((x: any) => Number(x.percentage) > 0 && Number(x.percentage) < 100), JSON.stringify(rightRun.rows[0]));
  r = await answerQuestion("share of executives in the biggest department repair", "T1", { llm: script([json({ sql: pctWrong, understood_as: "x" }), json({ sql: pctRight, understood_as: "x" })]), withClient });
  check("the 100% trap is sent back once; attempt 2 returns the true share", r.ok && r.attempts === 2 && r.data.rows.every((x: any) => Number(x.percentage) < 100), r.ok ? JSON.stringify(r.data.rows[0]) : r.message);
  const byNumSql = `SELECT department_code, department, exec_count FROM (SELECT e.department_code, e.department, count(*) AS exec_count, rank() OVER (ORDER BY count(*) DESC) AS r FROM nlq.employees e WHERE e.cohort = 'executive' AND NOT EXISTS (SELECT 1 FROM nlq.employees ne WHERE ne.department_code = e.department_code AND ne.cohort = 'nonexecutive') GROUP BY e.department_code, e.department) sub WHERE r <= 10 ORDER BY r, department_code`;
  const byRowSql = byNumSql.replace("ne.department_code = e.department_code", "ne.department_id = e.department_id").replace("GROUP BY e.department_code, e.department", "GROUP BY e.department_id, e.department_code, e.department");
  r = await answerQuestion("executive only departments by number repair", "T1", { llm: script([json({ sql: byNumSql, understood_as: "x" }), json({ sql: byRowSql, understood_as: "x" })]), withClient });
  check("matching departments by number is sent back once; attempt 2 matches by department_id", r.ok && r.attempts === 2 && /ne\.department_id = e\.department_id/.test(r.sql));
  const rankFirst = `SELECT department_code, exec_count FROM (SELECT department_code, count(*) FILTER (WHERE cohort='executive') AS exec_count, count(*) FILTER (WHERE cohort='nonexecutive') AS nonexec_count, rank() OVER (ORDER BY count(*) FILTER (WHERE cohort='executive') DESC) AS r FROM nlq.employees GROUP BY department_code) sub WHERE nonexec_count = 0 AND r <= 10 ORDER BY exec_count DESC, department_code`;
  const filterFirst = `SELECT department_code, exec_count FROM (SELECT department_code, count(*) FILTER (WHERE cohort='executive') AS exec_count, rank() OVER (ORDER BY count(*) FILTER (WHERE cohort='executive') DESC) AS r FROM nlq.employees GROUP BY department_code HAVING count(*) FILTER (WHERE cohort='nonexecutive') = 0) sub WHERE r <= 10 ORDER BY exec_count DESC, department_code`;
  r = await answerQuestion("top departments with executives only repair", "T1", { llm: script([json({ sql: rankFirst, understood_as: "x" }), json({ sql: filterFirst, understood_as: "x" })]), withClient });
  check("ranking before the population filter is sent back once; attempt 2 filters first (HAVING)", r.ok && r.attempts === 2 && /HAVING/i.test(r.sql));
  // -- 12 Oct: "which department is ticket N in" came back as a department with no person. Sent back once; ticket_no and name come first.
  const tkRow = await withClient(async (c) => (await c.query("SELECT ticket_no FROM nlq.employees ORDER BY ticket_no LIMIT 1")).rows[0] as { ticket_no: string });
  const idBlind = `SELECT e.department_code, e.department FROM nlq.employees e WHERE e.ticket_no = '${tkRow.ticket_no}'`;
  const idRight = `SELECT e.ticket_no, e.name, e.department_code, e.department FROM nlq.employees e WHERE e.ticket_no = '${tkRow.ticket_no}'`;
  r = await answerQuestion("which department is that ticket in repair", "T1", { llm: script([json({ sql: idBlind, understood_as: "x" }), json({ sql: idRight, understood_as: "x" })]), withClient });
  check("a ticket lookup that does not say WHO is sent back once: attempt 2 has ticket_no and name FIRST and the one row ran", r.ok && r.attempts === 2 && r.data.columns[0] === "ticket_no" && r.data.columns[1] === "name" && r.data.total === 1, r.ok ? r.data.columns.join(",") : r.message);
  check("...the row carries the ticket number and the employee's name together", r.ok && String(r.data.rows[0].ticket_no) === tkRow.ticket_no && String(r.data.rows[0].name).length > 0);
  r = await answerQuestion("which department is that ticket in stubborn", "T1", { llm: script([json({ sql: idBlind, understood_as: "x" }), json({ sql: idBlind, understood_as: "x" })]), withClient });
  check("a model that insists on the department alone is still answered (never fail a question over this)", r.ok && r.attempts === 2);
  r = await answerQuestion("which department is that ticket in right first time", "T1", { llm: script([json({ sql: idRight, understood_as: "x" })]), withClient });
  check("an answer that already says who it is about is accepted at once (1 attempt)", r.ok && r.attempts === 1);
  const cmpWrong = `SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE (nlq.word_like(name_words, name_codes, 'sunil') AND nlq.word_like(name_words, name_codes, 'das')) OR (nlq.word_like(name_words, name_codes, 'amit') AND nlq.word_like(name_words, name_codes, 'sen')) ORDER BY global_seniority_rank LIMIT 1`;
  const cmpFixed = cmpWrong.replace("department FROM", "department, global_seniority_rank FROM").replace(" LIMIT 1", "");
  r = await answerQuestion("who is more senior, Sunil Das or Amit Sen", "T1", { llm: script([json({ sql: cmpWrong, understood_as: "x" }), json({ sql: cmpFixed, understood_as: "x" })]), withClient });
  check("a LIMIT 1 comparison is sent back once; attempt 2 shows both people with their ranks", r.ok && r.attempts === 2 && !/LIMIT/i.test(r.sql) && /global_seniority_rank FROM/.test(r.sql));
  r = await answerQuestion("who is the most senior sunil das or amit sen", "T1", { llm: script([json({ sql: cmpWrong, understood_as: "x" })]), withClient });
  check("a genuine 'most senior of A or B' LIMIT 1 is NOT sent back", r.ok && r.attempts === 1);
  r = await answerQuestion("two soft problems at once", "T1", { llm: script([json({ sql: `SELECT department, count(*) AS count FROM nlq.employees GROUP BY department`, understood_as: "x" }), json({ sql: `SELECT department_code, department, count(*) AS count FROM nlq.employees GROUP BY department_id, department_code, department ORDER BY count DESC`, understood_as: "x" })]), withClient });
  check("name-only AND unordered are fixed together by ONE repair", r.ok && r.attempts === 2 && /department_code/.test(r.sql) && /ORDER BY/i.test(r.sql));

  r = await answerQuestion("q2", "T1", { llm: script([json({ sql: "SELECT nosuchcol FROM nlq.employees", understood_as: "x" }), goodPlan]), withClient });
  check("a database error is repaired on attempt 2", r.ok && r.attempts === 2);

  r = await answerQuestion("q3", "T1", { llm: script(["not json at all", goodPlan]), withClient });
  check("an unparsable reply is retried", r.ok && r.attempts === 2);

  r = await answerQuestion("q4", "T1", { llm: script([json({ sql: "SELECT pg_sleep(1)", understood_as: "x" }), json({ sql: "SELECT set_config('role','postgres',true)", understood_as: "x" }), json({ sql: "SELECT * FROM public.\"user\"", understood_as: "x" })]), withClient });
  check("gives up after 3 attempts with an honest message", !r.ok && r.kind === "error" && r.attempts === 3 && /could not turn this/i.test(r.message));

  r = await answerQuestion("q5", "T1", { llm: script([json({ sql: null, understood_as: "salary", unanswerable_reason: "No salary data." })]), withClient });
  check("unanswerable is reported, not guessed", !r.ok && r.kind === "unanswerable" && r.message === "No salary data.");

  r = await answerQuestion("what is the leave policy for contract workers", "T1", { llm: script([json({ sql: null, understood_as: "A policy question.", out_of_scope: true })]), withClient });
  check("a question that is not about employees is reported as out_of_scope", !r.ok && r.kind === "out_of_scope");

  r = await answerQuestion("q6", "T1", { llm: script([json({ sql: null, understood_as: "ambiguous", needs_clarification: "Which Sanjay do you mean?" })]), withClient });
  check("clarifying question is passed through", !r.ok && r.kind === "clarify" && r.message === "Which Sanjay do you mean?");

  r = await answerQuestion("q7", "T1", { llm: async () => { throw new Error("network down"); }, withClient });
  check("model outage gives a clear error", !r.ok && r.kind === "error" && /could not be reached/.test(r.message));

  r = await answerQuestion("", "T1", { llm: script([]), withClient });
  check("empty question is refused", !r.ok && r.kind === "error");
  r = await answerQuestion("x".repeat(600), "T1", { llm: script([]), withClient });
  check("over-long question is refused", !r.ok && r.kind === "error");

  // the department scope through the whole pipeline
  const scoped = await answerQuestion("how many in garage", "T1", { llm: script([json({ sql: posQ, understood_as: "garage count", confidence: "high" })]), withClient });
  check("the pipeline result carries the scope", scoped.ok && scoped.scope !== null && scoped.scope.total === 3, scoped.ok ? JSON.stringify(scoped.scope) : scoped.message);
  const plain = await answerQuestion("how many executives", "T1", { llm: script([json({ sql: `SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive'`, understood_as: "execs", confidence: "high" })]), withClient });
  check("an answer without a department filter has no scope", plain.ok && plain.scope === null);

  // the quoted-name rule through the whole pipeline
  r = await answerQuestion('find the names which end with "debnath"', "T1", {
    llm: script([json({ sql: helperSql, understood_as: "similar spelling", confidence: "high" }), json({ sql: exactSql, understood_as: "Exactly DEBNATH.", confidence: "high" })]),
    withClient,
  });
  check("a quoted name answered with similar-spelling is sent back and corrected on attempt 2", r.ok && r.attempts === 2 && r.sql.includes("'DEBNATH'") && !r.sql.includes("last_word_like"), r.ok ? `attempts ${r.attempts}` : r.message);
  const qPrompt = buildPrompt({ question: 'find the names which end with "debnath"', context: ctx, examples: [] });
  check("the prompt names the quoted term and demands exact matching", qPrompt.includes('puts "debnath" in double quotes') && qPrompt.includes("EXACTLY"));
  check("an unquoted question gets no such line", !buildPrompt({ question: "find the names which end with debnath", context: ctx, examples: [] }).includes("in double quotes. Match"));

  // the three real failures, through the whole pipeline: wrong first try, corrected on the second
  const cases3: [string, string, string][] = [
    ["count of officers in the C&IT department", bad1, `SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (SELECT id FROM nlq.departments WHERE code IN (98500,98530,98540))`],
    ["top 10 senior staff", bad2, `SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE cohort = 'nonexecutive' ORDER BY global_seniority_rank LIMIT 10`],
    ["number of people working in BLAST FURNACE (OPERATION)", `SELECT count(*) AS count FROM nlq.employees WHERE department_id IN (SELECT id FROM nlq.departments WHERE nlq.norm(name) LIKE '%blast furnace (operation)%')`, `SELECT count(*) AS count FROM nlq.employees WHERE department_id IN (SELECT id FROM nlq.departments WHERE nlq.norm(name) LIKE '%blast furnace operation%')`],
  ];
  for (const [qq, badSql, goodSql2] of cases3) {
    const rr = await answerQuestion(qq, "T1", { llm: script([json({ sql: badSql, understood_as: "first try", confidence: "high" }), json({ sql: goodSql2, understood_as: "corrected", confidence: "high" })]), withClient });
    check(`wrong first answer is caught and corrected: "${qq}"`, rr.ok && rr.attempts === 2, rr.ok ? `attempts ${rr.attempts}` : rr.message);
  }
  const promptStaff = buildPrompt({ question: "top 10 senior staff", context: ctx, examples: [] });
  check("the prompt carries the vocabulary line for this question", promptStaff.includes("IMPORTANT (vocabulary)") && promptStaff.includes("cohort = 'nonexecutive'"));
  check("the prompt states singular and plural forms and the Medical Officer tie-break", promptStaff.includes("Singular and plural mean the same") && promptStaff.includes("Medical Officer"));
  check("the prompt tells the model to write norm patterns without punctuation", promptStaff.includes("NO brackets, punctuation or capitals"));

  // tick / cross and rejected-reading memory
  r = await answerQuestion("kumar test verdict", "USER-A", { llm: script([goodPlan]), withClient });
  const logId = r.ok ? r.logId : null;
  check("answer is logged with an id for the tick/cross", logId !== null);
  check("another person cannot rate someone else's answer", logId !== null && !(await recordVerdict(db, logId, "reject", "USER-B")));
  check("the asker can mark it wrong", logId !== null && (await recordVerdict(db, logId, "reject", "USER-A")));
  r = await answerQuestion("Kumar  test   VERDICT", "USER-A", { llm: script([goodPlan, json({ sql: `${good} LIMIT 5`, understood_as: "A different reading." })]), withClient });
  check("the same SQL is refused after a cross; a different reading is accepted", r.ok && r.attempts === 2 && r.sql.includes("LIMIT 5"), r.ok ? `attempts ${r.attempts}` : r.message);
  r = await answerQuestion("kumar test verdict", "USER-C", { llm: script([goodPlan, json({ sql: `${good} LIMIT 5`, understood_as: "A different reading." })]), withClient });
  check("one person's cross is final: the same SQL is refused for everyone else too", r.ok && r.attempts === 2 && r.sql.includes("LIMIT 5"), r.ok ? `attempts ${r.attempts}` : r.message);

  // confirmed answers become worked examples
  r = await answerQuestion("employees called zzqx", "USER-A", { llm: script([json({ sql: `SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE 'ZZQX' = ANY(name_words) ORDER BY global_seniority_rank`, understood_as: "zzqx" })]), withClient });
  if (r.ok && r.logId) await recordVerdict(db, r.logId, "confirm", "USER-A");
  const { loadConfirmedExamples } = await import("../examples");
  const confirmed = await loadConfirmedExamples(db);
  check("a ticked answer is stored and returned as a worked example", confirmed.some((e) => e.question === "employees called zzqx"));
  check("…and is retrieved for a similar new question", pickExamples("find employees called zzqx please", confirmed).some((e) => e.source === "confirmed"));

  // ==========================================================================
  section("I. Golden questions through the full pipeline (stand-in model replies with the reference)");
  let variants = 0;
  let variantPass = 0;
  for (const c of GOLDEN) {
    let expected: Record<string, unknown>[] = [];
    if (c.reference) {
      const g = guardSql(c.reference);
      check(`reference SQL is valid for ${c.id}`, g.ok, g.ok ? "" : (g as any).reason);
      expected = (await runReadOnly(db, c.reference, { rowLimit: 5000 })).rows;
    }
    for (const v of c.variants) {
      variants++;
      const reply = c.reference
        ? json({ sql: c.reference, understood_as: `Reference for ${c.id}`, confidence: "high" })
        : json({ sql: null, understood_as: "not available", unanswerable_reason: "This data does not include that." });
      const res = await answerQuestion(v, "GOLD", { llm: script([reply]), withClient, exec: { rowLimit: 5000 } });
      let pass: boolean;
      if (c.kind === "unanswerable") pass = !res.ok && res.kind === "unanswerable";
      else pass = res.ok && compareResults(c.kind, expected, res.data.rows).pass;
      if (pass) variantPass++;
      else check(`golden ${c.id}: "${v}"`, false, res.ok ? compareResults(c.kind, expected, res.data.rows).detail : res.message);
    }
  }
  check(`all ${variants} golden wordings pass through the pipeline`, variantPass === variants, `${variantPass}/${variants}`);
  console.log(`  ${GOLDEN.length} questions, ${variants} wordings`);

  // expected-size sanity on the cases that mattered in the real conversation
  const sizeOf = async (sql: string) => Number((await pg.query(`SELECT count(*)::int n FROM (${sql}) q`)).rows[0].n);
  const gm = GOLDEN.find((g) => g.id === "gm_cit_nath")!;
  const gmRows = (await runReadOnly(db, gm.reference!)).rows;
  check("GMs in C&IT ending nath = exactly PRADIP NATH (the non-executive GOUTAM DEBNATH is excluded)", gmRows.length === 1 && gmRows[0].name === "PRADIP NATH", JSON.stringify(gmRows.map((x) => x.name)));
  const mid = GOLDEN.find((g) => g.id === "contains_nath_not_at_end")!;
  const midNames = (await runReadOnly(db, mid.reference!, { rowLimit: 5000 })).rows.map((x) => String(x.name));
  check("'contains nath but not at the end' excludes every Debnath and Gopinath", !midNames.some((n) => /DEBNATH$|GOPINATH$/.test(n)) && midNames.includes("UPENDRANATH BARMAN"));
  check("reference row counts are non-trivial (tests are not vacuous)", (await sizeOf(GOLDEN[0].reference!)) > 5 && (await sizeOf(GOLDEN[4].reference!)) > 3);

  // ==========================================================================
  section("K. The omnibar path: question -> model SQL -> the payload the omnibar renders");
  const nothing = async () => null;
  let legacyCalls = 0;
  const mkDeps = (llm: LlmFn, over: Partial<OmnibarDeps> = {}): OmnibarDeps => ({
    enabled: true, llm, withClient, holiday: nothing, legacy: async () => { legacyCalls++; return null; }, verifiedMin: 2, ...over,
  });
  const model = (sql: string, understood = "the reading") => script([json({ sql, understood_as: understood, confidence: "high" })]);
  const PEOPLE5 = `SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE cohort = 'executive' ORDER BY global_seniority_rank LIMIT 5`;

  let o: any = await runOmnibar("list five senior executives", "T-OMNI", mkDeps(model(PEOPLE5, "Five most senior executives.")));
  const expectTickets = (await pg.query(`SELECT ticket_no FROM nlq.employees WHERE cohort = 'executive' ORDER BY global_seniority_rank LIMIT 5`)).rows.map((r: any) => r.ticket_no);
  check("a people list becomes count + people cards", o && o.kind === "count" && o.count === 5 && Array.isArray(o.people) && o.people.length === 5, JSON.stringify(o && { kind: o.kind, count: o.count }));
  check("people cards keep the model's seniority order", JSON.stringify(o.people.map((p: any) => p.ticketNo)) === JSON.stringify(expectTickets));
  check("people cards have the shape the omnibar renders", o.people.every((p: any) => p.type === "employee" && typeof p.id === "string" && p.name && p.isExecutive === true && "mobileMasked" in p && "hasEmail" in p));
  check("the reading, the SQL and the log id travel with the answer", o.interpretation === "Five most senior executives." && o.nl2sql.sql.includes("LIMIT 5") && typeof o.nl2sql.logId === "number" && o.nl2sql.userKey === "T-OMNI");
  check("the headline names the number of people", /5 people found/.test(o.answer));
  const logged = (await pg.query(`SELECT user_key, ok FROM public.nl2sql_log WHERE id = $1`, [o.nl2sql.logId])).rows[0];
  check("the omnibar answer is logged for that person", logged && logged.user_key === "T-OMNI" && logged.ok === true);

  // contact details stay masked; passwords never appear
  const many: any = await runOmnibar("sixty executives", "T-OMNI", mkDeps(model(`SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE cohort = 'executive' ORDER BY global_seniority_rank LIMIT 60`)));
  const withMobile = many.people.find((p: any) => p.hasMobile);
  check("some people have a phone on file (test data)", !!withMobile);
  const raw = (await pg.query(`SELECT u."contactNo" AS c, u.email AS e FROM public.employee_roster r JOIN public."user" u ON u.id = r.user_id WHERE r.ticket_no = $1`, [withMobile.ticketNo])).rows[0];
  check("a phone number is masked after its first 6 digits", withMobile.mobileMasked === raw.c.slice(0, 6) + "x".repeat(raw.c.length - 6) && withMobile.mobileMasked !== raw.c, `${withMobile.mobileMasked} vs ${raw.c}`);
  const withMail = many.people.find((p: any) => p.hasEmail);
  check("an e-mail address is masked before the @", !!withMail && /^xxxxxx@/.test(withMail.emailMasked));
  const blob = JSON.stringify(many);
  check("no password hash and no full contact value is in the payload", !blob.includes("HASHED-SECRET") && !blob.includes(raw.c) && !(raw.e && blob.includes(raw.e)));

  // long lists: first 100 shown, true total reported
  const longList: any = await runOmnibar("all non executives", "T-OMNI", mkDeps(model(`SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE cohort = 'nonexecutive' ORDER BY global_seniority_rank`)));
  const nonExecTotal = (await pg.query(`SELECT count(*)::int n FROM nlq.employees WHERE cohort = 'nonexecutive'`)).rows[0].n;
  check("a long list shows 100 people but reports the true total", longList.people.length === 100 && longList.listTruncated === true && longList.count === nonExecTotal, `${longList.people.length}/${longList.count} vs ${nonExecTotal}`);

  // a single number
  o = await runOmnibar("how many executives", "T-OMNI", mkDeps(model(`SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive'`, "The number of executives.")));
  const execTotal = (await pg.query(`SELECT count(*)::int n FROM nlq.employees WHERE cohort = 'executive'`)).rows[0].n;
  check("a single number becomes a count answer", o.kind === "count" && o.count === execTotal && o.answer === "The number of executives." && !o.people, JSON.stringify(o));

  // a breakdown table
  o = await runOmnibar("designation wise", "T-OMNI", mkDeps(model(`SELECT designation, count(*) AS count FROM nlq.employees GROUP BY designation, rank_order ORDER BY rank_order`)));
  check("a breakdown becomes a table answer", o.kind === "total" && o.nl2sql.table && o.nl2sql.table.columns.join() === "designation,count" && o.nl2sql.table.rows.length > 5 && !o.people);
  check("the table headline counts its rows", new RegExp(`^${o.nl2sql.table.total.toLocaleString()} rows\\.`).test(o.answer), o.answer);

  // departments covered
  o = await runOmnibar("plant garage people", "T-OMNI", mkDeps(model(`SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE department_id IN (SELECT id FROM nlq.departments WHERE nlq.norm(name) LIKE '%garage%') ORDER BY global_seniority_rank`)));
  check("departments covered travel with the answer", o.nl2sql.scope && o.nl2sql.scope.total === 3 && o.nl2sql.scope.departments.every((d: string) => /GARAGE/.test(d)), JSON.stringify(o.nl2sql.scope));
  // a comparison STATES its answer, computed from the ranks of two real people
  const twoTop = (await pg.query(`SELECT ticket_no, name, global_seniority_rank FROM nlq.employees ORDER BY global_seniority_rank LIMIT 2`)).rows;
  const cmpSql2 = `SELECT ticket_no, name, designation, department_code, department, global_seniority_rank FROM nlq.employees WHERE ticket_no IN ('${twoTop[0].ticket_no}', '${twoTop[1].ticket_no}') ORDER BY global_seniority_rank`;
  o = await runOmnibar(`who is more senior, ${twoTop[1].name} or ${twoTop[0].name}`, "T-OMNI", mkDeps(model(cmpSql2)));
  check("end to end: the answer states who is more senior, in words, with no internal number", typeof o.answer === "string" && o.answer.startsWith(`${twoTop[0].name} (`) && / is more senior than /.test(o.answer) && !/\d{2},\d{3}/.test(o.answer) && o.people.length === 2, String(o.answer));
  o = await runOmnibar(`who is junior, ${twoTop[1].name} or ${twoTop[0].name}`, "T-OMNI", mkDeps(model(cmpSql2)));
  check("end to end: 'who is junior' names the junior", typeof o.answer === "string" && o.answer.startsWith(`${twoTop[1].name} (`) && / is junior to /.test(o.answer), String(o.answer));
  check("end to end: executives' cards show 'Position in grade', never the raw rank", o.people.every((pp: any) => !pp.extraFields || pp.extraFields.every((f: any) => f.label === "Position in grade" && !/,/.test(f.value))), JSON.stringify(o.people.map((pp: any) => pp.extraFields)));
  {
    const tb: any = o.nl2sql.table;
    check("end to end: the TABLE carries 'position_in_grade' and never the raw rank", tb.columns.includes("position_in_grade") && !tb.columns.includes("global_seniority_rank") && tb.rows.every((rr: any) => !("global_seniority_rank" in rr) && (rr.position_in_grade === null || Number(rr.position_in_grade) < 10000)), JSON.stringify(tb.rows[0]));
    const pg2 = (await pg.query(`SELECT ticket_no, name, designation, department_code, department, global_seniority_rank FROM nlq.employees ORDER BY global_seniority_rank LIMIT 3`)).rows;
    const cardsMore = await withClient((c) => peoplePage(c, { columns: ["ticket_no", "name", "designation", "department_code", "department", "global_seniority_rank"], rows: pg2, total: 3, truncated: false } as any, undefined));
    check("'Show more': the page's cards carry 'Position in grade' (a small number), never the raw rank", cardsMore.length === 3 && cardsMore.every((cc: any) => !cc.extraFields || cc.extraFields.every((f: any) => f.label === "Position in grade" && Number(f.value) < 10000)), JSON.stringify(cardsMore.map((cc: any) => cc.extraFields)));
  }
  o = await runOmnibar("the two most senior people in the plant", "T-OMNI", mkDeps(model(cmpSql2)));
  check("end to end: an ordinary list keeps its headline number and its caption", o.count === 2 && o.answer === "2 people found.", JSON.stringify([o.count, o.answer]));
  {
    const tb2: any = o.nl2sql.table;
    const dIdx = tb2.columns.indexOf("designation");
    check("end to end: the table has a 'cohort' column right after designation, 'Executive' for the two most senior", tb2.columns[dIdx + 1] === "cohort" && tb2.rows.every((rr: any) => rr.cohort === "Executive"), tb2.columns.join(","));
    check("end to end: the cards do NOT repeat the cohort as a chip", o.people.every((pp: any) => !pp.extraFields || pp.extraFields.every((f: any) => f.label !== "Cohort")));
  }
  const oCmp: any = await runOmnibar(`who is more senior, ${twoTop[1].name} or ${twoTop[0].name}`, "T-OMNI", mkDeps(model(cmpSql2)));
  check("end to end: a comparison has no bare headline number, and its sentence states the answer", oCmp.count === undefined && typeof oCmp.answer === "string" && / is more senior than /.test(oCmp.answer), JSON.stringify([oCmp.count, oCmp.answer]));
  check("end to end: an ordinary list keeps its plain '2 people found.'", o.answer === "2 people found.", String(o.answer));
  check("the payload carries the model-call count and the time taken (shown in the SQL panel)", o.nl2sql.attempts >= 1 && typeof o.nl2sql.elapsedMs === "number" && o.nl2sql.elapsedMs >= 0, JSON.stringify([o.nl2sql.attempts, o.nl2sql.elapsedMs]));

  // extra columns next to ticket_no
  o = await runOmnibar("with email flag", "T-OMNI", mkDeps(model(`SELECT ticket_no, name, has_email_nic FROM nlq.employees WHERE cohort = 'executive' ORDER BY global_seniority_rank LIMIT 3`)));
  check("a people list with an extra column also gets the table", o.people.length === 3 && o.nl2sql.table && o.nl2sql.table.columns.includes("has_email_nic"));
  o = await runOmnibar("nobody", "T-OMNI", mkDeps(model(`SELECT ticket_no, name FROM nlq.employees WHERE name = 'NO SUCH PERSON' ORDER BY global_seniority_rank`)));
  check("an empty list says so", o.kind === "count" && o.count === 0 && Array.isArray(o.people) && o.people.length === 0 && /0 people found/.test(o.answer));

  // routing decisions
  legacyCalls = 0;
  let calls = 0;
  const counted = (inner: LlmFn): LlmFn => async (p) => { calls++; return inner(p); };
  o = await runOmnibar("what is the leave policy for contract workers", "T-OMNI", mkDeps(counted(script([json({ sql: null, understood_as: "A policy question.", out_of_scope: true })]))));
  check("a non-employee question falls through to circular search (null) without the old engine", o === null && legacyCalls === 0);

  calls = 0;
  o = await runOmnibar("holidays in 2026", "T-OMNI", mkDeps(counted(script([])), { holiday: async () => ({ kind: "count", answer: "holiday answer" }) as any }));
  check("a holiday question keeps its deterministic answer and never calls the model", o && o.answer === "holiday answer" && calls === 0);
  o = await runOmnibar("anything", "T-OMNI", mkDeps(model(PEOPLE5), { holiday: async () => { throw new Error("parser exploded"); } }));
  check("a failing holiday check does not break employee questions", o && o.kind === "count");

  calls = 0; legacyCalls = 0;
  o = await runOmnibar("anything", "T-OMNI", mkDeps(counted(script([])), { enabled: false, legacy: async () => ({ kind: "count", answer: "legacy answer" }) as any }));
  check("the kill switch sends the question to the previous engine only", o && o.answer === "legacy answer" && calls === 0);

  o = await runOmnibar("salary of arup roy", "T-OMNI", mkDeps(script([json({ sql: null, understood_as: "A salary request.", unanswerable_reason: "This data does not include salary." })])));
  check("an unanswerable employee question is explained, in the information card", o.kind === "clarify" && o.answer === "This data does not include salary." && o.interpretation === "A salary request.");
  o = await runOmnibar("sanjay", "T-OMNI", mkDeps(script([json({ sql: null, understood_as: "ambiguous", needs_clarification: "Which Sanjay do you mean?" })])));
  check("a clarifying question is passed on", o.kind === "clarify" && o.answer === "Which Sanjay do you mean?");
  check("a clarifying question is not flagged as a data gap", o.unanswerable === undefined);
  o = await runOmnibar("salary of arup roy", "T-OMNI", mkDeps(script([json({ sql: null, understood_as: "A salary request.", unanswerable_reason: "This data does not include salary." })])));
  check("an unanswerable answer is flagged, so that the route may try the circulars first", o.kind === "clarify" && o.unanswerable === true);
  o = await runOmnibar("which pathology room should non-executive employees report to", "T-OMNI", mkDeps(script([json({ sql: null, understood_as: "A room request.", unanswerable_reason: "The health_checkups view does not include a pathology-room column." })])));
  check("an explanation that names the database's own view or column is replaced by a plain one", o.kind === "clarify" && o.unanswerable === true && !/health_checkups|view|column/i.test(o.answer) && /do not hold that information/.test(o.answer));

  const down: LlmFn = async () => { throw new Error("network down"); };
  o = await runOmnibar("anything", "T-OMNI", mkDeps(down, { legacy: async () => ({ kind: "count", answer: "legacy answer" }) as any }));
  check("if the model is unreachable the previous engine answers", o && o.answer === "legacy answer");
  o = await runOmnibar("anything", "T-OMNI", mkDeps(down));
  check("if the model is unreachable and the old engine has nothing, circular search still runs (null)", o === null);
  o = await runOmnibar("anything", "T-OMNI", mkDeps(script(["not json", "still not json", "nope"])));
  check("three unusable replies give an honest message, not silence", o && o.kind === "clarify" && /could not turn this/i.test(o.answer), JSON.stringify(o));
  o = await runOmnibar("anything", "T-OMNI", mkDeps(script(["not json", "still not json", "nope"]), { legacy: async () => ({ kind: "count", answer: "legacy answer" }) as any }));
  check("three unusable replies fall back to the previous engine when it has an answer", o && o.answer === "legacy answer");

  // people lookup details
  const pf = await peopleFor(db, ["", "no-such-ticket", ...expectTickets, expectTickets[0]]);
  check("peopleFor ignores blanks and unknown tickets and removes duplicates", pf.length === 5 && new Set(pf.map((p) => p.ticketNo)).size === 5);
  check("peopleFor returns nothing for an empty list", (await peopleFor(db, [])).length === 0);

  // the tick/cross wiring: rating the omnibar answer works for its owner only
  const rated: any = await runOmnibar("rate me", "T-RATER", mkDeps(model(PEOPLE5)));
  check("the owner can rate an omnibar answer", await recordVerdict(db, rated.nl2sql.logId, "confirm", rated.nl2sql.userKey));
  check("someone else cannot", !(await recordVerdict(db, rated.nl2sql.logId, "reject", "T-OTHER")));

  // ==========================================================================
  section("L. The learning loop: Yes / No on every answer, a different second attempt, verified answers");

  // -- the live database is upgraded by file 07: simulate the OLD table and run it as ONE query, twice
  await pg.query(`ALTER TABLE public.nl2sql_log DROP COLUMN source, DROP COLUMN retry_of, DROP COLUMN reject_reason, DROP COLUMN reject_note`);
  await pg.query(`DROP TABLE public.omnibar_feedback`);
  const file07 = readFileSync(join(SQL_DIR, "07_feedback_learning.sql"), "utf8");
  for (const pass of [1, 2]) {
    let err = "";
    try { await pg.query(file07); } catch (e: any) { err = String(e.message); }
    check(`07 upgrades the old log table and creates the feedback table (run ${pass})`, err === "", err);
  }
  const cols = (await pg.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='nl2sql_log' AND column_name IN ('source','retry_of','reject_reason','reject_note')`)).rows.length;
  check("the four new log columns exist", cols === 4, String(cols));
  check("no restricted role is left switched on after 07", (await pg.query(`SELECT current_user AS u`)).rows[0].u !== "nlq_reader");

  // -- input validation
  const fbOk = parseFeedback({ query: " q ", source: "nl2sql", verdict: "no", reasonCode: "wrong_name", note: " x ", nl2sqlLogId: 5, attempt: 2 }, "T1");
  check("valid feedback is parsed and trimmed", !!fbOk && fbOk.query === "q" && fbOk.reasonCode === "wrong_name" && fbOk.note === "x" && fbOk.nl2sqlLogId === 5 && fbOk.attempt === 2);
  check("an unknown route is refused", parseFeedback({ query: "q", source: "nope", verdict: "yes" }, null) === null);
  check("a missing verdict is refused", parseFeedback({ query: "q", source: "circular" }, null) === null);
  check("an empty query is refused", parseFeedback({ query: "  ", source: "circular", verdict: "yes" }, null) === null);
  check("a Yes carries no reason", parseFeedback({ query: "q", source: "circular", verdict: "yes", reasonCode: "wrong_name", note: "n" }, null)?.reasonCode === null);
  check("an unknown reason code is dropped", parseFeedback({ query: "q", source: "circular", verdict: "no", reasonCode: "bogus" }, null)?.reasonCode === null);
  check("a long note is capped at 300 characters", (parseFeedback({ query: "q", source: "circular", verdict: "no", note: "x".repeat(900) }, null)?.note || "").length === 300);
  check("every reason code has a hint", REASON_CODES.every((c) => retryHint(c, null).length > 20));

  // -- Yes / No on a model answer, on someone else's answer, and on a non-model answer
  const SQL_A = `SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE cohort = 'executive' ORDER BY global_seniority_rank LIMIT 4`;
  const SQL_B = `SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE cohort = 'executive' ORDER BY global_seniority_rank LIMIT 3`;
  const ask = async (qq: string, user: string | null, sql: string, over: Partial<OmnibarDeps> = {}) => {
    const out = (await runOmnibar(qq, user, mkDeps(model(sql), over))) as any;
    if (!out || !out.nl2sql) throw new Error(`ask() got no model answer for "${qq}" (user ${user}): ${JSON.stringify(out)}`);
    return out;
  };

  const a1 = await ask("learn question", "L-A", SQL_A);
  const fNo = await recordFeedback(db, { userKey: "L-A", query: "learn question", source: "nl2sql", verdict: "no", reasonCode: "wrong_name", note: "I meant exact", nl2sqlLogId: a1.nl2sql.logId, attempt: 1 });
  const rowNo = (await pg.query(`SELECT verdict, reject_reason, reject_note FROM public.nl2sql_log WHERE id = $1`, [a1.nl2sql.logId])).rows[0];
  check("a No on a model answer is stored with its reason and sets the verdict on the log row", fNo.verdictRecorded && rowNo.verdict === "reject" && rowNo.reject_reason === "wrong_name" && rowNo.reject_note === "I meant exact", JSON.stringify(rowNo));
  check("the click itself is stored in omnibar_feedback", (await pg.query(`SELECT count(*)::int n FROM public.omnibar_feedback WHERE id = $1 AND verdict = 'no' AND source = 'nl2sql'`, [fNo.id])).rows[0].n === 1);

  const a2 = await ask("learn question 2", "L-B", SQL_A);
  const fYes = await recordFeedback(db, { userKey: "L-B", query: "learn question 2", source: "nl2sql", verdict: "yes", nl2sqlLogId: a2.nl2sql.logId, attempt: 1 });
  const rowYes = (await pg.query(`SELECT verdict, reject_reason FROM public.nl2sql_log WHERE id = $1`, [a2.nl2sql.logId])).rows[0];
  check("a Yes sets the verdict to confirm and carries no reason", fYes.verdictRecorded && rowYes.verdict === "confirm" && rowYes.reject_reason === null);

  const fOther = await recordFeedback(db, { userKey: "L-X", query: "learn question", source: "nl2sql", verdict: "yes", nl2sqlLogId: a1.nl2sql.logId, attempt: 1 });
  check("someone else cannot change another person's verdict (but the click is still stored)", !fOther.verdictRecorded && fOther.id !== null && (await pg.query(`SELECT verdict FROM public.nl2sql_log WHERE id = $1`, [a1.nl2sql.logId])).rows[0].verdict === "reject");

  const fCirc = await recordFeedback(db, { userKey: "L-A", query: "leave rules", source: "circular", verdict: "no", reasonCode: "wanted_employees", attempt: 1 });
  check("a No on circular results (no log row) is stored", fCirc.id !== null && !fCirc.verdictRecorded && (await pg.query(`SELECT reason_code FROM public.omnibar_feedback WHERE id = $1`, [fCirc.id])).rows[0].reason_code === "wanted_employees");
  const fHol = await recordFeedback(db, { userKey: "L-A", query: "holidays 2026", source: "holiday", verdict: "yes", attempt: 1 });
  check("a Yes on a holiday answer is stored", fHol.id !== null);

  // -- No teaches: one No is final, the SQL is blocked for everyone
  const GQ = "global reject question";
  for (const u of ["G-1"]) {
    const g = await ask(GQ, u, SQL_A);
    await recordFeedback(db, { userKey: u, query: GQ, source: "nl2sql", verdict: "no", reasonCode: "wrong_result", note: "too few", nl2sqlLogId: g.nl2sql.logId, attempt: 1 });
  }
  check("an SQL rejected by one person is blocked for everyone else", (await loadRejectedSql(db, "G-3", GQ)).some((x) => x.includes("LIMIT 4")));
  check("it is not blocked for a different question", !(await loadRejectedSql(db, "G-3", "something else entirely")).some((x) => x.includes("LIMIT 4")));
  const g3 = await runOmnibar(GQ, "G-3", mkDeps(script([json({ sql: SQL_A, understood_as: "again", confidence: "high" }), json({ sql: SQL_B, understood_as: "different", confidence: "high" })])));
  check("the model's attempt to repeat that SQL is turned down and a different one is used", !!g3 && (g3 as any).nl2sql.sql.includes("LIMIT 3") && (g3 as any).nl2sql.attempts === 2, JSON.stringify((g3 as any)?.nl2sql?.attempts));
  const CQ = "split opinion question";
  for (const [u, v] of [["C-3", "yes"], ["C-1", "no"], ["C-2", "no"]] as const) { // the confirmation comes first, so the SQL is never blocked
    const g = await ask(CQ, u, SQL_A);
    await recordFeedback(db, { userKey: u, query: CQ, source: "nl2sql", verdict: v, reasonCode: v === "no" ? "wrong_result" : null, nl2sqlLogId: g.nl2sql.logId, attempt: 1 });
  }
  check("an SQL that someone confirmed is NOT blocked globally", !(await loadRejectedSql(db, "C-4", CQ)).some((x) => x.includes("LIMIT 4")));

  // -- No teaches: rejected readings of SIMILAR questions are shown to the model
  const negs = await loadNegativeExamples(db);
  check("rejected pairs are loaded with their reasons", negs.some((n) => n.question === GQ && n.reason && /wrong result/.test(n.reason)));
  check("the most similar rejected readings are picked, unrelated ones are not", pickNegatives("global reject question variant", negs).some((n) => n.question === GQ) && pickNegatives("zzz totally unrelated words", negs).length === 0);
  const prompts: string[] = [];
  const capture = (inner: LlmFn): LlmFn => async (p) => { prompts.push(p); return inner(p); };
  await runOmnibar("global reject question variant", "N-1", mkDeps(capture(model(SQL_B))));
  check("the prompt shows the model readings people marked wrong for a similar question", /READINGS PEOPLE MARKED WRONG/.test(prompts[0]) && prompts[0].includes("LIMIT 4") && /too few/.test(prompts[0]));
  const longHint = retryHint("wrong_name", "n".repeat(900));
  const bigNeg = pickNegatives("global reject question", negs, 2).map((n) => ({ ...n, sql: n.sql + " ".repeat(10) + "x".repeat(900) }));
  const ppBig = buildPrompt({ question: "global reject question", context: { ...ctx, departments: padded }, examples: pickExamples("global reject question", []), negatives: bigNeg, hint: longHint, rejectedSql: [SQL_A] });
  console.log(`  worst-case prompt: ${ppBig.length} of 19600 characters`);
  check("with lessons and a correction the prompt still fits the budget (300 departments)", ppBig.length < 19600, `${ppBig.length} chars`);

  // -- Yes teaches: the verified answer lifecycle
  const VQ = "verified question";
  const v1 = await ask(VQ, "V-1", SQL_A);
  await recordFeedback(db, { userKey: "V-1", query: VQ, source: "nl2sql", verdict: "yes", nl2sqlLogId: v1.nl2sql.logId, attempt: 1 });
  const ver1 = await findVerifiedSql(db, VQ, 1);
  check("one confirmation is enough to verify an answer", !!ver1 && ver1.confirms === 1 && ver1.sql.includes("LIMIT 4"));
  const v2 = await ask(VQ, "V-2", SQL_A);
  await recordFeedback(db, { userKey: "V-2", query: VQ, source: "nl2sql", verdict: "yes", nl2sqlLogId: v2.nl2sql.logId, attempt: 1 });
  const ver = await findVerifiedSql(db, VQ, 2);
  check("a second confirmation of the same SQL is counted", !!ver && ver.confirms === 2 && ver.sql.includes("LIMIT 4"));
  const anonQ = "anonymous question";
  for (let i = 0; i < 2; i++) {
    const g = await ask(anonQ, null, SQL_A);
    await recordFeedback(db, { userKey: null, query: anonQ, source: "nl2sql", verdict: "yes", nl2sqlLogId: g.nl2sql.logId, attempt: 1 });
  }
  check("a confirmation without a user key still counts (feedback does not depend on who clicked)", !!(await findVerifiedSql(db, anonQ, 1)));

  let modelCalls = 0;
  const callCounter = (inner: LlmFn): LlmFn => async (p) => { modelCalls++; return inner(p); };
  modelCalls = 0;
  const vAns: any = await runOmnibar(VQ, "V-3", mkDeps(callCounter(model(SQL_B))));
  check("a verified answer is served WITHOUT calling the model", modelCalls === 0 && vAns.source === "cache" && vAns.nl2sql.verifiedBy === 2 && vAns.people.length === 4, JSON.stringify({ modelCalls, src: vAns?.source }));
  check("it is logged as a cache answer so it can be rated", (await pg.query(`SELECT source FROM public.nl2sql_log WHERE id = $1`, [vAns.nl2sql.logId])).rows[0].source === "cache");
  check("answerFromVerified returns nothing for an unverified question", (await answerFromVerified("never asked before", "V-3", { llm: model(SQL_A), withClient }, 2)) === null);
  await recordFeedback(db, { userKey: "V-3", query: VQ, source: "cache", verdict: "no", reasonCode: "wrong_result", nl2sqlLogId: vAns.nl2sql.logId, attempt: 1 });
  check("a single No revokes a verified answer", (await findVerifiedSql(db, VQ, 2)) === null);
  modelCalls = 0;
  const after: any = await runOmnibar(VQ, "V-4", mkDeps(callCounter(model(SQL_B))));
  check("after the revocation the model is asked again", modelCalls === 1 && after.source === "nl2sql");

  // -- ROBUST VOTING: one voice per person, the latest vote wins, Undo, dispute, vote limit, late sign-in
  const RV = "robust voting question";
  const yesFor = async (q: string, u: string | null) => { const g = await ask(q, u, SQL_A); const f = await recordFeedback(db, { userKey: u, query: q, source: "nl2sql", verdict: "yes", nl2sqlLogId: g.nl2sql.logId, attempt: 1 }); return { g, f }; };
  const noFor = async (q: string, u: string | null) => { const g = await ask(q, u, SQL_A); const f = await recordFeedback(db, { userKey: u, query: q, source: "nl2sql", verdict: "no", reasonCode: "wrong_result", nl2sqlLogId: g.nl2sql.logId, attempt: 1 }); return { g, f }; };
  await yesFor(RV, "RV-1"); await yesFor(RV, "RV-1"); await yesFor(RV, "RV-1");
  const oneVoice = await findVerifiedSql(db, RV, 1);
  check("one person confirming three times counts as ONE voice", !!oneVoice && oneVoice.confirms === 1);
  check("...so it is NOT verified when two different people are required", (await findVerifiedSql(db, RV, 2)) === null);
  const rv2 = await yesFor(RV, "RV-2");
  check("a second different person makes it two voices", (await findVerifiedSql(db, RV, 2))?.confirms === 2);
  const rv3 = await noFor(RV, "RV-3");
  check("Yes from some and a No from another person = DISPUTED: no longer verified", (await findVerifiedSql(db, RV, 1)) === null);
  check("...and a disputed reading is NOT blocked either", !(await loadRejectedSql(db, "RV-9", RV)).some((x) => x.includes("LIMIT 4")));
  const un = await undoFeedback(db, "RV-3", rv3.f.id, rv3.g.nl2sql.logId);
  check("the voter can UNDO their No", un.undone === true);
  check("after the Undo the dispute is gone: verified again by 2 people", (await findVerifiedSql(db, RV, 2))?.confirms === 2);
  check("the undone vote row is gone from the feedback table", (await pg.query(`SELECT count(*)::int n FROM public.omnibar_feedback WHERE id = $1`, [rv3.f.id])).rows[0].n === 0);
  check("another person CANNOT undo someone else's vote", (await undoFeedback(db, "RV-9", rv2.f.id, rv2.g.nl2sql.logId)).undone === false && (await findVerifiedSql(db, RV, 2))?.confirms === 2);
  const rv2r = await noFor(RV, "RV-2"); // RV-2 is served the verified answer and reports it wrong ("Report wrong")
  check("a person's LATEST vote wins: RV-2 said Yes, later No -> counted as a No (disputed)", (await findVerifiedSql(db, RV, 1)) === null);
  check("a person who marked a reading wrong is not offered that reading again by the model", (await loadRejectedSql(db, "RV-2", RV)).some((x) => x.includes("LIMIT 4")));
  await recordVerdict(db, rv2r.g.nl2sql.logId, "confirm", "RV-2"); // RV-2 changes their mind on the same answer
  check("...changing their mind to Yes replaces the No: verified again with 2 voices", (await findVerifiedSql(db, RV, 2))?.confirms === 2);
  check("...and that reading is no longer held against RV-2", !(await loadRejectedSql(db, "RV-2", RV)).some((x) => x.includes("LIMIT 4")));
  const BQ = "blocked by one voice question";
  const bq = await noFor(BQ, "B-1");
  check("a lone No (nobody confirmed) blocks that reading for others", (await loadRejectedSql(db, "B-2", BQ)).some((x) => x.includes("LIMIT 4")));
  await undoFeedback(db, "B-1", bq.f.id, bq.g.nl2sql.logId);
  check("...and the block disappears when that person takes the No back", !(await loadRejectedSql(db, "B-2", BQ)).some((x) => x.includes("LIMIT 4")));
  const LQ = "late sign in question";
  const lq = await ask(LQ, null, SQL_A);
  check("someone who signed in AFTER asking can rate an answer logged while signed out", await recordVerdict(db, lq.nl2sql.logId, "confirm", "LS-1"));
  check("...and the answer then belongs to them: a different person cannot rate it", !(await recordVerdict(db, lq.nl2sql.logId, "reject", "LS-2")));
  check("an answer logged for a person is still closed to a signed-out rater", !(await recordVerdict(db, rv2.g.nl2sql.logId, "reject", null)));
  await yesFor("vote limit question", "LIM-1"); await yesFor("vote limit question two", "LIM-1"); await yesFor("vote limit question three", "LIM-1");
  check("the hourly vote counter counts a person's votes", (await countRecentVotes(db, "LIM-1")) === 3 && (await countRecentVotes(db, "LIM-NONE")) === 0);
  check("the limit is 30 votes per person per hour", VOTES_PER_HOUR === 30);

  // -- columns the person asked for: codes go on the person's card, other extra columns get a table (never silently dropped)
  const STD = `ticket_no, name, designation, department_code, department`;
  const TAIL = `FROM nlq.employees WHERE cohort = 'executive' ORDER BY global_seniority_rank LIMIT 3`;
  const plainList: any = await ask("list executives plain columns test", "COL-1", `SELECT ${STD} ${TAIL}`);
  check("a plain list now carries each person's department code AND name on the card (designation code still not shown), shown as cards, the five selected columns plus Cohort", plainList.people.length === 3 && plainList.people.every((p: any) => /^\d+$/.test(String(p.departmentCode ?? "")) && p.designationCode === undefined) && plainList.nl2sql.display?.view === "cards" && plainList.nl2sql.display.columns.length === 6 && plainList.nl2sql.display.columns.some((c: any) => c.key === "cohort"));
  const codeList: any = await ask("list executives with department codes test", "COL-1", `SELECT ticket_no, name, designation, department, department_code ${TAIL}`);
  check("'with department codes': each person's card carries the department code", codeList.people.length === 3 && codeList.people.every((p: any) => /^\d+$/.test(String(p.departmentCode ?? ""))), JSON.stringify(codeList.people.map((p: any) => p.departmentCode)));
  check("...and the code matches the database (the same person's real department code)", (await pg.query(`SELECT count(*)::int n FROM nlq.employees WHERE ticket_no = ANY($1::text[]) AND department_code::text = ANY($2::text[])`, [codeList.people.map((p: any) => p.ticketNo), codeList.people.map((p: any) => p.departmentCode)])).rows[0].n >= 3);
  check("...the department-code column is among the displayed columns with a readable title, and the table is there for the Cards/Table switch", codeList.nl2sql.display?.view === "cards" && codeList.nl2sql.display.columns.some((c: any) => c.key === "department_code" && c.label === "Dept code") && !!codeList.nl2sql.table);
  check("designations of the SAME people are untouched by the code", codeList.people.every((p: any) => p.designationCode === undefined && !!p.designation));
  const desigCodeList: any = await ask("list executives with designation codes test", "COL-1", `SELECT ${STD}, designation_code, department_code ${TAIL}`);
  check("designation code and department code can both be shown", desigCodeList.people.every((p: any) => /^\d+$/.test(String(p.designationCode ?? "")) && /^\d+$/.test(String(p.departmentCode ?? ""))));
  const rankList: any = await ask("list executives with rank order test", "COL-1", `SELECT ${STD}, rank_order ${TAIL}`);
  check("a column the card cannot show (rank_order) is shown in a table, not dropped", !!rankList.nl2sql.table && rankList.nl2sql.table.columns.includes("rank_order") && rankList.nl2sql.table.rows.length === 3);
  const chipSql = `SELECT ${STD}, rank_order, has_email ${TAIL}`;
  const chipList: any = await ask("list executives with rank and email flag test", "COL-1", chipSql);
  check("every column the cards do not show becomes a labelled chip on each person's card (Rank, Has email)", chipList.people.length === 3 && chipList.people.every((p: any) => Array.isArray(p.extraFields) && p.extraFields.map((f: any) => f.label).join() === "Rank,Has email"), JSON.stringify(chipList.people[0].extraFields));
  check("...the chip values are the real values, formatted (Rank is a number; Has email is Yes or No)", chipList.people.every((p: any, i: number) => p.extraFields[0].value === String(chipList.nl2sql.table.rows.find((r: any) => String(r.ticket_no) === p.ticketNo).rank_order) && /^(Yes|No)$/.test(p.extraFields[1].value)));
  check("a plain list has no chips, and the codes are NOT repeated as chips", plainList.people.every((p: any) => p.extraFields === undefined) && codeList.people.every((p: any) => p.extraFields === undefined));
  // -- "Show more": stable order, consistent pages, nothing repeated, nothing skipped
  const so = (q: string) => stableOrderSql(q);
  check("stableOrderSql: with an ORDER BY the tie-breaker is APPENDED to it and the model's SQL is kept verbatim", so("SELECT ticket_no, name FROM nlq.employees ORDER BY designation DESC") === "SELECT ticket_no, name FROM nlq.employees ORDER BY designation DESC, 1, 2");
  check("...without an ORDER BY one is added", so("SELECT ticket_no, name, designation FROM nlq.employees") === "SELECT ticket_no, name, designation FROM nlq.employees ORDER BY 1, 2, 3");
  check("...it goes BEFORE a LIMIT / OFFSET, never after", so("SELECT ticket_no, name FROM nlq.employees ORDER BY name LIMIT 500 OFFSET 20") === "SELECT ticket_no, name FROM nlq.employees ORDER BY name, 1, 2 LIMIT 500 OFFSET 20" && so("SELECT ticket_no, name FROM nlq.employees LIMIT 5") === "SELECT ticket_no, name FROM nlq.employees ORDER BY 1, 2 LIMIT 5");
  check("...an ORDER BY / LIMIT inside a sub-query or a window function is not mistaken for the outer one", so("SELECT ticket_no, name FROM nlq.employees WHERE department_id IN (SELECT id FROM nlq.departments ORDER BY id LIMIT 3)") === "SELECT ticket_no, name FROM nlq.employees WHERE department_id IN (SELECT id FROM nlq.departments ORDER BY id LIMIT 3) ORDER BY 1, 2" && so("SELECT ticket_no, rank() OVER (ORDER BY rank_order) AS r FROM nlq.employees") === "SELECT ticket_no, rank() OVER (ORDER BY rank_order) AS r FROM nlq.employees ORDER BY 1, 2");
  check("...the word LIMIT inside a quoted string is not a LIMIT", so("SELECT ticket_no, name FROM nlq.employees WHERE name = 'X LIMIT 5'") === "SELECT ticket_no, name FROM nlq.employees WHERE name = 'X LIMIT 5' ORDER BY 1, 2");
  check("...text such as = ANY(name_words) is untouched (the SQL is never rebuilt from its parse)", so("SELECT ticket_no FROM nlq.employees WHERE 'KUMAR' = ANY(name_words)") === "SELECT ticket_no FROM nlq.employees WHERE 'KUMAR' = ANY(name_words) ORDER BY 1");
  check("...a trailing semicolon is dropped; a GROUP BY query gets the tie-breaker too", so("SELECT designation, count(*) AS n FROM nlq.employees GROUP BY designation;") === "SELECT designation, count(*) AS n FROM nlq.employees GROUP BY designation ORDER BY 1, 2");
  check("...null for a CTE, a UNION, SELECT * and unparsable text (those run as written, with no Show more)", so("WITH a AS (SELECT 1) SELECT * FROM a") === null && so("SELECT ticket_no FROM nlq.employees UNION SELECT ticket_no FROM nlq.employees") === null && so("SELECT * FROM nlq.employees") === null && so("this is not sql") === null);
  const ALLQ = `SELECT ticket_no, name, designation FROM nlq.employees ORDER BY designation`; // heavy ties on purpose
  const fullSet = (await pg.query(`SELECT ticket_no FROM nlq.employees`)).rows.map((r: any) => String(r.ticket_no)).sort();
  const seenT: string[] = []; let off = 0; let pagesN = 0; const allTotals = new Set<number>(); let lastTrunc = true;
  while (lastTrunc && pagesN < 80) {
    const pg1 = await withClient((c) => runReadOnly(c, ALLQ, { rowLimit: 37, offset: off }));
    seenT.push(...pg1.rows.map((r: any) => String(r.ticket_no))); allTotals.add(pg1.total); lastTrunc = pg1.truncated; off += pg1.rows.length; pagesN++;
    if (pagesN === 1) check("the first page reports the true total and says it can be paged", pg1.total === fullSet.length && pg1.truncated === true && pg1.pageable === true && pg1.rows.length === 37);
  }
  check("PAGING a list with heavy ties (ORDER BY designation) in pages of 37: every person exactly once, nobody repeated, nobody skipped", seenT.length === fullSet.length && new Set(seenT).size === fullSet.length && JSON.stringify([...seenT].sort()) === JSON.stringify(fullSet), `${seenT.length} of ${fullSet.length} in ${pagesN} pages`);
  check("...the total is the same on every page, and the last page says there is no more", allTotals.size === 1 && lastTrunc === false);
  const beyond = await withClient((c) => runReadOnly(c, ALLQ, { rowLimit: 37, offset: fullSet.length + 500 }));
  check("an offset beyond the end gives no rows and no 'more'", beyond.rows.length === 0 && beyond.truncated === false && beyond.total === fullSet.length + 500);
  const orderedA = await withClient((c) => runReadOnly(c, `SELECT ticket_no FROM nlq.employees ORDER BY global_seniority_rank`, { rowLimit: 20 }));
  const orderedB = (await pg.query(`SELECT ticket_no FROM nlq.employees ORDER BY global_seniority_rank LIMIT 20`)).rows;
  check("a query already ordered by a unique key keeps exactly the model's order on page one", JSON.stringify(orderedA.rows.map((r: any) => String(r.ticket_no))) === JSON.stringify(orderedB.map((r: any) => String(r.ticket_no))));
  const cteRes = await withClient((c) => runReadOnly(c, `WITH d AS (SELECT ticket_no FROM nlq.employees) SELECT ticket_no FROM d ORDER BY ticket_no`, { rowLimit: 5 }));
  check("a CTE answer still runs, but is not pageable", cteRes.rows.length === 5 && cteRes.pageable === false);
  let refused = ""; try { await withClient((c) => runReadOnly(c, `SELECT 1; SELECT 2`, { rowLimit: 5, offset: 0 })); } catch (e: any) { refused = String(e.message); }
  check("the single-statement protection still applies with paging", /single statement/i.test(refused));
  const bigAsk: any = await ask("list every employee in seniority order for paging test", "PG-1", `SELECT ticket_no, name, designation, department_code, department FROM nlq.employees ORDER BY global_seniority_rank`);
  check("a list longer than one page: the answer says 'Show more' is possible, 100 cards come first, and the true total is known", bigAsk.nl2sql.canPage === true && bigAsk.people.length === PAGE_SIZE && bigAsk.nl2sql.table.rows.length === PAGE_SIZE && bigAsk.nl2sql.table.total === fullSet.length && bigAsk.nl2sql.logId != null);
  const smallAsk: any = await ask("list three executives for paging test", "PG-1", `SELECT ticket_no, name FROM nlq.employees WHERE cohort = 'executive' ORDER BY global_seniority_rank LIMIT 3`);
  check("a short list never offers 'Show more'", smallAsk.nl2sql.canPage === undefined);
  const page2 = await withClient((c) => runReadOnly(c, `SELECT ticket_no, name, designation, department, rank_order FROM nlq.employees ORDER BY global_seniority_rank`, { rowLimit: PAGE_SIZE, offset: PAGE_SIZE }));
  const cards2 = await withClient((c) => peoplePage(c, page2, [{ key: "rank_order", label: "Seniority grade" }, { key: "name", label: "x".repeat(300) }]));
  check("peoplePage builds the SAME kind of cards for a later page: right people, in order, chips with the page-one titles", cards2.length === page2.rows.length && cards2.every((p, i) => p.ticketNo === String(page2.rows[i].ticket_no)) && cards2.every((p: any) => p.extraFields?.[0]?.label === "Seniority grade"));
  const pp1 = pageProgress(100, 1133); const pp2 = pageProgress(1100, 1133); const pp3 = pageProgress(200, 250);
  check("pageProgress: 'Show 100 more' while more than a page remains, 'Show the last N' at the end, with a running count", pp1.label === "Show 100 more" && pp1.progress === "100 of 1,133 shown" && pp2.label === "Show the last 33" && pp3.label === "Show the last 50" && pp1.remaining === 1033);
  const mp = mergePage({ columns: ["a"], rows: [{ a: 1 }], total: 5, truncated: true as boolean }, { rows: [{ a: 2 }, { a: 3 }], total: 5, hasMore: false });
  check("mergePage appends the page, updates 'more', and leaves the original untouched", mp.rows.length === 3 && mp.truncated === false && mp.total === 5);
  const idList: any = await ask("list executives with seniority position test", "COL-1", `SELECT ${STD}, global_seniority_rank ${TAIL}`);
  check("a requested seniority position is still shown -- as 'Position in grade' (a readable number), never as the internal rank", !!idList.nl2sql.table && idList.nl2sql.table.columns.includes("position_in_grade") && !idList.nl2sql.table.columns.includes("global_seniority_rank") && idList.nl2sql.table.rows.every((rr: any) => rr.position_in_grade === null || Number(rr.position_in_grade) < 10000));
  const ppl = [{ ticketNo: "1", name: "A" }, { ticketNo: "2", name: "B" }] as any[];
  const same = withDisplayCodes(ppl, ["ticket_no", "name"], [{ ticket_no: "1" }, { ticket_no: "2" }]);
  check("withDisplayCodes returns the people untouched when no code column was selected", same === ppl);
  const coded = withDisplayCodes(ppl, ["ticket_no", "department_code"], [{ ticket_no: "1", department_code: 98500 }, { ticket_no: "9", department_code: 1 }]);
  check("withDisplayCodes matches by ticket, leaves unmatched people alone, and does not mutate the input", coded[0].departmentCode === "98500" && coded[1].departmentCode === undefined && (ppl[0] as any).departmentCode === undefined);

  // -- the model's presentation hint: it PROPOSES, display.ts VERIFIES against the real result; nothing can break or hide an answer
  const withPlan = async (q: string, plan: object) => (await runOmnibar(q, "DSP-1", mkDeps(script([json(plan)])))) as any;
  const LIST5 = `SELECT ticket_no, name, designation, department, department_code ${TAIL}`;
  const hinted = await withPlan("list executives hinted view test", { sql: LIST5, understood_as: "Three senior executives.", confidence: "high", display: { view: "table", title: "Senior executives, with codes", columns: [{ key: "department_code", label: "Code" }, { key: "name", label: "Officer" }] } });
  check("a valid hint is followed: title and the column titles/order (a LIST OF PEOPLE still opens on the cards)", hinted.nl2sql.display.view === "cards" && hinted.nl2sql.display.title === "Senior executives, with codes" && hinted.nl2sql.display.columns[0].key === "department_code" && hinted.nl2sql.display.columns[0].label === "Code" && hinted.nl2sql.display.columns[1].label === "Officer");
  check("...and still every selected column is shown, once (plus the Cohort column)", hinted.nl2sql.display.columns.length === 6 && new Set(hinted.nl2sql.display.columns.map((c: any) => c.key)).size === 6 && hinted.nl2sql.display.columns.some((c: any) => c.key === "cohort") && !!hinted.nl2sql.table);
  const hintedOrder = await withPlan("list executives hinted order test", { sql: `SELECT ${STD} ${TAIL}`, understood_as: "Three senior executives.", confidence: "high", display: { columns: [{ key: "ticket_no" }, { key: "name" }, { key: "designation" }, { key: "department_code" }, { key: "department" }] } });
  check("end to end: with a model column hint, the Cohort column still sits right after Designation (not last)", hintedOrder.nl2sql.display.columns.map((c: any) => c.key).join(",") === "ticket_no,name,designation,cohort,department_code,department", hintedOrder.nl2sql.display.columns.map((c: any) => c.key).join(","));
  const asTable = await withPlan("list executives as a table hinted test", { sql: LIST5, understood_as: "Three senior executives.", confidence: "high", display: { view: "table" } });
  check("a person who literally asks for a table gets the table first", asTable.nl2sql.display.view === "table" && !!asTable.nl2sql.table && asTable.people.length === 3);
  check("a column the model titled in its hint uses that title on the chip", ((await withPlan("list executives titled chip test", { sql: `SELECT ${STD}, rank_order, has_email ${TAIL}`, understood_as: "x", confidence: "high", display: { columns: [{ key: "rank_order", label: "Seniority grade" }] } })) as any).people[0].extraFields[0].label === "Seniority grade");
  const junkHint = await withPlan("list executives junk hint test", { sql: LIST5, understood_as: "Three senior executives.", confidence: "high", display: { view: "hologram", title: 42, columns: [{ key: "nope" }, 7, null], bar: "x" } });
  check("a garbage hint never breaks the answer: same people, a layout chosen from the data (cards)", junkHint.kind === "count" && junkHint.people.length === 3 && junkHint.nl2sql.display.view === "cards" && junkHint.nl2sql.display.columns.length === 6);
  const BYDES = `SELECT designation, count(*) AS n FROM nlq.employees WHERE cohort = 'executive' GROUP BY designation ORDER BY n DESC`;
  const barHint = await withPlan("executives by designation bar test", { sql: BYDES, understood_as: "Executives per designation.", confidence: "high", display: { view: "bar", title: "Executives by designation", bar: { label: "designation", value: "n" } } });
  check("a bar-chart hint on 'designation + count' is accepted, and the table travels with it", barHint.nl2sql.display.view === "bar" && barHint.nl2sql.display.bar.label === "designation" && barHint.nl2sql.display.bar.value === "n" && barHint.nl2sql.table.rows.length >= 2);
  const autoBar = await withPlan("executives by designation auto test", { sql: BYDES, understood_as: "Executives per designation.", confidence: "high" });
  check("with NO hint the same answer is still shown as a bar chart (chosen from the shape of the data)", autoBar.nl2sql.display.view === "bar" && autoBar.nl2sql.display.title === null);
  const BYDES3 = `SELECT designation, count(*) AS n, min(rank_order) AS best_rank FROM nlq.employees WHERE cohort = 'executive' GROUP BY designation ORDER BY n DESC`;
  const badBar = await withPlan("executives by designation bad bar test", { sql: BYDES3, understood_as: "Executives per designation with best rank.", confidence: "high", display: { view: "bar", bar: { label: "designation", value: "designation" } } });
  check("a bar hint over a text column is refused: a table with all three columns", badBar.nl2sql.display.view === "table" && badBar.nl2sql.display.columns.length === 3 && badBar.nl2sql.display.bar === null);
  const oneNum = await withPlan("how many executives hint test", { sql: `SELECT count(*) FROM nlq.employees WHERE cohort = 'executive'`, understood_as: "Number of executives.", confidence: "high", display: { view: "table" } });
  check("a single number stays a single number: no table, no display, whatever the hint says", oneNum.nl2sql.display === null && !oneNum.nl2sql.table && typeof oneNum.count === "number");
  check("a verified answer (no hint is stored) is still presented well, chosen from its shape", vAns.nl2sql.display?.view === "cards" && vAns.nl2sql.display.columns.length >= 4);
  const pp = (d: unknown) => parsePlan(JSON.stringify({ sql: "SELECT 1", understood_as: "x", confidence: "high", display: d }));
  check("parsePlan: a hint of the wrong type (number, string, array) is dropped and the plan stays valid", [5, "x", [1, 2]].every((d) => { const r = pp(d); return !!r && r.display === undefined && r.sql === "SELECT 1"; }));
  check("parsePlan: an oversized hint is dropped, a normal one is kept", pp({ title: "t".repeat(5000) })?.display === undefined && (pp({ view: "table" })?.display as any)?.view === "table");
  check("the model's instructions describe the optional display hint, and still fit the budget", buildPrompt({ question: "list executives", context: ctx, examples: [] }).includes("display (optional") && buildPrompt({ question: "list executives", context: { ...ctx, departments: padded }, examples: [] }).length < 19600);

  // -- a No chooses a DIFFERENT way to answer
  const RQ = "retry question";
  const r1 = await ask(RQ, "R-1", SQL_A);
  await recordFeedback(db, { userKey: "R-1", query: RQ, source: "nl2sql", verdict: "no", reasonCode: "wrong_name", note: "I meant exact", nl2sqlLogId: r1.nl2sql.logId, attempt: 1 });
  prompts.length = 0;
  const r2: any = await runOmnibar(RQ, "R-1", mkDeps(capture(script([json({ sql: SQL_A, understood_as: "same again", confidence: "high" }), json({ sql: SQL_B, understood_as: "different", confidence: "high" })]))), { logId: r1.nl2sql.logId, reason: "wrong_name", note: "I meant exact", attempt: 1 });
  check("a second attempt is a new answer marked as attempt 2", r2.attempt === 2 && r2.nl2sql.retryAttempt === 2 && r2.nl2sql.sql.includes("LIMIT 3"));
  check("the model was told what was rejected and why", /name matching was wrong/i.test(prompts[0]) && prompts[0].includes("I meant exact") && prompts[0].includes("LIMIT 4"));
  check("repeating the rejected SQL was turned down (answer came on the 2nd model try)", r2.nl2sql.attempts === 2);
  check("the new answer is linked to the one it replaced", (await pg.query(`SELECT retry_of FROM public.nl2sql_log WHERE id = $1`, [r2.nl2sql.logId])).rows[0].retry_of === String(r1.nl2sql.logId) || Number((await pg.query(`SELECT retry_of FROM public.nl2sql_log WHERE id = $1`, [r2.nl2sql.logId])).rows[0].retry_of) === r1.nl2sql.logId);

  modelCalls = 0;
  const dv: any = await runOmnibar(RQ, "R-1", mkDeps(callCounter(model(SQL_B)), { holiday: async () => ({ kind: "count", answer: "holiday" }) as any }), { logId: null, reason: "wrong_result", note: null, attempt: 1 });
  check("a second attempt skips the holiday shortcut and the verified shortcut", modelCalls === 1 && dv.source === "nl2sql");
  modelCalls = 0;
  const docs = await runOmnibar(RQ, "R-1", mkDeps(callCounter(model(SQL_B))), { logId: r1.nl2sql.logId, reason: "wanted_documents", note: null, attempt: 1 });
  check("'I wanted documents' switches route to circular search without calling the model", docs === null && modelCalls === 0);
  prompts.length = 0;
  await runOmnibar("leave rules for staff", "R-2", mkDeps(capture(model(SQL_B))), { logId: null, reason: "wanted_employees", note: null, attempt: 1 });
  check("'I wanted employee data' (after circular results) makes the model read it as an employee question", /expected an answer from the employee directory/.test(prompts[0]));
  modelCalls = 0;
  const gaveUp: any = await runOmnibar(RQ, "R-1", mkDeps(callCounter(model(SQL_B))), { logId: r2.nl2sql.logId, reason: "wrong_result", note: null, attempt: MAX_ATTEMPTS });
  check("after the maximum number of attempts it stops, explains, and does not call the model", modelCalls === 0 && gaveUp.kind === "clarify" && /saved for the team/.test(gaveUp.answer));

  // -- the URL contract
  const sp = (q: string) => new URLSearchParams(q);
  const pr = parseRetry(sp("ra=2&rr=wrong_name&rl=17&rn=%20hello%20"));
  check("parseRetry reads the retry request", !!pr && pr.attempt === 2 && pr.reason === "wrong_name" && pr.logId === 17 && pr.note === "hello");
  check("no ra means no retry", parseRetry(sp("rr=wrong_name&rl=17")) === null);
  check("an out-of-range attempt is ignored", parseRetry(sp("ra=0")) === null && parseRetry(sp("ra=10")) === null && parseRetry(sp("ra=abc")) === null);
  check("an unknown reason is dropped but the retry still happens", parseRetry(sp("ra=1&rr=bogus"))?.reason === null);
  check("a long note is capped", (parseRetry(sp("ra=1&rn=" + "x".repeat(800)))?.note || "").length === 300);

  // -- the review report
  await recordFeedback(db, { userKey: "R-1", query: RQ, source: "nl2sql", verdict: "yes", nl2sqlLogId: r2.nl2sql.logId, attempt: 2 });
  const report = await buildReport(db, 30, 2);
  check("the report shows Yes / No by route", /Yes \/ No by route/.test(report) && /\| nl2sql \|/.test(report));
  check("the report lists the reasons people gave", /wrong_name/.test(report) && /wanted_employees/.test(report));
  check("the report lists the most rejected questions with their SQL", report.includes(GQ) && /LIMIT 4/.test(report));
  check("the report turns a fixed No into a regression case (rejected -> accepted)", /Fixed by a second attempt/.test(report) && report.includes(RQ) && /Rejected:/.test(report) && /Accepted:/.test(report));
  check("the report lists verified answers (after revocation the revoked one is gone)", /Verified answers/.test(report) && !report.includes(`- ${VQ} —`));

  // ==========================================================================
  section("J. Scale: about 6,500 employees -- the phonetic query must stay fast and correct");
  await pg.query(`INSERT INTO public.employee_roster (ticket_no, sail_pno, name, designation_grade_id, sail_department_id, cohort, within_grade_position, global_seniority_rank, user_id)
                  SELECT r.ticket_no || '-' || g, r.sail_pno, r.name, r.designation_grade_id, r.sail_department_id, r.cohort, r.within_grade_position, r.global_seniority_rank, NULL
                  FROM public.employee_roster r CROSS JOIN generate_series(1, 6) g`);
  const total = (await pg.query(`SELECT count(*)::int n FROM public.employee_roster`)).rows[0].n;
  const stored = (await pg.query(`SELECT nlq.refresh_name_codes() AS n`)).rows[0].n;
  check(`refresh stores codes for every employee (${total})`, Number(stored) === total, `${stored} vs ${total}`);
  const fastSql = `SELECT ticket_no, name FROM nlq.employees
     WHERE nlq.word_like(name_words, name_codes, 'kumar') AND NOT nlq.first_word_like(name_words, name_codes, 'kumar') AND NOT nlq.last_word_like(name_words, name_codes, 'kumar')`;
  const t0 = Date.now();
  const fast = await runReadOnly(db, fastSql, { rowLimit: 100, timeoutMs: 5000 });
  const ms = Date.now() - t0;
  check(`similar-spelling query over ${total} employees is fast (< 1000 ms; before the fix it was several seconds)`, ms < 1000, `${ms} ms`);
  console.log(`  phonetic query over ${total} employees: ${ms} ms`);
  const liveCount = (await pg.query(`SELECT count(*)::int n FROM (SELECT regexp_split_to_array(upper(btrim(name)), '\\s+') AS w, public.name_phonetic_codes(name) AS c FROM public.employee_roster) l
     WHERE nlq.word_like(w, c, 'kumar') AND NOT nlq.first_word_like(w, c, 'kumar') AND NOT nlq.last_word_like(w, c, 'kumar')`)).rows[0].n;
  check("fast view returns exactly the same rows as computing the codes live", fast.total === liveCount, `${fast.total} vs ${liveCount}`);
  await pg.query(`UPDATE public.employee_roster SET name = 'ZZ RENAMED MAZUMDAR' WHERE id = (SELECT min(id) FROM public.employee_roster)`);
  const healed = await runReadOnly(db, `SELECT ticket_no FROM nlq.employees WHERE name = 'ZZ RENAMED MAZUMDAR' AND nlq.last_word_like(name_words, name_codes, 'majumdar')`);
  check("a renamed employee is matched correctly with NO refresh (stored codes never go stale)", healed.total === 1);


  // ==========================================================================
  section("N. The health check-up schedule: the date comes from the circular, the person from HR");
  await pg.query(`INSERT INTO public.circulars (id, headline, "serialNumber", "publishedAt") VALUES (901, 'HEALTH CHECK UP SCHEDULE JAN 2025', 3, '2024-12-28 10:00'), (902, 'HEALTH CHECK UP SCHEDULE DEC 2024', 9, '2024-11-27 10:00')`);
  const nx = (await pg.query(`SELECT r.ticket_no, r.name, d.code AS dcode, d.name AS dname FROM public.employee_roster r JOIN public.sail_department d ON d.id = r.sail_department_id WHERE r.cohort = 'nonexecutive' ORDER BY r.id LIMIT 6`)).rows as { ticket_no: string; name: string; dcode: number; dname: string }[];
  const insH = (cid: number, y: number, m: number, seq: number, printedTicket: string | null, ticket: string | null, namePrinted: string, code: number, dept: string, date: string, status: string, note: string | null = null, page: number | null = null) =>
    pg.query(
      `INSERT INTO public.health_checkup_schedule (circular_id, schedule_year, schedule_month, seq, ticket_printed, ticket_no, name_printed, department_code_printed, department_printed, checkup_date, date_printed, status, status_note, page_number) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [cid, y, m, seq, printedTicket, ticket, namePrinted, code, dept, date, date, status, note, page],
    );
  await insH(901, 2025, 1, 1, nx[0].ticket_no, nx[0].ticket_no, `${nx[0].name} (as printed)`, nx[0].dcode, nx[0].dname, "2025-01-13", "verified", null, 3);
  await insH(901, 2025, 1, 2, nx[1].ticket_no, nx[1].ticket_no, nx[1].name, nx[1].dcode, nx[1].dname, "2025-01-13", "verified", null, 4);
  await insH(901, 2025, 1, 3, nx[2].ticket_no, nx[2].ticket_no, nx[2].name, nx[2].dcode, nx[2].dname, "2025-01-14", "verified", null, 3);
  await insH(901, 2025, 1, 4, "999999", nx[3].ticket_no, nx[3].name, nx[3].dcode, nx[3].dname, "2025-01-14", "corrected", "ticket misread");
  await insH(901, 2025, 1, 5, "888888", null, "ZZ NOBODY KNOWN", 12345, "SOME SECTION", "2025-01-14", "unverified", "not in HR");
  await insH(901, 2025, 1, 6, "777777", null, "SOMEONE ELSE ZETA", 12345, "SOME SECTION", "2025-01-14", "unverified", "ticket 777777 belongs to ANOTHER PERSON in HR, which does not fit the printed name");
  await insH(901, 2025, 1, 7, "666666", null, "TWICE LISTED OMEGA", 12345, "SOME SECTION", "2025-01-14", "unverified", "ticket 666666 appears twice in this schedule (rows 3 and 7); this row is the weaker match");
  await insH(902, 2024, 12, 1, nx[0].ticket_no, nx[0].ticket_no, nx[0].name, 99999, "OLD DEPARTMENT NAME", "2024-12-05", "verified", null, 8);

  const HQ_COLS = "ticket_no, name, department_code, department, checkup_date, schedule, circular, verified";
  const one = await runReadOnly(db, `SELECT ${HQ_COLS} FROM nlq.health_checkups WHERE ticket_no = '${nx[0].ticket_no}' AND schedule_year = 2025 AND schedule_month_no = 1`);
  const r0: any = one.rows[0];
  check("a ticket + month gives exactly its one row, with the date, the schedule and the circular label", one.total === 1 && r0.checkup_date === "2025-01-13" && r0.schedule === "January 2025" && r0.circular === "Circular 003 (2024)" && r0.verified === true, JSON.stringify(r0));
  check("the NAME is HR's, not the text read from the page (the page read was '... (as printed)')", r0.name === nx[0].name, String(r0.name));
  check("the date is plain text YYYY-MM-DD (no time zone to shift a day)", typeof r0.checkup_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r0.checkup_date));
  const both: any = await runReadOnly(db, `SELECT ${HQ_COLS} FROM nlq.health_checkups WHERE ticket_no = '${nx[0].ticket_no}' ORDER BY schedule_year, schedule_month_no, checkup_date`);
  check("with no month named, every schedule of the person comes back (two), earliest first", both.total === 2 && both.rows[0].checkup_date === "2024-12-05" && both.rows[1].checkup_date === "2025-01-13", JSON.stringify(both.rows.map((x: any) => x.checkup_date)));
  check("the department is the one PRINTED in that schedule (it differs between the two)", both.rows[0].department === "OLD DEPARTMENT NAME" && Number(both.rows[0].department_code) === 99999 && both.rows[1].department === nx[0].dname, JSON.stringify(both.rows.map((x: any) => x.department)));
  check("each schedule names its own circular", both.rows[0].circular === "Circular 009 (2024)" && both.rows[1].circular === "Circular 003 (2024)");
  const corrRow: any = await runReadOnly(db, `SELECT ${HQ_COLS} FROM nlq.health_checkups WHERE ticket_no = '${nx[3].ticket_no}'`);
  check("a row whose ticket was corrected is found by the HR ticket and counts as verified", corrRow.total === 1 && corrRow.rows[0].verified === true);
  const ghost: any = await runReadOnly(db, `SELECT ${HQ_COLS} FROM nlq.health_checkups WHERE nlq.word_like(name_words, name_codes, 'nobody')`);
  check("an unconfirmed row (a person HR does not know) SHOWS the ticket as printed, with verified = false, and is found by its printed name (the name helpers work on the view)", ghost.total === 1 && ghost.rows[0].ticket_no === "888888" && ghost.rows[0].verified === false, JSON.stringify(ghost.rows));
  const unconf: any = await runReadOnly(db, `SELECT ticket_no, name, verified FROM nlq.health_checkups WHERE ticket_no = '888888'`);
  check("...and is found by that printed ticket too, flagged verified = false (shown as 'No' on screen), never as a dash", unconf.total === 1 && unconf.rows[0].name === "ZZ NOBODY KNOWN" && unconf.rows[0].verified === false, JSON.stringify(unconf.rows));
  const hiddenTk: any = await runReadOnly(db, `SELECT ticket_no FROM nlq.health_checkups WHERE ticket_no IN ('777777', '666666')`);
  check("a printed ticket that is ANOTHER HR employee's, or is listed twice in the schedule, is NOT shown as a ticket (it may belong to someone else)", hiddenTk.total === 0, String(hiddenTk.total));
  const hiddenNm: any = await runReadOnly(db, `SELECT ticket_no, name, verified FROM nlq.health_checkups WHERE nlq.word_like(name_words, name_codes, 'omega') OR nlq.word_like(name_words, name_codes, 'zeta')`);
  check("...but those two people are still found by name, with no ticket and verified = false", hiddenNm.total === 2 && hiddenNm.rows.every((x: any) => x.ticket_no === null && x.verified === false), JSON.stringify(hiddenNm.rows));
  const byName: any = await runReadOnly(db, `SELECT ticket_no, name, checkup_date FROM nlq.health_checkups WHERE nlq.word_like(name_words, name_codes, '${nx[2].name.split(" ")[0].toLowerCase()}') AND nlq.last_word_like(name_words, name_codes, '${nx[2].name.split(" ").slice(-1)[0].toLowerCase()}')`);
  check("a confirmed person is found by name too (HR's name words)", byName.rows.some((x: any) => x.ticket_no === nx[2].ticket_no && x.checkup_date === "2025-01-14"));

  // -- security: the question-answering role sees the view, never the table
  const gOk = guardSql(`SELECT ${HQ_COLS} FROM nlq.health_checkups WHERE ticket_no = '1'`);
  check("the guard accepts the schedule view", gOk.ok === true, JSON.stringify(gOk));
  const gBad = guardSql("SELECT * FROM public.health_checkup_schedule");
  check("the guard refuses the underlying table", gBad.ok === false);
  let denied = false;
  await pg.query("BEGIN");
  try {
    await pg.query("SET LOCAL ROLE nlq_reader");
    await pg.query("SELECT count(*) FROM nlq.health_checkups");
    try { await pg.query("SELECT 1 FROM public.health_checkup_schedule LIMIT 1"); } catch (e: any) { denied = /permission denied/i.test(String(e.message)); }
  } finally { await pg.query("ROLLBACK"); }
  check("the read-only role can read the view but is refused the table (permission denied)", denied);

  // -- the rules
  const hr: [string, string, boolean][] = [
    ["a check-up list WITHOUT the date -> flagged", "SELECT ticket_no, name, department_code, department FROM nlq.health_checkups WHERE ticket_no = '1'", true],
    ["a check-up list with the date -> fine", "SELECT ticket_no, name, department_code, department, checkup_date, circular FROM nlq.health_checkups WHERE ticket_no = '1'", false],
    ["a COUNT of a day's check-ups -> fine", "SELECT count(*) AS count FROM nlq.health_checkups WHERE checkup_date = '2025-01-15'", false],
    ["a per-day breakdown -> fine", "SELECT checkup_date, count(*) AS count FROM nlq.health_checkups WHERE schedule_year = 2025 GROUP BY checkup_date ORDER BY checkup_date", false],
    ["a query that does not touch the schedule -> not this rule's business", "SELECT ticket_no, name FROM nlq.employees WHERE ticket_no = '1'", false],
  ];
  for (const [label, sqlText, expect] of hr) {
    const problem = checkHealthColumns(sqlText);
    check(label, expect ? problem !== null : problem === null, String(problem));
  }
  check("a schedule lookup by ticket with no name is flagged by the identity rule too", checkPersonIdentity("SELECT department, checkup_date FROM nlq.health_checkups WHERE ticket_no = '1'") !== null);
  check("a schedule list in date order needs no seniority order (the view has none)", checkRankingAndOrder("SELECT ticket_no, name, checkup_date FROM nlq.health_checkups WHERE checkup_date = '2025-01-15' ORDER BY name") === null);
  check("...while a list of employees still must be in seniority order", checkRankingAndOrder("SELECT ticket_no, name FROM nlq.employees WHERE cohort = 'executive'") !== null);

  // -- the whole question, through the pipeline with a scripted model
  const HQ = `which department is ticket ${nx[0].ticket_no} in for the January 2025 health check-up`;
  const hNoDate = `SELECT ticket_no, name, department_code, department FROM nlq.health_checkups WHERE ticket_no = '${nx[0].ticket_no}' AND schedule_year = 2025 AND schedule_month_no = 1`;
  const hRight = `SELECT ticket_no, name, department_code, department, checkup_date, circular FROM nlq.health_checkups WHERE ticket_no = '${nx[0].ticket_no}' AND schedule_year = 2025 AND schedule_month_no = 1 ORDER BY checkup_date`;
  let hr1 = await answerQuestion(HQ, "T1", { llm: script([json({ sql: hNoDate, understood_as: "x" }), json({ sql: hRight, understood_as: "x" })]), withClient });
  check("a check-up answer without the date is sent back once; attempt 2 has ticket, name, department, DATE and circular", hr1.ok && hr1.attempts === 2 && hr1.data.columns.join(",") === "ticket_no,name,department_code,department,checkup_date,circular", hr1.ok ? hr1.data.columns.join(",") : hr1.message);
  check("...and the one row carries the person, their department as printed and the right date", hr1.ok && hr1.data.total === 1 && hr1.data.rows[0].name === nx[0].name && hr1.data.rows[0].checkup_date === "2025-01-13");
  hr1 = await answerQuestion(HQ + " stubborn", "T1", { llm: script([json({ sql: hNoDate, understood_as: "x" }), json({ sql: hNoDate, understood_as: "x" })]), withClient });
  check("a model that insists is still answered (never fail a question over this)", hr1.ok && hr1.attempts === 2);
  hr1 = await answerQuestion(HQ + " right first time", "T1", { llm: script([json({ sql: hRight, understood_as: "x" })]), withClient });
  check("an answer with the date is accepted at once", hr1.ok && hr1.attempts === 1);

  // -- what the omnibar shows: a TABLE with the date, not person cards
  const oh: any = await runOmnibar(HQ, "T-HEALTH", mkDeps(model(hRight, "The check-up schedule row of one ticket.")));
  const ohCols: string[] = oh?.nl2sql?.table?.columns ?? [];
  check("the schedule is shown as a table (not person cards)", oh && oh.kind === "total" && !oh.people && ohCols.length > 0, JSON.stringify(oh && { kind: oh.kind, people: !!oh.people }));
  check("...with the ticket, name, department, DATE and circular, and no cohort column", ["ticket_no", "name", "department_code", "department", "checkup_date", "circular"].every((c) => ohCols.includes(c)) && !ohCols.includes("cohort"), ohCols.join(","));

  // -- no row: the answer says which schedules exist (the month may be wrong, or the person is not on that list)
  const hNone = `SELECT ticket_no, name, department_code, department, checkup_date, circular FROM nlq.health_checkups WHERE ticket_no = '${nx[0].ticket_no}' AND schedule_year = 2025 AND schedule_month_no = 2 ORDER BY checkup_date`;
  const ohn: any = await runOmnibar(`which department is ticket ${nx[0].ticket_no} in for the February 2025 health check-up`, "T-HEALTH", mkDeps(model(hNone, "The schedule row of one ticket.")));
  check("a question with no match about a list that does not exist (February 2025) says so and names the lists that do exist, in plain words (no 'row', no 'No row matches')", !!ohn && /There is no health check-up list for February 2025 in the system\. The lists in the system are: December 2024, January 2025\./.test(String(ohn.answer)) && !/\brows?\b/i.test(String(ohn.answer)), String(ohn && ohn.answer));
  check("...and a question with a row keeps its normal headline", !!oh && /1 row/.test(String(oh.answer)), String(oh && oh.answer));
  // a ticket that matches nothing is not a dead end: who the ticket belongs to, and every schedule it IS on (12 Oct: ticket 228757 asked for January 2025)
  const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  check("an empty answer about a ticket says what was asked first, then who the ticket belongs to (HR) and every list it IS on", !!ohn && new RegExp(`^Ticket ${nx[0].ticket_no} is not on the February 2025 health check-up list\\. It belongs to ${escRe(nx[0].name)}`).test(String(ohn.answer)) && /This ticket is on the December 2024 list, on 05 Dec 2024 \(Circular 009 \(2024\)\); the January 2025 list, on /.test(String(ohn.answer)), String(ohn && ohn.answer));
  check("...the empty answer is marked as a sentence (so the screen leaves out its big 0), and a normal answer is not", ohn?.nl2sql?.plainAnswer === true && oh?.nl2sql?.plainAnswer === undefined);
  // a schedule whose circular was uploaded but not read: the empty answer says so (from the upload's decision log)
  await pg.query(`INSERT INTO public.circulars (id, headline, "serialNumber", "publishedAt") VALUES (903, 'CIRCULAR-HEALTH CHECK UP FEB-2025', 7, '2025-01-30')`);
  await pg.query(`INSERT INTO public.circular_ingest_log (circular_id, kind, status, detail) VALUES (903, 'health-schedule', 'timeout', '{}')`);
  const ohp: any = await runOmnibar(`which department is ticket ${nx[0].ticket_no} in for the February 2025 health check-up`, "T-HEALTH", mkDeps(model(hNone, "The schedule row of one ticket.")));
  check("an empty answer says which uploaded schedule has not been read yet: Circular 007 (2025) has not been read yet, so it is not included", !!ohp && /The health check-up schedule of Circular 007 \(2025\) has not been read yet, so it is not included\./.test(String(ohp.answer)) && /^Ticket /.test(String(ohp.answer)), String(ohp && ohp.answer));
  await pg.query(`INSERT INTO public.health_checkup_schedule (circular_id, schedule_year, schedule_month, seq, page_number, ticket_printed, ticket_no, name_printed, department_code_printed, department_printed, checkup_date, status) VALUES (903, 2025, 2, 1, 3, '777001', NULL, 'LATE PERSON', 1, 'X', '2025-02-03', 'unverified')`);
  const ohq: any = await runOmnibar(`which department is ticket 000000 in for the March 2025 health check-up`, "T-HEALTH", mkDeps(model(`SELECT ticket_no, name, department_code, department, checkup_date, circular FROM nlq.health_checkups WHERE ticket_no = '000000'`, "One ticket.")));
  check("a ticket nobody knows (the question named no list): Ticket 000000 is not on that health check-up list, it is not in the HR directory and not on any other list", !!ohq && /Ticket 000000 is not on that health check-up list\. It is not in the HR directory and is not on any other health check-up list in the system\./.test(String(ohq.answer)), String(ohq && ohq.answer));
  check("once the schedule's rows ARE in the system (the tool was run, or the upload read them) the not-been-read-yet sentence is gone", !!ohq && !/has not been read yet/.test(String(ohq.answer)) && /^Ticket 000000 is not on that/.test(String(ohq.answer)), String(ohq && ohq.answer));
  await pg.query(`DELETE FROM public.health_checkup_schedule WHERE circular_id = 903`);
  await pg.query(`DELETE FROM public.circulars WHERE id = 903`);

  // -- the "Source" line: which circular(s) the answer was read from, and the page of the people listed (looked up by the system, not asked of the model)
  const srcCols: any = await runReadOnly(db, `SELECT circular_id, circular_title, page_number FROM nlq.health_checkups WHERE ticket_no = '${nx[0].ticket_no}' AND schedule_year = 2025 AND schedule_month_no = 1`);
  check("the view carries the circular's id, title and the page of the row (appended columns)", srcCols.total === 1 && Number(srcCols.rows[0].circular_id) === 901 && srcCols.rows[0].circular_title === "HEALTH CHECK UP SCHEDULE JAN 2025" && Number(srcCols.rows[0].page_number) === 3, JSON.stringify(srcCols.rows));
  check("the model is NOT told about them (nor about the redundant 'schedule' column): they are not in its prompt", !pHealth_probe().includes("circular_id") && !pHealth_probe().includes("page_number") && !pHealth_probe().includes("circular_title") && !pHealth_probe().includes("schedule ('January"));
  function pHealth_probe() { return buildPrompt({ question: HQ, context: ctx, examples: pickExamples(HQ, []) }); }
  check("...and the worked examples do not select it either", pickExamples(HQ, []).every((e) => !/\bschedule\b[,\s]/.test(String(e.sql).split("FROM")[0])));
  check("a ticket + month answer carries ONE source: Circular 003 (2024), its title, page 3", Array.isArray(oh?.nl2sql?.sources) && oh.nl2sql.sources.length === 1 && oh.nl2sql.sources[0].circularId === 901 && oh.nl2sql.sources[0].label === "Circular 003 (2024)" && oh.nl2sql.sources[0].title === "HEALTH CHECK UP SCHEDULE JAN 2025" && oh.nl2sql.sources[0].pages.join() === "3", JSON.stringify(oh?.nl2sql?.sources));
  const hBoth = `SELECT ticket_no, name, department_code, department, checkup_date, circular, verified FROM nlq.health_checkups WHERE ticket_no = '${nx[0].ticket_no}' ORDER BY schedule_year, schedule_month_no`;
  const obo: any = await runOmnibar(`when are the health check-ups of ticket ${nx[0].ticket_no}`, "T-HEALTH", mkDeps(model(hBoth, "Every schedule the ticket is in.")));
  check("a person on two schedules: two sources, in the order of the answer (December 2024 first: Circular 009 page 8, then Circular 003 page 3)", obo?.nl2sql?.sources?.length === 2 && obo.nl2sql.sources[0].label === "Circular 009 (2024)" && obo.nl2sql.sources[0].pages.join() === "8" && obo.nl2sql.sources[1].label === "Circular 003 (2024)" && obo.nl2sql.sources[1].pages.join() === "3", JSON.stringify(obo?.nl2sql?.sources));
  const hDay = `SELECT ticket_no, name, department_code, department, checkup_date, circular, verified FROM nlq.health_checkups WHERE checkup_date = '2025-01-13' ORDER BY name`;
  const odd: any = await runOmnibar("who has the health check-up on 13 January 2025", "T-HEALTH", mkDeps(model(hDay, "Everyone called on that day.")));
  check("a day's list: ONE source for the circular, with the pages of all the people listed (3 and 4), so the viewer can mark them all", odd?.nl2sql?.sources?.length === 1 && odd.nl2sql.sources[0].pages.join() === "3,4", JSON.stringify(odd?.nl2sql?.sources));
  const oemp: any = await runOmnibar("list executives", "T-EMP", mkDeps(model("SELECT ticket_no, name FROM nlq.employees WHERE cohort = 'executive' ORDER BY global_seniority_rank", "Executives.")));
  check("an answer that is not a health check-up schedule has no source line", !!oemp && (oemp.nl2sql?.sources === undefined));
  check("a schedule answer with NO row has no source line either (just the 'which schedules exist' sentence)", !!ohn && ohn.nl2sql?.sources === undefined);
  const dFail = mkDeps(model(hRight, "The check-up schedule row of one ticket."));
  const origWith = dFail.withClient;
  dFail.withClient = ((fn: (c: any) => Promise<any>) => origWith((c: any) => fn({ query: async (sql: string, p?: unknown[]) => { if (/circular_title/.test(sql)) throw new Error("lookup failed"); return c.query(sql, p); } }))) as typeof dFail.withClient;
  const ofail: any = await runOmnibar(HQ, "T-HEALTH", dFail);
  check("if the source lookup fails the ANSWER is unaffected (same table, no source line, no error)", !!ofail && ofail.kind === "total" && (ofail.nl2sql?.table?.rows?.length ?? 0) === 1 && ofail.nl2sql?.sources === undefined, JSON.stringify(ofail && { kind: ofail.kind, rows: ofail.nl2sql?.table?.rows?.length, src: ofail.nl2sql?.sources }));

  // -- who is not confirmed against HR: said under the Source line ONLY when it applies (instead of a Yes/No column on every row)
  const hDay14 = `SELECT ticket_no, name, department_code, department, checkup_date, circular FROM nlq.health_checkups WHERE checkup_date = '2025-01-14' ORDER BY name`;
  const o14: any = await runOmnibar("who has the health check-up on 14 January 2025", "T-HEALTH", mkDeps(model(hDay14, "Everyone called on that day.")));
  const note14 = String(o14?.nl2sql?.sourceNote ?? "");
  check("a day that includes people HR does not know says so, with their names: '3 of the 5 people listed are not in the HR directory ...'", /^3 of the 5 people listed are not in the HR directory \(the ticket shown is as printed in the circular\): /.test(note14) && ["SOMEONE ELSE ZETA", "TWICE LISTED OMEGA", "ZZ NOBODY KNOWN"].every((n) => note14.includes(n)), note14);
  check("...and the people HR does know (including the one whose ticket was corrected) are NOT named", !note14.includes(nx[2].name) && !note14.includes(nx[3].name), note14);
  check("a day of confirmed people has NO such note (nothing appears on screen)", odd?.nl2sql?.sourceNote === undefined && oh?.nl2sql?.sourceNote === undefined && obo?.nl2sql?.sourceNote === undefined);
  const hGhost = `SELECT ticket_no, name, department_code, department, checkup_date, circular FROM nlq.health_checkups WHERE ticket_no = '888888'`;
  const og: any = await runOmnibar("which department is ticket 888888 in for the health check-up", "T-HEALTH", mkDeps(model(hGhost, "One ticket.")));
  check("one person HR does not know: 'This person is not in the HR directory; the ticket shown is as printed in the circular.' (the printed ticket is still shown)", og?.nl2sql?.sourceNote === "This person is not in the HR directory; the ticket shown is as printed in the circular." && String(og?.nl2sql?.table?.rows?.[0]?.ticket_no) === "888888", String(og?.nl2sql?.sourceNote));
  check("the model is no longer asked for the Verified column: not in the standard select list, not in any worked example", !/ALWAYS SELECTs[^\n]*verified/.test(pHealth_probe()) && pickExamples(HQ, []).every((e) => !/\bverified\b/.test(String(e.sql))) && /do not select it unless asked/.test(pHealth_probe()));

  // -- the big number and "N rows." at the top: hidden ONLY for a one-row table (a lookup of one person or ticket)
  check("a one-row table answer hides the big number; a count answer ('how many'), a list of 2 or more, and everything else keep it", isSingleRowTable("total", 1, true) === true && isSingleRowTable("total", 15, true) === false && isSingleRowTable("count", 1, true) === false && isSingleRowTable("total", 1, false) === false && isSingleRowTable("total", 2, true) === false && isSingleRowTable("clarify", 1, true) === false && isSingleRowTable(undefined, undefined, true) === false);
  check("...and the real one-ticket answer is exactly that case (kind total, 1 row, with a table)", oh?.kind === "total" && oh?.count === 1 && !!oh?.nl2sql?.table);

  // -- the prompt: the schedule is described only when the question is about a check-up, and it still fits the size limit
  check("a check-up question is recognised; ordinary questions are not", isHealthQuestion(HQ) && isHealthQuestion("health checkup date of ticket 1") && isHealthQuestion("medical examination schedule") && !isHealthQuestion("list executives in C&IT") && !isHealthQuestion("who is the most senior roy"));
  const pHealth = buildPrompt({ question: HQ, context: ctx, examples: [] });
  const pPlain = buildPrompt({ question: "list executives in c&it", context: ctx, examples: [] });
  check("the schedule view is described for a check-up question, and the table list says four", pHealth.includes("nlq.health_checkups --") && pHealth.includes("any table other than the four listed"));
  check("...and not for any other question (their prompt is unchanged)", !pPlain.includes("health_checkups") && pPlain.includes("any table other than the three above"));
  const hq2 = "which department is that ticket in for the health check-up";
  const hBig = buildPrompt({ question: hq2, context: { ...ctx, departments: padded }, examples: pickExamples(hq2, []), negatives: bigNeg, hint: longHint, rejectedSql: [SQL_A] });
  console.log(`  worst-case HEALTH prompt: ${hBig.length} of 19600 characters`);
  check("with lessons, a correction and 300 departments the HEALTH prompt still fits the size limit", hBig.length < 19600, `${hBig.length} chars`);
  check("the check-up examples are the ones chosen for a check-up question", pickExamples(HQ, []).slice(0, 2).some((e) => /health_checkups/.test(String(e.sql))));

  // ==========================================================================
  // Step 28b: "N most senior IN EACH department" and "grade X or above". Two gaps found on the real data (13 Oct): the model answered
  // "5 people" (5 in all) for the five most senior executives of EACH plant garage section, and "0 rows" for the departments with more than 20
  // non-executives of grade S-9 or above, where 45 or more qualify. Fixture removed again afterwards.
  await pg.query(`INSERT INTO public.sail_department (id, code, name, cohort_scope) VALUES (29101, 970101, 'ZQ GROUPA', 'shared'), (29102, 970102, 'ZQ GROUPB', 'shared')`);
  try {
    const EXG = `(SELECT id FROM public.designation_grade WHERE track <> 'nonexec' ORDER BY id LIMIT 1)`;
    const G = (title: string) => `(SELECT id FROM public.designation_grade WHERE title = '${title}' LIMIT 1)`;
    await pg.query(`INSERT INTO public.employee_roster (ticket_no,name,designation_grade_id,sail_department_id,cohort,within_grade_position,global_seniority_rank) VALUES
      ('981001','ZQ A ONE',${EXG},29101,'executive',98101,981001), ('981002','ZQ A TWO',${EXG},29101,'executive',98102,981002),
      ('981003','ZQ A THREE',${EXG},29101,'executive',98103,981003), ('981004','ZQ A FOUR',${EXG},29101,'executive',98104,981004),
      ('981011','ZQ B ONE',${EXG},29102,'executive',98111,981011), ('981012','ZQ B TWO',${EXG},29102,'executive',98112,981012),
      ('981013','ZQ B THREE',${EXG},29102,'executive',98113,981013), ('981014','ZQ B FOUR',${EXG},29102,'executive',98114,981014),
      ('981101','ZQ S FOUR',${G("S-4")},29101,'nonexecutive',98201,981101), ('981102','ZQ S FIVE',${G("S-5")},29101,'nonexecutive',98202,981102),
      ('981103','ZQ S NINE',${G("S-9")},29101,'nonexecutive',98203,981103), ('981111','ZQ S ELEVEN',${G("S-11")},29102,'nonexecutive',98211,981111),
      ('981112','ZQ S FOUR B',${G("S-4")},29102,'nonexecutive',98212,981112)`);
    const FXB = `SELECT id FROM nlq.departments WHERE code IN (970101, 970102)`;
    const perGroup = await pg.query(
      `SELECT ticket_no FROM (SELECT ticket_no, department_code, global_seniority_rank, row_number() OVER (PARTITION BY department_id ORDER BY global_seniority_rank) AS r FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (${FXB})) t WHERE r <= 3 ORDER BY department_code, global_seniority_rank`,
    );
    check("per-group top 3: three people in EACH of the two departments (6 in all), the most senior ones, not 3 in all", perGroup.rows.map((r: any) => r.ticket_no).join(",") === "981001,981002,981003,981011,981012,981013", perGroup.rows.map((r: any) => r.ticket_no).join(","));
    const above = await pg.query(`SELECT ticket_no FROM nlq.employees WHERE cohort = 'nonexecutive' AND rank_order <= (SELECT max(rank_order) FROM nlq.designations WHERE title = 'S-5') AND department_id IN (${FXB}) ORDER BY ticket_no`);
    check("grade S-5 or above = S-5, S-9 and S-11, and NOT S-4", above.rows.map((r: any) => r.ticket_no).join(",") === "981102,981103,981111", above.rows.map((r: any) => r.ticket_no).join(","));
    const below = await pg.query(`SELECT ticket_no FROM nlq.employees WHERE cohort = 'nonexecutive' AND rank_order >= (SELECT max(rank_order) FROM nlq.designations WHERE title = 'S-5') AND department_id IN (${FXB}) ORDER BY ticket_no`);
    check("the opposite comparison answers 'S-5 or BELOW' (the trap the rule warns about)", below.rows.map((r: any) => r.ticket_no).join(",") === "981101,981102,981112", below.rows.map((r: any) => r.ticket_no).join(","));
    const pr28 = buildPrompt({ question: "show the five most senior executives in each section", context: ctx, examples: [] });
    check("the instructions say how to take the top N PER GROUP", /PARTITION BY department_id/.test(pr28) && /IN EACH department/.test(pr28));
    check("the instructions say which way rank_order runs for 'grade X or above'", /rank_order 1 = MOST senior/.test(pr28) && /grade X or above/.test(pr28));
    check("both worked examples are in the seed set", SEED_EXAMPLES.some((e) => /three most senior executives in each blast furnace section/.test(e.question)) && SEED_EXAMPLES.some((e) => /non-executives of grade S-5 or above/.test(e.question)));
  } finally {
    await pg.query(`DELETE FROM public.employee_roster WHERE ticket_no LIKE '9810%' OR ticket_no LIKE '9811%'`);
    await pg.query(`DELETE FROM public.sail_department WHERE id IN (29101, 29102)`);
  }

  // ==========================================================================
  // Leave the scratch database as it was found: the stand-in circulars table and the schedule objects would make the other self-tests
  // (circularLabels, reread) refuse to run, which they do whenever a "circulars" table exists (their guard against a real database).
  await pg.query(`DROP VIEW IF EXISTS nlq.health_checkups`);
  await pg.query(`DROP TABLE IF EXISTS public.circular_ingest_log`);
  await pg.query(`DROP TABLE IF EXISTS public.health_checkup_schedule`);
  await pg.query(`DROP TABLE IF EXISTS public.circulars`);
  await pg.end();
  console.log(`\n${"=".repeat(60)}\nRESULT: ${passed} checks passed, ${failed} failed`);
  if (failed) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("selftest crashed:", e);
  process.exit(2);
});
