// src/lib/employees/analytics.ts
//
// Deterministic employee analytics. Every number comes from the DB via TypeORM
// QueryBuilder (parameterized, injection-safe) — never from AI. Aggregates only,
// no PII: these functions return counts/rows, never unmasked contacts.

import { getDb } from "@/lib/db";
import { User } from "@/lib/db/models";
import {
  RANKS,
  NONEXEC_DESIGNATIONS,
  resolveDesignation,
  HIERARCHY_INDEX,
  type DesigClass,
} from "./designations";

async function userRepo() {
  const ds = await getDb();
  return ds.getRepository<User>("User");
}

/** Count employees whose designation is exactly one of the given strings. */
export async function countDesignations(canonicals: string[]): Promise<number> {
  if (!canonicals.length) return 0;
  const r = await userRepo();
  return r
    .createQueryBuilder("u")
    .where("u.designation IN (:...names)", { names: canonicals })
    .getCount();
}

/** Executives = anyone with a designation that is NOT on the S-scale. */
export async function countExecutives(): Promise<number> {
  const r = await userRepo();
  return r
    .createQueryBuilder("u")
    .where("u.designation IS NOT NULL")
    .andWhere("u.designation NOT IN (:...s)", { s: NONEXEC_DESIGNATIONS })
    .getCount();
}

/** Non-executives = S-1 … S-11. */
export async function countNonExecutives(): Promise<number> {
  return countDesignations(NONEXEC_DESIGNATIONS);
}

/** Total employees on record. */
export async function totalHeadcount(): Promise<number> {
  const r = await userRepo();
  return r.createQueryBuilder("u").getCount();
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
        class: meta?.cls ?? "unknown",
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
