// src/app/api/announcements/[id]/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { Announcement } from "@/lib/db/models/announcement.model";
import { DateTime } from "luxon";
import { EDIT_DELETE_WINDOW_HOURS } from "@/lib/constants";
import {
  sanitizeAnnouncementHtml,
  htmlToPlainText,
} from "@/lib/announcements/contentProcessing";
import { embedAnnouncement } from "@/lib/announcements/embedAnnouncement";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const announcementId = parseInt(params.id, 10);
  
  try {
    const dataSource = await getDb();
    const announcementRepo = dataSource.getRepository(Announcement);
    const announcement = await announcementRepo.findOne({
      where: { id: announcementId },
    });

    if (!announcement) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(announcement);
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const announcementId = parseInt(params.id, 10);
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  // 1. Authorization: Only Executives (ticketNo starts with 4)
  const ticketNo = (session?.user as any)?.ticketNo || "";
  if (!ticketNo.startsWith("4")) {
    return NextResponse.json(
      { error: "Forbidden: Executive access required" },
      { status: 403 },
    );
  }

  try {
    const dataSource = await getDb();
    const announcementRepo = dataSource.getRepository(Announcement);
    const announcement = await announcementRepo.findOne({
      where: { id: announcementId },
    });

    if (!announcement)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 2. Ownership Check
    if (announcement.authorTicketNo !== ticketNo) {
      return NextResponse.json(
        { error: "Forbidden: You are not the author" },
        { status: 403 },
      );
    }

    // 3. Time Window Check (24 Hours)
    const now = DateTime.now();
    const diff = now.diff(announcement.createdAt, "hours").hours;
    if (diff > EDIT_DELETE_WINDOW_HOURS) {
      return NextResponse.json(
        { error: "Modification window expired" },
        { status: 403 },
      );
    }

    const { title, content } = await request.json();
    const titleChanged =
      typeof title === "string" && title && title !== announcement.title;
    announcement.title = title || announcement.title;

    // Re-sanitize + re-derive the plain-text projection on edit so display
    // stays safe and search stays in sync with the new body.
    let bodyChanged = false;
    if (content !== undefined) {
      const safeContent = sanitizeAnnouncementHtml(content);
      announcement.content = safeContent || undefined;
      announcement.contentText = htmlToPlainText(safeContent) || null;
      bodyChanged = true;
    }

    await announcementRepo.save(announcement);

    // Re-index only when the searchable text actually changed.
    if (titleChanged || bodyChanged) {
      await embedAnnouncement(
        announcement.id,
        announcement.title,
        announcement.contentText,
      );
    }

    return NextResponse.json(announcement);
  } catch (error: any) {
    // Surface the real cause instead of swallowing it — makes a PATCH failure
    // debuggable in the server log and (in dev) the response.
    console.error(
      `PATCH /api/announcements failed for id=${announcementId}:`,
      error?.stack || error?.message || error,
    );
    return NextResponse.json(
      {
        error: "Internal Server Error",
        detail:
          process.env.NODE_ENV === "production"
            ? undefined
            : error?.message || String(error),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const announcementId = parseInt(params.id, 10);
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  const ticketNo = (session?.user as any)?.ticketNo || "";
  if (!ticketNo.startsWith("4")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const dataSource = await getDb();
    const announcementRepo = dataSource.getRepository(Announcement);
    const announcement = await announcementRepo.findOne({
      where: { id: announcementId },
    });

    if (!announcement)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (announcement.authorTicketNo !== ticketNo) {
      return NextResponse.json(
        { error: "Forbidden: Not author" },
        { status: 403 },
      );
    }

    const now = DateTime.now();
    const diff = now.diff(announcement.createdAt, "hours").hours;
    if (diff > EDIT_DELETE_WINDOW_HOURS) {
      return NextResponse.json(
        { error: "Deletion window expired" },
        { status: 403 },
      );
    }

    // ---- ATOMIC DB DELETE (single transaction) ----
    // Mirror the circular delete's rigor: remove every dependent row and the
    // announcement itself together so a mid-delete failure rolls the whole
    // thing back — never leaving an orphaned read-status row. There is no
    // DB-level FK cascade here (schema is synchronize:false, table made by
    // manual SQL), so the child rows MUST be deleted explicitly.
    //
    // Nothing else to clean up: the embedding is a column ON this row (gone
    // with it), and announcements have no blob/file storage.
    await dataSource.transaction(async (manager) => {
      // 1. Delete the child read-status rows (no cascade defined in the DB).
      await manager.query(
        `DELETE FROM public.announcementreadstatus WHERE "announcementId" = $1`,
        [announcementId],
      );

      // 2. Delete the announcement row itself (embedding column included).
      await manager.query(`DELETE FROM public.announcement WHERE id = $1`, [
        announcementId,
      ]);
    });

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error: any) {
    // Surface the real cause instead of swallowing it — makes a DELETE failure
    // debuggable in the server log and (in dev) the response.
    console.error(
      `DELETE /api/announcements failed for id=${announcementId}:`,
      error?.stack || error?.message || error,
    );
    return NextResponse.json(
      {
        error: "Internal Server Error",
        detail:
          process.env.NODE_ENV === "production"
            ? undefined
            : error?.message || String(error),
      },
      { status: 500 },
    );
  }
}
