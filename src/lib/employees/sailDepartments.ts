// src/lib/employees/sailDepartments.ts
//
// DB-backed department resolution, built on `public.sail_department`.
// NAMING NOTE (28 Sep 2026): this table only actually holds DSP's own
// departments -- SAIL is the parent body over 4 separate plants with only
// partly-overlapping structures, so the name is a known imprecision. Renaming
// the live table was considered and deliberately deferred (real, unverifiable
// blast radius: every Stage 8 migration script and any external tool that
// references `sail_department` by name would need to be found and updated in
// lockstep) -- this module keeps the table's name rather than half-renaming
// just the code layer. Resolution is a live, normalized lookup against that
// table (300 rows) for anything typed in full or by its real code, plus a
// small, EXPLICIT alias table for short/cryptic forms a plain name match
// can't catch. Alias entries are added only once confirmed directly (never
// guessed) -- see chat for how each one below was established.

import { getDb } from "@/lib/db";
import {
  resolveDepartment as resolveLegacyDepartment,
  findDepartmentInText as findLegacyDepartmentInText,
} from "./departments";

export interface SailDeptRow {
  id: number;
  code: number;
  name: string;
  cohortScope: "shared" | "executive" | "nonexecutive";
}

let cache: SailDeptRow[] | null = null;
let cacheAt = 0;
const TTL_MS = 5 * 60 * 1000;

export async function loadSailDepartments(): Promise<SailDeptRow[]> {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const d = await getDb();
  const rows: any[] = await d.query(
    `SELECT id, code, name, cohort_scope AS "cohortScope" FROM public.sail_department ORDER BY code`,
  );
  cache = rows.map((r) => ({
    id: Number(r.id),
    code: Number(r.code),
    name: String(r.name),
    cohortScope: r.cohortScope,
  }));
  cacheAt = Date.now();
  return cache;
}

export function invalidateSailDepartmentCache(): void {
  cache = null;
}

export function normDept(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[.\-_/()]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[?!,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DeptGroup {
  name: string;
  ids: number[]; // sail_department.id members -- what queries actually filter on
  codes: number[];
}

// Confirmed groups only -- every code here was verified directly against a
// real sail_department row in chat (28 Sep 2026), never guessed. Extend this
// list the same way: a real code/name pair confirmed by the user, then added.
const CONFIRMED_GROUPS: { name: string; codes: number[]; aliases: string[] }[] = [
  {
    // 98500 = ALL C&IT executives (one code, no split); 98530/98540 = the
    // department's non-exec sections ("COMPUTER and IT STAFF", "C & IT
    // (TECH)"). Granular non-exec section codes generally have no executives
    // of their own -- they belong to the department's one broad exec code
    // instead (confirmed as the general DSP pattern, not specific to C&IT).
    name: "C & IT",
    codes: [98500, 98530, 98540],
    aliases: ["c&it", "cit", "c and it", "computer and it", "it department"],
  },
  {
    name: "Plant Garage (Maintenance / M.H.E.M.D.)",
    codes: [85200],
    aliases: ["maintenance garage", "mhemd", "m h e m d", "m.h.e.m.d", "m.h.e.m.d."],
  },
  {
    name: "Plant Garage (Operation / M.H.E.O.D.)",
    codes: [85110],
    aliases: ["operation garage", "mheod", "m h e o d", "m.h.e.o.d", "m.h.e.o.d."],
  },
];

async function resolveConfirmedGroup(term: string): Promise<DeptGroup | null> {
  const n = normDept(term);
  const all = await loadSailDepartments();
  for (const g of CONFIRMED_GROUPS) {
    if (normDept(g.name) === n || g.aliases.some((a) => normDept(a) === n)) {
      const ids = all.filter((d) => g.codes.includes(d.code)).map((d) => d.id);
      return { name: g.name, ids, codes: g.codes };
    }
  }
  return null;
}

/** Resolve a typed department term to its member sail_department ids. */
export async function resolveSailDepartment(term: string): Promise<DeptGroup | null> {
  const n = normDept(term);
  if (!n) return null;

  const confirmed = await resolveConfirmedGroup(term);
  if (confirmed) return confirmed;

  const all = await loadSailDepartments();

  // Exact normalized-name match against the live table -- works immediately
  // for any of the 300 rows typed in full, no alias needed.
  const exact = all.filter((d) => normDept(d.name) === n);
  if (exact.length) return { name: exact[0].name, ids: exact.map((d) => d.id), codes: exact.map((d) => d.code) };

  // Raw SAIL department code, typed directly.
  const codeNum = Number(term.trim());
  if (Number.isInteger(codeNum) && String(codeNum) === term.trim()) {
    const byCode = all.filter((d) => d.code === codeNum);
    if (byCode.length) return { name: byCode[0].name, ids: byCode.map((d) => d.id), codes: byCode.map((d) => d.code) };
  }

  // Unambiguous substring match only -- mirrors the old departments.ts rule.
  // Multiple partial hits means the term is too vague to guess; caller should
  // treat it as unresolved rather than silently picking one.
  const hits = all.filter((d) => normDept(d.name).includes(n));
  if (hits.length === 1) return { name: hits[0].name, ids: [hits[0].id], codes: [hits[0].code] };

  // Final fallback: the OLD departments.ts, used PURELY as an alias
  // dictionary (28 Sep 2026) -- it already has ~90 hand-curated short forms
  // ("etl", "be", "csd", "cocc", "lrs", "mm", "mt", "rcl", "wrs", etc.) built
  // up over many sessions. Its own `codes` are a different, incompatible
  // numbering scheme and are NEVER used here -- only its canonical `name`
  // (e.g. "etl" -> "ELECTRICAL TECHNICAL LAB") is taken and looked up for
  // real against the LIVE sail_department table below. If the live table's
  // naming has diverged too far to match (the way C&IT's did), this
  // correctly resolves to nothing rather than guessing -- no new alias is
  // ever hardcoded here on the strength of this bridge alone.
  const legacy = resolveLegacyDepartment(term);
  if (legacy) {
    const legacyName = normDept(legacy.name);
    const legacyExact = all.filter((d) => normDept(d.name) === legacyName);
    if (legacyExact.length)
      return { name: legacyExact[0].name, ids: legacyExact.map((d) => d.id), codes: legacyExact.map((d) => d.code) };
    const legacyHits = all.filter(
      (d) => normDept(d.name).includes(legacyName) || legacyName.includes(normDept(d.name)),
    );
    if (legacyHits.length === 1)
      return { name: legacyHits[0].name, ids: [legacyHits[0].id], codes: [legacyHits[0].code] };
  }

  return null;
}

/**
 * Find a department mentioned ANYWHERE in free text (order-independent),
 * matching a confirmed alias or a real stored name as a whole phrase. Longest
 * match wins. NOTE: this is now ASYNC (DB-backed) -- the old departments.ts
 * export was synchronous, so OmnibarModal.tsx's `findDepartmentInText(q)`
 * call site (used to feed the "Intranet Sites" card) needs to become
 * `await findSailDepartmentInText(q)` inside its existing async search
 * handler. Flagging this explicitly rather than leaving it silently broken.
 */
export async function findSailDepartmentInText(
  query: string,
): Promise<{ group: DeptGroup; phrase: string } | null> {
  const nq = ` ${normDept(query)} `;
  const all = await loadSailDepartments();
  let best: { group: DeptGroup; phrase: string; len: number } | null = null;

  for (const g of CONFIRMED_GROUPS) {
    for (const c of [g.name, ...g.aliases]) {
      const nc = normDept(c);
      if (nc.length < 2) continue;
      if (nq.includes(` ${nc} `) && (!best || nc.length > best.len)) {
        const ids = all.filter((d) => g.codes.includes(d.code)).map((d) => d.id);
        best = { group: { name: g.name, ids, codes: g.codes }, phrase: nc, len: nc.length };
      }
    }
  }
  for (const d of all) {
    const nc = normDept(d.name);
    if (nc.length < 2) continue;
    if (nq.includes(` ${nc} `) && (!best || nc.length > best.len)) {
      best = { group: { name: d.name, ids: [d.id], codes: [d.code] }, phrase: nc, len: nc.length };
    }
  }
  if (best) return { group: best.group, phrase: best.phrase };

  // Same legacy-dictionary bridge as resolveSailDepartment above (see its
  // comment) -- only the old file's canonical NAME is used as a lookup key
  // against the live table, never its codes.
  const legacy = findLegacyDepartmentInText(query);
  if (legacy) {
    const legacyName = normDept(legacy.group.name);
    const legacyExact = all.filter((d) => normDept(d.name) === legacyName);
    if (legacyExact.length) {
      return {
        group: { name: legacyExact[0].name, ids: legacyExact.map((d) => d.id), codes: legacyExact.map((d) => d.code) },
        phrase: legacy.phrase,
      };
    }
    const legacyHits = all.filter(
      (d) => normDept(d.name).includes(legacyName) || legacyName.includes(normDept(d.name)),
    );
    if (legacyHits.length === 1) {
      return {
        group: { name: legacyHits[0].name, ids: [legacyHits[0].id], codes: [legacyHits[0].code] },
        phrase: legacy.phrase,
      };
    }
  }

  return null;
}
