// src/app/api/announcements/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const db = await getDb();
  const session = await getServerSession(authOptions);

  try {
    const announcements = await db.Announcement.findAll({
      order: [["date", "DESC"]],
      raw: true,
    });

    if (!session?.user) {
      const data = announcements.map((ann: any) => ({ ...ann, isRead: false }));
      return NextResponse.json(data);
    }

    const readStatuses = await db.AnnouncementReadStatus.findAll({
      where: { userId: session.user.id },
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
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
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
