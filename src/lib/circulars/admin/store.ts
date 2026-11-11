// src/lib/circulars/admin/store.ts
//
// CIRCULAR MANAGER DATABASE OPERATIONS (Modular Facility Kit).
// Protected by:
//   - pg_advisory_xact_lock(hashtext('circulars'))
//   - authorityOf / begin (HOD or authorised delegate)
//   - append-only logging to public.facility_audit

import type { DataSource } from "typeorm";
import { getDb } from "@/lib/db";
import { grantDelegate, revokeDelegate, listDelegates } from "@/lib/facility/authority";
import { recentAuditRows } from "@/lib/facility/audit";
import { toIsoInstant } from "@/lib/dates";
import type { Actor, FacilityDb, QueryFn } from "@/lib/facility/types";
import type { RecentCircularView } from "./types";

export type CircularDb = FacilityDb;

export async function defaultDb(): Promise<CircularDb> {
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
// Recent Circulars List
// -----------------------------------------------------------------------------

export async function listRecentCirculars(
  db: CircularDb,
  limit = 5,
): Promise<RecentCircularView[]> {
  return db.run(async (q) => {
    const rows = await q(
      `SELECT c.id,
              c.headline,
              c."publishedAt",
              c."uploadedAt",
              c."authorTicketNo",
              c."fileUrls",
              c."serialNumber",
              COALESCE(er.name, u.name) AS author_name,
              COUNT(DISTINCT cc.page_number)::int AS page_count
         FROM public.circulars c
         LEFT JOIN public.circular_chunks cc ON cc.circular_id = c.id
         LEFT JOIN public.employee_roster er ON er.ticket_no = c."authorTicketNo"
         LEFT JOIN public."user" u ON u."ticketNo" = c."authorTicketNo"
        GROUP BY c.id, c.headline, c."publishedAt", c."uploadedAt", c."authorTicketNo", c."fileUrls", c."serialNumber", er.name, u.name
        ORDER BY c."uploadedAt" DESC NULLS LAST, c.id DESC
        LIMIT $1`,
      [limit],
    );

    return rows.map((r: any) => {
      const fileUrls: string[] = Array.isArray(r.fileUrls) ? r.fileUrls : [];
      return {
        id: Number(r.id),
        headline: String(r.headline ?? "").trim(),
        publishedAt: toIsoInstant(r.publishedAt),
        uploadedAt: toIsoInstant(r.uploadedAt),
        authorTicketNo: String(r.authorTicketNo ?? "").trim(),
        authorName: r.author_name ? String(r.author_name).trim() : null,
        pageCount: Number(r.page_count ?? 0) || fileUrls.length,
        fileUrls,
        fileUrl: fileUrls.length > 0 ? fileUrls[0] : null,
        serialNumber: r.serialNumber ? Number(r.serialNumber) : null,
      };
    });
  });
}

// -----------------------------------------------------------------------------
// Delegation (HOD-only)
// -----------------------------------------------------------------------------

export async function listCircularDelegates(db: CircularDb) {
  return listDelegates(db, "circular");
}

export async function grantCircularDelegate(
  db: CircularDb,
  actor: Actor,
  target: { ticket: string; name: string; confirmNonExecutive?: boolean },
) {
  return grantDelegate(db, "circular", actor, target);
}

export async function revokeCircularDelegate(
  db: CircularDb,
  actor: Actor,
  targetTicket: string,
) {
  return revokeDelegate(db, "circular", actor, targetTicket);
}

export async function listCircularAudit(db: CircularDb, limit = 50) {
  return recentAuditRows(db, "circular", limit);
}
