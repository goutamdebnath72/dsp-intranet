// src/lib/nl2sql/eval/run-live.ts
//
// THE REAL TEST: does the real language model turn questions it has never seen
// into correct SQL on YOUR real data? For every golden question, in every
// wording, it asks the model, runs what the model wrote through the same guard
// and read-only executor the app uses, and compares the rows with the
// reference SQL's rows. Nothing is hard-coded: expected results are computed
// from your database.
//
//   npx tsx --env-file=.env.local src/lib/nl2sql/eval/run-live.ts
//   npx tsx --env-file=.env.local src/lib/nl2sql/eval/run-live.ts --quick
//   npx tsx --env-file=.env.local src/lib/nl2sql/eval/run-live.ts --only=gm_cit_nath,debnath_not_nath
//
// Needs in the environment: GROQ_API_KEY (and optionally GROQ_MODEL), and
// NL2SQL_DATABASE_URL or DATABASE_URL. It only ever READS your database
// (the queries run as the nlq_reader role in read-only transactions); the one
// write is a row per question in public.nl2sql_log if that table exists.
//
// Output: nl2sql-eval-report.md and nl2sql-eval-report.json in the current
// folder. Paste the "Failures" section back to improve the prompt.

import { Client } from "pg";
import { writeFileSync } from "fs";

import { answerQuestion } from "../pipeline";
import { runReadOnly } from "../executor";
import { groqLlm } from "../llm";
import { GOLDEN, compareResults, type GoldenCase } from "./golden";
import type { SqlClient } from "../types";

const args = process.argv.slice(2);
const quick = args.includes("--quick");
const only = (args.find((a) => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean);
const delayMs = Number((args.find((a) => a.startsWith("--delay=")) || "--delay=400").replace("--delay=", ""));

interface Row {
  caseId: string;
  question: string;
  pass: boolean;
  detail: string;
  attempts: number;
  ms: number;
  sql: string | null;
  understoodAs: string | null;
  outcome: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const url = process.env.NL2SQL_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set NL2SQL_DATABASE_URL or DATABASE_URL");
  if (!process.env.GROQ_API_KEY) throw new Error("Set GROQ_API_KEY");

  const pg = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  await pg.connect();
  const db: SqlClient = { query: (t, p) => pg.query(t, p) as any };
  const withClient = async <T,>(fn: (c: SqlClient) => Promise<T>) => fn(db);
  const llm = groqLlm();

  const cases: GoldenCase[] = GOLDEN.filter((c) => !only.length || only.includes(c.id));
  const rows: Row[] = [];
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  console.log(`Model: ${model}   Cases: ${cases.length}   ${quick ? "(quick: first wording only)" : ""}\n`);

  for (const c of cases) {
    let expected: Record<string, unknown>[] = [];
    if (c.reference) {
      try {
        expected = (await runReadOnly(db, c.reference, { rowLimit: 5000 })).rows;
      } catch (e: any) {
        console.log(`!! reference SQL for ${c.id} failed on your database: ${e.message}`);
        console.log("   (it may use a column or department your database lacks; skipping this case)\n");
        continue;
      }
    }
    const list = quick ? c.variants.slice(0, 1) : c.variants;
    for (const v of list) {
      const t0 = Date.now();
      const res = await answerQuestion(v, "LIVE-EVAL", { llm, withClient, exec: { rowLimit: 5000 } });
      let pass = false;
      let detail = "";
      if (c.kind === "unanswerable") {
        pass = !res.ok && res.kind === "unanswerable";
        detail = pass ? "declared unanswerable" : res.ok ? "answered with data instead of declining" : `${res.kind}: ${res.message}`;
      } else if (res.ok) {
        const cmp = compareResults(c.kind, expected, res.data.rows);
        pass = cmp.pass;
        detail = cmp.detail;
      } else {
        detail = `${res.kind}: ${res.message}`;
      }
      rows.push({
        caseId: c.id, question: v, pass, detail, attempts: res.attempts, ms: Date.now() - t0,
        sql: res.ok ? res.sql : (res.sql ?? null), understoodAs: (res as any).understoodAs ?? null,
        outcome: res.ok ? "answered" : res.kind,
      });
      console.log(`${pass ? "PASS" : "FAIL"}  [${c.id}] ${v}\n        ${detail}  (${res.attempts} attempt${res.attempts === 1 ? "" : "s"}, ${Date.now() - t0} ms)`);
      await sleep(delayMs);
    }
  }
  await pg.end();

  // ---- report ---------------------------------------------------------------
  const total = rows.length;
  const passed = rows.filter((r) => r.pass).length;
  const firstTry = rows.filter((r) => r.pass && r.attempts === 1).length;
  const avgMs = total ? Math.round(rows.reduce((s, r) => s + r.ms, 0) / total) : 0;
  const byCase = new Map<string, Row[]>();
  rows.forEach((r) => byCase.set(r.caseId, [...(byCase.get(r.caseId) ?? []), r]));

  const md: string[] = [];
  md.push(`# Natural-language SQL: live evaluation`);
  md.push(`\n- Model: \`${model}\`\n- Date: ${new Date().toISOString()}\n- **Wordings passed: ${passed} of ${total} (${total ? Math.round((passed / total) * 100) : 0}%)**\n- Passed on the first attempt: ${firstTry}\n- Average time per question: ${avgMs} ms\n`);
  md.push(`## By question\n\n| Question | Passed | Notes |\n|---|---|---|`);
  for (const [id, rs] of byCase) {
    const note = GOLDEN.find((g) => g.id === id)?.note ?? "";
    md.push(`| ${id} | ${rs.filter((r) => r.pass).length}/${rs.length} | ${note} |`);
  }
  const fails = rows.filter((r) => !r.pass);
  md.push(`\n## Failures (${fails.length})\n`);
  if (!fails.length) md.push("None.\n");
  for (const f of fails) {
    md.push(`### [${f.caseId}] ${f.question}\n- Result: ${f.detail}\n- Outcome: ${f.outcome}, ${f.attempts} attempt(s)\n- Model understood it as: ${f.understoodAs ?? "(nothing)"}\n- SQL the model wrote:\n\n\`\`\`sql\n${f.sql ?? "(none)"}\n\`\`\`\n`);
  }
  const multi = rows.filter((r) => r.pass && r.attempts > 1);
  if (multi.length) {
    md.push(`## Passed only after a retry (${multi.length})\n`);
    multi.forEach((r) => md.push(`- [${r.caseId}] ${r.question} (${r.attempts} attempts)`));
  }
  writeFileSync("nl2sql-eval-report.md", md.join("\n") + "\n");
  writeFileSync("nl2sql-eval-report.json", JSON.stringify({ model, total, passed, firstTry, avgMs, rows }, null, 2));

  console.log(`\n${"=".repeat(60)}\n${passed} of ${total} wordings correct (${total ? Math.round((passed / total) * 100) : 0}%), ${firstTry} on the first attempt, avg ${avgMs} ms`);
  console.log("Report written: nl2sql-eval-report.md and nl2sql-eval-report.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
