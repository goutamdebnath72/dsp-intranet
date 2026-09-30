// src/lib/nl2sql/context.ts
//
// The live reference data the model needs to resolve words like "GM" or
// "plant garage" to real rows: the designation list (30 rows) and the
// department list (~300 rows), read from the database through the SAME
// read-only path as any other query, and cached for a few minutes.

import type { SqlClient } from "./types";
import { runReadOnly } from "./executor";
import { DEPARTMENT_SHORT_FORMS, DESIGNATION_SHORT_FORMS, MULTI_ROW_DEPARTMENTS } from "./aliasHints";

export interface DesignationRow { id: number; code: number; title: string; track: string; rank_order: number }
export interface DepartmentRow { id: number; code: number; name: string; cohort_scope: string }
export interface DynamicContext { designations: DesignationRow[]; departments: DepartmentRow[] }

const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; ctx: DynamicContext } | null = null;

export function clearContextCache() {
  cache = null;
}

export async function loadDynamicContext(client: SqlClient): Promise<DynamicContext> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.ctx;
  const d = await runReadOnly(client, "SELECT id, code, title, track, rank_order FROM nlq.designations ORDER BY rank_order, id", { rowLimit: 500 });
  const p = await runReadOnly(client, "SELECT id, code, name, cohort_scope FROM nlq.departments ORDER BY name, code", { rowLimit: 1000 });
  const ctx: DynamicContext = {
    designations: d.rows as unknown as DesignationRow[],
    departments: p.rows as unknown as DepartmentRow[],
  };
  cache = { at: Date.now(), ctx };
  return ctx;
}

export function formatDesignations(rows: DesignationRow[]): string {
  const lines = rows.map((r) => `${r.id} | ${r.code} | ${r.title} | ${r.track} | rank_order ${r.rank_order}`);
  const short = DESIGNATION_SHORT_FORMS.map(([t, a]) => `${a.join(" / ")} = ${t}`).join("; ");
  return `id | code | title | track | rank_order   (rank_order 1 = most senior; equal rank_order = equivalent grade)\n${lines.join("\n")}\nShort forms: ${short}.`;
}

const QUESTION_STOP = new Set([
  "how", "many", "the", "and", "are", "who", "list", "find", "show", "all", "names", "name", "with", "that", "have", "has", "whose",
  "ends", "end", "starts", "start", "contains", "contain", "employees", "employee", "executives", "executive", "non", "staff", "people",
  "number", "count", "total", "senior", "most", "which", "from", "for", "not", "but", "any", "department", "dept", "section", "email",
  "nic", "mail", "word", "words", "last", "first", "middle", "top", "designation", "wise", "breakdown", "work", "working", "plant", "dsp", "sail", "company",
]);

/** Same normalization as the database function nlq.norm(). */
function normText(s: string): string {
  return s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function meaningfulWords(s: string): string[] {
  return normText(s).split(" ").filter((w) => w.length >= 3 && !QUESTION_STOP.has(w));
}

/**
 * The full department list (~300 rows) is about half of a prompt and the
 * language model's per-minute token allowance is limited, so only the
 * departments that look relevant to THIS question are shown. Relevance is a
 * plain word overlap between the question and the department name (plus the
 * known short forms, e.g. "etl" brings in ELECTRICAL TECHNICAL LAB). Nothing is
 * lost for correctness: a department not shown is still matched by name inside
 * the SQL (nlq.norm(name) LIKE ...), and the prompt says so.
 */
export function selectRelevantDepartments(question: string, all: DepartmentRow[], max = 25): DepartmentRow[] {
  const qNorm = " " + normText(question) + " ";
  const qWords = new Set(meaningfulWords(question));
  for (const [name, aliases] of DEPARTMENT_SHORT_FORMS) {
    if (aliases.some((a) => qNorm.includes(" " + normText(a) + " "))) meaningfulWords(name).forEach((w) => qWords.add(w));
  }
  if (!qWords.size) return [];
  const scored = all
    .map((d) => {
      const dWords = meaningfulWords(d.name);
      let score = 0;
      for (const q of qWords) {
        if (dWords.some((w) => w === q || (q.length >= 4 && w.startsWith(q)) || (w.length >= 4 && q.startsWith(w)))) score++;
      }
      return { d, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.d.name.length - y.d.name.length || x.d.id - y.d.id);
  return scored.slice(0, max).map((x) => x.d);
}

export function formatDepartments(shown: DepartmentRow[], totalCount: number): string {
  const multi = MULTI_ROW_DEPARTMENTS.map(
    (m) => `${m.name} (also "${m.aliases.join('", "')}"): department_code IN (${m.codes.join(", ")}) -- ${m.note}`,
  ).join("\n");
  const short = DEPARTMENT_SHORT_FORMS.map(([n, a]) => `${a.join(" / ")} = ${n}`).join("; ");
  const rows = shown.length
    ? "id | code | name\n" + shown.map((r) => `${r.id} | ${r.code} | ${r.name}${r.cohort_scope !== "shared" ? ` [${r.cohort_scope} only]` : ""}`).join("\n")
    : "(no department in the question matched a known name)";
  return (
    `The database has ${totalCount} department rows. Only those that look relevant to this question are listed:\n${rows}\n` +
    `A department that is not listed is still found in SQL by name: department_id IN (SELECT id FROM nlq.departments WHERE nlq.norm(name) LIKE '%words%').\n\n` +
    `Departments made of several rows (use ALL codes):\n${multi}\n\nOther short forms: ${short}.`
  );
}
