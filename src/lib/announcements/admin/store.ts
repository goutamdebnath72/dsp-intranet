// src/lib/announcements/admin/store.ts
//
// ANNOUNCEMENT MANAGER DATABASE OPERATIONS (Modular Facility Kit).
// Protected by:
//   - pg_advisory_xact_lock(hashtext('announcements'))
//   - authorityOf / begin (HOD or authorised delegate)
//   - guardRecord (lost update / race condition guard via HMAC version)
//   - append-only logging to public.facility_audit

import type { DataSource } from "typeorm";
import { DateTime } from "luxon";
import { getDb } from "@/lib/db";
import { begin, authorityOf, grantDelegate, revokeDelegate, listDelegates } from "@/lib/facility/authority";
import { writeAudit, recentAuditRows, lastChangeOf } from "@/lib/facility/audit";
import { guardRecord, type Guarded } from "@/lib/facility/guard";
import { versionOf } from "@/lib/concurrency/version";
import { toIsoInstant, IST } from "@/lib/dates";
import { EDIT_DELETE_WINDOW_HOURS } from "@/lib/constants";
import { sanitizeAnnouncementHtml, htmlToPlainText } from "@/lib/announcements/contentProcessing";
import { embedAnnouncement } from "@/lib/announcements/embedAnnouncement";
import type { Actor, FacilityDb, QueryFn } from "@/lib/facility/types";
import type { AnnouncementItemView } from "./types";

export type AnnouncementDb = FacilityDb;

export async function defaultDb(): Promise<AnnouncementDb> {
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

export function announcementVersion(row: {
  id: number;
  title: string;
  content?: string | null;
  date?: unknown;
}): string {
  return versionOf("announcement", [
    row.id,
    String(row.title || "").trim(),
    String(row.content || "").trim(),
    toIsoInstant(row.date) || "",
  ]);
}

export interface AnnouncementDbRow {
  id: number;
  title: string;
  content: string | null;
  contentText: string | null;
  date: any;
  createdAt: any;
  authorTicketNo: string;
  author_name?: string | null;
}

// -----------------------------------------------------------------------------
// Recent Announcements List
// -----------------------------------------------------------------------------

export async function listRecentAnnouncements(
  db: AnnouncementDb,
  actor: Actor,
  limit = 5,
): Promise<AnnouncementItemView[]> {
  return db.run(async (q) => {
    const authority = await authorityOf(q, "announcement", actor.ticket);
    const isHod = authority === "hod";

    const rows = await q(
      `SELECT a.id,
              a.title,
              a.content,
              a."contentText",
              a.date,
              a."createdAt",
              a."authorTicketNo",
              COALESCE(er.name, u.name) AS author_name
         FROM public.announcement a
         LEFT JOIN public.employee_roster er ON er.ticket_no = a."authorTicketNo"
         LEFT JOIN public."user" u ON u."ticketNo" = a."authorTicketNo"
        ORDER BY a."createdAt" DESC, a.id DESC
        LIMIT $1`,
      [limit],
    );

    const now = DateTime.now();

    return rows.map((r: any) => {
      const createdAt = r.createdAt ? DateTime.fromJSDate(new Date(r.createdAt as string | number | Date)) : now;
      const hoursDiff = now.diff(createdAt, "hours").hours;
      const isAuthor = String(r.authorTicketNo ?? "").trim() === actor.ticket;
      const withinWindow = hoursDiff <= EDIT_DELETE_WINDOW_HOURS;
      const canEdit = isHod || (isAuthor && withinWindow);
      const hoursLeft = Math.max(0, Math.round(EDIT_DELETE_WINDOW_HOURS - hoursDiff));

      return {
        id: Number(r.id),
        title: String(r.title ?? "").trim(),
        content: String(r.content ?? ""),
        contentText: r.contentText ? String(r.contentText).trim() : null,
        date: r.date ? new Date(r.date as string | number | Date).toISOString() : new Date().toISOString(),
        createdAt: r.createdAt ? new Date(r.createdAt as string | number | Date).toISOString() : new Date().toISOString(),
        authorTicketNo: String(r.authorTicketNo ?? "").trim(),
        authorName: r.author_name ? String(r.author_name).trim() : null,
        canEdit,
        hoursLeft,
        version: announcementVersion(r),
      };
    });
  });
}

// -----------------------------------------------------------------------------
// Publish Announcement
// -----------------------------------------------------------------------------

export async function publishAnnouncement(
  db: AnnouncementDb,
  actor: Actor,
  input: { title: string; content?: string; date?: string },
): Promise<{ status: "ok"; id: number } | { status: "invalid"; reason: string }> {
  const title = input.title.trim();
  if (!title) return { status: "invalid", reason: "Title/Headline is required." };

  const safeContent = sanitizeAnnouncementHtml(input.content);
  const contentText = htmlToPlainText(safeContent);
  const dateIso = input.date || DateTime.now().setZone(IST).toUTC().toISO();

  const id = await db.run(async (q) => {
    const role = await begin(q, "announcement", actor);
    const rows = await q(
      `INSERT INTO public.announcement (title, content, "contentText", date, "createdAt", "authorTicketNo")
       VALUES ($1, $2, $3, $4, now(), $5)
       RETURNING id`,
      [title, safeContent || null, contentText || null, dateIso, actor.ticket],
    );
    const newId = Number(rows[0].id);

    await writeAudit(q, "announcement", actor, role, "add", {
      targetId: newId,
      after: { id: newId, title },
      note: "Published announcement",
    });

    return newId;
  });

  // Non-blocking embedding generation
  void embedAnnouncement(id, title, contentText);

  return { status: "ok", id };
}

// -----------------------------------------------------------------------------
// Modify Announcement (Protected with HMAC Race Condition Guard)
// -----------------------------------------------------------------------------

export type ModifyResult =
  | { status: "ok" }
  | { status: "not-found" }
  | { status: "forbidden"; reason: string }
  | { status: "stale"; current: AnnouncementItemView; last: any }
  | { status: "invalid"; reason: string };

export async function modifyAnnouncement(
  db: AnnouncementDb,
  actor: Actor,
  input: { id: number; title: string; content?: string; sentVersion?: string },
): Promise<ModifyResult> {
  const title = input.title.trim();
  if (!title) return { status: "invalid", reason: "Title is required." };

  const safeContent = sanitizeAnnouncementHtml(input.content);
  const contentText = htmlToPlainText(safeContent);

  return db.run(async (q): Promise<ModifyResult> => {
    const role = await begin(q, "announcement", actor);
    const isHod = role === "hod";

    const guarded = await guardRecord<AnnouncementDbRow, AnnouncementItemView>(q, "announcement", input.id, {
      sent: input.sentVersion,
      load: async (): Promise<AnnouncementDbRow | null> => {
        const rows = await q(
          `SELECT a.*, COALESCE(er.name, u.name) as author_name
             FROM public.announcement a
             LEFT JOIN public.employee_roster er ON er.ticket_no = a."authorTicketNo"
             LEFT JOIN public."user" u ON u."ticketNo" = a."authorTicketNo"
            WHERE a.id = $1
            FOR UPDATE`,
          [input.id],
        );
        return (rows[0] as unknown as AnnouncementDbRow) || null;
      },
      version: (r) => announcementVersion(r),
      current: (r) => {
        const now = DateTime.now();
        const createdAt = r.createdAt ? DateTime.fromJSDate(new Date(r.createdAt as string | number | Date)) : now;
        const hoursDiff = now.diff(createdAt, "hours").hours;
        return {
          id: Number(r.id),
          title: String(r.title ?? "").trim(),
          content: String(r.content ?? ""),
          contentText: r.contentText ? String(r.contentText).trim() : null,
          date: r.date ? new Date(r.date as string | number | Date).toISOString() : new Date().toISOString(),
          createdAt: r.createdAt ? new Date(r.createdAt as string | number | Date).toISOString() : new Date().toISOString(),
          authorTicketNo: String(r.authorTicketNo ?? "").trim(),
          authorName: r.author_name ? String(r.author_name).trim() : null,
          canEdit: isHod || (String(r.authorTicketNo).trim() === actor.ticket && hoursDiff <= EDIT_DELETE_WINDOW_HOURS),
          hoursLeft: Math.max(0, Math.round(EDIT_DELETE_WINDOW_HOURS - hoursDiff)),
          version: announcementVersion(r),
        };
      },
    });

    if (guarded.status === "missing") return { status: "not-found" };
    if (guarded.status === "stale") return { status: "stale", current: guarded.current, last: guarded.last };

    const old = guarded.row;
    const isAuthor = String(old.authorTicketNo).trim() === actor.ticket;
    const createdAt = old.createdAt ? DateTime.fromJSDate(new Date(old.createdAt as string | number | Date)) : DateTime.now();
    const hoursDiff = DateTime.now().diff(createdAt, "hours").hours;

    if (!isHod && (!isAuthor || hoursDiff > EDIT_DELETE_WINDOW_HOURS)) {
      return {
        status: "forbidden",
        reason: !isAuthor ? "You are not the author of this announcement." : "Modification window has expired.",
      };
    }

    await q(
      `UPDATE public.announcement
          SET title = $1, content = $2, "contentText" = $3
        WHERE id = $4`,
      [title, safeContent || null, contentText || null, input.id],
    );

    await writeAudit(q, "announcement", actor, role, "modify", {
      targetId: input.id,
      before: { title: old.title, content: old.content },
      after: { title, content: safeContent },
      note: "Updated announcement",
    });

    // Re-index embedding asynchronously
    void embedAnnouncement(input.id, title, contentText);

    return { status: "ok" };
  });
}

// -----------------------------------------------------------------------------
// Delete Announcement (Protected with HMAC Race Condition Guard)
// -----------------------------------------------------------------------------

export type DeleteResult =
  | { status: "ok" }
  | { status: "not-found" }
  | { status: "forbidden"; reason: string }
  | { status: "stale"; current: AnnouncementItemView; last: any };

export async function deleteAnnouncement(
  db: AnnouncementDb,
  actor: Actor,
  input: { id: number; sentVersion?: string },
): Promise<DeleteResult> {
  return db.run(async (q): Promise<DeleteResult> => {
    const role = await begin(q, "announcement", actor);
    const isHod = role === "hod";

    const guarded = await guardRecord<AnnouncementDbRow, AnnouncementItemView>(q, "announcement", input.id, {
      sent: input.sentVersion,
      load: async (): Promise<AnnouncementDbRow | null> => {
        const rows = await q(
          `SELECT a.*, COALESCE(er.name, u.name) as author_name
             FROM public.announcement a
             LEFT JOIN public.employee_roster er ON er.ticket_no = a."authorTicketNo"
             LEFT JOIN public."user" u ON u."ticketNo" = a."authorTicketNo"
            WHERE a.id = $1
            FOR UPDATE`,
          [input.id],
        );
        return (rows[0] as unknown as AnnouncementDbRow) || null;
      },
      version: (r) => announcementVersion(r),
      current: (r) => {
        const now = DateTime.now();
        const createdAt = r.createdAt ? DateTime.fromJSDate(new Date(r.createdAt as string | number | Date)) : now;
        const hoursDiff = now.diff(createdAt, "hours").hours;
        return {
          id: Number(r.id),
          title: String(r.title ?? "").trim(),
          content: String(r.content ?? ""),
          contentText: r.contentText ? String(r.contentText).trim() : null,
          date: r.date ? new Date(r.date as string | number | Date).toISOString() : new Date().toISOString(),
          createdAt: r.createdAt ? new Date(r.createdAt as string | number | Date).toISOString() : new Date().toISOString(),
          authorTicketNo: String(r.authorTicketNo ?? "").trim(),
          authorName: r.author_name ? String(r.author_name).trim() : null,
          canEdit: isHod || (String(r.authorTicketNo).trim() === actor.ticket && hoursDiff <= EDIT_DELETE_WINDOW_HOURS),
          hoursLeft: Math.max(0, Math.round(EDIT_DELETE_WINDOW_HOURS - hoursDiff)),
          version: announcementVersion(r),
        };
      },
    });

    if (guarded.status === "missing") return { status: "not-found" };
    if (guarded.status === "stale") return { status: "stale", current: guarded.current, last: guarded.last };

    const old = guarded.row;
    const isAuthor = String(old.authorTicketNo).trim() === actor.ticket;
    const createdAt = old.createdAt ? DateTime.fromJSDate(new Date(old.createdAt as string | number | Date)) : DateTime.now();
    const hoursDiff = DateTime.now().diff(createdAt, "hours").hours;

    if (!isHod && (!isAuthor || hoursDiff > EDIT_DELETE_WINDOW_HOURS)) {
      return {
        status: "forbidden",
        reason: !isAuthor ? "You are not the author of this announcement." : "Deletion window has expired.",
      };
    }

    await q(`DELETE FROM public.announcement_read_status WHERE "announcementId" = $1`, [input.id]);
    await q(`DELETE FROM public.announcement WHERE id = $1`, [input.id]);

    await writeAudit(q, "announcement", actor, role, "delete", {
      targetId: input.id,
      before: { title: old.title, content: old.content },
      note: "Deleted announcement",
    });

    return { status: "ok" };
  });
}

// -----------------------------------------------------------------------------
// Delegation & Audit (HOD-only)
// -----------------------------------------------------------------------------

export async function listAnnouncementDelegates(db: AnnouncementDb) {
  return listDelegates(db, "announcement");
}

export async function grantAnnouncementDelegate(
  db: AnnouncementDb,
  actor: Actor,
  target: { ticket: string; name: string; confirmNonExecutive?: boolean },
) {
  return grantDelegate(db, "announcement", actor, target);
}

export async function revokeAnnouncementDelegate(
  db: AnnouncementDb,
  actor: Actor,
  targetTicket: string,
) {
  return revokeDelegate(db, "announcement", actor, targetTicket);
}

export async function listAnnouncementAudit(db: AnnouncementDb, limit = 50) {
  return recentAuditRows(db, "announcement", limit);
}
