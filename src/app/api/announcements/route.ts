import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { DateTime } from 'luxon';

// Function to fetch all announcements
export async function GET() {
    const session = await getServerSession(authOptions);

    try {
        const announcements = await prisma.announcement.findMany({
            orderBy: { date: 'desc' },
        });

        // If a user is logged in, find their ID via email and get their read statuses
        if (session?.user?.email) {
            const user = await prisma.user.findUnique({
                where: { email: session.user.email },
            });

            if (user) {
                const readStatuses = await prisma.announcementReadStatus.findMany({
                    where: { userId: user.id },
                    select: { announcementId: true },
                });
                const readAnnouncementIds = new Set(readStatuses.map(status => status.announcementId));

                const announcementsWithReadStatus = announcements.map(announcement => ({
                    ...announcement,
                    isRead: readAnnouncementIds.has(announcement.id),
                }));
                return NextResponse.json(announcementsWithReadStatus);
            }
        }

        // For logged-out users, 'isRead' will be false
        const announcementsWithReadStatus = announcements.map(announcement => ({
            ...announcement,
            isRead: false,
        }));
        return NextResponse.json(announcementsWithReadStatus);

    } catch (error) {
        console.error('Failed to fetch announcements:', error);
        return NextResponse.json({ error: 'Failed to fetch announcements' }, { status: 500 });
    }
}

// Function to create a new announcement
export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { title, content } = await request.json();

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        const newAnnouncement = await prisma.announcement.create({
            data: {
                title: title,
                content: content || null,
                date: DateTime.now().toJSDate(),
            },
        });

        return NextResponse.json(newAnnouncement, { status: 201 });
    } catch (error) {
        console.error('Failed to create announcement:', error);
        return NextResponse.json({ error: 'Failed to create announcement' }, { status: 500 });
    }
}