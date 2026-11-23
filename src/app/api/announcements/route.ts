// src/app/api/announcements/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { Announcement, AnnouncementReadStatus } from "@/lib/db/models";
import { DateTime } from "luxon";
import { ANNOUNCEMENT_NEW_THRESHOLD_DAYS } from "@/lib/constants"; // This stays the single source of truth

// Important: maximum cache destruction.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/**
 * GET: I fetch all announcements and calculate the "New" chip status securely.
 */
export async function GET(request: Request) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  try {
    const dataSource = await getDb();

    const announcementRepo = dataSource.getRepository(Announcement);
    const announcements = await announcementRepo.find({
      order: { date: "DESC" },
    });

    let readIds = new Set<number>();
    let userId: string | null = null;

    if (session?.user) {
      const activeUserId = (session.user as any).id;
      userId = activeUserId;

      const readStatusRepo = dataSource.getRepository(AnnouncementReadStatus);
      const readStatuses = await readStatusRepo.find({
        where: { userId: activeUserId },
      });
      readIds = new Set(readStatuses.map((r) => r.announcementId));
    }

    // For the PDFs of the announcements I take the name and size only, never the address in storage. A database with no table for them yet simply has none.
    const files = new Map<number, { name: string; bytes: number }>();
    try {
      const rows = (await dataSource.query(`SELECT announcement_id, name, bytes FROM public.announcement_file`)) as Array<Record<string, unknown>>;
      for (const r of rows) files.set(Number(r.announcement_id), { name: String(r.name), bytes: Number(r.bytes) });
    } catch {
      /* no table yet: no files */
    }

    const now = DateTime.now();
    // I use the token from lib/constants.ts.
    const thresholdDate = now.minus({ days: ANNOUNCEMENT_NEW_THRESHOLD_DAYS });

    const data = announcements.map((ann) => {
      let parsedDate: DateTime = now;
      const rawDate = ann.date as any;

      if (rawDate && typeof rawDate.toMillis === "function")
        parsedDate = rawDate;
      else if (typeof rawDate === "string")
        parsedDate = DateTime.fromISO(rawDate);
      else if (rawDate instanceof Date)
        parsedDate = DateTime.fromJSDate(rawDate);

      // My logic: hide the chip if it is expired (older than the threshold) OR if the user has already read it.
      const isExpired = parsedDate < thresholdDate;
      const hasUserReadIt = userId ? readIds.has(ann.id) : false;

      return {
        ...ann,
        isRead: isExpired || hasUserReadIt,
        file: files.get(ann.id) ?? null,
      };
    });

    const response = NextResponse.json(data);
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("Surrogate-Control", "no-store");

    return response;
  } catch (error) {
    console.error(
      "❌ Database layer unreachable. Failed to fetch announcements:",
      error,
    );
    return NextResponse.json([]);
  }
}

/**
 * POST: I moved it to the Announcement Manager (src/lib/announcements/admin). The old handler only tested the database role
 * "admin": no facility authority, no lock, no audit row. Publishing now happens only there.
 */
export async function POST(_request: Request) {
  return NextResponse.json(
    { error: "Announcements are now published, edited and deleted in the Announcement Manager (Search bar, Ctrl+K). This route no longer writes." },
    { status: 410 },
  );
}
