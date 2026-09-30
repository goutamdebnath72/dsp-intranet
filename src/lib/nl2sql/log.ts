// src/lib/nl2sql/log.ts -- best-effort persistence; never breaks an answer.
import type { SqlClient } from "./types";
import { normalizeQuestion } from "./text";

export interface LogEntry {
  userKey: string | null;
  question: string;
  sql: string | null;
  understoodAs: string | null;
  confidence: string | null;
  ok: boolean;
  error: string | null;
  rowTotal: number | null;
  elapsedMs: number;
  attempts: number;
}

export async function logResult(client: SqlClient, e: LogEntry): Promise<number | null> {
  try {
    const r = await client.query(
      `INSERT INTO public.nl2sql_log
         (user_key, question, question_norm, sql, understood_as, confidence, ok, error, row_total, elapsed_ms, attempts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [e.userKey, e.question, normalizeQuestion(e.question), e.sql, e.understoodAs, e.confidence, e.ok, e.error, e.rowTotal, e.elapsedMs, e.attempts],
    );
    return r.rows[0]?.id != null ? Number(r.rows[0].id) : null;
  } catch {
    return null;
  }
}

/** Record a tick/cross. Only the person who asked can rate their own answer. */
export async function recordVerdict(client: SqlClient, logId: number, verdict: "confirm" | "reject", userKey: string | null): Promise<boolean> {
  try {
    const r = await client.query(
      `UPDATE public.nl2sql_log SET verdict = $2, verdict_at = now()
        WHERE id = $1 AND user_key IS NOT DISTINCT FROM $3 RETURNING id`,
      [logId, verdict, userKey],
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

/** SQL this person already marked wrong for this exact question (30 days). */
export async function loadRejectedSql(client: SqlClient, userKey: string | null, question: string): Promise<string[]> {
  if (!userKey) return [];
  try {
    const r = await client.query(
      `SELECT DISTINCT sql FROM public.nl2sql_log
        WHERE user_key = $1 AND question_norm = $2 AND verdict = 'reject' AND sql IS NOT NULL
          AND created_at > now() - interval '30 days' LIMIT 5`,
      [userKey, normalizeQuestion(question)],
    );
    return r.rows.map((x: any) => String(x.sql));
  } catch {
    return [];
  }
}
