// src/lib/nl2sql/familyCheck.ts
//
// A question that names a large department (CO & CC, main hospital, L & D ...) must be answered for ALL its rows (step 45b).
//
// The model is told the ids (context.ts departmentFamilies), but a model can ignore a hint, and a confident wrong answer is worse than none. Live, 24 Oct 2026:
//   "main hospital"  -> LIKE '%hospital%'       found 2 of the 6 medical rows and counted 0 executives
//   "hydraulic lab"  -> LIKE '%hydraulic lab%'  found no row and counted 0
//   "l&d"            -> LIKE '%l d%'            also matches the text "contro[l d]eptt": it counted ENVIRONMENT CONTROL DEPTT and called it L&D
// This check works out WHICH ROWS the model's SQL selects (by id, by code, or by a LIKE or = on the name, read against the live department list), and if they are not the
// family, it sends the model back with the exact ids. It looks at the RESULT, not the form: LIKE '%co and cc%' passes (it selects exactly the CO & CC rows), code IN (92500, 92530)
// passes, department_id IN (...) passes. A named SECTION is respected: when the question carries a word that only the selected rows have ("sms ccp", "hospital office"), a part of
// the family is accepted. Like the other soft rules of the pipeline it is used on the first two attempts only: a question is never failed over it.
//
// Step 48a: when the mistake is one we can mend with certainty, the SQL is mended instead (repairFamilies), at once and with no
// second model call: live, 24 Oct 2026 17:41, the model wrote code IN (135,180,161,126,89,1), the row IDS as department CODES, three times in a row, the check sent it back twice and the
// third attempt (never checked) showed 0 -- after 80 seconds, because every extra model call spends about 6,000 tokens and Groq's per-minute limit made the next one wait 23 and 45 seconds.

import { departmentFamilies, type DepartmentRow } from "./context";
import { DEPARTMENT_FAMILIES } from "./aliasHints";

const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const LIST = String.raw`\(\s*(\d+(?:\s*,\s*\d+)*)\s*\)`;
/** Little words that are in many department names and in many questions: they never tell which SECTION a question means. */
const STOP = new Set(["and", "of", "the", "in", "at", "for", "to", "a", "an", "on", "by", "with", "or", "dept", "deptt", "department", "departments", "section", "sections"]);
const numbers = (s: string) => s.split(",").map((x) => Number(x.trim()));

/** The numbers an SQL puts after "code IN (...)" or "code = ..." (department_code too). */
function codeNumbers(sql: string): number[] {
  const out: number[] = [];
  for (const m of sql.matchAll(new RegExp(String.raw`\b(?:\w+\.)?(?:department_)?code\s+IN\s*` + LIST, "gi"))) out.push(...numbers(m[1]));
  for (const m of sql.matchAll(/\b(?:\w+\.)?(?:department_)?code\s*=\s*(\d+)\b/gi)) out.push(Number(m[1]));
  return out;
}

/** The rows of the live list that an SQL selects through its department conditions (none when it has no department condition we can read). */
export function rowsSelectedBy(sql: string, departments: DepartmentRow[]): DepartmentRow[] {
  const ids = new Set<number>();
  const codes = new Set(codeNumbers(sql));
  for (const m of sql.matchAll(new RegExp(String.raw`\b(?:\w+\.)?(?:department_id|id)\s+IN\s*` + LIST, "gi"))) numbers(m[1]).forEach((n) => ids.add(n));
  for (const m of sql.matchAll(/\b(?:\w+\.)?(?:department_id|id)\s*=\s*(\d+)\b/gi)) ids.add(Number(m[1]));
  const likes: { re: RegExp; onNorm: boolean }[] = [];
  const toRe = (p: string) => new RegExp("^" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "i");
  for (const m of sql.matchAll(/((?:nlq\.)?norm\(\s*(?:\w+\.)?(?:name|department)\s*\)|(?:\w+\.)?(?:name|department))\s+(NOT\s+)?(?:I?LIKE)\s+'([^']*)'/gi)) {
    if (!m[2]) likes.push({ re: toRe(m[3]), onNorm: /norm\s*\(/i.test(m[1]) });
  }
  const equals: { v: string; onNorm: boolean }[] = [];
  for (const m of sql.matchAll(/((?:nlq\.)?norm\(\s*(?:\w+\.)?(?:name|department)\s*\)|(?:\w+\.)?(?:name|department))\s*=\s*'([^']*)'/gi)) equals.push({ v: m[2], onNorm: /norm\s*\(/i.test(m[1]) });
  return departments.filter(
    (d) =>
      ids.has(d.id) ||
      codes.has(d.code) ||
      likes.some((l) => l.re.test(l.onNorm ? norm(d.name) : d.name.toLowerCase())) ||
      equals.some((e) => (e.onNorm ? norm(d.name) === e.v.toLowerCase() : d.name.toLowerCase() === e.v.toLowerCase())),
  );
}

/** The words that name the family itself (its nicknames, or its own name): a row word NOT in here tells which section a row is ("ccp" is not a nickname of SMS, it is a section of it). */
function genericWords(familyName: string): Set<string> {
  const g = DEPARTMENT_FAMILIES.find((x) => x.name === familyName);
  const phrases = g ? g.aliases : [familyName];
  return new Set(phrases.flatMap((p) => norm(p).split(" ")).filter(Boolean));
}

/** A sentence for the model when its SQL does not cover a department family the question names; null when it does (or when the question names none). */
export function checkFamilies(question: string, sql: string, departments: DepartmentRow[]): string | null {
  const families = departmentFamilies(question, departments);
  if (!families.length) return null;
  const qWords = new Set(norm(question).split(" "));
  const selected = rowsSelectedBy(sql, departments);
  const selIds = new Set(selected.map((r) => r.id));
  const problems: string[] = [];
  for (const f of families) {
    if (f.rows.every((r) => selIds.has(r.id))) continue;
    const inside = f.rows.filter((r) => selIds.has(r.id));
    const generic = genericWords(f.name);
    // the person named ONE section ("sms ccp", "hospital office"): a part of the family is right when the question carries a word only those rows have
    if (inside.length && inside.some((r) => norm(r.name).split(" ").some((w) => !STOP.has(w) && !generic.has(w) && qWords.has(w)))) continue;
    const famIds = new Set(f.rows.map((r) => r.id));
    const outside = [...new Set(selected.filter((r) => !famIds.has(r.id)).map((r) => r.name))].slice(0, 2);
    const got = inside.length ? `only ${inside.length} of its ${f.rows.length} rows` : "none of its rows";
    // the live mistake of 24 Oct: the row ids written as codes (code IN (135, 180, ...)): say so in so many words
    const asCodes = codeNumbers(sql);
    const confusion = asCodes.length > 0 && asCodes.every((n) => famIds.has(n)) && !f.rows.some((r) => asCodes.includes(r.code))
      ? " Careful: the numbers you put in code IN (...) are department IDs (the row numbers), not department codes: use them as department_id IN (...)."
      : "";
    problems.push(
      `The question names ${f.name}, which is ${f.rows.length} department rows, and your SQL selects ${got}${outside.length ? ` (and ${outside.join(", ")} instead)` : ""}. ` +
        `Filter with department_id IN (${f.rows.map((r) => r.id).join(", ")}) -- all of them -- and not with a LIKE on the name, unless the person names one section.${confusion}`,
    );
  }
  return problems.length ? problems.join(" ALSO: ") : null;
}

/**
 * Mends the SQL when it covers the department family a question names wrongly (ids written as codes, a LIKE on the name that finds other rows or none, one row of several ...): the first
 * department_id IN (...) / department_code IN (...) -- a list or a sub-query, found by matching the brackets -- becomes department_id IN (the family's ids). Returns the mended SQL, or null
 * when nothing needs mending or the mistake is not one we can mend with certainty:
 *   - the question names two or more families (a comparison): the model's own grouping would be lost, so it is sent back instead;
 *   - the SQL has no department_id IN / department_code IN to put the ids into;
 *   - the mended SQL would not pass checkFamilies again.
 */
export function repairFamilies(question: string, sql: string, departments: DepartmentRow[]): string | null {
  const families = departmentFamilies(question, departments);
  if (families.length !== 1) return null;
  // the person named ONE section ("BLAST FURNACE (OPERATION)", "main hospital office"): widening it to the whole department would be a wrong answer, so it is not mended (the model is sent back)
  const generic = genericWords(families[0].name);
  const qWords = new Set(norm(question).split(" "));
  if (families[0].rows.some((r) => norm(r.name).split(" ").some((w) => !STOP.has(w) && !generic.has(w) && qWords.has(w)))) return null;
  if (checkFamilies(question, sql, departments) === null) return null;
  const m = /\b(?:department_id|department_code)\s+IN\s*\(/i.exec(sql);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  let inString = false;
  let i = start;
  for (; i < sql.length && depth > 0; i++) {
    const ch = sql[i];
    if (inString) {
      if (ch === "'") {
        if (sql[i + 1] === "'") i++;
        else inString = false;
      }
      continue;
    }
    if (ch === "'") inString = true;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
  }
  if (depth !== 0) return null;
  const end = i - 1; // the closing bracket
  const fixed = sql.slice(0, m.index) + `department_id IN (${families[0].rows.map((r) => r.id).join(", ")}` + sql.slice(end);
  return checkFamilies(question, fixed, departments) === null ? fixed : null;
}
