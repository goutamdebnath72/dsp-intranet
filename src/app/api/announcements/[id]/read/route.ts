import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { Announcement, AnnouncementReadStatus, User } from "@/lib/db/models";
import { DateTime } from "luxon";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const announcementId = parseInt(params.id, 10);
  if (isNaN(announcementId)) {
    return NextResponse.json(
      { error: "Invalid announcement ID" },
      { status: 400 },
    );
  }

  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json(
      { error: "User profile mismatch" },
      { status: 400 },
    );
  }

  try {
    const dataSource = await getDb();

    // Using string token lookups to prevent Next.js HMR metadata reference drops
    const announcementRepo =
      dataSource.getRepository<Announcement>("Announcement");
    const userRepo = dataSource.getRepository<User>("User");
    const readStatusRepo = dataSource.getRepository<AnnouncementReadStatus>(
      "AnnouncementReadStatus",
    );

    // 1. Verify that the target announcement exists
    const announcementExists = await announcementRepo.findOne({
      where: { id: announcementId },
    });
    if (!announcementExists) {
      return NextResponse.json(
        { error: "Announcement not found" },
        { status: 404 },
      );
    }

    // 2. Verify that the active session user exists in the DB
    const userExists = await userRepo.findOne({
      where: { id: userId },
    });
    if (!userExists) {
      return NextResponse.json(
        { error: "User not found in records" },
        { status: 404 },
      );
    }

    // 3. Prevent duplicate read rows by checking if already marked
    let status = await readStatusRepo.findOne({
      where: {
        userId,
        announcementId,
      },
    });

    if (!status) {
      status = readStatusRepo.create({
        id: crypto.randomUUID(), // ✅ Generates the required non-null string id
        userId,
        announcementId,
        readAt: DateTime.now(),
      });
      await readStatusRepo.save(status);
    }

    return NextResponse.json({
      message: "Announcement marked as read successfully",
    });
  } catch (error: any) {
    console.error("❌ Failed to mark announcement as read:", error);
    return NextResponse.json(
      { error: "Failed to mark announcement as read", details: error.message },
      { status: 500 },
    );
  }
}
