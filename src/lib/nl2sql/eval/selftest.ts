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
import { parsePlan } from "../generator";
import { buildPrompt } from "../prompt";
import { loadDynamicContext, clearContextCache, selectRelevantDepartments } from "../context";
import { SEED_EXAMPLES, pickExamples, similarity } from "../examples";
import { recordVerdict } from "../log";
import { extractQuotedTerms, checkQuotedTerms } from "../quoted";
import { checkDepartmentColumns } from "../deptColumns";
import { checkRankingAndOrder } from "../rankingCheck";
import { departmentScopeQueries, computeDepartmentScope, peopleFootprintQuery, departmentFilterInfo } from "../scope";
import { stableOrderSql, PAGE_SIZE } from "../paging";
import { pageProgress, mergePage, columnKind, formatCell, sortRows, toCsv, resolveDisplay } from "../display";
import { runOmnibar, peopleFor, parseRetry, MAX_ATTEMPTS, withDisplayCodes, type OmnibarDeps, peoplePage } from "../omnibar";
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
  for (const f of ["01_nlq_schema_views_role.sql", "02_nl2sql_log_tables.sql"]) await pg.query(readFileSync(join(SQL_DIR, f), "utf8"));
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
    check(`prompt stays under the token budget with 300 departments: "${qq.slice(0, 32)}"`, pp.length < 18000, `${pp.length} chars`);
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
    ["D5 done right: the total is computed INSIDE, beside rank() -> fine", "SELECT department_code, department, cnt, round(cnt * 100.0 / total, 2) AS percentage FROM (SELECT department_code, department, count(*) AS cnt, sum(count(*)) OVER () AS total, rank() OVER (ORDER BY count(*) DESC) AS r FROM nlq.employees WHERE cohort = 'nonexecutive' GROUP BY department_id, department_code, department) s WHERE r = 1", false],
    ["an outer window with NO filter on a window result -> fine", "SELECT department_code, department, cnt, sum(cnt) OVER () AS total FROM (SELECT department_code, department, count(*) AS cnt FROM nlq.employees GROUP BY department_id, department_code, department) t WHERE cnt > 20 ORDER BY cnt DESC", false],
    ["E5 (10 Oct): array_agg(name) with no ORDER BY -> flagged", "SELECT designation, count(*) AS count, array_agg(name) AS names FROM nlq.employees WHERE cohort = 'executive' AND has_webmail AND NOT has_email_nic GROUP BY designation, rank_order ORDER BY rank_order, designation", true],
    ["array_agg(name ORDER BY global_seniority_rank) -> fine", "SELECT designation, count(*) AS count, array_agg(name ORDER BY global_seniority_rank) AS names FROM nlq.employees WHERE cohort = 'executive' GROUP BY designation, rank_order ORDER BY rank_order, designation", false],
    ["string_agg(name, ', ') with no ORDER BY -> flagged", "SELECT designation, string_agg(name, ', ') AS names FROM nlq.employees GROUP BY designation ORDER BY designation", true],
    ["string_agg(name, ', ' ORDER BY global_seniority_rank) -> fine", "SELECT designation, string_agg(name, ', ' ORDER BY global_seniority_rank) AS names FROM nlq.employees GROUP BY designation ORDER BY designation", false],
    ["SELECT * / unparsable -> cannot be judged -> fine", "SELEKT nonsense FROM", false],
  ];
  for (const [label, sqlText, expectProblem] of rk) {
    const problem = checkRankingAndOrder(sqlText);
    check(label, expectProblem ? problem !== null : problem === null, String(problem));
  }
  check("the LIMIT message tells the model to use rank()", /rank\(\) OVER/.test(String(checkRankingAndOrder("SELECT designation, count(*) AS c FROM nlq.employees GROUP BY designation ORDER BY c DESC LIMIT 1"))));
  check("the seed example for the right pattern passes both soft checks", SEED_EXAMPLES.filter((e) => e.sql && /rank\(\) OVER/.test(e.sql)).every((e) => checkRankingAndOrder(e.sql!) === null && checkDepartmentColumns(e.sql!) === null) && SEED_EXAMPLES.some((e) => e.sql && /rank\(\) OVER/.test(e.sql)));

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
  o = await runOmnibar("garage people", "T-OMNI", mkDeps(model(`SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE department_id IN (SELECT id FROM nlq.departments WHERE nlq.norm(name) LIKE '%garage%') ORDER BY global_seniority_rank`)));
  check("departments covered travel with the answer", o.nl2sql.scope && o.nl2sql.scope.total === 3 && o.nl2sql.scope.departments.every((d: string) => /GARAGE/.test(d)), JSON.stringify(o.nl2sql.scope));

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
  console.log(`  worst-case prompt: ${ppBig.length} of 19000 characters`);
  check("with lessons and a correction the prompt still fits the budget (300 departments)", ppBig.length < 19000, `${ppBig.length} chars`);

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
  check("a plain list now carries each person's department code AND name on the card (designation code still not shown), shown as cards, all five columns known", plainList.people.length === 3 && plainList.people.every((p: any) => /^\d+$/.test(String(p.departmentCode ?? "")) && p.designationCode === undefined) && plainList.nl2sql.display?.view === "cards" && plainList.nl2sql.display.columns.length === 5);
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
  const seenT: string[] = []; let off = 0; let pagesN = 0; let allTotals = new Set<number>(); let lastTrunc = true;
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
  check("seniority position (global_seniority_rank) is shown too", !!idList.nl2sql.table && idList.nl2sql.table.columns.includes("global_seniority_rank"));
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
  check("...and still every selected column is shown, once", hinted.nl2sql.display.columns.length === 5 && new Set(hinted.nl2sql.display.columns.map((c: any) => c.key)).size === 5 && !!hinted.nl2sql.table);
  const asTable = await withPlan("list executives as a table hinted test", { sql: LIST5, understood_as: "Three senior executives.", confidence: "high", display: { view: "table" } });
  check("a person who literally asks for a table gets the table first", asTable.nl2sql.display.view === "table" && !!asTable.nl2sql.table && asTable.people.length === 3);
  check("a column the model titled in its hint uses that title on the chip", ((await withPlan("list executives titled chip test", { sql: `SELECT ${STD}, rank_order, has_email ${TAIL}`, understood_as: "x", confidence: "high", display: { columns: [{ key: "rank_order", label: "Seniority grade" }] } })) as any).people[0].extraFields[0].label === "Seniority grade");
  const junkHint = await withPlan("list executives junk hint test", { sql: LIST5, understood_as: "Three senior executives.", confidence: "high", display: { view: "hologram", title: 42, columns: [{ key: "nope" }, 7, null], bar: "x" } });
  check("a garbage hint never breaks the answer: same people, a layout chosen from the data (cards)", junkHint.kind === "count" && junkHint.people.length === 3 && junkHint.nl2sql.display.view === "cards" && junkHint.nl2sql.display.columns.length === 5);
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
  check("the model's instructions describe the optional display hint, and still fit the budget", buildPrompt({ question: "list executives", context: ctx, examples: [] }).includes("display (optional") && buildPrompt({ question: "list executives", context: { ...ctx, departments: padded }, examples: [] }).length < 19000);

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
