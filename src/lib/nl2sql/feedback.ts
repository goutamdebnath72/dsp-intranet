// src/lib/nl2sql/feedback.ts -- a Yes/No on any omnibar answer (best-effort; never breaks the page).
import type { SqlClient } from "./types";
import { normalizeQuestion } from "./text";
import { recordVerdict } from "./log";
import { isAnswerSource, isReasonCode, type AnswerSource, type ReasonCode } from "./learning";

export interface FeedbackInput {
  userKey: string | null;
  query: string;
  source: AnswerSource;
  verdict: "yes" | "no";
  reasonCode?: ReasonCode | null;
  note?: string | null;
  /** The nl2sql_log row of the answer, when a model-written (or cached) answer was rated. */
  nl2sqlLogId?: number | null;
  /** 1 for the first answer, 2 for the second attempt after a "No", ... */
  attempt?: number;
}

export function parseFeedback(body: any, userKey: string | null): FeedbackInput | null {
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 500) : "";
  if (!query) return null;
  if (!isAnswerSource(body?.source)) return null;
  if (body?.verdict !== "yes" && body?.verdict !== "no") return null;
  const reasonCode = isReasonCode(body?.reasonCode) ? body.reasonCode : null;
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  const logId = Number(body?.nl2sqlLogId);
  const attempt = Number(body?.attempt);
  return {
    userKey,
    query,
    source: body.source,
    verdict: body.verdict,
    reasonCode: body.verdict === "no" ? reasonCode : null,
    note: body.verdict === "no" ? note : null,
    nl2sqlLogId: Number.isInteger(logId) && logId > 0 ? logId : null,
    attempt: Number.isInteger(attempt) && attempt >= 1 && attempt <= 9 ? attempt : 1,
  };
}

/** Stores the click; for model-written / cached answers it also sets the verdict on the log row (the learning loop reads that). */
export async function recordFeedback(client: SqlClient, f: FeedbackInput): Promise<{ id: number | null; verdictRecorded: boolean }> {
  let id: number | null = null;
  try {
    const r = await client.query(
      `INSERT INTO public.omnibar_feedback (user_key, query, query_norm, source, verdict, reason_code, note, nl2sql_log_id, attempt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [f.userKey, f.query, normalizeQuestion(f.query), f.source, f.verdict, f.reasonCode ?? null, f.note ?? null, f.nl2sqlLogId ?? null, f.attempt ?? 1],
    );
    id = r.rows[0]?.id != null ? Number(r.rows[0].id) : null;
  } catch {
    /* best effort */
  }
  let verdictRecorded = false;
  if (f.nl2sqlLogId && (f.source === "nl2sql" || f.source === "cache")) {
    verdictRecorded = await recordVerdict(client, f.nl2sqlLogId, f.verdict === "yes" ? "confirm" : "reject", f.userKey, { code: f.reasonCode ?? null, note: f.note ?? null });
  }
  return { id, verdictRecorded };
}

/** At most this many votes per person per hour (a brake on accidents and on abuse). */
export const VOTES_PER_HOUR = 30;

export async function countRecentVotes(client: SqlClient, userKey: string): Promise<number> {
  try {
    const r = await client.query(
      `SELECT count(*)::int AS n FROM public.omnibar_feedback WHERE user_key = $1 AND created_at > now() - interval '1 hour'`,
      [userKey],
    );
    return Number(r.rows[0]?.n) || 0;
  } catch {
    return 0;
  }
}

/**
 * Takes back a vote. Only the person who cast it can: their feedback row is removed and the verdict
 * on the answer's log row is cleared, so the vote stops counting (votes.ts only counts rows with a verdict).
 */
export async function undoFeedback(
  client: SqlClient,
  userKey: string,
  feedbackId: number | null,
  nl2sqlLogId: number | null,
): Promise<{ undone: boolean }> {
  let undone = false;
  try {
    if (feedbackId) {
      const r = await client.query(`DELETE FROM public.omnibar_feedback WHERE id = $1 AND user_key = $2 RETURNING id`, [feedbackId, userKey]);
      if (r.rows.length > 0) undone = true;
    }
    if (nl2sqlLogId) {
      const r = await client.query(
        `UPDATE public.nl2sql_log SET verdict = NULL, verdict_at = NULL, reject_reason = NULL, reject_note = NULL
          WHERE id = $1 AND user_key = $2 AND verdict IS NOT NULL RETURNING id`,
        [nl2sqlLogId, userKey],
      );
      if (r.rows.length > 0) undone = true;
    }
  } catch {
    /* best effort */
  }
  return { undone };
}
