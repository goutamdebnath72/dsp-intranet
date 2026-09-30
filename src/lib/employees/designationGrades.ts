// src/lib/employees/designationGrades.ts
//
// DB-backed designation/rank layer. Replaces the old hardcoded RANKS[] /
// HIERARCHY[] arrays in designations.ts entirely -- every title, code, track
// and rank_order value comes from `public.designation_grade` (30 rows, built
// in the Stage 8 SAIL seniority project), never hardcoded here.
//
// Confirmed live (chat, 28 Sep 2026):
//   - "Asst. Manager" appears at BOTH code 204 (paired with Medical Officer)
//     and code 201 (paired with Junior Manager) -- two real, distinct grades
//     (rank_order 12 and 13) that happen to share one display title. A bare,
//     unqualified "Asst Manager" search combines both grade ids -- each
//     person's own designation_grade_id already correctly records which one
//     they actually are; search just needs to not miss either.
//   - "Director In-charge" (code 227, rank_order 1) is a real title the old
//     hardcoded RANKS array never had at all.

import { getDb } from "@/lib/db";

export type Track = "managerial" | "medical" | "nonexec";

export interface DesignationGradeRow {
  id: number;
  code: number;
  title: string;
  track: Track;
  rankOrder: number;
}

let cache: DesignationGradeRow[] | null = null;
let cacheAt = 0;
const TTL_MS = 5 * 60 * 1000; // designation_grade only changes via a deliberate migration

export async function loadDesignationGrades(): Promise<DesignationGradeRow[]> {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const d = await getDb();
  const rows: any[] = await d.query(
    `SELECT id, code, title, track, rank_order AS "rankOrder"
       FROM public.designation_grade
      ORDER BY rank_order`,
  );
  cache = rows.map((r) => ({
    id: Number(r.id),
    code: Number(r.code),
    title: String(r.title),
    track: r.track as Track,
    rankOrder: Number(r.rankOrder),
  }));
  cacheAt = Date.now();
  return cache;
}

/** Force a re-read on next call -- for tests / after a live migration. */
export function invalidateDesignationGradeCache(): void {
  cache = null;
}

export function normTitle(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[.\-_/]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[?!,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Typed shorthand -> the EXACT stored title it means. Kept separate from the
// DB so a stored title can have several typable spellings without a
// migration per spelling. Carried forward from the old RANKS aliases
// (already validated over many prior sessions), plus the two fixes this
// session found: "officer(s)" for exec, "non-ex"/"nonex"/"non ex" for
// non-exec -- these were previously only in resolveDesignation(), never in
// the routing matcher, which is exactly why they mis-routed to circular
// search (see chat).
const TITLE_ALIASES: Record<string, string[]> = {
  "director in charge": ["director in-charge", "director incharge", "dic"],
  "executive director": ["ed"],
  "chief general manager": ["cgm", "chief gm"],
  "director(m&hs)": ["director m-hs", "director mhs", "director medical", "medical director"],
  "general manager": ["gm"],
  "joint director": ["jt director"],
  "dy. general manager": ["dgm", "dy general manager", "deputy general manager", "dy gm", "deputy gm"],
  "sr. deputy director": ["sr deputy director", "senior deputy director", "sr dy director"],
  "dmo/consultant": ["dmo", "dmo consultant", "deputy medical officer"],
  "asst.general manager": ["agm", "asst general manager", "assistant general manager", "asst gm", "assistant gm"],
  "asst. director/sr. consultant": ["asst director", "assistant director", "sr consultant", "senior consultant"],
  "sr. manager": ["sr manager", "senior manager", "sr mgr", "sr mngr", "senior mgr"],
  manager: ["mgr", "mngr"],
  "dy. manager": ["dy manager", "deputy manager", "dy mgr", "deputy mgr"],
  "admo/specialist": ["admo", "specialist", "admo specialist"],
  "asst. manager": ["asst manager", "assistant manager", "asst mgr", "assistant mgr"],
  "medical officer": ["mo"],
  "junior manager": ["jr manager", "jr mgr", "junior mgr"],
};

const ALIAS_TO_TITLE: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [title, aliases] of Object.entries(TITLE_ALIASES)) {
    m.set(normTitle(title), title);
    for (const a of aliases) m.set(normTitle(a), title);
  }
  return m;
})();

// Whole-term group aliases (exec / nonexec / employees-combined). "employees"
// is handled by the CALLER, not here -- it isn't a designation, it's the
// union of every grade in the table, which the caller can build directly
// from loadDesignationGrades() without needing a special case here.
const EXEC_TERMS = new Set(["executive", "executives", "exec", "execs", "officer", "officers"]);
const NONEXEC_TERMS = new Set([
  "non executive", "non executives", "nonexecutive", "non exec", "nonexec",
  "non-ex", "nonex", "non ex",
  "s grade", "s grades", "s scale", "worker", "workers", "staff", "non executive staff",
]);

export interface DesignationResolution {
  gradeIds: number[];
  label: string;
  // "combined" is synthetic -- built by parser.ts for the bare word
  // "employees"/"staff"/etc, meaning BOTH cohorts with no filter at all
  // (not a real designation_grade concept, so never returned by
  // resolveDesignationTerm/findDesignationInText themselves).
  kind: "grade" | "exec" | "nonexec" | "combined";
}

export async function resolveDesignationTerm(term: string): Promise<DesignationResolution | null> {
  const n = normTitle(term);
  if (!n) return null;
  const grades = await loadDesignationGrades();

  if (EXEC_TERMS.has(n)) {
    return { gradeIds: grades.filter((g) => g.track !== "nonexec").map((g) => g.id), label: "Executives", kind: "exec" };
  }
  if (NONEXEC_TERMS.has(n)) {
    return { gradeIds: grades.filter((g) => g.track === "nonexec").map((g) => g.id), label: "Non-executives", kind: "nonexec" };
  }

  // S-grade pattern: s1, s 1, s-1, grade s1
  const sm = n.match(/^(?:grade\s*)?s\s*(\d{1,2})$/);
  if (sm) {
    const title = `S-${parseInt(sm[1], 10)}`;
    const rows = grades.filter((g) => g.title === title);
    if (rows.length) return { gradeIds: rows.map((g) => g.id), label: title, kind: "grade" };
  }

  // Aliased title -- may resolve to MULTIPLE grade rows sharing one display
  // title (confirmed intentional for "Asst. Manager" -- combine, don't pick).
  const canonicalTitle = ALIAS_TO_TITLE.get(n);
  if (canonicalTitle) {
    const rows = grades.filter((g) => normTitle(g.title) === canonicalTitle);
    if (rows.length) return { gradeIds: rows.map((g) => g.id), label: rows[0].title, kind: "grade" };
  }

  // Fallback: verbatim title match for anything typed in full that isn't in
  // TITLE_ALIASES yet (covers "Director In-charge", "Joint Director", etc.
  // typed exactly as stored, with no shorthand needed).
  const direct = grades.filter((g) => normTitle(g.title) === n);
  if (direct.length) return { gradeIds: direct.map((g) => g.id), label: direct[0].title, kind: "grade" };

  return null;
}

/** All grade ids, for the "employees" combined-cohort term (both exec+nonexec). */
export async function allGradeIds(): Promise<number[]> {
  return (await loadDesignationGrades()).map((g) => g.id);
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find a designation term ANYWHERE in free text (word-bounded, not
 * position-anchored -- "in c&it list executives" and "list executives in
 * c&it" must both match). Longest known phrase wins. Used by parser.ts to
 * decide routing; replaces the old findDesignation()'s hand-rolled regex set
 * (which is what was missing "officer"/"non-ex" and caused the mis-routing).
 */
export async function findDesignationInText(
  query: string,
): Promise<{ term: string; resolution: DesignationResolution } | null> {
  const nq = ` ${normTitle(query)} `;
  const grades = await loadDesignationGrades();

  const candidates = new Set<string>([...ALIAS_TO_TITLE.keys(), ...EXEC_TERMS, ...NONEXEC_TERMS]);
  for (const g of grades) if (/^s-\d{1,2}$/i.test(g.title)) candidates.add(normTitle(g.title));

  const sorted = Array.from(candidates).sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    const re = new RegExp(` ${esc(c)}(s|es)? `);
    if (re.test(nq)) {
      const resolved = await resolveDesignationTerm(c);
      if (resolved) return { term: c, resolution: resolved };
    }
  }

  // S-grade written with a hyphen/space run together, e.g. "s7", "grade s 7".
  const sm = nq.match(/ (?:grade )?s[- ]?(\d{1,2}) /);
  if (sm) {
    const resolved = await resolveDesignationTerm(`s ${sm[1]}`);
    if (resolved) return { term: `s ${sm[1]}`, resolution: resolved };
  }

  return null;
}

/**
 * True only when the ENTIRE phrase is nothing but a recognised designation
 * term (plus its own plural) -- used to tell "for employees" apart from a
 * genuine department name (see parser.ts's findDeptScope).
 */
export async function isFullyDesignationPhrase(phrase: string): Promise<boolean> {
  const nq = ` ${normTitle(phrase)} `;
  const grades = await loadDesignationGrades();
  const candidates = new Set<string>([...ALIAS_TO_TITLE.keys(), ...EXEC_TERMS, ...NONEXEC_TERMS]);
  for (const g of grades) if (/^s-\d{1,2}$/i.test(g.title)) candidates.add(normTitle(g.title));
  for (const c of candidates) {
    if (new RegExp(`^ ${esc(c)}(s|es)? $`).test(nq)) return true;
  }
  if (/^ (?:grade )?s[- ]?\d{1,2} $/.test(nq)) return true;
  return false;
}
