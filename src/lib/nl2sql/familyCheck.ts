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

import { departmentFamilies, type DepartmentRow } from "./context";
import { DEPARTMENT_FAMILIES } from "./aliasHints";

const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const LIST = String.raw`\(\s*(\d+(?:\s*,\s*\d+)*)\s*\)`;
const numbers = (s: string) => s.split(",").map((x) => Number(x.trim()));

/** The rows of the live list that an SQL selects through its department conditions (none when it has no department condition we can read). */
export function rowsSelectedBy(sql: string, departments: DepartmentRow[]): DepartmentRow[] {
  const ids = new Set<number>();
  const codes = new Set<number>();
  for (const m of sql.matchAll(new RegExp(String.raw`\b(?:\w+\.)?(?:department_id|id)\s+IN\s*` + LIST, "gi"))) numbers(m[1]).forEach((n) => ids.add(n));
  for (const m of sql.matchAll(/\b(?:\w+\.)?(?:department_id|id)\s*=\s*(\d+)\b/gi)) ids.add(Number(m[1]));
  for (const m of sql.matchAll(new RegExp(String.raw`\b(?:\w+\.)?(?:department_)?code\s+IN\s*` + LIST, "gi"))) numbers(m[1]).forEach((n) => codes.add(n));
  for (const m of sql.matchAll(/\b(?:\w+\.)?(?:department_)?code\s*=\s*(\d+)\b/gi)) codes.add(Number(m[1]));
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
    if (inside.length && inside.some((r) => norm(r.name).split(" ").some((w) => !generic.has(w) && qWords.has(w)))) continue;
    const famIds = new Set(f.rows.map((r) => r.id));
    const outside = [...new Set(selected.filter((r) => !famIds.has(r.id)).map((r) => r.name))].slice(0, 2);
    const got = inside.length ? `only ${inside.length} of its ${f.rows.length} rows` : "none of its rows";
    problems.push(
      `The question names ${f.name}, which is ${f.rows.length} department rows, and your SQL selects ${got}${outside.length ? ` (and ${outside.join(", ")} instead)` : ""}. ` +
        `Filter with department_id IN (${f.rows.map((r) => r.id).join(", ")}) -- all of them -- and not with a LIKE on the name, unless the person names one section.`,
    );
  }
  return problems.length ? problems.join(" ALSO: ") : null;
}
