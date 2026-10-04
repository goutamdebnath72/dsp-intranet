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
import { departmentScopeQueries, computeDepartmentScope } from "../scope";
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
    check(`prompt stays under the token budget with 300 departments: "${qq.slice(0, 32)}"`, pp.length < 16000, `${pp.length} chars`);
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
  check("a sub-query that only works through the outer query (the real 'garage, no email' SQL) claims NO scope", corr === null, JSON.stringify(corr));
  check("no department filter -> null", (await computeDepartmentScope(db, `SELECT count(*) FROM nlq.employees`)) === null);
  const promptDept = buildPrompt({ question: "senior most DGM in electrical", context: ctx, examples: [] });
  check("the prompt explains abbreviated department words and the stem rule", promptDept.includes("ELECT") && promptDept.includes("LIKE '%elect%'") && promptDept.includes("SHORT STEM"));

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
  const good = `SELECT ticket_no, name, designation, department FROM nlq.employees WHERE 'KUMAR' = ANY(name_words) ORDER BY global_seniority_rank`;
  const goodPlan = json({ sql: good, understood_as: "People with the word KUMAR.", confidence: "high" });

  let r = await answerQuestion("kumar anywhere", "T1", { llm: script([goodPlan]), withClient });
  check("happy path succeeds in 1 attempt", r.ok && r.attempts === 1);
  check("result reports a true total and is logged", r.ok && r.data.total > 100 && r.logId !== null);

  r = await answerQuestion("q1", "T1", { llm: script([json({ sql: "DROP TABLE nlq.employees", understood_as: "x" }), goodPlan]), withClient });
  check("a guard rejection is repaired on attempt 2", r.ok && r.attempts === 2);

  r = await answerQuestion("q2", "T1", { llm: script([json({ sql: "SELECT nosuchcol FROM nlq.employees", understood_as: "x" }), goodPlan]), withClient });
  check("a database error is repaired on attempt 2", r.ok && r.attempts === 2);

  r = await answerQuestion("q3", "T1", { llm: script(["not json at all", goodPlan]), withClient });
  check("an unparsable reply is retried", r.ok && r.attempts === 2);

  r = await answerQuestion("q4", "T1", { llm: script([json({ sql: "SELECT pg_sleep(1)", understood_as: "x" }), json({ sql: "SELECT set_config('role','postgres',true)", understood_as: "x" }), json({ sql: "SELECT * FROM public.\"user\"", understood_as: "x" })]), withClient });
  check("gives up after 3 attempts with an honest message", !r.ok && r.kind === "error" && r.attempts === 3 && /could not turn this/i.test(r.message));

  r = await answerQuestion("q5", "T1", { llm: script([json({ sql: null, understood_as: "salary", unanswerable_reason: "No salary data." })]), withClient });
  check("unanswerable is reported, not guessed", !r.ok && r.kind === "unanswerable" && r.message === "No salary data.");

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
    ["top 10 senior staff", bad2, `SELECT ticket_no, name, designation, department FROM nlq.employees WHERE cohort = 'nonexecutive' ORDER BY global_seniority_rank LIMIT 10`],
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
  r = await answerQuestion("kumar test verdict", "USER-C", { llm: script([goodPlan]), withClient });
  check("someone else's cross does not affect other people", r.ok && r.attempts === 1);

  // confirmed answers become worked examples
  r = await answerQuestion("employees called zzqx", "USER-A", { llm: script([json({ sql: `SELECT ticket_no, name, designation, department FROM nlq.employees WHERE 'ZZQX' = ANY(name_words)`, understood_as: "zzqx" })]), withClient });
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
