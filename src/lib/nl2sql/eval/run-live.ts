// src/lib/nl2sql/eval/run-live.ts
//
// THE REAL TEST: does the real language model turn questions it has never seen into correct SQL on
// YOUR real data? For every golden question, in every wording, it asks the model, runs what the model
// wrote through the same guard and read-only executor the app uses, and compares the rows with the
// reference SQL's rows. Nothing is hard-coded: expected results come from your database.
//
//   npx tsx --env-file=.env.local src/lib/nl2sql/eval/run-live.ts                 (everything)
//   npx tsx --env-file=.env.local src/lib/nl2sql/eval/run-live.ts --quick         (first wording of each)
//   npx tsx --env-file=.env.local src/lib/nl2sql/eval/run-live.ts --only=a,b      (chosen questions)
//   npx tsx --env-file=.env.local src/lib/nl2sql/eval/run-live.ts --resume        (continue an earlier run)
//   ... --resume --retry-failed      (also ask again the wordings that FAILED; keep the passes)
//
// Results are saved after EVERY question (nl2sql-eval-results.json + nl2sql-eval-report.md), so nothing
// is lost if the run stops. If the model provider's daily token allowance runs out, the run stops
// cleanly and tells you the exact command to continue later with --resume (wordings that already got a
// real answer are not asked again). Only the read-only nlq_reader role touches your data.

import { Client } from "pg";
import { existsSync, readFileSync, writeFileSync } from "fs";

import { answerQuestion } from "../pipeline";
import { runReadOnly } from "../executor";
import { groqLlm } from "../llm";
import { GOLDEN, compareResults, type GoldenCase } from "./golden";
import type { SqlClient } from "../types";

const args = process.argv.slice(2);
const quick = args.includes("--quick");
const resume = args.includes("--resume");
const retryFailed = args.includes("--retry-failed");
const only = (args.find((a) => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean);
const delayMs = Number((args.find((a) => a.startsWith("--delay=")) || "--delay=400").replace("--delay=", ""));
const RESULTS = "nl2sql-eval-results.json";

interface Row {
  caseId: string;
  question: string;
  pass: boolean;
  detail: string;
  attempts: number;
  ms: number;
  tokens: number;
  cached?: number;
  sql: string | null;
  understoodAs: string | null;
  outcome: string; // answered | clarify | unanswerable | error
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isDailyLimit = (msg: string) => /tokens per day|TPD/i.test(msg);

function writeReport(rows: Row[], model: string, stoppedEarly: string | null) {
  const total = rows.length;
  const passed = rows.filter((r) => r.pass).length;
  const real = rows.filter((r) => r.outcome !== "error" || !/could not be reached/.test(r.detail));
  const realPassed = real.filter((r) => r.pass).length;
  const firstTry = rows.filter((r) => r.pass && r.attempts === 1).length;
  const avgMs = total ? Math.round(rows.reduce((s, r) => s + r.ms, 0) / total) : 0;
  const tok = rows.filter((r) => r.tokens > 0);
  const avgTok = tok.length ? Math.round(tok.reduce((s, r) => s + r.tokens, 0) / tok.length) : 0;
  const avgCached = tok.length ? Math.round(tok.reduce((s, r) => s + (r.cached ?? 0), 0) / tok.length) : 0;
  const counted = Math.max(0, avgTok - avgCached);
  const byCase = new Map<string, Row[]>();
  rows.forEach((r) => byCase.set(r.caseId, [...(byCase.get(r.caseId) ?? []), r]));

  const md: string[] = [];
  md.push(`# Natural-language SQL: live evaluation`);
  if (stoppedEarly) md.push(`\n> **Stopped early:** ${stoppedEarly}\n`);
  md.push(`\n- Model: \`${model}\`\n- Updated: ${new Date().toISOString()}\n- **Wordings correct: ${passed} of ${total}** (${total ? Math.round((passed / total) * 100) : 0}%)`);
  md.push(`- Of those that got a real answer from the model (not a provider error): ${realPassed} of ${real.length}`);
  md.push(`- Passed on the first attempt: ${firstTry}\n- Average time per question: ${avgMs} ms\n- Tokens per question (all): ${avgTok}; of which cached: ${avgCached}${avgCached ? "" : " (the provider reported no cached tokens, so assume all of them count)"}\n- Tokens that COUNT toward the provider's limits (all minus cached): about ${counted}${counted ? ` -> a 200,000-token daily allowance is about ${Math.floor(200000 / counted)} questions\n` : "\n"}`);
  md.push(`## By question\n\n| Question | Passed | Notes |\n|---|---|---|`);
  for (const [id, rs] of byCase) md.push(`| ${id} | ${rs.filter((r) => r.pass).length}/${rs.length} | ${GOLDEN.find((g) => g.id === id)?.note ?? ""} |`);
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
  writeFileSync(RESULTS, JSON.stringify({ model, rows }, null, 2));
  writeFileSync("nl2sql-eval-report.json", JSON.stringify({ model, total, passed, firstTry, avgMs, avgTok, rows }, null, 2));
}

async function main() {
  const url = process.env.NL2SQL_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set NL2SQL_DATABASE_URL or DATABASE_URL");
  if (!process.env.GROQ_API_KEY) throw new Error("Set GROQ_API_KEY");

  const pg = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  await pg.connect();
  const db: SqlClient = { query: (t, p) => pg.query(t, p) as any };
  const withClient = async <T,>(fn: (c: SqlClient) => Promise<T>) => fn(db);
  let tokenCounter = 0;
  let cachedCounter = 0;
  const llm = groqLlm({ onUsage: (u) => { tokenCounter += u.total; cachedCounter += u.cached; } });
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  // --resume: keep wordings that already got a real answer; re-ask only missing ones and provider errors.
  let rows: Row[] = [];
  if (resume && existsSync(RESULTS)) {
    try {
      rows = (JSON.parse(readFileSync(RESULTS, "utf8")).rows as Row[]).filter((r) => r.outcome !== "error" && (!retryFailed || r.pass));
    } catch {
      rows = [];
    }
  }
  const done = new Set(rows.map((r) => r.question));

  const cases: GoldenCase[] = GOLDEN.filter((c) => !only.length || only.includes(c.id));
  const plan = cases.flatMap((c) => (quick ? c.variants.slice(0, 1) : c.variants).map((v) => ({ c, v }))).filter((x) => !done.has(x.v));
  console.log(`Model: ${model}   Wordings to ask: ${plan.length}${resume ? `   (already done: ${done.size})` : ""}${quick ? "   (quick)" : ""}\n`);

  const expectedCache = new Map<string, Record<string, unknown>[]>();
  let stopped: string | null = null;
  let asked = 0;

  for (const { c, v } of plan) {
    if (c.reference && !expectedCache.has(c.id)) {
      try {
        expectedCache.set(c.id, (await runReadOnly(db, c.reference, { rowLimit: 5000 })).rows);
      } catch (e: any) {
        console.log(`!! reference SQL for ${c.id} failed on your database: ${e.message}\n   (skipping this case)\n`);
        continue;
      }
    }
    const expected = expectedCache.get(c.id) ?? [];
    const t0 = Date.now();
    const before = tokenCounter;
    const beforeCached = cachedCounter;
    const res = await answerQuestion(v, "LIVE-EVAL", { llm, withClient, exec: { rowLimit: 5000 } });
    asked++;

    if (!res.ok && res.kind === "error" && isDailyLimit(res.message)) {
      stopped = "the model provider's DAILY token allowance is used up. Nothing is wrong with the model or the code.";
      console.log(`\nSTOP  ${stopped}`);
      break; // this wording was not really asked; --resume will ask it again
    }

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
    const tokens = tokenCounter - before;
    const cached = cachedCounter - beforeCached;
    rows.push({
      caseId: c.id, question: v, pass, detail, attempts: res.attempts, ms: Date.now() - t0, tokens, cached,
      sql: res.ok ? res.sql : (res.sql ?? null), understoodAs: (res as any).understoodAs ?? null,
      outcome: res.ok ? "answered" : res.kind,
    });
    writeReport(rows, model, null); // saved after every wording
    console.log(`${pass ? "PASS" : "FAIL"}  [${c.id}] ${v}\n        ${detail}  (${res.attempts} attempt${res.attempts === 1 ? "" : "s"}, ${Date.now() - t0} ms, ${tokens} tokens${cached ? `, ${cached} cached` : ""})`);
    await sleep(delayMs);
  }
  await pg.end();
  writeReport(rows, model, stopped);

  const passed = rows.filter((r) => r.pass).length;
  console.log(`\n${"=".repeat(60)}\n${passed} of ${rows.length} wordings correct so far (${rows.length ? Math.round((passed / rows.length) * 100) : 0}%)`);
  if (stopped) {
    const remaining = plan.length - asked + 1;
    console.log(`Stopped early with about ${remaining} wording(s) still to ask. Results so far are saved.`);
    console.log(`Later (the allowance refills gradually over 24 hours), continue with:\n  npx tsx --env-file=.env.local src/lib/nl2sql/eval/run-live.ts --resume --delay=20000`);
  }
  console.log("Report: nl2sql-eval-report.md   (raw data: nl2sql-eval-results.json)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
