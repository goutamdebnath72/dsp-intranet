// src/app/api/circulars/[id]/read/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";

// ✅ Import directly from individual model files to prevent Webpack duplication
import { Circular } from "@/lib/db/models/circular.model";
import { CircularReadStatus } from "@/lib/db/models/circular-read-status.model";
import { User } from "@/lib/db/models/user.model";
import { DateTime } from "luxon";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const circularId = parseInt(params.id, 10);
  if (isNaN(circularId)) {
    return NextResponse.json({ error: "Invalid circular ID" }, { status: 400 });
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

    const circularRepo = dataSource.getRepository(Circular);
    const userRepo = dataSource.getRepository(User);
    const readStatusRepo = dataSource.getRepository(CircularReadStatus);

    // The three checks do not depend on each other, so they run AT ONCE (one round trip to the database instead of three one after another:
    // saving a read used to take 2-3 seconds on a remote database, and the screen waits for it).
    const [circularCount, userCount, alreadyRead] = await Promise.all([
      circularRepo.count({ where: { id: circularId } }),
      userRepo.count({ where: { id: userId } }),
      readStatusRepo.count({ where: { userId, circularId } }),
    ]);
    if (circularCount === 0) {
      return NextResponse.json({ error: "Circular not found" }, { status: 404 });
    }
    if (userCount === 0) {
      return NextResponse.json({ error: "User not found in records" }, { status: 404 });
    }

    // Prevent duplicate read rows (the unique index on userId + circularId is the final guard: two opens at the same moment is not an error).
    if (alreadyRead === 0) {
      try {
        await readStatusRepo.save(
          readStatusRepo.create({
            id: crypto.randomUUID(),
            userId,
            circularId,
            readAt: DateTime.now(),
          }),
        );
      } catch (e: any) {
        const duplicate = e?.code === "23505" || /duplicate key value|unique constraint/i.test(e?.message || "");
        if (!duplicate) throw e;
      }
    }

    return NextResponse.json({
      message: "Circular marked as read successfully",
    });
  } catch (error: any) {
    console.error("❌ Failed to mark circular as read:", error);
    return NextResponse.json(
      { error: "Failed to mark circular as read", details: error.message },
      { status: 500 },
    );
  }
}
