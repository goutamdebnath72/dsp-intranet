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

    // 1. Verify the target circular exists
    const circularExists = await circularRepo.findOne({
      where: { id: circularId },
    });
    if (!circularExists) {
      return NextResponse.json(
        { error: "Circular not found" },
        { status: 404 },
      );
    }

    // 2. Verify the active session user exists in the DB
    const userExists = await userRepo.findOne({
      where: { id: userId },
    });
    if (!userExists) {
      return NextResponse.json(
        { error: "User not found in records" },
        { status: 404 },
      );
    }

    // 3. Prevent duplicate read rows
    let status = await readStatusRepo.findOne({
      where: {
        userId,
        circularId,
      },
    });

    if (!status) {
      status = readStatusRepo.create({
        id: crypto.randomUUID(),
        userId,
        circularId,
        readAt: DateTime.now(),
      });
      await readStatusRepo.save(status);
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
