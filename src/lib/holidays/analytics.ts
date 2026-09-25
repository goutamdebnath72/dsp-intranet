// src/lib/holidays/analytics.ts
//
// THE holiday worker. ONE parameterized query answers every holiday question
// (count / list / find-one / type-lookup / exists / breakdown / compare),
// mirroring queryPeople in src/lib/employees/analytics.ts. Every number comes
// from the DB via parameterized raw SQL (injection-safe) -- never from AI.
//
// Dual-tag rows (the same holiday name appearing twice on the same date under
// two different holidayType values -- confirmed present in the live data,
// e.g. 2026-01-23 "Saraswati Puja/ Basant Panchami/ Netaji's Birth Day" is
// BOTH RH and FH) are counted/listed AS-IS, no dedup -- confirmed with the
// user as intentional, not a bug to design around.

import { DateTime } from "luxon";
import { getDb } from "@/lib/db";
import { HolidayType } from "@/lib/db/models/holiday-master.model";
import { TYPE_LABEL } from "./terms";

export type HolidayOp =
  | "count"
  | "list"
  | "findOne"
  | "typeLookup"
  | "exists"
  | "breakdown"
  | "compare"
  | "rhQuota";

export interface HolidayFilters {
  year?: number | null; // primary year (compare: yearA)
  yearB?: number | null; // compare mode only
  type?: HolidayType | null;
  name?: string | null; // ILIKE on holidaymaster.name
  month?: number | null; // 1..12
  date?: { month: number; day: number } | null;
  category?: string | null; // "A" | "B" | "C" | "D" -- filters holidayyear
  // rows whose categories column (a comma-separated string, e.g. "A,B")
  // contains this letter. Only meaningful for FH rows; CH/RH rows have
  // categories = null since CH applies to everyone and RH entitlement is a
  // quota, not a per-holiday fact.
}

export interface HolidayQuery {
  op: HolidayOp;
  filters: HolidayFilters;
}

export interface HolidayRow {
  id: number;
  name: string;
  type: HolidayType;
  date: string; // ISO yyyy-LL-dd
  categories: string | null; // e.g. "A,B" -- FH rows only, null otherwise
  note: string | null; // one-off reclassification reason, or null
}

export interface HolidayBreakdownRow {
  type: HolidayType;
  label: string;
  count: number;
}

export interface HolidayCompareRow {
  type: HolidayType;
  label: string;
  a: number;
  b: number;
}

export interface HolidayRhQuotaRow {
  category: string;
  quota: number;
}

export interface HolidayQueryResult {
  count: number;
  holidays?: HolidayRow[];
  byType?: HolidayBreakdownRow[];
  compare?: {
    yearA: number;
    yearB: number;
    byType: HolidayCompareRow[];
    totalA: number;
    totalB: number;
  };
  rhQuota?: HolidayRhQuotaRow[];
  /** false = the requested year isn't loaded in holidayyear -- the caller
   *  must NOT invent an answer (see the future-year guard, handoff §2.2). */
  yearAvailable?: boolean;
}

async function db() {
  return getDb();
}

// ----------------------------------------------------------------------------
// Which years actually have rows in holidayyear. Tiny table, short cache
// (mirrors terms.ts's holiday-name cache) so this doesn't round-trip on
// every keystroke-triggered search.
// ----------------------------------------------------------------------------
let yearsCache: { years: number[]; at: number } | null = null;
const YEARS_CACHE_TTL_MS = 60 * 1000;

export async function availableHolidayYears(): Promise<number[]> {
  const now = Date.now();
  if (yearsCache && now - yearsCache.at < YEARS_CACHE_TTL_MS) return yearsCache.years;
  const d = await db();
  const rows: Array<{ year: number }> = await d.query(
    `SELECT DISTINCT year FROM holidayyear ORDER BY year`,
  );
  const years = rows.map((r) => r.year);
  yearsCache = { years, at: now };
  return years;
}

export async function isHolidayYearLoaded(year: number): Promise<boolean> {
  const years = await availableHolidayYears();
  return years.includes(year);
}

// ----------------------------------------------------------------------------
function buildWhere(f: HolidayFilters): { where: string; params: any[] } {
  const clauses: string[] = ["1=1"];
  const params: any[] = [];
  if (f.year != null) {
    params.push(f.year);
    clauses.push(`hy.year = $${params.length}`);
  }
  if (f.type) {
    params.push(f.type);
    clauses.push(`hy."holidayType" = $${params.length}`);
  }
  if (f.month != null) {
    params.push(f.month);
    clauses.push(`EXTRACT(MONTH FROM hy.date)::int = $${params.length}`);
  }
  if (f.date) {
    params.push(f.date.month);
    clauses.push(`EXTRACT(MONTH FROM hy.date)::int = $${params.length}`);
    params.push(f.date.day);
    clauses.push(`EXTRACT(DAY FROM hy.date)::int = $${params.length}`);
  }
  if (f.name && f.name.trim()) {
    params.push(`%${f.name.trim()}%`);
    clauses.push(`hm.name ILIKE $${params.length}`);
  }
  if (f.category && f.category.trim()) {
    params.push(f.category.trim());
    // categories is a comma-separated string, e.g. "A,B" -- string_to_array
    // + array containment is the correct "comma list contains this value"
    // check, rather than a fragile ILIKE substring match (which would
    // wrongly match "A" against a hypothetical future "AB" or similar).
    clauses.push(`string_to_array(hy.categories, ',') @> ARRAY[$${params.length}]::text[]`);
  }
  return { where: clauses.join(" AND "), params };
}

function rowToHoliday(r: any): HolidayRow {
  const d: DateTime = DateTime.fromJSDate(new Date(r.date));
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    date: d.toISODate() ?? "",
    categories: r.categories ?? null,
    note: r.note ?? null,
  };
}

export async function queryHolidays(spec: HolidayQuery): Promise<HolidayQueryResult> {
  const d = await db();
  const { filters, op } = spec;

  // ---- compare: two years, side by side, every type. ----
  if (op === "compare") {
    const yearA = filters.year ?? DateTime.now().year;
    const yearB = filters.yearB ?? yearA - 1;
    const [loadedA, loadedB] = await Promise.all([
      isHolidayYearLoaded(yearA),
      isHolidayYearLoaded(yearB),
    ]);
    if (!loadedA || !loadedB) return { count: 0, yearAvailable: false };

    const rows: Array<{ year: number; type: HolidayType; n: number }> = await d.query(
      `SELECT year, "holidayType" AS type, count(*)::int AS n
         FROM holidayyear WHERE year = ANY($1::int[]) GROUP BY year, "holidayType"`,
      [[yearA, yearB]],
    );
    const byType: HolidayCompareRow[] = (Object.values(HolidayType) as HolidayType[]).map(
      (t) => ({
        type: t,
        label: TYPE_LABEL[t],
        a: rows.find((r) => r.year === yearA && r.type === t)?.n ?? 0,
        b: rows.find((r) => r.year === yearB && r.type === t)?.n ?? 0,
      }),
    );
    const totalA = byType.reduce((s, r) => s + r.a, 0);
    const totalB = byType.reduce((s, r) => s + r.b, 0);
    return {
      count: totalA,
      compare: { yearA, yearB, byType, totalA, totalB },
      yearAvailable: true,
    };
  }

  // Every other op needs its primary year (when given) actually loaded.
  if (filters.year != null && !(await isHolidayYearLoaded(filters.year))) {
    return { count: 0, yearAvailable: false };
  }

  // ---- rhQuota: per-category RH entitlement for a year -- a genuinely
  // different table (holiday_rh_quota), not holidayyear, since this is a
  // year-level policy fact, not tied to any single holiday. ----
  if (op === "rhQuota") {
    const year = filters.year ?? DateTime.now().year;
    const params: any[] = [year];
    let where = `year = $1`;
    if (filters.category && filters.category.trim()) {
      params.push(filters.category.trim());
      where += ` AND category = $${params.length}`;
    }
    const rows: HolidayRhQuotaRow[] = await d.query(
      `SELECT category, quota FROM holiday_rh_quota WHERE ${where} ORDER BY category ASC`,
      params,
    );
    return { count: rows.length, rhQuota: rows, yearAvailable: true };
  }

  // ---- breakdown: one year, grouped by type. ----
  if (op === "breakdown") {
    const year = filters.year ?? DateTime.now().year;
    const { where, params } = buildWhere({ year });
    const rows: Array<{ type: HolidayType; n: number }> = await d.query(
      `SELECT hy."holidayType" AS type, count(*)::int AS n
         FROM holidayyear hy WHERE ${where} GROUP BY hy."holidayType"`,
      params,
    );
    const byType: HolidayBreakdownRow[] = (Object.values(HolidayType) as HolidayType[]).map(
      (t) => ({
        type: t,
        label: TYPE_LABEL[t],
        count: rows.find((r) => r.type === t)?.n ?? 0,
      }),
    );
    const count = byType.reduce((s, r) => s + r.count, 0);
    return { count, byType, yearAvailable: true };
  }

  // ---- count: simple aggregate. ----
  if (op === "count") {
    const { where, params } = buildWhere(filters);
    const rows: Array<{ n: number }> = await d.query(
      `SELECT count(*)::int AS n FROM holidayyear hy WHERE ${where}`,
      params,
    );
    return { count: rows[0]?.n ?? 0, yearAvailable: true };
  }

  // ---- list | findOne | typeLookup | exists: all need the joined rows;
  // the caller decides how to FORMAT them (single hit, ambiguous list of
  // hits, or a plain list), the SQL shape is identical. ----
  const { where, params } = buildWhere(filters);
  const rows: any[] = await d.query(
    `SELECT hy.id, hy.date, hy."holidayType" AS type, hm.name AS name,
            hy.categories AS categories, hy.note AS note
       FROM holidayyear hy JOIN holidaymaster hm ON hm.id = hy."holidayMasterId"
      WHERE ${where}
      ORDER BY hy.date ASC`,
    params,
  );
  const holidays = rows.map(rowToHoliday);
  return { count: holidays.length, holidays, yearAvailable: true };
}
