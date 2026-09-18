// src/app/api/circulars/seen/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { Circular } from "@/lib/db/models/circular.model";
import { CircularReadStatus } from "@/lib/db/models/circular-read-status.model";
import { DateTime } from "luxon";
import { CIRCULAR_NEW_THRESHOLD_HOURS } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/**
 * GET: Returns the "new circular" state for the current session.
 *
 * Rule (B1 — 24h window for both states):
 * - A circular is a *candidate* only if uploaded within the window.
 * - Logged-in: a candidate is "unread" until the user opens it. Reading
 *   every candidate clears the dot early.
 * - Logged-out: every candidate is "unread" (no per-user read state); the
 *   dot rides out the window regardless of who viewed it.
 *
 * Response: { hasNewCircular: boolean, unreadIds: number[] }
 *   unreadIds = the recent circulars this session should show as unread
 *   (used by the modal to bold their titles).
 */
export async function GET(request: Request) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  try {
    const dataSource = await getDb();
    const circularRepo = dataSource.getRepository(Circular);

    const now = DateTime.now();
    const thresholdDate = now.minus({ hours: CIRCULAR_NEW_THRESHOLD_HOURS });

    // Candidate set: circulars uploaded within the window.
    const recentCirculars = await circularRepo
      .createQueryBuilder("c")
      .select(["c.id"])
      .where("c.uploadedAt > :threshold", {
        threshold: thresholdDate.toJSDate(),
      })
      .getMany();

    const recentIds = recentCirculars.map((c) => c.id);

    // No recent circulars at all -> nothing new for anyone.
    if (recentIds.length === 0) {
      return noStore({ hasNewCircular: false, unreadIds: [], newCount: 0 });
    }

    const activeUserId = session?.user ? (session.user as any).id : null;

    let unreadIds: number[];

    if (activeUserId) {
      // Logged-in: subtract the ones this user has already read.
      const readStatusRepo = dataSource.getRepository(CircularReadStatus);
      const readRows = await readStatusRepo.find({
        where: { userId: activeUserId },
        select: { circularId: true },
      });
      const readSet = new Set(readRows.map((r) => r.circularId));
      unreadIds = recentIds.filter((id) => !readSet.has(id));
    } else {
      // Logged-out: every recent circular is "unread".
      unreadIds = recentIds;
    }

    return noStore({
      hasNewCircular: unreadIds.length > 0,
      unreadIds,
      newCount: unreadIds.length,
    });
  } catch (error) {
    console.error("❌ Failed to compute circular new-status:", error);
    // Fail safe: no dot rather than a false alarm.
    return noStore({ hasNewCircular: false, unreadIds: [], newCount: 0 });
  }
}

function noStore(body: unknown) {
  const response = NextResponse.json(body);
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Surrogate-Control", "no-store");
  return response;
}
