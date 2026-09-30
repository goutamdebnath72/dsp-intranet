// src/lib/employees/rosterQuery.ts
//
// THE people worker, rebuilt entirely on `employee_roster` (Stage 8). This
// REPLACES the old queryPeople() in analytics.ts, which queried
// public."user"/public.departments directly and sorted by a parsed ticket
// number -- confirmed (chat, 28 Sep 2026) to be the root cause of every
// "wrong seniority order" bug found this session.
//
// Design notes, decided in chat:
//   - employee_roster.{name, designation_grade_id, sail_department_id,
//     global_seniority_rank} are AUTHORITATIVE -- read directly, never from
//     public."user", until the next roster refresh.
//   - public."user" is joined ONLY for contactNo/email (the masked-reveal
//     CUG feature), which the roster does not carry.
//   - er.cohort ('executive' | 'nonexecutive') is used directly for broad
//     exec/nonexec/combined-employee filtering -- simpler and more robust
//     than deriving it from designation_grade.track.
//   - 3 of 6,493 roster rows have user_id IS NULL (confirmed: transferred-out
//     executives, not a data bug). LEFT JOIN means they still appear in
//     lists/counts with name/designation/department but no contact fields --
//     matches how they'd already be unreachable via login/reveal anyway.
//   - Sort is ALWAYS `ORDER BY er.global_seniority_rank ASC` -- no exceptions,
//     no ticketNo fallback. This is the one rule the project calls
//     "no-compromise."

import { getDb } from "@/lib/db";
import type { EmployeeResult } from "@/lib/search/employeeSearch";
import { compileNamePredicate, evaluateNamePredicate } from "./namePredicate";

export type NameMatchMode = "surname" | "firstname" | "anyword" | "contains" | "auto";

export interface RosterFilters {
  nameFragment?: string | null; // partial/phonetic -- legacy, used by the deterministic parser path
  nameExact?: string | null; // quoted: exact whole-word, case-insensitive, position-independent
  /**
   * Compositional name search (REPLACED 29 Sep 2026: the old flat
   * `mode`+`excludePositions` scheme was itself a form of patchwork -- a
   * new enum value/field was needed for every new logical combination a
   * question could express. This is a small set of primitives
   * (wordEquals/wordIsFirst/wordIsLast/substring/fuzzy) combined via
   * AND/OR/NOT, which composes for free -- see namePredicate.ts. Set by
   * the LLM orchestrator (queryOrchestrator.ts); the deterministic parser
   * path continues to use the simpler nameFragment/nameExact fields above,
   * unaffected.
   */
  namePredicate?: import("./namePredicate").NamePredicate | null;
  gradeIds?: number[] | null; // designation_grade.id values (specific title/S-grade)
  cohort?: "executive" | "nonexecutive" | null; // broad class, incl. "employees" = omit both filters entirely
  sailDeptIds?: number[] | null; // sail_department.id values
}
export interface RosterQuery {
  op: "count" | "list";
  filters: RosterFilters;
  limit?: number;
}
export interface RosterQueryResult {
  count: number;
  people?: EmployeeResult[];
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildWhere(f: RosterFilters): { where: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  const frag = (f.nameFragment ?? "").trim();
  if (frag) {
    params.push(`%${frag}%`);
    const pLike = params.length;
    params.push(frag);
    const pPhon = params.length;
    clauses.push(`(er.name ILIKE $${pLike} OR public.phonetic_subseq_match($${pPhon}, u.name_phonetic))`);
  }

  const exact = (f.nameExact ?? "").trim();
  if (exact) {
    params.push(exact.toLowerCase());
    clauses.push(`position((' ' || $${params.length} || ' ') in (' ' || lower(er.name) || ' ')) > 0`);
  }

  if (f.namePredicate) {
    clauses.push(compileNamePredicate(f.namePredicate, params));
  }


  if (f.gradeIds && f.gradeIds.length) {
    params.push(f.gradeIds);
    clauses.push(`er.designation_grade_id = ANY($${params.length}::smallint[])`);
  }
  if (f.cohort) {
    params.push(f.cohort);
    clauses.push(`er.cohort = $${params.length}`);
  }
  if (f.sailDeptIds && f.sailDeptIds.length) {
    params.push(f.sailDeptIds);
    clauses.push(`er.sail_department_id = ANY($${params.length}::smallint[])`);
  }

  return { where: clauses.length ? clauses.join(" AND ") : "TRUE", params };
}

function maskMobile(m: string | null): string | null {
  if (!m) return null;
  const digits = m.replace(/\D/g, "");
  if (digits.length < 4) return "xxxx";
  return `${digits.slice(0, 6)}${"x".repeat(Math.max(0, digits.length - 6))}`;
}
function maskEmail(e: string | null): string | null {
  if (!e) return null;
  const at = e.indexOf("@");
  if (at <= 0) return "xxxxxx";
  return `xxxxxx${e.slice(at)}`;
}

function rowToEmployee(r: any): EmployeeResult {
  const ticket = (r.ticket_no || "").trim();
  return {
    id: r.user_id || `roster:${r.id}`, // fall back to a roster-scoped id for the 3 unlinked rows
    type: "employee",
    name: r.name,
    ticketNo: ticket,
    sailPNo: r.sail_pno || null,
    designation: r.designation_title || null,
    department: r.dept_name || null,
    mobileMasked: maskMobile(r.contactNo || null),
    emailMasked: maskEmail(r.email || null),
    hasMobile: !!r.contactNo,
    hasEmail: !!r.email,
    isExecutive: r.cohort === "executive",
    matchKind: "id",
    score: 0,
  } as EmployeeResult;
}

const BASE_SELECT = `
  er.id, er.ticket_no, er.sail_pno, er.name, er.cohort, er.user_id,
  dg.title AS designation_title,
  sd.name AS dept_name,
  u."contactNo" AS "contactNo", u.email, u.name_phonetic
`;
const BASE_FROM = `
  FROM public.employee_roster er
  JOIN public.designation_grade dg ON dg.id = er.designation_grade_id
  LEFT JOIN public.sail_department sd ON sd.id = er.sail_department_id
  LEFT JOIN public."user" u ON u.id = er.user_id
`;

export async function queryRoster(spec: RosterQuery): Promise<RosterQueryResult> {
  const d = await getDb();
  const { where, params } = buildWhere(spec.filters);

  if (spec.filters.namePredicate) {
    // VERIFIED PATH (added 29 Sep 2026, per explicit request): count and
    // list must never disagree, and every returned row must independently
    // satisfy the exact condition -- so both come from ONE pass over a
    // bounded candidate set, re-checked in plain code (evaluateNamePredicate
    // in namePredicate.ts), not trusted from SQL compilation alone. The
    // 2000-row cap is a generous safety bound (DSP's total headcount is
    // ~6,500), not a real limit on any sensible query.
    const candidateRows: any[] = await d.query(
      `SELECT ${BASE_SELECT} ${BASE_FROM} WHERE ${where} ORDER BY er.global_seniority_rank ASC LIMIT 2000`,
      params,
    );
    const verified = candidateRows.filter((r) =>
      evaluateNamePredicate(spec.filters.namePredicate!, r.name, r.name_phonetic ?? null),
    );
    const count = verified.length;
    if (spec.op === "count") return { count };
    const limit = spec.limit ?? 100;
    return { count, people: verified.slice(0, limit).map(rowToEmployee) };
  }

  const countRows: Array<{ n: number }> = await d.query(
    `SELECT count(*)::int AS n ${BASE_FROM} WHERE ${where}`,
    params,
  );
  const count = countRows?.[0]?.n ?? 0;
  if (spec.op === "count") return { count };

  const limit = spec.limit ?? 100;
  const listParams = [...params, limit];
  const rows: any[] = await d.query(
    `SELECT ${BASE_SELECT} ${BASE_FROM}
      WHERE ${where}
      ORDER BY er.global_seniority_rank ASC
      LIMIT $${listParams.length}`,
    listParams,
  );
  return { count, people: rows.map(rowToEmployee) };
}

/** Convenience: list people by a resolved set of grade ids, dept-scoped. */
export async function listByGrades(
  gradeIds: number[],
  sailDeptIds: number[] | null,
  limit = 100,
): Promise<EmployeeResult[]> {
  if (!gradeIds.length) return [];
  return (
    await queryRoster({ op: "list", filters: { gradeIds, sailDeptIds: sailDeptIds ?? undefined }, limit })
  ).people ?? [];
}
