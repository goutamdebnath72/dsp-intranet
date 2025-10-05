// src/app/api/announcements/[id]/read/route.ts

import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- FIX 1: Validate the incoming ID parameter ---
  const announcementId = parseInt(context.params.id, 10);
  if (isNaN(announcementId)) {
    return NextResponse.json({ error: 'Invalid announcement ID' }, { status: 400 });
  }
  // --- END FIX 1 ---

  // Note: The redundant 'await request.text();' has been removed.

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Use the validated announcementId in the database query
    await prisma.announcementReadStatus.upsert({
      where: {
        userId_announcementId: {
          userId: user.id,
          announcementId, // This is now guaranteed to be a number
        },
      },
      update: {},
      create: {
        userId: user.id,
        announcementId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to mark announcement as read:", error);
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}