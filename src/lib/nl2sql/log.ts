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
  /** 'nl2sql' (model wrote it) or 'cache' (a verified answer was re-run). */
  source?: "nl2sql" | "cache";
  /** The answer this one replaced after a "No". */
  retryOf?: number | null;
}

export async function logResult(client: SqlClient, e: LogEntry): Promise<number | null> {
  try {
    const r = await client.query(
      `INSERT INTO public.nl2sql_log
         (user_key, question, question_norm, sql, understood_as, confidence, ok, error, row_total, elapsed_ms, attempts, source, retry_of)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [e.userKey, e.question, normalizeQuestion(e.question), e.sql, e.understoodAs, e.confidence, e.ok, e.error, e.rowTotal, e.elapsedMs, e.attempts, e.source ?? "nl2sql", e.retryOf ?? null],
    );
    return r.rows[0]?.id != null ? Number(r.rows[0].id) : null;
  } catch {
    return null;
  }
}

/** Record a tick/cross. Only the person who asked can rate their own answer. */
export async function recordVerdict(
  client: SqlClient,
  logId: number,
  verdict: "confirm" | "reject",
  userKey: string | null,
  reason?: { code?: string | null; note?: string | null },
): Promise<boolean> {
  try {
    const r = await client.query(
      `UPDATE public.nl2sql_log SET verdict = $2, verdict_at = now(), reject_reason = $4, reject_note = $5
        WHERE id = $1 AND user_key IS NOT DISTINCT FROM $3 RETURNING id`,
      [logId, verdict, userKey, verdict === "reject" ? reason?.code ?? null : null, verdict === "reject" ? reason?.note ?? null : null],
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * SQL that must not be offered again for this exact question:
 *  - what THIS person already marked wrong (30 days), and
 *  - what at least TWO different people marked wrong and nobody confirmed (blocked for everyone).
 */
export async function loadRejectedSql(client: SqlClient, userKey: string | null, question: string): Promise<string[]> {
  const qn = normalizeQuestion(question);
  const out: string[] = [];
  try {
    if (userKey) {
      const r = await client.query(
        `SELECT DISTINCT sql FROM public.nl2sql_log
          WHERE user_key = $1 AND question_norm = $2 AND verdict = 'reject' AND sql IS NOT NULL
            AND created_at > now() - interval '30 days' LIMIT 5`,
        [userKey, qn],
      );
      out.push(...r.rows.map((x: any) => String(x.sql)));
    }
    const g = await client.query(
      `SELECT sql FROM public.nl2sql_log
        WHERE question_norm = $1 AND sql IS NOT NULL
        GROUP BY sql
       HAVING count(DISTINCT user_key) FILTER (WHERE verdict = 'reject') >= 2
          AND count(*) FILTER (WHERE verdict = 'confirm') = 0
        LIMIT 5`,
      [qn],
    );
    out.push(...g.rows.map((x: any) => String(x.sql)));
  } catch {
    /* best effort */
  }
  return Array.from(new Set(out));
}

/** One log row, e.g. the answer a person just rejected (to tell the model what NOT to repeat). */
export async function loadLogRow(client: SqlClient, id: number): Promise<{ id: number; question: string; sql: string | null; userKey: string | null } | null> {
  try {
    const r = await client.query(`SELECT id, question, sql, user_key FROM public.nl2sql_log WHERE id = $1`, [id]);
    const x = r.rows[0];
    return x ? { id: Number(x.id), question: String(x.question), sql: x.sql ? String(x.sql) : null, userKey: x.user_key ?? null } : null;
  } catch {
    return null;
  }
}
