// src/lib/nl2sql/rosterFinder.ts
//
// THE DEPARTMENT & DESIGNATION FINDER (People selection, facet "Department & designation"): the reader PICKS a department and/or a designation (and may type part of a name), so nothing has to be understood:
// the list is a FIXED SQL TEMPLATE filled with whole numbers (ids from the two pickers) and a name made only of letters. No language model is involved, the SQL goes through the same guard, the same
// read-only executor, the same log row and the same cards, masking and "Show more" paging as every answer the model writes. Pure here (the SQL and its words); the run is in omnibar.ts (runRosterFinder).

export interface FinderInput {
  departmentId?: number | null;
  gradeId?: number | null;
  /** part of a name, to narrow the list (letters, spaces, dots, hyphens, apostrophes only) */
  name?: string | null;
}

export type FinderPlan = { ok: true; sql: string; wanted: { departmentId: number | null; gradeId: number | null; name: string | null } } | { ok: false; reason: string };

const positiveInt = (v: unknown): number | null => {
  const n = typeof v === "string" && /^\d{1,9}$/.test(v.trim()) ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** the words of a name filter: letters (any script) only, each 2 to 30 long, at most 4 words */
export function nameWords(raw: unknown): string[] {
  const s = String(raw ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\s.'-]/gu, " ");
  return s.split(/[\s.'-]+/).filter((w) => w.length >= 2 && w.length <= 30).slice(0, 4);
}

export function planFinder(input: FinderInput): FinderPlan {
  const departmentId = positiveInt(input.departmentId);
  const gradeId = positiveInt(input.gradeId);
  const words = nameWords(input.name);
  if (departmentId === null && gradeId === null && words.length === 0) return { ok: false, reason: "Pick a department, a designation, or type part of a name." };
  const where: string[] = [];
  if (departmentId !== null) where.push(`department_id = ${departmentId}`);
  if (gradeId !== null) where.push(`grade_id = ${gradeId}`);
  // every word must be like a word of the name (spelled alike by sound); the word is letters only, so it is safe inside quotes
  for (const w of words) where.push(`nlq.word_like(name_words, name_codes, '${w.replace(/'/g, "''")}')`);
  const sql = `SELECT ticket_no, name, designation, department_code, department, global_seniority_rank FROM nlq.employees WHERE ${where.join(" AND ")} ORDER BY global_seniority_rank`;
  return { ok: true, sql, wanted: { departmentId, gradeId, name: words.length ? words.join(" ") : null } };
}

/** the sentence that says what was listed (the answer's own words; the model is not asked) */
export function finderUnderstoodAs(w: { gradeTitle?: string | null; departmentName?: string | null; name?: string | null }): string {
  const parts: string[] = [];
  parts.push(w.gradeTitle ? `${w.gradeTitle}` : "Employees");
  if (w.departmentName) parts.push(`in ${w.departmentName}`);
  if (w.name) parts.push(`with a name like "${w.name}"`);
  return `${parts.join(" ")}, in seniority order (listed from the directory: nothing was guessed and no AI was used).`;
}
