// src/lib/nl2sql/quoted.ts
//
// A general rule of this app (set by the user): a name in "double quotes" means EXACT, literal
// matching -- never the similar-spelling helpers. The prompt states the rule, but a language model
// follows worked examples more reliably than rules, so the rule is ALSO checked on the SQL it
// writes. A violation is sent back to the model with the exact reason (the normal retry path).
// This is not a per-phrasing patch: it applies to every question and every quoted name.

const QUOTED = /["\u201C\u201D]([^"\u201C\u201D]{1,40})["\u201C\u201D]/g;

/** The distinct double-quoted terms in a question, in order of appearance. */
export function extractQuotedTerms(question: string): string[] {
  const out: string[] = [];
  for (const m of (question || "").matchAll(QUOTED)) {
    const t = m[1].trim();
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** null when fine; otherwise the reason the SQL breaks the "quoted = exact" rule. */
export function checkQuotedTerms(question: string, sql: string): string | null {
  for (const t of extractQuotedTerms(question)) {
    const e = escapeRe(t);
    const usesHelper = new RegExp(
      `nlq\\.(?:word_like|first_word_like|last_word_like)\\s*\\([^)]*'${e}'\\s*\\)|nlq\\.code\\s*\\(\\s*'${e}'`,
      "i",
    );
    if (usesHelper.test(sql)) {
      const U = t.toUpperCase();
      return (
        `The question puts "${t}" in double quotes, so it must be matched EXACTLY and literally. ` +
        `Do not use nlq.word_like / first_word_like / last_word_like / nlq.code for "${t}". ` +
        `Compare name_words (UPPER CASE) instead, e.g. name_words[cardinality(name_words)] = '${U}' or '${U}' = ANY(name_words).`
      );
    }
  }
  return null;
}
