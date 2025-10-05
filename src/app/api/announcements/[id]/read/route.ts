// src/app/api/announcements/[id]/read/route.ts

// 1. Import 'NextRequest' alongside 'NextResponse'
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function POST(
  // 2. Use 'NextRequest' as the type for the first argument
  request: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const announcementId = parseInt(context.params.id, 10);
  if (isNaN(announcementId)) {
    return NextResponse.json({ error: 'Invalid announcement ID' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.announcementReadStatus.upsert({
      where: {
        userId_announcementId: {
          userId: user.id,
          announcementId,
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