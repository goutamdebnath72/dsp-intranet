// src/app/api/announcements/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  const session = await getServerSession(authOptions);

  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: { date: 'desc' },
    });

    if (!session?.user) {
      // For logged-out users, isRead is always false
      const data = announcements.map(ann => ({ ...ann, isRead: false }));
      return NextResponse.json(data);
    }

    // For logged-in users, check their read status
    const readStatuses = await prisma.announcementReadStatus.findMany({
      where: { userId: session.user.id },
    });
    const readAnnouncementIds = new Set(readStatuses.map(status => status.announcementId));

    const data = announcements.map(ann => ({
      ...ann,
      isRead: readAnnouncementIds.has(ann.id),
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch announcements:", error);
    return NextResponse.json({ error: "Failed to fetch announcements" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  // Secure the endpoint: only admins can create announcements
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { title, content, date } = await request.json();

    if (!title || !date) {
      return NextResponse.json({ error: 'Title and date are required' }, { status: 400 });
    }

    const newAnnouncement = await prisma.announcement.create({
      data: {
        title,
        content: content || null,
        date: new Date(date),
      },
    });

    return NextResponse.json(newAnnouncement, { status: 201 });
  } catch (error) {
    console.error("Failed to create announcement:", error);
    return NextResponse.json({ error: 'Failed to create announcement' }, { status: 500 });
  }
}