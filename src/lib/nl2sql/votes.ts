// src/lib/nl2sql/votes.ts
//
// ONE rule for how Yes / No votes on a model-written answer are counted, used by both "verified"
// (learning.ts) and "blocked" (log.ts) so they can never disagree:
//
//   * a PERSON counts once per (question, SQL): the same person voting on five asks of the same
//     question is still one voice;
//   * the LATEST vote of that person wins, so changing your mind (or clicking Undo, which clears the
//     verdict) simply replaces the earlier vote;
//   * rows with no user (votes from before sign-in was required) count together as ONE person.
//
// Parameter $1 of the query that embeds this must be the normalized question.

export function latestVotesCte(okOnly: boolean): string {
  return `votes AS (
  SELECT DISTINCT ON (COALESCE(user_key, 'anonymous'), sql)
         COALESCE(user_key, 'anonymous') AS person, sql, verdict
    FROM public.nl2sql_log
   WHERE question_norm = $1 AND sql IS NOT NULL AND verdict IS NOT NULL${okOnly ? " AND ok" : ""}
   ORDER BY COALESCE(user_key, 'anonymous'), sql, verdict_at DESC NULLS LAST, id DESC
)`;
}
