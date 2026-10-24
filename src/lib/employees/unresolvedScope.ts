// src/lib/employees/unresolvedScope.ts
//
// A department the question names but nobody can find must NOT turn into "everybody" (step 44d).
//
// The older rule-based engine (the omnibar's safety net when the model's attempt fails) drops a department phrase it does not know and answers for the whole
// plant: "how many executives are there in heavy maintenance, list them?" was answered "DSP currently has 1,169 executives." with the executives of every
// department listed: a confident wrong answer. Since 29 Sep 2026 that engine deliberately no longer reports "I couldn't identify the department X" for leftover text
// (phrases such as "at any position" were misfiring), so the gap is closed here, narrowly: ONLY the engine's unscoped company-wide count is checked, and only against
// a phrase after in / at / under / within / inside / from that is not generic wording ("the plant", "DSP", "each department", "grade E-5", "total").

import type { AnalyticsPayload } from "./analytics";

const GENERIC = new Set([
  "dsp", "sail", "plant", "company", "whole", "entire", "all", "total", "each", "every", "durgapur", "steel", "organisation", "organization", "service", "india",
  "grade", "grades", "level", "rank", "designation", "position", "post", "cadre", "category", "class", "order", "number", "numbers", "count",
  "executive", "executives", "employee", "employees", "non", "officer", "officers", "staff", "people", "persons",
  "the", "a", "an", "this", "that", "these", "those", "and", "of", "or",
]);
const TRAILING = new Set(["department", "departments", "dept", "depts", "section", "sections", "division", "shop", "unit"]);
const STOP_AT = new Set(["list", "show", "and", "with", "who", "whose", "that", "having", "have", "has", "ordered", "sorted", "by", "please", "them", "names", "name", "where", "which", "are", "is", "in", "at", "under", "within", "inside", "from"]);

/** The department-like phrase after in / at / under / within / inside / from, or null when the question has none (or only generic wording). */
export function unresolvedDepartmentPhrase(q: string): string | null {
  const re = /\b(?:in|at|under|within|inside|from)\s+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    const words: string[] = [];
    for (const raw of q.slice(m.index + m[0].length).split(/\s+/)) {
      const w = raw.replace(/[,;?.!]+$/g, "");
      if (!w || STOP_AT.has(w.toLowerCase())) break;
      words.push(w);
      if (/[,;?.!]$/.test(raw) || words.length >= 4) break;
    }
    while (words.length && TRAILING.has(words[words.length - 1].toLowerCase())) words.pop();
    // a grade code (E5, E-5, S-9) is wording about a grade, not a department
    const meaningful = words.filter((w) => !GENERIC.has(w.toLowerCase()) && !/^\d+$/.test(w) && !/^[es]-?\d{1,2}$/i.test(w));
    if (meaningful.length) return words.join(" ").replace(/^the\s+/i, "");
  }
  return null;
}

/**
 * The older engine's answer, unless it is the unscoped company-wide count ("DSP currently has N executives.") to a question that names a department it could not
 * find: then an honest question instead of a wrong number. Any other answer (a department's own count, a list by name, a breakdown, a holiday) is returned as it is.
 */
export function withoutBlindScope(q: string, p: AnalyticsPayload | null): AnalyticsPayload | null {
  if (!p || p.kind !== "count" || !/^DSP currently has /i.test(p.answer)) return p;
  const phrase = unresolvedDepartmentPhrase(q);
  if (!phrase) return p;
  return { kind: "clarify", answer: `I could not find a department called "${phrase}", so I have not counted anyone. Please give its full name or its code.` };
}
