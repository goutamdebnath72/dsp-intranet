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
import { syncHolidayPolicyChunks, type PolicyNoteInput, type ReclassificationInput } from "@/lib/holidays/policyChunks";
import type { Actor, Authority, FacilityDb, QueryFn } from "@/lib/facility/types";
import type {
  HolidayYearView,
  PendingExtractionView,
  StagedHolidayEntry,
} from "./types";

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
      `SELECT hy.id, hy."holidayType", hy.date, hm.name
         FROM public.holidayyear hy
         JOIN public.holidaymaster hm ON hy."holidayMasterId" = hm.id
        WHERE hy.year = $1
        ORDER BY hy.date ASC, hm.name ASC`,
      [year],
    );

    const quotas = await q(
      `SELECT category, quota FROM public.holiday_rh_quota WHERE year = $1`,
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

    const fingerprint = rows
      .map((r) => `${r.date}:${r.name}:${r.holidayType}`)
      .join("|");

    const version = versionOf("holiday_year", [
      year,
      totalHolidays,
      quotas.length,
      policyChunkCount,
      fingerprint,
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
  let clean = raw.replace(/^\uFEFF/, "").trim();
  clean = clean.replace(/[^\x20-\x7E\n\r[\]{}:,"'A-Za-z0-9_.\- ]+/g, "");

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

  if (parsed.year && input.expectedYear && parsed.year !== input.expectedYear) {
    return {
      status: "invalid",
      reason: `Year mismatch: Content states year ${parsed.year}, but ${input.expectedYear} was selected.`,
    };
  }

  try {
    return await db.run(async (q) => {
      const role = await begin(q, "holiday", actor);

      // Race-condition check if client provided sentVersion
      if (input.sentVersion) {
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
      }

      // 1. Ensure master records exist for each holiday name
      const masterIds = new Map<string, number>();
      for (const h of parsed.holidays) {
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
          [
            h.date.toISODate(),
            targetYear,
            h.type,
            masterId,
            h.categories,
            h.note,
          ],
        );
      }

      // 4. Update RH quota
      await q(`DELETE FROM public.holiday_rh_quota WHERE year = $1`, [targetYear]);
      for (const rq of parsed.rhQuota) {
        await q(
          `INSERT INTO public.holiday_rh_quota (year, category, quota) VALUES ($1, $2, $3)`,
          [targetYear, rq.category, rq.quota],
        );
      }

      // 5. Build policy notes and reclassifications for vector embeddings
      const reclassifications: ReclassificationInput[] = parsed.holidays
        .filter((h) => h.note)
        .map((h) => ({
          holidayName: h.title,
          date: h.date.toISODate()!,
          note: h.note!,
        }));

      let chunksWritten = 0;
      try {
        const syncRes = await syncHolidayPolicyChunks(
          targetYear,
          parsed.policyNotes,
          reclassifications,
        );
        chunksWritten = syncRes.chunksWritten;
      } catch (embErr) {
        console.warn(`[holiday/store] Policy embedding sync warning:`, embErr);
      }

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

      if (sentVersion) {
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
// Staging Extractions (Review, Confirm & Reject)
// -----------------------------------------------------------------------------

export async function listPendingStaging(db: HolidayDb): Promise<PendingExtractionView[]> {
  return db.run(async (q) => {
    const rows = await q(
      `SELECT id, circular_id, year, status, payload, created_at
         FROM public.holiday_extraction_staging
        WHERE status = 'pending'
        ORDER BY created_at DESC`,
    );

    return rows.map((r): PendingExtractionView => {
      const payload = (r.payload as any) || {};
      const holidays: StagedHolidayEntry[] = (payload.holidays || []).map((h: any) => ({
        name: String(h.name || h.title || ""),
        date: String(h.date || ""),
        type: h.type,
        categories: h.categories ? String(h.categories) : null,
        note: h.note ? String(h.note) : null,
        isNewMaster: Boolean(h.isNewMaster),
        newAlias: h.newAlias ? String(h.newAlias) : null,
      }));

      const newCount = holidays.filter((h) => h.isNewMaster).length;
      const noteCount = holidays.filter((h) => h.note).length;
      const nearMissCount = holidays.filter((h) => h.newAlias).length;

      return {
        id: Number(r.id),
        circularId: Number(r.circular_id),
        year: Number(r.year),
        status: String(r.status),
        createdAt: toIsoInstant(r.created_at) ?? "",
        holidayCount: holidays.length,
        newCount,
        noteCount,
        nearMissCount,
        holidays,
        rhQuota: Array.isArray(payload.rhQuota) ? payload.rhQuota : [],
        warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
      };
    });
  });
}

export async function confirmStaging(
  db: HolidayDb,
  actor: Actor,
  id: number,
): Promise<{ status: "ok"; year: number; holidayCount: number } | { status: "not-found" } | { status: "forbidden" }> {
  try {
    return await db.run(async (q) => {
      const role = await begin(q, "holiday", actor);

      const rows = await q(
        `SELECT id, circular_id, year, payload FROM public.holiday_extraction_staging WHERE id = $1 AND status = 'pending'`,
        [id],
      );
      if (rows.length === 0) return { status: "not-found" };

      const r = rows[0];
      const year = Number(r.year);
      const payload = (r.payload as any) || {};
      const holidays = payload.holidays || [];
      const rhQuota = payload.rhQuota || [];

      // Seed holidays from payload
      for (const h of holidays) {
        let masterId = h.matchedMasterId;
        if (!masterId) {
          const m = await q(`SELECT id FROM public.holidaymaster WHERE name = $1 LIMIT 1`, [h.name]);
          if (m.length > 0) masterId = Number(m[0].id);
          else {
            const ins = await q(`INSERT INTO public.holidaymaster (name, type, aliases) VALUES ($1, $2, $3) RETURNING id`, [h.name, h.type, []]);
            masterId = Number(ins[0].id);
          }
        }

        await q(
          `INSERT INTO public.holidayyear ("date", "year", "holidayType", "holidayMasterId", categories, note)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [h.date, year, h.type, masterId, h.categories || null, h.note || null],
        );
      }

      for (const rq of rhQuota) {
        await q(
          `INSERT INTO public.holiday_rh_quota (year, category, quota) VALUES ($1, $2, $3)`,
          [year, rq.category, rq.quota],
        );
      }

      await q(
        `UPDATE public.holiday_extraction_staging
            SET status = 'confirmed', reviewed_by = $2, reviewed_at = now()
          WHERE id = $1`,
        [id, actor.ticket],
      );

      await writeAudit(q, "holiday", actor, role, "confirm", {
        targetId: year,
        after: { stagingId: id, year, holidayCount: holidays.length },
        note: `Confirmed extraction staging #${id} (${holidays.length} holidays for ${year})`,
      });

      return { status: "ok", year, holidayCount: holidays.length };
    });
  } catch (err: any) {
    if (err.name === "Forbidden") return { status: "forbidden" };
    throw err;
  }
}

export async function rejectStaging(
  db: HolidayDb,
  actor: Actor,
  id: number,
): Promise<{ status: "ok" } | { status: "not-found" } | { status: "forbidden" }> {
  try {
    return await db.run(async (q) => {
      const role = await begin(q, "holiday", actor);

      const rows = await q(
        `SELECT id, year FROM public.holiday_extraction_staging WHERE id = $1 AND status = 'pending'`,
        [id],
      );
      if (rows.length === 0) return { status: "not-found" };

      await q(
        `UPDATE public.holiday_extraction_staging
            SET status = 'rejected', reviewed_by = $2, reviewed_at = now()
          WHERE id = $1`,
        [id, actor.ticket],
      );

      await writeAudit(q, "holiday", actor, role, "reject", {
        targetId: Number(rows[0].year),
        note: `Rejected extraction staging #${id}`,
      });

      return { status: "ok" };
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
