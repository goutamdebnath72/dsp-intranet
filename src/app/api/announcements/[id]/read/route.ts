// src/app/api/announcements/[id]/read/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import db from "@/lib/db"; 
import { authOptions } from "@/lib/auth";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { params } = context;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const announcementId = parseInt(params.id, 10);
  if (isNaN(announcementId)) {
    return NextResponse.json(
      { error: "Invalid announcement ID" },
      { status: 400 }
    );
  }

  try {    
    const user = await db.User.findOne({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    
    // This will create a new entry only if one doesn't already exist
    await db.AnnouncementReadStatus.findOrCreate({
      where: {
        userId: user.id,
        announcementId: announcementId,
      },
      // The 'defaults' will be used to create the new record
      defaults: {
        id: crypto.randomUUID(), // Use built-in crypto for a unique ID
        userId: user.id,
        announcementId: announcementId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to mark announcement as read:", error);
    return NextResponse.json(
      { error: "Failed to mark as read" },
      { status: 500 }
    );
  }
}
