// src/lib/nl2sql/eval/review.ts
//
// REVIEW RUN: take a text file of REAL questions (one per line), ask the real model about each, and
// write a review sheet: the question, what the model says it understood, the exact SQL, and the
// result size. Unlike run-live.ts there is no reference answer -- a person (or a reviewer reading the
// sheet) judges whether each reading and SQL is right. It is how real wording gets tested.
//
//   npx tsx --env-file=.env.local src/lib/nl2sql/eval/review.ts nl2sql-eval-questions.txt
//   npx tsx --env-file=.env.local src/lib/nl2sql/eval/review.ts nl2sql-eval-questions.txt --rows=3
//   npx tsx --env-file=.env.local src/lib/nl2sql/eval/review.ts nl2sql-eval-questions.txt --resume
//
// The questions file: one question per line; blank lines and lines starting with # are ignored.
// By DEFAULT the sheet contains no employee data (no names, no rows): only the question, the model's
// reading, the SQL, and the number of rows. --rows=N adds the first N result rows to the sheet.
// Results are saved after every question; if the provider's daily token allowance runs out the run
// stops cleanly and --resume continues later. Only the read-only nlq_reader role touches your data.
// Output (git-ignored by the pattern nl2sql-eval-*): nl2sql-eval-review.md and nl2sql-eval-review-results.json

import { Client } from "pg";
import { existsSync, readFileSync, writeFileSync } from "fs";

import { answerQuestion } from "../pipeline";
import { groqLlm } from "../llm";
import type { SqlClient } from "../types";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const resume = args.includes("--resume");
const previewRows = Math.max(0, Number((args.find((a) => a.startsWith("--rows=")) || "--rows=0").replace("--rows=", "")) || 0);
const delayMs = Number((args.find((a) => a.startsWith("--delay=")) || "--delay=400").replace("--delay=", ""));
const RESULTS = "nl2sql-eval-review-results.json";
const REPORT = "nl2sql-eval-review.md";

interface Item {
  question: string;
  outcome: "answered" | "clarify" | "unanswerable" | "error";
  message: string | null;
  understoodAs: string | null;
  confidence: string | null;
  attempts: number;
  ms: number;
  tokens: number;
  cached: number;
  sql: string | null;
  total: number | null;
  columns: string[];
  preview: Record<string, unknown>[];
  scope?: string[] | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isDailyLimit = (msg: string) => /tokens per day|TPD/i.test(msg);
const PERSON_COLUMN = /^(ticket_no|name|sail_pno|id)$/i;
const isAggregate = (columns: string[]) => columns.length > 0 && !columns.some((c) => PERSON_COLUMN.test(c));
const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v)).replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 60);

function writeReport(items: Item[], model: string, stopped: string | null) {
  const by = (o: Item["outcome"]) => items.filter((i) => i.outcome === o).length;
  const withTok = items.filter((i) => i.tokens > 0);
  const avgTok = withTok.length ? Math.round(withTok.reduce((s, i) => s + i.tokens, 0) / withTok.length) : 0;
  const avgCached = withTok.length ? Math.round(withTok.reduce((s, i) => s + i.cached, 0) / withTok.length) : 0;
  const md: string[] = [];
  md.push("# Review sheet: real questions run through the language model");
  if (stopped) md.push(`\n> **Stopped early:** ${stopped}\n`);
  md.push(
    `\n- Model: \`${model}\`   Updated: ${new Date().toISOString()}\n- Questions: ${items.length} (answered ${by("answered")}, asked to clarify ${by("clarify")}, declined as unanswerable ${by("unanswerable")}, errors ${by("error")})\n` +
      `- Tokens per question: ${avgTok} (cached ${avgCached}, so about ${Math.max(0, avgTok - avgCached)} count toward the provider's limit)\n` +
      `- Employee data in this sheet: ${previewRows ? `the first ${previewRows} rows of each list of people, plus aggregate numbers` : "none (only aggregate numbers such as counts, with SQL)"}\n`,
  );
  md.push("For each item: is the **Understood as** line what the person meant, and does the **SQL** do what that line says?\n");
  items.forEach((it, n) => {
    md.push(`## ${n + 1}. ${it.question}`);
    md.push(`- Outcome: **${it.outcome}**${it.confidence ? ` (confidence ${it.confidence})` : ""}, ${it.attempts} attempt(s), ${it.ms} ms`);
    if (it.understoodAs) md.push(`- Understood as: ${it.understoodAs}`);
    if (it.message) md.push(`- Message: ${it.message}`);
    if (it.scope && it.scope.length) md.push(`- Departments covered (${it.scope.length}): ${it.scope.slice(0, 15).join("; ")}${it.scope.length > 15 ? "; …" : ""}`);
    if (it.total !== null) md.push(`- Result: **${it.total}** row(s)${it.columns.length ? ` — columns: ${it.columns.join(", ")}` : ""}`);
    if (it.sql) md.push(`\n\`\`\`sql\n${it.sql}\n\`\`\``);
    if (it.preview.length) {
      md.push(`\n| ${it.columns.join(" | ")} |\n|${it.columns.map(() => "---").join("|")}|`);
      it.preview.forEach((r) => md.push(`| ${it.columns.map((c) => cell(r[c])).join(" | ")} |`));
    }
    md.push("");
  });
  writeFileSync(REPORT, md.join("\n"));
  writeFileSync(RESULTS, JSON.stringify({ model, items }, null, 2));
}

async function main() {
  if (!file) throw new Error("Usage: review.ts <questions-file> [--rows=N] [--resume] [--delay=ms]");
  if (!existsSync(file)) throw new Error(`Questions file not found: ${file}`);
  const url = process.env.NL2SQL_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set NL2SQL_DATABASE_URL or DATABASE_URL");
  if (!process.env.GROQ_API_KEY) throw new Error("Set GROQ_API_KEY");

  const questions = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (!questions.length) throw new Error("The questions file has no questions.");

  const pg = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  await pg.connect();
  const db: SqlClient = { query: (t, p) => pg.query(t, p) as any };
  const withClient = async <T,>(fn: (c: SqlClient) => Promise<T>) => fn(db);
  let tokens = 0;
  let cached = 0;
  const llm = groqLlm({ onUsage: (u) => { tokens += u.total; cached += u.cached; } });
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  let items: Item[] = [];
  if (resume && existsSync(RESULTS)) {
    try {
      items = (JSON.parse(readFileSync(RESULTS, "utf8")).items as Item[]).filter((i) => i.outcome !== "error");
    } catch {
      items = [];
    }
  }
  const done = new Set(items.map((i) => i.question));
  const todo = questions.filter((q) => !done.has(q));
  console.log(`Model: ${model}   Questions in file: ${questions.length}   to ask now: ${todo.length}${resume ? `   (already done: ${done.size})` : ""}\n`);

  let stopped: string | null = null;
  for (const q of todo) {
    const t0 = Date.now();
    const tb = tokens;
    const cb = cached;
    const res = await answerQuestion(q, "REVIEW-RUN", { llm, withClient, exec: { rowLimit: Math.max(previewRows, 20) } });
    if (!res.ok && res.kind === "error" && isDailyLimit(res.message)) {
      stopped = "the model provider's DAILY token allowance is used up. Nothing is wrong with the model or the code.";
      console.log(`\nSTOP  ${stopped}`);
      break;
    }
    const base = { question: q, attempts: res.attempts, ms: Date.now() - t0, tokens: tokens - tb, cached: cached - cb };
    const item: Item = res.ok
      ? { ...base, outcome: "answered", message: null, understoodAs: res.understoodAs, confidence: res.confidence, sql: res.sql, total: res.data.total, columns: res.data.columns, preview: res.data.rows.slice(0, isAggregate(res.data.columns) ? 20 : previewRows), scope: res.scope ? res.scope.departments.map((d) => d.name) : null }
      : { ...base, outcome: res.kind, message: res.message, understoodAs: res.understoodAs ?? null, confidence: null, sql: res.sql ?? null, total: null, columns: [], preview: [] };
    items.push(item);
    writeReport(items, model, null);
    console.log(`${String(items.length).padStart(3)}. [${item.outcome}] ${q}\n       ${item.understoodAs ?? item.message ?? ""}${item.total !== null ? `  -> ${item.total} row(s)` : ""}  (${item.attempts} attempt${item.attempts === 1 ? "" : "s"}, ${item.tokens} tokens)`);
    await sleep(delayMs);
  }
  await pg.end();
  writeReport(items, model, stopped);
  console.log(`\n${"=".repeat(60)}\n${items.length} of ${questions.length} questions done.`);
  if (stopped) console.log(`Continue later (the allowance refills gradually) with:\n  npx tsx --env-file=.env.local src/lib/nl2sql/eval/review.ts ${file} --resume --delay=20000`);
  console.log(`Review sheet: ${REPORT}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
