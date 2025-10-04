import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function POST(
  request: Request,
  // The signature of the second argument is changed to be more explicit
  context: { params: { id: string } }
) {
  await request.text();

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // We now get the 'id' from the context object
  const announcementId = parseInt(context.params.id, 10);

  try {
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
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}