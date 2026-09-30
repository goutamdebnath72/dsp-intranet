// src/lib/nl2sql/pipeline.ts
//
// question -> (LLM writes SQL) -> guard -> read-only execution -> answer.
// If the SQL is rejected by the guard or fails in the database, the model is
// shown the exact problem and gets up to two more attempts. Everything
// external (the model, the database) is injected so the whole flow can be
// tested without either.

import type { LlmFn, PipelineResult, SqlClient } from "./types";
import { guardSql } from "./guard";
import { runReadOnly, type ExecOptions } from "./executor";
import { loadDynamicContext } from "./context";
import { loadConfirmedExamples, pickExamples } from "./examples";
import { buildPrompt } from "./prompt";
import { parsePlan } from "./generator";
import { logResult, loadRejectedSql } from "./log";
import { normalizeSql } from "./text";
import { checkQuotedTerms } from "./quoted";

export interface PipelineDeps {
  llm: LlmFn;
  withClient: <T>(fn: (c: SqlClient) => Promise<T>) => Promise<T>;
  exec?: ExecOptions;
  maxAttempts?: number;
}

// Omit<> collapses a union to its common keys; this keeps each variant intact.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const MAX_QUESTION_CHARS = 500;
const firstLine = (s: unknown) => String((s as any)?.message ?? s).split("\n")[0].slice(0, 300);

export async function answerQuestion(question: string, userKey: string | null, deps: PipelineDeps): Promise<PipelineResult> {
  const started = Date.now();
  const q = (question || "").trim();
  const elapsed = () => Date.now() - started;

  if (!q) return { ok: false, kind: "error", question: q, message: "Please type a question.", attempts: 0, elapsedMs: 0, logId: null };
  if (q.length > MAX_QUESTION_CHARS) {
    return { ok: false, kind: "error", question: q, message: `The question is too long (over ${MAX_QUESTION_CHARS} characters).`, attempts: 0, elapsedMs: 0, logId: null };
  }

  const finish = async (r: DistributiveOmit<PipelineResult, "logId" | "elapsedMs">, logExtra: { ok: boolean; error: string | null; rowTotal: number | null; understoodAs: string | null; confidence: string | null }): Promise<PipelineResult> => {
    const logId = await deps
      .withClient((c) =>
        logResult(c, {
          userKey, question: q, sql: (r as any).sql ?? null, understoodAs: logExtra.understoodAs, confidence: logExtra.confidence,
          ok: logExtra.ok, error: logExtra.error, rowTotal: logExtra.rowTotal, elapsedMs: elapsed(), attempts: (r as any).attempts,
        }),
      )
      .catch(() => null);
    return { ...(r as any), elapsedMs: elapsed(), logId } as PipelineResult;
  };

  // ---- gather live context (cached), confirmed examples, this person's rejections
  let prep;
  try {
    prep = await deps.withClient(async (c) => ({
      ctx: await loadDynamicContext(c),
      confirmed: await loadConfirmedExamples(c),
      rejected: await loadRejectedSql(c, userKey, q),
    }));
  } catch (e) {
    return { ok: false, kind: "error", question: q, message: `Could not prepare the query environment: ${firstLine(e)}`, attempts: 0, elapsedMs: elapsed(), logId: null };
  }
  const examples = pickExamples(q, prep.confirmed);
  const rejectedNorm = new Set(prep.rejected.map(normalizeSql));

  const maxAttempts = deps.maxAttempts ?? 3;
  let repair: { previousSql: string; problem: string } | undefined;
  let lastProblem = "The model did not produce a usable query.";
  let lastSql: string | null = null;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const prompt = buildPrompt({ question: q, context: prep.ctx, examples, rejectedSql: prep.rejected, repair });

    let raw: string;
    try {
      raw = await deps.llm(prompt);
    } catch (e) {
      return finish(
        { ok: false, kind: "error", question: q, message: `The language model could not be reached: ${firstLine(e)}`, attempts },
        { ok: false, error: `llm: ${firstLine(e)}`, rowTotal: null, understoodAs: null, confidence: null },
      );
    }

    const plan = parsePlan(raw);
    if (!plan) {
      lastProblem = "The reply was not a valid JSON object with the required fields.";
      repair = { previousSql: lastSql ?? "(none)", problem: lastProblem };
      continue;
    }

    if (!plan.sql) {
      if (plan.needs_clarification) {
        return finish(
          { ok: false, kind: "clarify", question: q, message: plan.needs_clarification, understoodAs: plan.understood_as, attempts },
          { ok: false, error: "clarify", rowTotal: null, understoodAs: plan.understood_as, confidence: plan.confidence },
        );
      }
      return finish(
        { ok: false, kind: "unanswerable", question: q, message: plan.unanswerable_reason || "This question cannot be answered from the available data.", understoodAs: plan.understood_as, attempts },
        { ok: false, error: "unanswerable", rowTotal: null, understoodAs: plan.understood_as, confidence: plan.confidence },
      );
    }

    const g = guardSql(plan.sql);
    lastSql = plan.sql;
    if (!g.ok) {
      lastProblem = g.reason;
      repair = { previousSql: plan.sql, problem: `The SQL was rejected by the safety check: ${g.reason}` };
      continue;
    }
    const quotedProblem = checkQuotedTerms(q, g.sql);
    if (quotedProblem) {
      lastProblem = quotedProblem;
      repair = { previousSql: g.sql, problem: quotedProblem };
      continue;
    }
    if (rejectedNorm.has(normalizeSql(g.sql))) {
      lastProblem = "This is the same SQL the person already marked wrong.";
      repair = { previousSql: g.sql, problem: "The person already marked exactly this SQL as wrong for this question. Give a different reading, or ask a clarifying question." };
      continue;
    }

    try {
      const data = await deps.withClient((c) => runReadOnly(c, g.sql, deps.exec));
      return finish(
        { ok: true, question: q, sql: g.sql, understoodAs: plan.understood_as, confidence: plan.confidence, data, attempts } as any,
        { ok: true, error: null, rowTotal: data.total, understoodAs: plan.understood_as, confidence: plan.confidence },
      );
    } catch (e) {
      lastProblem = `The database rejected it: ${firstLine(e)}`;
      repair = { previousSql: g.sql, problem: lastProblem };
    }
  }

  return finish(
    { ok: false, kind: "error", question: q, message: `I could not turn this into a working query after ${attempts} attempts. Last problem: ${lastProblem}`, sql: lastSql, attempts },
    { ok: false, error: lastProblem, rowTotal: null, understoodAs: null, confidence: null },
  );
}
