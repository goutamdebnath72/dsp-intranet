// src/app/api/announcements/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
// ⛔️ REMOVED: import { authOptions } from "@/lib/auth";
// ✅ ADDED: Import the new async auth function
import { getAuthOptions } from "@/lib/auth";

export async function GET() {
  const db = await getDb();
  // ✅ CHANGED: Call the new async function
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  try {
    // (Your existing logic is unchanged, it now uses the correct 'db')
    const announcements = await db.Announcement.findAll({
      order: [["date", "DESC"]],
      raw: true,
    });

    if (!session?.user) {
      const data = announcements.map((ann: any) => ({ ...ann, isRead: false }));
      return NextResponse.json(data);
    }

    const readStatuses = await db.AnnouncementReadStatus.findAll({
      where: { userId: (session.user as any).id }, // More specific user ID
      raw: true,
    });

    const readIds = new Set(readStatuses.map((r: any) => r.announcementId));

    const data = announcements.map((ann: any) => ({
      ...ann,
      isRead: readIds.has(ann.id),
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error("❌ Failed to fetch announcements:", error);
    return NextResponse.json(
      { error: "Failed to fetch announcements" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const db = await getDb();
  // ✅ CHANGED: Call the new async function
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  if ((session?.user as any)?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    // (Your existing logic is unchanged, it now uses the correct 'db')
    const { title, content, date } = await request.json();
    if (!title || !date) {
      return NextResponse.json(
        { error: "Title and date are required" },
        { status: 400 }
      );
    }

    const newAnnouncement = await db.Announcement.create({
      title,
      content: content || null,
      date: new Date(date),
    });

    return NextResponse.json(newAnnouncement, { status: 201 });
  } catch (error) {
    console.error("❌ Failed to create announcement:", error);
    return NextResponse.json(
      { error: "Failed to create announcement" },
      { status: 500 }
    );
  }
}
