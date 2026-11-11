// src/lib/holidays/admin/store.ts
//
// HOLIDAY MANAGER DATABASE OPERATIONS (Modular Facility Kit).
// Protected by:
//   - pg_advisory_xact_lock(hashtext('holiday_year'))
//   - authorityOf / begin (HOD or authorised delegate)
//   - guardRecord (lost update / race condition guard via HMAC version)
//   - append-only logging to public.facility_audit

import { HOLIDAY_REVIEW_YEAR_MIN, HOLIDAY_REVIEW_YEAR_MAX } from "@/lib/constants";
import type { DataSource } from "typeorm";
import { DateTime } from "luxon";
import { getDb } from "@/lib/db";
import { begin, authorityOf, grantDelegate, revokeDelegate, listDelegates } from "@/lib/facility/authority";
import { writeAudit, recentAuditRows, lastChangeOf } from "@/lib/facility/audit";
import { guardRecord } from "@/lib/facility/guard";
import { versionOf } from "@/lib/concurrency/version";
import { toIsoInstant } from "@/lib/dates";
import { buildPolicyChunkRows, writePolicyChunkRows, type PolicyChunkRow, type PolicyNoteInput, type ReclassificationInput } from "@/lib/holidays/policyChunks";
import type { Actor, Authority, FacilityDb, QueryFn } from "@/lib/facility/types";
import type { HolidayYearView } from "./types";

export type HolidayDb = FacilityDb;

export async function defaultDb(): Promise<HolidayDb> {
  const ds = await getDb();
  return {
    run: async <T>(fn: (q: QueryFn) => Promise<T>): Promise<T> => {
      const qr = ds.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        const q: QueryFn = async (sql, params) => qr.query(sql, params as never[]);
        const out = await fn(q);
        await qr.commitTransaction();
        return out;
      } catch (e) {
        await qr.rollbackTransaction();
        throw e;
      } finally {
        await qr.release();
      }
    },
    cacheKey: ds,
  };
}

// -----------------------------------------------------------------------------
// Year View & Fingerprint
// -----------------------------------------------------------------------------

export async function getYearView(db: HolidayDb, year: number): Promise<HolidayYearView | null> {
  return db.run(async (q) => {
    const rows = await q(
      `SELECT hy.id, hy."holidayType", to_char(hy.date, 'YYYY-MM-DD') AS d, hm.name, hy.categories, hy.note
         FROM public.holidayyear hy
         JOIN public.holidaymaster hm ON hy."holidayMasterId" = hm.id
        WHERE hy.year = $1
        ORDER BY hy.date ASC, hm.name ASC, hy.id ASC`,
      [year],
    );

    const quotas = await q(
      `SELECT category, quota FROM public.holiday_rh_quota WHERE year = $1 ORDER BY category, quota`,
      [year],
    );

    const chunkRows = await q(
      `SELECT count(*)::int AS count FROM public.holiday_policy_chunks WHERE year = $1`,
      [year],
    );
    const policyChunkCount = Number(chunkRows[0]?.count ?? 0);

    const totalHolidays = rows.length;
    let chCount = 0;
    let fhCount = 0;
    let rhCount = 0;

    for (const r of rows) {
      const type = String(r.holidayType);
      if (type === "CH") chCount++;
      else if (type === "FH") fhCount++;
      else if (type === "RH") rhCount++;
    }

    // EVERYTHING a seed or a clear would overwrite is in the version: date, name, type, categories, note, and the RH quota
    // values (it covered only date/name/type and the number of quota rows, so an edit of a note or a quota went unnoticed).
    const fingerprint = rows
      .map((r) => `${r.d}:${r.name}:${r.holidayType}:${r.categories ?? ""}:${r.note ?? ""}`)
      .join("|");
    const quotaPrint = quotas.map((x) => `${x.category}=${x.quota}`).join("|");

    const version = versionOf("holiday_year", [
      year,
      totalHolidays,
      quotas.length,
      policyChunkCount,
      fingerprint,
      quotaPrint,
    ]);

    const last = await lastChangeOf(q, "holiday", year);

    return {
      year,
      totalHolidays,
      chCount,
      fhCount,
      rhCount,
      rhQuotaCount: quotas.length,
      policyChunkCount,
      version,
      lastChange: last,
    };
  });
}

export async function listAvailableYears(db: HolidayDb): Promise<number[]> {
  return db.run(async (q) => {
    const rows = await q(
      `SELECT DISTINCT year FROM public.holidayyear ORDER BY year DESC`,
    );
    const dbYears = rows.map((r) => Number(r.year)).filter((y) => Number.isFinite(y));
    const rangeYears = Array.from(
      { length: HOLIDAY_REVIEW_YEAR_MAX - HOLIDAY_REVIEW_YEAR_MIN + 1 },
      (_, i) => HOLIDAY_REVIEW_YEAR_MAX - i,
    );
    const set = new Set([...rangeYears, ...dbYears]);
    return Array.from(set).sort((a, b) => b - a);
  });
}

// -----------------------------------------------------------------------------
// Parsing Verified Enriched JSON / TXT
// -----------------------------------------------------------------------------

function extractPureJsonText(raw: string): string {
  // Strip only what is never meant to be there: the BOM, zero-width characters and control characters (tab, CR and LF are
  // kept). The first version removed EVERY non-ASCII character, silently changing Hindi/Bengali holiday names and
  // turning an en dash or curly quote in a policy note into a missing character.
  let clean = raw.replace(/^\uFEFF/, "").trim();
  clean = clean.replace(/[\u200B-\u200D\u2060\uFEFF\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

  const arrayStart = clean.indexOf("[");
  const arrayEnd = clean.lastIndexOf("]");
  const objectStart = clean.indexOf("{");
  const objectEnd = clean.lastIndexOf("}");

  const hasObject = objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart;
  const hasArray = arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart;

  if (hasObject && (!hasArray || objectStart < arrayStart)) {
    return clean.slice(objectStart, objectEnd + 1).trim();
  }
  if (hasArray) {
    return clean.slice(arrayStart, arrayEnd + 1).trim();
  }
  throw new Error("No valid JSON array or object found in content");
}

export interface ParsedHolidayPayload {
  year?: number;
  holidays: Array<{
    title: string;
    date: DateTime;
    type: "CH" | "FH" | "RH";
    categories: string | null;
    note: string | null;
  }>;
  rhQuota: Array<{ category: string; quota: number }>;
  policyNotes: Array<{ topic: string; text: string }>;
}

export function parseHolidayUploadText(rawContent: string): ParsedHolidayPayload {
  const jsonText = extractPureJsonText(rawContent);
  const parsed = JSON.parse(jsonText);

  const rawHolidays: any[] = Array.isArray(parsed) ? parsed : parsed.holidays ?? [];
  const rawRhQuota: any[] = Array.isArray(parsed) ? [] : parsed.rhQuota ?? [];
  const rawPolicyNotes: any[] = Array.isArray(parsed) ? [] : parsed.policyNotes ?? [];
  const declaredYear = typeof parsed.year === "number" ? parsed.year : undefined;

  const holidays = rawHolidays
    .filter((h) => (h.name || h.title) && h.date && h.type)
    .map((h) => {
      const parsedDate = DateTime.fromISO(h.date);
      if (!parsedDate.isValid) {
        throw new Error(`Invalid date format structure detected: ${h.date}`);
      }
      return {
        title: String(h.name || h.title).trim(),
        date: parsedDate,
        type: h.type as "CH" | "FH" | "RH",
        categories: h.categories ? String(h.categories).trim() : null,
        note: h.note ? String(h.note).trim() : null,
      };
    });

  const rhQuota = rawRhQuota
    .filter((q) => q.category && typeof q.quota === "number")
    .map((q) => ({
      category: String(q.category).trim(),
      quota: Number(q.quota),
    }));

  const policyNotes = rawPolicyNotes
    .filter((p) => p.topic && p.text)
    .map((p) => ({
      topic: String(p.topic).trim(),
      text: String(p.text).trim(),
    }));

  return {
    year: declaredYear,
    holidays,
    rhQuota,
    policyNotes,
  };
}

// -----------------------------------------------------------------------------
// Seed Operation (with Concurrency Guard)
// -----------------------------------------------------------------------------

export type SeedResult =
  | { status: "ok"; year: number; holidayCount: number; rhQuotaCount: number; policyChunkCount: number }
  | { status: "stale"; current: HolidayYearView; last: any }
  | { status: "invalid"; reason: string }
  | { status: "forbidden" };

export async function seedYear(
  db: HolidayDb,
  actor: Actor,
  input: {
    rawContent: string;
    expectedYear?: number;
    sentVersion?: string;
  },
): Promise<SeedResult> {
  let parsed: ParsedHolidayPayload;
  try {
    parsed = parseHolidayUploadText(input.rawContent);
  } catch (err: any) {
    return { status: "invalid", reason: err.message || "Failed to parse holiday JSON/TXT" };
  }

  if (parsed.holidays.length === 0) {
    return { status: "invalid", reason: "The uploaded file contains no valid holiday entries." };
  }

  // Infer year from first holiday if not explicitly stated in payload
  const inferredYear = parsed.year ?? parsed.holidays[0].date.year;
  const targetYear = input.expectedYear ?? inferredYear;

  if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
    return { status: "invalid", reason: `Invalid year: ${targetYear}` };
  }
  if (parsed.year && input.expectedYear && parsed.year !== input.expectedYear) {
    return {
      status: "invalid",
      reason: `Year mismatch: Content states year ${parsed.year}, but ${input.expectedYear} was selected.`,
    };
  }

  // Every entry must be for the year being seeded and have a valid type: a file without a "year" field, with 2025 dates,
  // uploaded while 2026 is selected, used to be stored as 2026; and a lower-case type ("ch") failed in the database as a 500.
  for (const h of parsed.holidays) {
    h.type = String(h.type).toUpperCase() as "CH" | "FH" | "RH";
    if (!["CH", "FH", "RH"].includes(h.type)) {
      return { status: "invalid", reason: `"${h.title}" has an unknown type "${h.type}". Use CH, FH or RH.` };
    }
    if (h.date.year !== targetYear) {
      return { status: "invalid", reason: `"${h.title}" is dated ${h.date.toISODate()}, which is not in ${targetYear}. Check the file or the selected year.` };
    }
  }
  for (const rq of parsed.rhQuota) {
    if (!Number.isInteger(rq.quota) || rq.quota < 0) {
      return { status: "invalid", reason: `The RH quota for "${rq.category}" must be a whole number, 0 or more.` };
    }
  }

  // The policy-note embeddings are made BEFORE the lock and the transaction: the network is never waited for while the
  // tool's global write lock is held, and if any embedding fails nothing at all has been touched (the first version
  // swallowed the failure and left the year's policy chunks deleted or half rewritten, with status "ok").
  const reclassifications: ReclassificationInput[] = parsed.holidays
    .filter((h) => h.note)
    .map((h) => ({ holidayName: h.title, date: h.date.toISODate()!, note: h.note! }));
  let chunkRows: PolicyChunkRow[];
  try {
    chunkRows = await buildPolicyChunkRows(targetYear, parsed.policyNotes, reclassifications);
  } catch (embErr: any) {
    console.warn("[holiday/store] policy embedding failed, nothing saved:", embErr?.message || embErr);
    return { status: "invalid", reason: "The holiday notes could not be indexed for search just now (the AI service did not answer). Nothing was saved: please try again in a moment." };
  }

  try {
    return await db.run(async (q) => {
      const role = await begin(q, "holiday", actor);

      // The guard is NOT optional: a request without a version (or with a forged one) is treated as stale, exactly as in
      // the other tools. (It used to run only `if (input.sentVersion)`, so a direct request skipped it.)
      const guarded = await guardRecord(q, "holiday", targetYear, {
        sent: input.sentVersion,
        load: async () => {
          const yv = await getYearView({ run: (fn) => fn(q) }, targetYear);
          return yv ? { id: targetYear, ...yv } : null;
        },
        version: (row) => row.version,
        current: (row) => row,
      });
      if (guarded.status === "stale") {
        return { status: "stale", current: guarded.current, last: guarded.last };
      }

      // 1. Ensure master records exist for each holiday name
      const masterIds = new Map<string, number>();
      for (const h of parsed.holidays) {
        if (masterIds.has(h.title)) continue;
        const existing = await q(
          `SELECT id FROM public.holidaymaster WHERE name = $1 LIMIT 1`,
          [h.title],
        );
        if (existing.length > 0) {
          masterIds.set(h.title, Number(existing[0].id));
        } else {
          const inserted = await q(
            `INSERT INTO public.holidaymaster (name, type, aliases) VALUES ($1, $2, $3) RETURNING id`,
            [h.title, h.type, []],
          );
          masterIds.set(h.title, Number(inserted[0].id));
        }
      }

      // 2. Clear existing holiday instances for this year
      await q(`DELETE FROM public.holidayyear WHERE year = $1`, [targetYear]);

      // 3. Insert fresh holidayyear rows
      for (const h of parsed.holidays) {
        const masterId = masterIds.get(h.title)!;
        await q(
          `INSERT INTO public.holidayyear ("date", "year", "holidayType", "holidayMasterId", categories, note)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [h.date.toISODate(), targetYear, h.type, masterId, h.categories, h.note],
        );
      }

      // 4. RH quota: replaced only when the file states one (a file without rhQuota keeps the year's existing quota, as the
      //    original upload did; the rewrite had started wiping it).
      if (parsed.rhQuota.length > 0) {
        await q(`DELETE FROM public.holiday_rh_quota WHERE year = $1`, [targetYear]);
        for (const rq of parsed.rhQuota) {
          await q(
            `INSERT INTO public.holiday_rh_quota (year, category, quota) VALUES ($1, $2, $3)`,
            [targetYear, rq.category, rq.quota],
          );
        }
      }

      // 5. Policy chunks for search: replaced inside this same transaction (embeddings were made above).
      const chunksWritten = await writePolicyChunkRows(q, targetYear, chunkRows);

      // 6. Record Audit
      await writeAudit(q, "holiday", actor, role, "seed", {
        targetId: targetYear,
        after: {
          year: targetYear,
          holidaysCount: parsed.holidays.length,
          rhQuotaCount: parsed.rhQuota.length,
          policyChunksCount: chunksWritten,
        },
        note: `Seeded ${parsed.holidays.length} holidays, ${parsed.rhQuota.length} RH quotas for ${targetYear}`,
      });

      return {
        status: "ok",
        year: targetYear,
        holidayCount: parsed.holidays.length,
        rhQuotaCount: parsed.rhQuota.length,
        policyChunkCount: chunksWritten,
      };
    });
  } catch (err: any) {
    if (err.name === "Forbidden") return { status: "forbidden" };
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Clear Year Operation (with Concurrency Guard)
// -----------------------------------------------------------------------------

export type ClearResult =
  | { status: "ok"; year: number; holidaysRemoved: number }
  | { status: "stale"; current: HolidayYearView; last: any }
  | { status: "invalid"; reason: string }
  | { status: "forbidden" };

export async function clearYear(
  db: HolidayDb,
  actor: Actor,
  input: { year: number; sentVersion?: string },
): Promise<ClearResult> {
  const { year, sentVersion } = input;
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return { status: "invalid", reason: `Invalid year: ${year}` };
  }

  try {
    return await db.run(async (q) => {
      const role = await begin(q, "holiday", actor);

      // not optional (see seedYear): no version, or a forged one, is stale
      const guarded = await guardRecord(q, "holiday", year, {
        sent: sentVersion,
        load: async () => {
          const yv = await getYearView({ run: (fn) => fn(q) }, year);
          return yv ? { id: year, ...yv } : null;
        },
        version: (row) => row.version,
        current: (row) => row,
      });
      if (guarded.status === "stale") {
        return { status: "stale", current: guarded.current, last: guarded.last };
      }

      const existingRows = await q(
        `SELECT count(*)::int as count FROM public.holidayyear WHERE year = $1`,
        [year],
      );
      const holidaysRemoved = Number(existingRows[0]?.count ?? 0);

      await q(`DELETE FROM public.holidayyear WHERE year = $1`, [year]);
      await q(`DELETE FROM public.holiday_rh_quota WHERE year = $1`, [year]);
      await q(`DELETE FROM public.holiday_policy_chunks WHERE year = $1`, [year]);

      await writeAudit(q, "holiday", actor, role, "clear", {
        targetId: year,
        before: { year, holidaysRemoved },
        note: `Cleared ${holidaysRemoved} holidays and quotas for ${year}`,
      });

      return { status: "ok", year, holidaysRemoved };
    });
  } catch (err: any) {
    if (err.name === "Forbidden") return { status: "forbidden" };
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Delegation and History (Powered by shared facility kit)
// -----------------------------------------------------------------------------

export async function listHolidayDelegates(db: HolidayDb) {
  return listDelegates(db, "holiday");
}

export async function grantHolidayDelegate(
  db: HolidayDb,
  actor: Actor,
  target: { ticket: string; name: string; confirmNonExecutive?: boolean },
) {
  return grantDelegate(db, "holiday", actor, target);
}

export async function revokeHolidayDelegate(
  db: HolidayDb,
  actor: Actor,
  ticket: string,
) {
  return revokeDelegate(db, "holiday", actor, ticket);
}

export async function recentHolidayAudit(db: HolidayDb, limit = 50) {
  return recentAuditRows(db, "holiday", limit);
}
