// src/app/api/announcements/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";

// ✅ Import directly from their model files to prevent Webpack module duplication
import { Announcement } from "@/lib/db/models/announcement.model";
import { AnnouncementReadStatus } from "@/lib/db/models/announcement-read-status.model";
import { DateTime } from "luxon";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/**
 * GET: Fetch all announcements and calculate "New" chip status securely.
 */
export async function GET(request: Request) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  try {
    const dataSource = await getDb();

    // Class constructor references mapped securely
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

    const now = DateTime.now();
    const sevenDaysAgo = now.minus({ days: 7 });

    const data = announcements.map((ann) => {
      let parsedDate: DateTime = now;
      const rawDate = ann.date as any;

      if (rawDate && typeof rawDate.toMillis === "function") {
        parsedDate = rawDate;
      } else if (typeof rawDate === "string") {
        parsedDate = DateTime.fromISO(rawDate);
      } else if (rawDate instanceof Date) {
        parsedDate = DateTime.fromJSDate(rawDate);
      }

      const isOlderThan7Days = parsedDate < sevenDaysAgo;
      const hasUserReadIt = userId ? readIds.has(ann.id) : false;
      const shouldHideNewChip = isOlderThan7Days || hasUserReadIt;

      return {
        ...ann,
        isRead: shouldHideNewChip,
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
 * POST: Create a new plant announcement (Admin Restricted Access Pipeline)
 */
export async function POST(request: Request) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  if ((session?.user as any)?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const dataSource = await getDb();
    const { title, content, date } = await request.json();

    if (!title || !date) {
      return NextResponse.json(
        { error: "Title and date are required" },
        { status: 400 },
      );
    }

    const announcementRepo = dataSource.getRepository(Announcement);

    const newAnnouncement = announcementRepo.create({
      title,
      content: content || null,
      date: DateTime.fromISO(date),
      createdAt: DateTime.now(),
    });

    const savedAnnouncement = await announcementRepo.save(newAnnouncement);
    return NextResponse.json(savedAnnouncement, { status: 201 });
  } catch (error) {
    console.error("❌ Failed to create announcement:", error);
    return NextResponse.json(
      { error: "Failed to create announcement" },
      { status: 500 },
    );
  }
}
