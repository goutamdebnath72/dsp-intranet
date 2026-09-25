// src/lib/employees/analytics.ts
//
// Deterministic employee analytics. Every number comes from the DB via TypeORM
// QueryBuilder (parameterized, injection-safe) — never from AI. Aggregates only,
// no PII: these functions return counts/rows, never unmasked contacts.

import { DateTime } from "luxon";
import { getDb } from "@/lib/db";
import { User } from "@/lib/db/models";
import {
  RANKS,
  NONEXEC_DESIGNATIONS,
  resolveDesignation,
  HIERARCHY_INDEX,
  type DesigClass,
} from "./designations";
import { parseAnalytics } from "./parser";
import type { EmployeeResult } from "@/lib/search/employeeSearch";
import { queryHolidays, type HolidayRow } from "@/lib/holidays/analytics";
import { HolidayType } from "@/lib/db/models/holiday-master.model";
import { TYPE_LABEL as HOLIDAY_TYPE_LABEL, MONTH_LABEL } from "@/lib/holidays/terms";

async function userRepo() {
  const ds = await getDb();
  return ds.getRepository<User>("User");
}

// ============================================================================
// THE people worker. ONE parameterized query answers every people question —
// count or list — filtered by any combination of: a name fragment, exact
// designation(s), department codes, and executive class. All values are bound
// (injection-safe). Every people-count/list helper below delegates here, so new
// question shapes need new *filters*, not new functions.
// ============================================================================
export interface PeopleFilters {
  nameFragment?: string | null; // partial/phonetic name (first, last, or piece)
  nameExact?: string | null; // quoted: exact whole-word match, case-insensitive
  designations?: string[] | null; // exact canonical designations
  deptCodes?: number[] | null; // departments.code members
  execOnly?: boolean; // designation present and NOT on the S-scale
  nonExecOnly?: boolean; // designation on the S-scale
}
export interface PeopleQuery {
  op: "count" | "list";
  filters: PeopleFilters;
  limit?: number;
}
export interface PeopleQueryResult {
  count: number;
  people?: EmployeeResult[];
}

function buildPeopleWhere(f: PeopleFilters): {
  where: string;
  params: any[];
  needsJoin: boolean;
} {
  const clauses: string[] = [];
  const params: any[] = [];
  let needsJoin = false;

  const frag = (f.nameFragment ?? "").trim();
  if (frag) {
    params.push(`%${frag}%`);
    const pLike = params.length;
    params.push(frag);
    const pPhon = params.length;
    // forgiving: literal substring OR phonetic (sound-alike) — same rule the
    // People search uses, so "goutam" also counts "Gautam".
    clauses.push(
      `(u.name ILIKE $${pLike} OR public.phonetic_subseq_match($${pPhon}, u.name_phonetic))`,
    );
  }

  const exact = (f.nameExact ?? "").trim();
  if (exact) {
    // Quoted term: match the string exactly as a whole word (or contiguous
    // words), case-insensitively — NO phonetic, NO mid-word substring. Uses
    // position() with space padding so "goutam" hits "GOUTAM KARMAKAR" but not
    // "GAUTAM ..." (different spelling) or "GOUTAMA" (not a whole word).
    params.push(exact.toLowerCase());
    clauses.push(
      `position((' ' || $${params.length} || ' ') in (' ' || lower(u.name) || ' ')) > 0`,
    );
  }
  if (f.designations && f.designations.length) {
    params.push(f.designations);
    clauses.push(`u.designation = ANY($${params.length}::text[])`);
  }
  if (f.execOnly) {
    params.push(NONEXEC_DESIGNATIONS);
    clauses.push(
      `u.designation IS NOT NULL AND u.designation <> ALL($${params.length}::text[])`,
    );
  }
  if (f.nonExecOnly) {
    params.push(NONEXEC_DESIGNATIONS);
    clauses.push(`u.designation = ANY($${params.length}::text[])`);
  }
  if (f.deptCodes && f.deptCodes.length) {
    needsJoin = true;
    params.push(f.deptCodes);
    clauses.push(`dp.code = ANY($${params.length}::int[])`);
  }

  const where = clauses.length ? clauses.join(" AND ") : "TRUE";
  return { where, params, needsJoin };
}

export async function queryPeople(
  spec: PeopleQuery,
): Promise<PeopleQueryResult> {
  const d = await getDb();
  const { where, params, needsJoin } = buildPeopleWhere(spec.filters);
  const join = needsJoin
    ? `JOIN public.departments dp ON dp.id = u."departmentId"`
    : `LEFT JOIN public.departments dp ON dp.id = u."departmentId"`;

  const countRows: Array<{ n: number }> = await d.query(
    `SELECT count(*)::int AS n FROM public."user" u ${join} WHERE ${where}`,
    params,
  );
  const count = countRows?.[0]?.n ?? 0;
  if (spec.op === "count") return { count };

  const limit = spec.limit ?? 100;
  const listParams = [...params, limit];
  const rows: any[] = await d.query(
    `SELECT u.id, u.name, u."ticketNo" AS "ticketNo", u."sailPNo" AS "sailPNo",
            u.designation, u."contactNo" AS "contactNo", u.email, dp.name AS dept_name
       FROM public."user" u ${join}
      WHERE ${where}
      ORDER BY NULLIF(regexp_replace(u."ticketNo", '\\D', '', 'g'), '')::int ASC NULLS LAST, u.name ASC
      LIMIT $${listParams.length}`,
    listParams,
  );
  return { count, people: rows.map(rowToEmployee) };
}

/** Count employees whose designation is exactly one of the given strings. */
export async function countDesignations(canonicals: string[]): Promise<number> {
  if (!canonicals.length) return 0;
  return (await queryPeople({ op: "count", filters: { designations: canonicals } }))
    .count;
}

/** Executives = anyone with a designation that is NOT on the S-scale. */
export async function countExecutives(): Promise<number> {
  return (await queryPeople({ op: "count", filters: { execOnly: true } })).count;
}

/** Non-executives = S-1 … S-11. */
export async function countNonExecutives(): Promise<number> {
  return countDesignations(NONEXEC_DESIGNATIONS);
}

/** Total employees on record. */
export async function totalHeadcount(): Promise<number> {
  return (await queryPeople({ op: "count", filters: {} })).count;
}

export interface BreakdownRow {
  designation: string;
  count: number;
  short: string;
  class: DesigClass | "unknown";
}

// canonical -> { short, class } lookup for labelling the breakdown
const META = (() => {
  const m = new Map<string, { short: string; cls: DesigClass }>();
  for (const r of RANKS) m.set(r.canonical, { short: r.short, cls: r.class });
  for (const s of NONEXEC_DESIGNATIONS) m.set(s, { short: s, cls: "nonexec" });
  return m;
})();

/** Full designation-wise breakdown, highest count first. */
export async function designationBreakdown(): Promise<BreakdownRow[]> {
  const r = await userRepo();
  const rows = await r
    .createQueryBuilder("u")
    .select("u.designation", "designation")
    .addSelect("COUNT(*)", "count")
    .where("u.designation IS NOT NULL")
    .groupBy("u.designation")
    .orderBy("COUNT(*)", "DESC")
    .getRawMany<{ designation: string; count: string }>();

  return rows
    .map((row) => {
      const meta = META.get(row.designation);
      return {
        designation: row.designation,
        count: parseInt(row.count, 10) || 0,
        short: meta?.short ?? row.designation,
        class: meta?.cls ?? ("unknown" as const),
      };
    })
    .sort(
      (a, b) =>
        (HIERARCHY_INDEX.get(a.designation) ?? 999) -
        (HIERARCHY_INDEX.get(b.designation) ?? 999),
    );
}

export interface RankCountResult {
  label: string;
  count: number;
  kind: "rank" | "sgrade" | "exec" | "nonexec";
  canonicals: string[];
}

/**
 * Resolve a free term (e.g. "AGM", "executives", "S-1") to its exact count.
 * Returns null if the term isn't a recognised designation/class — the caller
 * then falls through to the next layer (AI, or a different search).
 */
export async function countByTerm(term: string): Promise<RankCountResult | null> {
  const res = resolveDesignation(term);
  if (!res) return null;

  let count: number;
  if (res.kind === "exec") count = await countExecutives();
  else if (res.kind === "nonexec") count = await countNonExecutives();
  else count = await countDesignations(res.canonicals);

  return { label: res.label, count, kind: res.kind, canonicals: res.canonicals };
}


// ============================================================================
// Department-scoped (Phase 2). Uses the validated join
//   user.departmentId -> departments.id, filtered by departments.code.
// Parameterized raw SQL (same pattern as the reveal/phonetic paths).
// ============================================================================

export async function deptHeadcount(codes: number[]): Promise<number> {
  if (!codes.length) return 0;
  return (await queryPeople({ op: "count", filters: { deptCodes: codes } })).count;
}

export async function countByDesignationAndDept(
  canonicals: string[],
  codes: number[],
): Promise<number> {
  if (!codes.length || !canonicals.length) return 0;
  return (
    await queryPeople({
      op: "count",
      filters: { designations: canonicals, deptCodes: codes },
    })
  ).count;
}

export async function execCountInDept(codes: number[]): Promise<number> {
  if (!codes.length) return 0;
  return (
    await queryPeople({ op: "count", filters: { execOnly: true, deptCodes: codes } })
  ).count;
}

export async function nonExecCountInDept(codes: number[]): Promise<number> {
  return countByDesignationAndDept(NONEXEC_DESIGNATIONS, codes);
}

export async function deptBreakdown(codes: number[]): Promise<BreakdownRow[]> {
  if (!codes.length) return [];
  const d = await getDb();
  const rows: Array<{ designation: string; count: number }> = await d.query(
    `SELECT u.designation AS designation, count(*)::int AS count
       FROM public."user" u
       JOIN public.departments dp ON dp.id = u."departmentId"
      WHERE dp.code = ANY($1::int[]) AND u.designation IS NOT NULL
      GROUP BY u.designation`,
    [codes],
  );
  return rows
    .map((row) => {
      const meta = META.get(row.designation);
      return {
        designation: row.designation,
        count: Number(row.count) || 0,
        short: meta?.short ?? row.designation,
        class: meta?.cls ?? ("unknown" as const),
      };
    })
    .sort(
      (a, b) =>
        (HIERARCHY_INDEX.get(a.designation) ?? 999) -
        (HIERARCHY_INDEX.get(b.designation) ?? 999),
    );
}

export async function countByTermInDept(
  term: string,
  codes: number[],
): Promise<RankCountResult | null> {
  const res = resolveDesignation(term);
  if (!res) return null;
  let count: number;
  if (res.kind === "exec") count = await execCountInDept(codes);
  else if (res.kind === "nonexec") count = await nonExecCountInDept(codes);
  else count = await countByDesignationAndDept(res.canonicals, codes);
  return { label: res.label, count, kind: res.kind, canonicals: res.canonicals };
}

// ============================================================================
// Single entry point: question text -> ready-to-render answer, or null.
// Shared by the Smart Semantic path and the debug endpoint so they never drift.
// ============================================================================

// ---- People list worker (masked cards, same shape as the employee search) ---
// Local masking (mirrors employeeSearch.ts) so listing a rank/department never
// leaks a raw contact and the frontend can reuse the existing People-row card.
function maskMobileLocal(m: string | null): string | null {
  if (!m) return null;
  const digits = m.replace(/\D/g, "");
  if (digits.length < 4) return "xxxx";
  return `${digits.slice(0, 6)}${"x".repeat(Math.max(0, digits.length - 6))}`;
}
function maskEmailLocal(e: string | null): string | null {
  if (!e) return null;
  const at = e.indexOf("@");
  if (at <= 0) return "xxxxxx";
  return `xxxxxx${e.slice(at)}`;
}

// Shared row -> masked People card (used by queryPeople). Never leaks a raw
// contact; the frontend reuses the existing People-row component.
function rowToEmployee(r: any): EmployeeResult {
  const ticket = (r.ticketNo || "").trim();
  return {
    id: r.id,
    type: "employee",
    name: r.name,
    ticketNo: ticket,
    sailPNo: r.sailPNo || null,
    designation: r.designation || null,
    department: r.dept_name || null,
    mobileMasked: maskMobileLocal(r.contactNo || null),
    emailMasked: maskEmailLocal(r.email || null),
    hasMobile: !!r.contactNo,
    hasEmail: !!r.email,
    isExecutive: /^4\d{5}$/.test(ticket),
    matchKind: "id",
    score: 0,
  } as EmployeeResult;
}

export async function listPeople(
  canonicals: string[],
  codes: number[] | null,
  limit = 100,
): Promise<EmployeeResult[]> {
  if (!canonicals.length) return [];
  return (
    await queryPeople({
      op: "list",
      filters: { designations: canonicals, deptCodes: codes ?? undefined },
      limit,
    })
  ).people ?? [];
}

export interface AnalyticsPayload {
  kind: "count" | "total" | "breakdown" | "pending";
  answer: string;
  label?: string;
  count?: number;
  rows?: BreakdownRow[];
  people?: EmployeeResult[];
  listTruncated?: boolean;
  /** Stage 2: holiday rows for a holiday list query (rendered like People). */
  holidays?: HolidayRow[];
}

export async function answerAnalytics(q: string): Promise<AnalyticsPayload | null> {
  const intent = await parseAnalytics(q);
  if (!intent) return null;

  // Shared across every holiday case below: a result with yearAvailable ===
  // false means the requested year simply isn't loaded. Say so plainly
  // instead of returning null (which hands off to circular/semantic search
  // and surfaces confusing, unrelated-looking results for what is really
  // just "that year isn't loaded yet").
  const holidayYearNotLoaded = (year: number): AnalyticsPayload => ({
    kind: "pending",
    answer: `I don't have holiday data loaded for ${year} yet.`,
  });

  switch (intent.kind) {
    case "deptUnknown":
      return {
        kind: "pending",
        answer: `I couldn't identify the department “${intent.dept}”. Try its full name or a known short form (e.g. C&IT, ETL).`,
      };
    case "deptTotal": {
      const n = await deptHeadcount(intent.codes);
      return {
        kind: "count",
        count: n,
        answer: `${intent.deptName} has ${n.toLocaleString()} employees.`,
      };
    }
    case "deptBreakdown": {
      const rows = await deptBreakdown(intent.codes);
      return {
        kind: "breakdown",
        rows,
        answer: `Designation-wise breakdown for ${intent.deptName} (${rows.length} designations).`,
      };
    }
    case "people": {
      const res = intent.codes
        ? await countByTermInDept(intent.term, intent.codes)
        : await countByTerm(intent.term);
      if (!res) return null;
      const scope = intent.scopeName;
      const answer = scope
        ? res.kind === "exec"
          ? `${scope} has ${res.count.toLocaleString()} executives.`
          : res.kind === "nonexec"
            ? `${scope} has ${res.count.toLocaleString()} non-executives.`
            : `${scope} has ${res.count.toLocaleString()} ${res.label}.`
        : res.kind === "exec"
          ? `DSP has ${res.count.toLocaleString()} executives.`
          : res.kind === "nonexec"
            ? `DSP has ${res.count.toLocaleString()} non-executives (S-scale).`
            : `DSP currently has ${res.count.toLocaleString()} ${res.label}.`;
      const payload: AnalyticsPayload = {
        kind: "count",
        label: res.label,
        count: res.count,
        answer,
      };
      if (intent.list) {
        const people = await listPeople(res.canonicals, intent.codes ?? null, 100);
        payload.people = people;
        payload.listTruncated = res.count > people.length;
      }
      return payload;
    }
    case "peopleByName": {
      // Count/list employees whose NAME matches a fragment (partial + phonetic),
      // optionally scoped to a department. Always fetch the list — for a name,
      // *who* they are is the useful part.
      const res = await queryPeople({
        op: "list",
        filters: {
          ...(intent.exact
            ? { nameExact: intent.fragment }
            : { nameFragment: intent.fragment }),
          deptCodes: intent.codes ?? undefined,
        },
        limit: 100,
      });
      // A weak (unquoted, unverified) candidate that matches nobody is probably
      // not a name at all -> hand off to the next search lane instead of "0".
      if (res.count === 0 && !intent.strong) return null;
      const scope = intent.scopeName ? ` in ${intent.scopeName}` : "";
      const noun = res.count === 1 ? "person" : "people";
      const answer =
        res.count === 0
          ? `No employees named “${intent.fragment}”${scope}.`
          : `${res.count.toLocaleString()} ${noun} named “${intent.fragment}”${scope}.`;
      const payload: AnalyticsPayload = {
        kind: "count",
        label: intent.fragment,
        count: res.count,
        answer,
      };
      if (res.people && res.people.length) {
        payload.people = res.people;
        payload.listTruncated = res.count > res.people.length;
      }
      return payload;
    }
    case "total": {
      const n = await totalHeadcount();
      return {
        kind: "total",
        count: n,
        answer: `DSP has ${n.toLocaleString()} employees on record.`,
      };
    }
    case "breakdown": {
      const rows = await designationBreakdown();
      return {
        kind: "breakdown",
        rows,
        answer: `Designation-wise breakdown across DSP (${rows.length} designations).`,
      };
    }

    // ==========================================================================
    // Stage 2 — holidays. queryHolidays() is the one parameterized worker; every
    // case below just shapes its result into an AnalyticsPayload. A result with
    // yearAvailable === false means the requested year isn't loaded at all --
    // this must say so plainly (see holidayYearNotLoaded below) rather than
    // return null, which hands off to circular/semantic search and produces
    // confusing, unrelated-looking results for what is really just an honest
    // "that year isn't loaded yet."
    // ==========================================================================
    case "holidayCount": {
      // Closed holidays apply to EVERY employee category -- holidayyear
      // never sets `categories` on a CH row (see queryHolidays' buildWhere
      // comment), so filtering a CH count by category would always
      // silently return 0. That reads as "Category X gets none," which is
      // the opposite of the truth. Drop the inapplicable filter and say so.
      if (intent.type === HolidayType.CH && intent.category) {
        const res = await queryHolidays({ op: "count", filters: { year: intent.year, type: intent.type } });
        if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
        const noun = res.count === 1 ? "Closed holiday" : "Closed holidays";
        return {
          kind: "count",
          count: res.count,
          answer: `Closed holidays apply to every employee category, including Category ${intent.category} — there ${res.count === 1 ? "is" : "are"} ${res.count.toLocaleString()} ${noun} in ${intent.year}.`,
        };
      }

      // Restricted Holiday entitlement per category is a QUOTA fact
      // (holiday_rh_quota) -- RH rows themselves never carry a category
      // either (same reason as CH above), so a plain row-count filtered by
      // category would also always silently return 0. Answer from the
      // real source instead.
      if (intent.type === HolidayType.RH && intent.category) {
        const quotaRes = await queryHolidays({
          op: "rhQuota",
          filters: { year: intent.year, category: intent.category },
        });
        if (quotaRes.yearAvailable === false) return holidayYearNotLoaded(intent.year);
        const row = (quotaRes.rhQuota ?? [])[0];
        if (!row) {
          return {
            kind: "pending",
            answer: `I couldn't find an RH quota for Category ${intent.category} in ${intent.year}.`,
          };
        }
        const noun = row.quota === 1 ? "Restricted Holiday" : "Restricted Holidays";
        return {
          kind: "count",
          count: row.quota,
          answer: `Restricted Holidays aren't assigned per category — Category ${row.category} can choose ${row.quota} ${noun} in ${intent.year} from the full RH list.`,
        };
      }

      const res = await queryHolidays({
        op: "count",
        filters: { year: intent.year, type: intent.type, category: intent.category },
      });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      const label = intent.type ? `${HOLIDAY_TYPE_LABEL[intent.type]} holiday` : "holiday";
      const noun = res.count === 1 ? label : `${label}s`;
      const forCategory = intent.category ? ` for Category ${intent.category}` : "";
      return {
        kind: "count",
        count: res.count,
        answer: `There ${res.count === 1 ? "is" : "are"} ${res.count.toLocaleString()} ${noun} in ${intent.year}${forCategory}.`,
      };
    }

    case "holidayList": {
      // Same reasoning as holidayCount above: CH applies to every category,
      // so a category filter on a CH list is dropped and the answer says
      // so explicitly, instead of "No Closed holidays found ... for
      // Category A" -- which reads as Category A getting none, when in
      // fact they get every one of them, same as everyone else.
      if (intent.type === HolidayType.CH && intent.category) {
        const res = await queryHolidays({ op: "list", filters: { year: intent.year, type: intent.type, month: intent.month } });
        if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
        const rows = res.holidays ?? [];
        const scope = intent.month ? ` in ${MONTH_LABEL[intent.month]}` : "";
        const answer = rows.length
          ? `Closed holidays apply to every employee category, including Category ${intent.category} — ${rows.length} in ${intent.year}${scope}.`
          : `No Closed holidays found in ${intent.year}${scope} (this applies to every employee category, including Category ${intent.category}).`;
        return { kind: "count", count: rows.length, answer, holidays: rows };
      }

      // RH per-category entitlement is a QUOTA, not a distinct subset of
      // the RH list -- every employee picks from the same master list, so
      // "restricted holidays for Category D" has no different list than
      // the full one. Show the full list plus the real quota fact together,
      // rather than a category filter that would always silently be empty.
      if (intent.type === HolidayType.RH && intent.category) {
        const [listRes, quotaRes] = await Promise.all([
          queryHolidays({ op: "list", filters: { year: intent.year, type: intent.type, month: intent.month } }),
          queryHolidays({ op: "rhQuota", filters: { year: intent.year, category: intent.category } }),
        ]);
        if (listRes.yearAvailable === false || quotaRes.yearAvailable === false) {
          return holidayYearNotLoaded(intent.year);
        }
        const rows = listRes.holidays ?? [];
        const quotaRow = (quotaRes.rhQuota ?? [])[0];
        const quotaText = quotaRow
          ? ` Category ${quotaRow.category}'s quota is ${quotaRow.quota} of these.`
          : "";
        const scope = intent.month ? ` in ${MONTH_LABEL[intent.month]}` : "";
        const answer = `Restricted Holidays aren't assigned per category — here ${rows.length === 1 ? "is" : "are"} all ${rows.length} in ${intent.year}${scope}.${quotaText}`;
        return { kind: "count", count: rows.length, answer, holidays: rows };
      }

      const res = await queryHolidays({
        op: "list",
        filters: { year: intent.year, type: intent.type, month: intent.month, category: intent.category },
      });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      const rows = res.holidays ?? [];
      const label = intent.type ? `${HOLIDAY_TYPE_LABEL[intent.type]} holiday` : "holiday";
      const scope = intent.month ? ` in ${MONTH_LABEL[intent.month]}` : "";
      const forCategory = intent.category ? ` for Category ${intent.category}` : "";
      const answer = rows.length
        ? `${rows.length} ${rows.length === 1 ? label : `${label}s`} in ${intent.year}${scope}${forCategory}.`
        : `No ${label}s found in ${intent.year}${scope}${forCategory}.`;
      return {
        kind: "count",
        count: rows.length,
        answer,
        holidays: rows,
      };
    }

    case "holidayBreakdown": {
      const res = await queryHolidays({ op: "breakdown", filters: { year: intent.year } });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      const byType = res.byType ?? [];
      const rows: BreakdownRow[] = byType.map((b) => ({
        designation: b.type,
        count: b.count,
        short: `${b.label} (${b.type})`,
        class: "unknown",
      }));
      return {
        kind: "breakdown",
        rows,
        answer: `Holiday breakdown for ${intent.year}: ${byType.map((b) => `${b.label} ${b.count}`).join(", ")}.`,
      };
    }

    case "holidayCompare": {
      const res = await queryHolidays({
        op: "compare",
        filters: { year: intent.yearA, yearB: intent.yearB },
      });
      if (res.yearAvailable === false) {
        return {
          kind: "pending",
          answer: `I can only compare years already loaded in the holiday calendar; ${intent.yearA} or ${intent.yearB} isn't loaded yet.`,
        };
      }
      const c = res.compare!;
      if (intent.type) {
        const row = c.byType.find((t) => t.type === intent.type)!;
        const diff = row.a - row.b;
        const diffTxt = diff === 0 ? "no change" : diff > 0 ? `+${diff}` : `${diff}`;
        return {
          kind: "count",
          count: row.a,
          answer: `${row.label} holidays: ${c.yearA} has ${row.a}, ${c.yearB} had ${row.b} (${diffTxt}).`,
        };
      }
      const parts = c.byType.map((t) => `${t.label} ${c.yearA}: ${t.a} vs ${c.yearB}: ${t.b}`);
      return {
        kind: "count",
        count: c.totalA,
        answer: `${c.yearA} has ${c.totalA} holidays total vs ${c.yearB}'s ${c.totalB}. ${parts.join("; ")}.`,
      };
    }

    case "holidayFindOne": {
      const now = DateTime.now();
      const yearGiven = intent.year != null;
      const firstYear = intent.year ?? now.year;
      let res = await queryHolidays({ op: "list", filters: { name: intent.name, year: firstYear } });
      if (yearGiven && res.yearAvailable === false) {
        return holidayYearNotLoaded(firstYear);
      }
      if ((res.holidays?.length ?? 0) === 0 && !yearGiven) {
        // No hit in the default (current) year -- search any loaded year.
        res = await queryHolidays({ op: "list", filters: { name: intent.name, year: null } });
      }
      const rows = res.holidays ?? [];
      if (rows.length === 0) {
        return {
          kind: "pending",
          answer: `I couldn't find a holiday named “${intent.name}” in the loaded calendar.`,
        };
      }
      if (rows.length === 1) {
        const r = rows[0];
        const d = DateTime.fromISO(r.date);
        const noteText = r.note ? ` ${r.note}` : "";
        return {
          kind: "count",
          answer: `${r.name} falls on ${d.toFormat("d LLLL yyyy")} (${HOLIDAY_TYPE_LABEL[r.type]}).${noteText}`,
        };
      }
      const lines = rows.map((r) => {
        const d = DateTime.fromISO(r.date);
        return `${d.toFormat("d LLLL yyyy")} (${HOLIDAY_TYPE_LABEL[r.type]})`;
      });
      return { kind: "count", answer: `${intent.name}: ${lines.join("; ")}.` };
    }

    case "holidayTypeLookup": {
      const filters = intent.date
        ? { date: intent.date, year: intent.year }
        : { name: intent.name, year: intent.year };
      const res = await queryHolidays({ op: "list", filters });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      const rows = res.holidays ?? [];
      if (rows.length === 0) {
        const what = intent.date
          ? `${intent.date.day} ${MONTH_LABEL[intent.date.month]} ${intent.year}`
          : `“${intent.name}” in ${intent.year}`;
        return { kind: "pending", answer: `${what} isn't a holiday in the loaded calendar.` };
      }
      const lines = rows.map((r) => `${r.name} (${HOLIDAY_TYPE_LABEL[r.type]})`);
      const notes = Array.from(new Set(rows.map((r) => r.note).filter((n): n is string => !!n)));
      const noteText = notes.length ? ` ${notes.join(" ")}` : "";
      return { kind: "count", answer: `${lines.join(" and ")}.${noteText}` };
    }

    case "holidayExists": {
      const res = await queryHolidays({ op: "list", filters: { date: intent.date, year: intent.year } });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      const rows = res.holidays ?? [];
      const dateLabel = `${intent.date.day} ${MONTH_LABEL[intent.date.month]} ${intent.year}`;
      if (rows.length === 0) {
        return { kind: "count", answer: `No, ${dateLabel} is not a holiday.` };
      }
      const names = rows.map((r) => `${r.name} (${HOLIDAY_TYPE_LABEL[r.type]})`).join(" and ");
      const notes = Array.from(new Set(rows.map((r) => r.note).filter((n): n is string => !!n)));
      const noteText = notes.length ? ` ${notes.join(" ")}` : "";
      return { kind: "count", answer: `Yes — ${dateLabel} is ${names}.${noteText}` };
    }

    case "holidayInvalidCategory":
      return {
        kind: "pending",
        answer: `Category ${intent.input} is not a valid employee category`,
      };

    case "holidayRhQuota": {
      const res = await queryHolidays({
        op: "rhQuota",
        filters: { year: intent.year, category: intent.category },
      });
      if (res.yearAvailable === false) return holidayYearNotLoaded(intent.year);
      const rows = res.rhQuota ?? [];
      if (rows.length === 0) {
        const scope = intent.category ? ` for Category ${intent.category}` : "";
        return {
          kind: "pending",
          answer: `I couldn't find an RH quota${scope} in ${intent.year}.`,
        };
      }
      if (intent.category) {
        const r = rows[0];
        const noun = r.quota === 1 ? "Restricted Holiday" : "Restricted Holidays";
        return {
          kind: "count",
          count: r.quota,
          answer: `Category ${r.category} can take ${r.quota} ${noun} in ${intent.year}.`,
        };
      }
      const parts = rows.map((r) => `Category ${r.category}: ${r.quota}`);
      return {
        kind: "count",
        count: rows.reduce((s, r) => s + r.quota, 0),
        answer: `RH quota for ${intent.year} — ${parts.join(", ")}.`,
      };
    }
  }
  return null;
}
