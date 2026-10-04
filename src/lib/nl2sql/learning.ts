// src/lib/nl2sql/learning.ts
//
// What the system learns from people's Yes / No. No model is retrained; "learning" here means three
// concrete, inspectable mechanisms that change what the next answer looks like:
//
//   YES  -> the question + SQL becomes a worked example for similar questions (examples.ts), and once enough
//           DIFFERENT people have confirmed the same SQL for the same question (and nobody rejected it) it
//           becomes a VERIFIED answer: re-run directly, without calling the model (findVerifiedSql).
//   NO   -> (a) the rejected SQL is never offered again to that person for that question, and after two
//           different people reject it, to nobody; (b) rejected readings of SIMILAR questions are shown to the
//           model as mistakes to avoid (loadNegativeExamples / pickNegatives); (c) the person's reason picks
//           a different second attempt (retryHint, and the route chosen in omnibar.ts).
//   Everything is stored in public.nl2sql_log / public.omnibar_feedback and summarised by
//   eval/feedback-report.ts so a human can turn recurring failures into tests and rules.

import type { SqlClient } from "./types";
import { normalizeQuestion } from "./text";
import { similarity } from "./examples";

export const REASON_CODES = ["wrong_result", "wrong_department", "wrong_name", "wanted_documents", "wanted_employees", "other"] as const;
export type ReasonCode = (typeof REASON_CODES)[number];
export const isReasonCode = (x: unknown): x is ReasonCode => typeof x === "string" && (REASON_CODES as readonly string[]).includes(x);

export const ANSWER_SOURCES = ["nl2sql", "cache", "holiday", "legacy", "circular", "none"] as const;
export type AnswerSource = (typeof ANSWER_SOURCES)[number];
export const isAnswerSource = (x: unknown): x is AnswerSource => typeof x === "string" && (ANSWER_SOURCES as readonly string[]).includes(x);

/** Different people who must confirm the same answer before it is served without the model. */
export function verifiedMinConfirms(): number {
  const n = Number(process.env.NL2SQL_VERIFIED_MIN_CONFIRMS);
  return Number.isInteger(n) && n >= 1 ? n : 2;
}

const REASON_HINTS: Record<ReasonCode, string> = {
  wrong_result:
    "The result was wrong. Re-read the question for conditions you may have dropped or changed (designation, cohort, department, name condition, count versus list) and give a genuinely DIFFERENT reading.",
  wrong_department:
    "The department scope was wrong. Re-resolve which departments the question names: consider every section of that department, the short forms and abbreviations in the department list, and widen or narrow the filter accordingly.",
  wrong_name:
    "The name matching was wrong. If you matched by similar spelling, consider exact matching (name_words in UPPER CASE); if you matched exactly, consider similar spelling. Also reconsider the position of the word (first, middle, last, anywhere).",
  wanted_documents: "The person wanted documents (circulars), not an employee answer.",
  wanted_employees:
    "The person expected an answer from the employee directory, not documents. Treat the question as an employee question and answer it from the data if at all possible; use out_of_scope only if it truly has nothing to do with employees.",
  other: "The answer was not what the person meant.",
};

/** The sentence added to the prompt for a second attempt, from the reason and the person's own words. */
export function retryHint(reason: ReasonCode | null, note: string | null): string {
  const base = REASON_HINTS[reason ?? "other"];
  const words = (note || "").replace(/\s+/g, " ").trim().slice(0, 300);
  return words ? `${base} In their own words: "${words}". The rejected SQL is listed above; do not repeat it.` : `${base} The rejected SQL is listed above; do not repeat it.`;
}

// ---- NO: mistakes to avoid ------------------------------------------------------------------------------

export interface NegativeExample {
  question: string;
  sql: string;
  reason: string | null;
}

/** Recently rejected question/SQL pairs (newest first, distinct). */
export async function loadNegativeExamples(client: SqlClient, limit = 200): Promise<NegativeExample[]> {
  try {
    const r = await client.query(
      `SELECT question, sql, reject_reason, reject_note FROM public.nl2sql_log
        WHERE verdict = 'reject' AND sql IS NOT NULL
        ORDER BY verdict_at DESC NULLS LAST, id DESC LIMIT $1`,
      [limit],
    );
    const seen = new Set<string>();
    const out: NegativeExample[] = [];
    for (const x of r.rows) {
      const key = normalizeQuestion(String(x.question)) + "|" + String(x.sql).replace(/\s+/g, " ").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const why = [x.reject_reason ? String(x.reject_reason).replace(/_/g, " ") : null, x.reject_note ? String(x.reject_note).slice(0, 120) : null].filter(Boolean).join(": ");
      out.push({ question: String(x.question), sql: String(x.sql), reason: why || null });
    }
    return out;
  } catch {
    return [];
  }
}

/** The rejected readings of the most SIMILAR earlier questions (a similar question, not necessarily this one). */
export function pickNegatives(question: string, negatives: NegativeExample[], k = 2, minSimilarity = 0.34): NegativeExample[] {
  return negatives
    .map((n) => ({ n, s: similarity(question, n.question) }))
    .filter((x) => x.s >= minSimilarity)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.n);
}

// ---- YES: verified answers ------------------------------------------------------------------------------

export interface VerifiedAnswer {
  sql: string;
  understoodAs: string;
  confirms: number;
}

/**
 * A stored SQL for this exact (normalized) question that at least `minConfirms` DIFFERENT people confirmed and
 * that NOBODY rejected. It is served by re-running the SQL (always fresh data), without calling the model.
 * A single later "No" removes it from this list, so a verified answer can always be revoked.
 */
export async function findVerifiedSql(client: SqlClient, question: string, minConfirms: number): Promise<VerifiedAnswer | null> {
  try {
    const r = await client.query(
      `SELECT sql,
              count(DISTINCT user_key) FILTER (WHERE verdict = 'confirm')            AS confirms,
              (array_agg(understood_as ORDER BY id DESC) FILTER (WHERE verdict = 'confirm'))[1] AS understood_as
         FROM public.nl2sql_log
        WHERE question_norm = $1 AND sql IS NOT NULL AND ok
        GROUP BY sql
       HAVING count(DISTINCT user_key) FILTER (WHERE verdict = 'confirm') >= $2
          AND count(*) FILTER (WHERE verdict = 'reject') = 0
        ORDER BY confirms DESC LIMIT 1`,
      [normalizeQuestion(question), minConfirms],
    );
    const x = r.rows[0];
    return x ? { sql: String(x.sql), understoodAs: String(x.understood_as || ""), confirms: Number(x.confirms) } : null;
  } catch {
    return null;
  }
}
