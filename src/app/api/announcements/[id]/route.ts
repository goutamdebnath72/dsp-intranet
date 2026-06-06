// src/app/api/announcements/[id]/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { Announcement } from "@/lib/db/models/announcement.model";
import { DateTime } from "luxon";
import { EDIT_DELETE_WINDOW_HOURS } from "@/lib/constants";

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
    announcement.title = title || announcement.title;
    announcement.content =
      content !== undefined ? content : announcement.content;

    await announcementRepo.save(announcement);
    return NextResponse.json(announcement);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
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

    await announcementRepo.remove(announcement);
    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
