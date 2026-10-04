// src/lib/nl2sql/examples.ts
//
// Worked examples shown to the model. SEED_EXAMPLES are hand-written and are
// verified by the self-test (each must pass the guard AND run on the test
// database). CONFIRMED examples are real questions a person ticked as correct
// (public.nl2sql_log, verdict = 'confirm'); the most similar ones are added to
// every prompt -- that is how the system improves with use, with no code change.

import type { SqlClient } from "./types";
import { normalizeQuestion } from "./text";

export interface Example {
  question: string;
  sql: string | null;
  understood_as: string;
  /** Set for "cannot be answered" examples (sql is null). */
  unanswerable_reason?: string;
  /** Set for "not about employees" examples (sql is null). */
  out_of_scope?: boolean;
  source: "seed" | "confirmed";
}

const PEOPLE = "ticket_no, name, designation, department";

export const SEED_EXAMPLES: Example[] = [
  {
    question: "find the names of employees which have kumar at the middle",
    sql: `SELECT ${PEOPLE}
FROM nlq.employees
WHERE nlq.word_like(name_words, name_codes, 'kumar')
  AND NOT nlq.first_word_like(name_words, name_codes, 'kumar')
  AND NOT nlq.last_word_like(name_words, name_codes, 'kumar')
ORDER BY global_seniority_rank`,
    understood_as:
      'Employees whose name has "kumar" (or a similar spelling) as a word, but not as the first word and not as the last word.',
    source: "seed",
  },
  {
    question: 'find the names which end with "debnath" but not "nath" as a word',
    sql: `SELECT ${PEOPLE}
FROM nlq.employees
WHERE name_words[cardinality(name_words)] = 'DEBNATH'
  AND NOT ('NATH' = ANY(name_words))
ORDER BY global_seniority_rank`,
    understood_as:
      'Employees whose last word is exactly DEBNATH and who have no word that is exactly NATH. Both names are matched exactly, because one is wanted and the other excluded.',
    source: "seed",
  },
  {
    question: 'find the names which end with "kumar"',
    sql: `SELECT ${PEOPLE}
FROM nlq.employees
WHERE name_words[cardinality(name_words)] = 'KUMAR'
ORDER BY global_seniority_rank`,
    understood_as:
      'Employees whose last word is exactly KUMAR, letter for letter (no similar spellings), because the name is in double quotes.',
    source: "seed",
  },
  {
    question: "find the names which end with kumar",
    sql: `SELECT ${PEOPLE}
FROM nlq.employees
WHERE nlq.last_word_like(name_words, name_codes, 'kumar')
ORDER BY global_seniority_rank`,
    understood_as: 'Employees whose last word is "kumar" or a similar spelling.',
    source: "seed",
  },
  {
    question: "GMs in C&IT whose name ends with nath",
    sql: `SELECT ${PEOPLE}
FROM nlq.employees
WHERE designation = 'General Manager'
  AND department_id IN (SELECT id FROM nlq.departments WHERE code IN (98500, 98530, 98540))
  AND nlq.last_word_like(name_words, name_codes, 'nath')
ORDER BY global_seniority_rank`,
    understood_as:
      'General Managers in the C&IT department (all its sections) whose last word is "nath" or a similar spelling (such as Debnath).',
    source: "seed",
  },
  {
    question: "how many executives are there in C&IT",
    sql: `SELECT count(*) AS count
FROM nlq.employees
WHERE cohort = 'executive'
  AND department_id IN (SELECT id FROM nlq.departments WHERE code IN (98500, 98530, 98540))`,
    understood_as: "The number of executives in the C&IT department (all its sections).",
    source: "seed",
  },
  {
    question: "designation wise count of employees in plant garage",
    sql: `SELECT designation, count(*) AS count
FROM nlq.employees
WHERE department_id IN (SELECT id FROM nlq.departments WHERE code IN (85000, 85070, 85110, 85200, 85330, 85430))
GROUP BY designation, rank_order
ORDER BY rank_order, designation`,
    understood_as: "Employees of Plant Garage (all six garage sections) counted by designation, most senior designation first.",
    source: "seed",
  },
  {
    question: 'find names which contain "nath" but not at the end, as a whole word or as part of a word',
    sql: `SELECT ${PEOPLE}
FROM nlq.employees
WHERE upper(name) LIKE '%NATH%'
  AND NOT (upper(btrim(name)) LIKE '%NATH')
ORDER BY global_seniority_rank`,
    understood_as:
      'Employees whose name contains the text "nath" but does not end with "nath" (neither as a whole last word nor as the end of a word). Matched exactly, as literal text.',
    source: "seed",
  },
  {
    question: "how many DGMs in mechanical",
    sql: `SELECT count(*) AS count
FROM nlq.employees
WHERE designation = 'Dy. General Manager'
  AND department_id IN (SELECT id FROM nlq.departments WHERE nlq.norm(name) LIKE '%mech%')`,
    understood_as:
      "The number of Dy. General Managers in every department whose name contains MECH (mechanical, including abbreviated names such as '(MECH)'); matched on the stem because department names abbreviate the word.",
    source: "seed",
  },
  {
    question: "who are the 10 most senior non executives",
    sql: `SELECT ${PEOPLE}
FROM nlq.employees
WHERE cohort = 'nonexecutive'
ORDER BY global_seniority_rank
LIMIT 10`,
    understood_as: "The 10 most senior non-executives, by seniority rank.",
    source: "seed",
  },
  {
    question: "how many executives have no NIC email",
    sql: `SELECT count(*) AS count
FROM nlq.employees
WHERE cohort = 'executive' AND NOT has_email_nic`,
    understood_as: "The number of executives with no NIC (sail.in) email address on record.",
    source: "seed",
  },
  {
    question: "who is senior to sanjay debnath",
    sql: `SELECT ${PEOPLE}
FROM nlq.employees
WHERE global_seniority_rank < (
  SELECT global_seniority_rank FROM nlq.employees WHERE name_words = ARRAY['SANJAY', 'DEBNATH'] LIMIT 1
)
ORDER BY global_seniority_rank`,
    understood_as: "Everyone ranked more senior than the employee named SANJAY DEBNATH, most senior first.",
    source: "seed",
  },
  {
    question: "what is the leave policy for contract workers",
    sql: null,
    understood_as: "A question about a policy, not about employees in the directory.",
    out_of_scope: true,
    source: "seed",
  },
  {
    question: "what is the salary of sanjay debnath",
    sql: null,
    understood_as: "A request for an employee's salary.",
    unanswerable_reason: "This data does not include salary, pay or any other compensation information.",
    source: "seed",
  },
];

const STOP = new Set(["the", "of", "in", "a", "an", "and", "or", "who", "are", "is", "me", "show", "list", "find", "get", "give", "all", "which", "have", "has", "with", "that", "to", "for", "names", "name", "employees", "employee", "people"]);

function tokens(q: string): Set<string> {
  return new Set(
    normalizeQuestion(q)
      .replace(/"/g, " ")
      .split(" ")
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );
}

/** Jaccard similarity of the meaningful words of two questions. */
export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Choose up to `k` examples: always the best seeds (they teach the grammar)
 *  plus the most similar confirmed ones (they teach this database's usage). */
export function pickExamples(question: string, confirmed: Example[], k = 5): Example[] {
  const scored = [...SEED_EXAMPLES, ...confirmed]
    .map((e) => ({ e, s: similarity(question, e.question) + (e.source === "confirmed" ? 0.05 : 0) }))
    .sort((x, y) => y.s - x.s);
  const chosen = scored.slice(0, k).map((x) => x.e);
  // Always keep the two "no SQL" exemplars so the model knows null is legal and when to use each.
  const unans = SEED_EXAMPLES.find((e) => e.sql === null && !e.out_of_scope);
  const oos = SEED_EXAMPLES.find((e) => e.sql === null && e.out_of_scope);
  if (unans && !chosen.includes(unans)) chosen[chosen.length - 1] = unans;
  if (oos && !chosen.includes(oos)) chosen[chosen.length - 2] = oos;
  return chosen;
}

/** Ticked question/SQL pairs from the log, newest first (best-effort). */
export async function loadConfirmedExamples(client: SqlClient, limit = 200): Promise<Example[]> {
  try {
    const res = await client.query(
      `SELECT question, sql, understood_as FROM public.nl2sql_log
        WHERE verdict = 'confirm' AND ok AND sql IS NOT NULL
        ORDER BY verdict_at DESC NULLS LAST LIMIT $1`,
      [limit],
    );
    return res.rows.map((r: any) => ({
      question: String(r.question),
      sql: String(r.sql),
      understood_as: String(r.understood_as || ""),
      source: "confirmed" as const,
    }));
  } catch {
    return [];
  }
}
