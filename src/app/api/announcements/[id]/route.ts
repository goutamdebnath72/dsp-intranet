// src/app/api/announcements/[id]/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Announcement } from "@/lib/db/models/announcement.model";

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

// PATCH and DELETE moved to the Announcement Manager (src/lib/announcements/admin): it checks the authority in the
// DATABASE on every request (a revoked delegate loses the right at once), holds the facility lock, protects against
// a lost update with the record version and writes an audit row. The old handlers here checked only "ticket starts
// with 4 and is the author": no audit, no version, and a withdrawn delegate could keep editing and deleting.
export async function PATCH(
  _request: Request,
  _ctx: { params: { id: string } },
) {
  return NextResponse.json(
    { error: "Announcements are now published, edited and deleted in the Announcement Manager (Search bar, Ctrl+K). This route no longer writes." },
    { status: 410 },
  );
}

export async function DELETE(
  _request: Request,
  _ctx: { params: { id: string } },
) {
  return NextResponse.json(
    { error: "Announcements are now published, edited and deleted in the Announcement Manager (Search bar, Ctrl+K). This route no longer writes." },
    { status: 410 },
  );
}
