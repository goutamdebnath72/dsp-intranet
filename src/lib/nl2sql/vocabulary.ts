// src/lib/nl2sql/vocabulary.ts
//
// Two general safety nets, in the same spirit as quoted.ts. Both catch a model answer that
// CONTRADICTS a fixed fact about this database, send it back with the exact reason, and let the
// model fix it. Neither is tied to a particular phrasing.
//
// 1. Vocabulary: words like officer(s), executive(s), staff, workers, non-executive(s) name a
//    COHORT (executive / nonexecutive). A model once read "officers" as a designation word and
//    "staff" as plain "employees". The cohort words are shown to the model for THIS question and
//    the SQL is checked for a cohort condition. A word that is part of a real department name or
//    designation title in the question (e.g. "COMPUTER and IT STAFF", "Medical Officer") is not
//    treated as a cohort word.
// 2. nlq.norm patterns: nlq.norm() returns only lowercase letters, digits and single spaces, so a
//    pattern containing brackets, capitals (with LIKE) or other punctuation can never match.

export interface VocabHit {
  word: string;
  cohort: "executive" | "nonexecutive";
}

/** Same normalization as the database function nlq.norm(). */
function norm(s: string): string {
  return (s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

const NONEXEC = /\b(?:non ?ex(?:ec(?:utives?)?)?|staff|workers?|non ?officers?)\b/g;
const EXEC = /\b(?:executives?|execs?|officers?)\b/g;

/** Cohort words in the question. `knownPhrases` = real department names and designation titles. */
export function vocabularyHits(question: string, knownPhrases: string[]): VocabHit[] {
  const q = " " + norm(question) + " ";
  const exempt = new Set<string>();
  for (const p of knownPhrases) {
    const pn = norm(p);
    // the phrase may appear in the question as written or in its plural ("medical officers")
    if (pn && (q.includes(" " + pn + " ") || q.includes(" " + pn + "s "))) pn.split(" ").forEach((w) => exempt.add(w));
  }
  const isExempt = (match: string) => {
    const last = match.split(" ").pop() as string;
    return exempt.has(last) || exempt.has(last.replace(/s$/, ""));
  };

  const hits: VocabHit[] = [];
  const add = (word: string, cohort: VocabHit["cohort"]) => {
    if (!isExempt(word) && !hits.some((h) => h.word === word)) hits.push({ word, cohort });
  };
  for (const m of q.matchAll(NONEXEC)) add(m[0], "nonexecutive");
  const rest = q.replace(NONEXEC, " "); // "non executives" must not also count as "executives"
  for (const m of rest.matchAll(EXEC)) add(m[0], "executive");
  return hits;
}

const MEANING = {
  executive: "executives -> cohort = 'executive'",
  nonexecutive: "non-executives -> cohort = 'nonexecutive'",
} as const;

/** Extra prompt line for THIS question, or null when it has no cohort words. */
export function vocabularyLine(question: string, knownPhrases: string[]): string | null {
  const hits = vocabularyHits(question, knownPhrases);
  if (!hits.length) return null;
  const parts = hits.map((h) => `"${h.word}" means ${MEANING[h.cohort]}${h.cohort === "executive" ? " (it is NOT a designation word)" : ""}`);
  return `IMPORTANT (vocabulary): in this question ${parts.join("; ")}.`;
}

/** null when fine; otherwise why the SQL contradicts the cohort vocabulary of the question. */
export function checkVocabulary(question: string, sql: string, knownPhrases: string[]): string | null {
  const hits = vocabularyHits(question, knownPhrases);
  if (!hits.length) return null;
  const h = hits[0];
  if (!/\bcohort\b/i.test(sql)) {
    return (
      `The question says "${h.word}", which means ${MEANING[h.cohort]}. Your SQL has no condition on cohort. ` +
      `Add that condition; do not treat "${h.word}" as a designation word or as plain "employees".`
    );
  }
  const kinds = new Set(hits.map((x) => x.cohort));
  if (kinds.size === 1) {
    const want = h.cohort;
    const other = want === "executive" ? "nonexecutive" : "executive";
    const has = (c: string) => new RegExp(`cohort\\s*(?:=|in)\\s*\\(?\\s*'${c}'`, "i").test(sql);
    if (has(other) && !has(want)) {
      return `The question says "${h.word}", which means ${MEANING[want]}, but your SQL filters cohort = '${other}'. Use cohort = '${want}'.`;
    }
  }
  return null;
}

/** null when fine; otherwise a pattern that nlq.norm() output can never match. */
export function checkNormPatterns(sql: string): string | null {
  const re = /nlq\.norm\s*\([^()]*\)\s*(not\s+)?(ilike|like|=)\s*'((?:[^']|'')*)'/gi;
  for (const m of sql.matchAll(re)) {
    const op = m[2].toLowerCase();
    const pattern = m[3];
    const allowed = op === "ilike" ? /[^a-zA-Z0-9 %_]/ : /[^a-z0-9 %_]/;
    if (allowed.test(pattern)) {
      const bare = pattern.replace(/^%+|%+$/g, "");
      return (
        `nlq.norm() returns only lowercase letters, digits and single spaces (brackets, '-', '.', ',' are removed and '&' becomes 'and'), ` +
        `so the pattern '${pattern}' can never match. Write the pattern the same way (for example '%${norm(bare)}%'), ` +
        `or normalize the text too: nlq.norm(name) LIKE '%' || nlq.norm('${bare.replace(/'/g, "''")}') || '%'.`
      );
    }
  }
  return null;
}
