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
import { toIsoInstant, toDateTime, nowIso, IST } from "@/lib/dates";
import { EDIT_DELETE_WINDOW_HOURS } from "@/lib/constants";
import { sanitizeAnnouncementHtml, htmlToPlainText } from "@/lib/announcements/contentProcessing";
import { embedAnnouncement } from "@/lib/announcements/embedAnnouncement";
import type { Actor, FacilityDb, QueryFn } from "@/lib/facility/types";
import { blobFileStorage, checkPdf, type FileStorage, type UploadedPdf } from "@/lib/announcements/attachment";
import { dropFile, ensureFileTable, fileOf, filesOf, saveFile, type StoredFile } from "./files";
import { stripPdfLinks } from "@/lib/announcements/pdfLink";
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
  // a whole number from 1 to 50 (an unchecked client value allowed 1e9 rows of full HTML, or a negative LIMIT = a 500)
  limit = Number.isFinite(limit) ? Math.min(50, Math.max(1, Math.trunc(limit))) : 5;
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
    const files = await filesOf(q, rows.map((r: any) => Number(r.id))); // the PDFs (name and size only); none if the table is not there yet

    return rows.map((r: any) => {
      const createdAt = r.createdAt ? toDateTime(r.createdAt) : now;
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
        date: toIsoInstant(r.date) ?? nowIso(),
        createdAt: toIsoInstant(r.createdAt) ?? nowIso(),
        authorTicketNo: String(r.authorTicketNo ?? "").trim(),
        authorName: r.author_name ? String(r.author_name).trim() : null,
        canEdit,
        hoursLeft,
        version: announcementVersion(r),
        file: files.get(Number(r.id)) ?? null,
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
  input: { title: string; content?: string; date?: string; file?: UploadedPdf },
  storage: FileStorage = blobFileStorage(),
): Promise<{ status: "ok"; id: number } | { status: "invalid"; reason: string }> {
  const title = input.title.trim();
  if (!title) return { status: "invalid", reason: "Title/Headline is required." };
  // A PDF may stand alone (a title and a PDF, no body text); it must be a real PDF of a fair size.
  const pdf = input.file ? checkPdf(input.file) : null;
  if (pdf && !pdf.ok) return { status: "invalid", reason: pdf.reason };

  // Words linked to the PDF need a PDF: an announcement published without one keeps the words and loses the link.
  const safeContent = input.file ? sanitizeAnnouncementHtml(input.content) : stripPdfLinks(sanitizeAnnouncementHtml(input.content));
  const contentText = htmlToPlainText(safeContent);
  // The date must be a real ISO date/time (it went straight to the database before: a bad string was a 500).
  let dateIso: string | null;
  if (input.date) {
    const parsedDate = DateTime.fromISO(input.date);
    if (!parsedDate.isValid) return { status: "invalid", reason: "The announcement date is not a valid date." };
    dateIso = parsedDate.toUTC().toISO();
  } else {
    dateIso = DateTime.now().setZone(IST).toUTC().toISO();
  }

  // The PDF goes to storage BEFORE the transaction (a 10 MB upload must not hold the facility lock); if the transaction fails, it is taken back out.
  let stored: StoredFile | null = null;
  if (input.file && pdf && pdf.ok) {
    const url = await storage.put(`announcements/${pdf.name}`, input.file.bytes, "application/pdf");
    stored = { url, name: pdf.name, bytes: input.file.bytes.length };
  }

  let id: number;
  try {
    id = await db.run(async (q) => {
      const role = await begin(q, "announcement", actor);
      if (stored) await ensureFileTable(q);
      const rows = await q(
        `INSERT INTO public.announcement (title, content, "contentText", date, "createdAt", "authorTicketNo")
         VALUES ($1, $2, $3, $4, now(), $5)
         RETURNING id`,
        [title, safeContent || null, contentText || null, dateIso, actor.ticket],
      );
      const newId = Number(rows[0].id);
      if (stored) await saveFile(q, newId, stored, actor.ticket);

      await writeAudit(q, "announcement", actor, role, "add", {
        targetId: newId,
        after: stored ? { id: newId, title, file: stored.name } : { id: newId, title },
        note: stored ? "Published announcement with a PDF" : "Published announcement",
      });

      return newId;
    });
  } catch (e) {
    if (stored) await storage.del([stored.url]).catch(() => {}); // nothing was saved: the PDF is not left behind
    throw e;
  }

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
  input: { id: number; title: string; content?: string; sentVersion?: string; file?: UploadedPdf; removeFile?: boolean },
  storage: FileStorage = blobFileStorage(),
): Promise<ModifyResult> {
  const title = input.title.trim();
  if (!title) return { status: "invalid", reason: "Title is required." };
  const pdf = input.file ? checkPdf(input.file) : null;
  if (pdf && !pdf.ok) return { status: "invalid", reason: pdf.reason };

  const sanitizedContent = sanitizeAnnouncementHtml(input.content);
  const contentText = htmlToPlainText(sanitizedContent); // (the words are the same with or without a PDF link)

  // A new PDF goes to storage first (outside the lock). If the edit is then refused (stale, forbidden, not found) or fails, it is taken back out; if it succeeds, the PDF it replaced is.
  let stored: StoredFile | null = null;
  if (input.file && pdf && pdf.ok) {
    const url = await storage.put(`announcements/${pdf.name}`, input.file.bytes, "application/pdf");
    stored = { url, name: pdf.name, bytes: input.file.bytes.length };
  }
  let replacedUrl: string | null = null;
  let result: ModifyResult;
  try {
    result = await modifyInTransaction();
  } catch (e) {
    if (stored) await storage.del([stored.url]).catch(() => {});
    throw e;
  }
  if (result.status !== "ok") {
    if (stored) await storage.del([stored.url]).catch(() => {});
  } else if (replacedUrl) {
    await storage.del([replacedUrl]).catch(() => {});
  }
  return result;

  async function modifyInTransaction(): Promise<ModifyResult> {
  return db.run(async (q): Promise<ModifyResult> => {
    const role = await begin(q, "announcement", actor);
    const isHod = role === "hod";

    const guarded = await guardRecord<AnnouncementDbRow, AnnouncementItemView>(q, "announcement", input.id, {
      sent: input.sentVersion,
      load: async (): Promise<AnnouncementDbRow | null> => {
        const rows = await q(
          `SELECT a.id, a.title, a.content, a."contentText", a.date, a."createdAt", a."authorTicketNo",
                  COALESCE(er.name, u.name) AS author_name
             FROM public.announcement a
             LEFT JOIN public.employee_roster er ON er.ticket_no = a."authorTicketNo"
             LEFT JOIN public."user" u ON u."ticketNo" = a."authorTicketNo"
            WHERE a.id = $1
            FOR UPDATE OF a`, // OF a: Postgres refuses to lock the nullable side of the LEFT JOINs (it failed every modify and delete)
          [input.id],
        );
        return (rows[0] as unknown as AnnouncementDbRow) || null;
      },
      version: (r) => announcementVersion(r),
      current: (r) => {
        const now = DateTime.now();
        const createdAt = r.createdAt ? toDateTime(r.createdAt) : now;
        const hoursDiff = now.diff(createdAt, "hours").hours;
        return {
          id: Number(r.id),
          title: String(r.title ?? "").trim(),
          content: String(r.content ?? ""),
          contentText: r.contentText ? String(r.contentText).trim() : null,
          date: toIsoInstant(r.date) ?? nowIso(),
          createdAt: toIsoInstant(r.createdAt) ?? nowIso(),
          authorTicketNo: String(r.authorTicketNo ?? "").trim(),
          authorName: r.author_name ? String(r.author_name).trim() : null,
          canEdit: isHod || (String(r.authorTicketNo).trim() === actor.ticket && hoursDiff <= EDIT_DELETE_WINDOW_HOURS),
          hoursLeft: Math.max(0, Math.round(EDIT_DELETE_WINDOW_HOURS - hoursDiff)),
          version: announcementVersion(r),
        };
      },
    });

    if (guarded.status === "missing") return { status: "not-found" };
    if (guarded.status === "stale") return { status: "stale", current: { ...guarded.current, file: await fileOf(q, input.id).then((f) => (f ? { name: f.name, bytes: f.bytes } : null)) }, last: guarded.last };

    const old = guarded.row;
    const isAuthor = String(old.authorTicketNo).trim() === actor.ticket;
    const createdAt = old.createdAt ? toDateTime(old.createdAt) : DateTime.now();
    const hoursDiff = DateTime.now().diff(createdAt, "hours").hours;

    if (!isHod && (!isAuthor || hoursDiff > EDIT_DELETE_WINDOW_HOURS)) {
      return {
        status: "forbidden",
        reason: !isAuthor ? "You are not the author of this announcement." : "Modification window has expired.",
      };
    }

    // The PDF: a new one replaces the old; "remove" takes it off; neither leaves it as it was.
    let fileNote = "";
    let hasFile: boolean;
    if (stored) {
      await ensureFileTable(q);
      replacedUrl = (await fileOf(q, input.id))?.url ?? null;
      await saveFile(q, input.id, stored, actor.ticket);
      fileNote = ` PDF ${replacedUrl ? "replaced" : "attached"}: ${stored.name}.`;
      hasFile = true;
    } else if (input.removeFile) {
      const prev = await fileOf(q, input.id);
      if (prev) {
        replacedUrl = prev.url;
        await dropFile(q, input.id);
        fileNote = ` PDF removed: ${prev.name}.`;
      }
      hasFile = false;
    } else {
      hasFile = (await fileOf(q, input.id)) !== null;
    }

    // Words linked to the PDF stay linked only if the announcement ends up with a PDF.
    const safeContent = hasFile ? sanitizedContent : stripPdfLinks(sanitizedContent);
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
      note: fileNote ? `Updated announcement.${fileNote}` : "Updated announcement",
    });

    // Re-index embedding asynchronously
    void embedAnnouncement(input.id, title, contentText);

    return { status: "ok" };
  });
  }
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
  storage: FileStorage = blobFileStorage(),
): Promise<DeleteResult> {
  let deletedFileUrl: string | null = null;
  const result = await db.run(async (q): Promise<DeleteResult> => {
    const role = await begin(q, "announcement", actor);
    const isHod = role === "hod";

    const guarded = await guardRecord<AnnouncementDbRow, AnnouncementItemView>(q, "announcement", input.id, {
      sent: input.sentVersion,
      load: async (): Promise<AnnouncementDbRow | null> => {
        const rows = await q(
          `SELECT a.id, a.title, a.content, a."contentText", a.date, a."createdAt", a."authorTicketNo",
                  COALESCE(er.name, u.name) AS author_name
             FROM public.announcement a
             LEFT JOIN public.employee_roster er ON er.ticket_no = a."authorTicketNo"
             LEFT JOIN public."user" u ON u."ticketNo" = a."authorTicketNo"
            WHERE a.id = $1
            FOR UPDATE OF a`, // OF a: Postgres refuses to lock the nullable side of the LEFT JOINs (it failed every modify and delete)
          [input.id],
        );
        return (rows[0] as unknown as AnnouncementDbRow) || null;
      },
      version: (r) => announcementVersion(r),
      current: (r) => {
        const now = DateTime.now();
        const createdAt = r.createdAt ? toDateTime(r.createdAt) : now;
        const hoursDiff = now.diff(createdAt, "hours").hours;
        return {
          id: Number(r.id),
          title: String(r.title ?? "").trim(),
          content: String(r.content ?? ""),
          contentText: r.contentText ? String(r.contentText).trim() : null,
          date: toIsoInstant(r.date) ?? nowIso(),
          createdAt: toIsoInstant(r.createdAt) ?? nowIso(),
          authorTicketNo: String(r.authorTicketNo ?? "").trim(),
          authorName: r.author_name ? String(r.author_name).trim() : null,
          canEdit: isHod || (String(r.authorTicketNo).trim() === actor.ticket && hoursDiff <= EDIT_DELETE_WINDOW_HOURS),
          hoursLeft: Math.max(0, Math.round(EDIT_DELETE_WINDOW_HOURS - hoursDiff)),
          version: announcementVersion(r),
        };
      },
    });

    if (guarded.status === "missing") return { status: "not-found" };
    if (guarded.status === "stale") return { status: "stale", current: { ...guarded.current, file: await fileOf(q, input.id).then((f) => (f ? { name: f.name, bytes: f.bytes } : null)) }, last: guarded.last };

    const old = guarded.row;
    const isAuthor = String(old.authorTicketNo).trim() === actor.ticket;
    const createdAt = old.createdAt ? toDateTime(old.createdAt) : DateTime.now();
    const hoursDiff = DateTime.now().diff(createdAt, "hours").hours;

    if (!isHod && (!isAuthor || hoursDiff > EDIT_DELETE_WINDOW_HOURS)) {
      return {
        status: "forbidden",
        reason: !isAuthor ? "You are not the author of this announcement." : "Deletion window has expired.",
      };
    }

    const file = await fileOf(q, input.id); // its PDF goes with it (the row by cascade; the file in storage after the commit)
    await q(`DELETE FROM public.announcementreadstatus WHERE "announcementId" = $1`, [input.id]);
    await dropFile(q, input.id);
    await q(`DELETE FROM public.announcement WHERE id = $1`, [input.id]);
    deletedFileUrl = file?.url ?? null;

    await writeAudit(q, "announcement", actor, role, "delete", {
      targetId: input.id,
      before: file ? { title: old.title, content: old.content, file: file.name } : { title: old.title, content: old.content },
      note: file ? "Deleted announcement and its PDF" : "Deleted announcement",
    });

    return { status: "ok" };
  });
  if (result.status === "ok" && deletedFileUrl) await storage.del([deletedFileUrl]).catch(() => {});
  return result;
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
