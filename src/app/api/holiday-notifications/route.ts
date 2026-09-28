// src/app/api/holiday-notifications/route.ts
//
// Four things, one resource, following this codebase's existing convention
// of one route file handling multiple HTTP methods (see circulars/[id]/route.ts):
//   GET    -- called on every fresh login. Returns whether the user has ever
//             registered, their current preference, whether the notification
//             should actually be shown THIS time (the suppress logic lives
//             here, server-side, not trusted to the client), and the
//             upcoming-holidays data itself so the frontend never needs a
//             second round trip.
//   POST   -- register (first-time subscribe). Body: { suppressAfterFirstView?: boolean }.
//   PATCH  -- update an existing subscription: change the suppress
//             preference, and/or mark the one-time notification as seen
//             (called by the frontend right after it displays the
//             suppress=true case).
//   DELETE -- complete unsubscribe. Deletes the row outright -- see the
//             model's header comment for why this is a delete, not a flag.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { User } from "@/lib/db/models/user.model";
import { HolidayNotificationSubscription } from "@/lib/db/models/holiday-notification-subscription.model";
import { queryHolidays, type HolidayRow } from "@/lib/holidays/analytics";
import { DateTime } from "luxon";

async function requireUserId(): Promise<string | NextResponse> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ error: "User profile mismatch" }, { status: 400 });
  }
  return userId;
}

/** The next few DISTINCT upcoming holidays (today onward, current year),
 *  grouped by (date + name) the same way the search feature's table does --
 *  a dual-type day (e.g. both RH and FH) must show once, not twice, in a
 *  compact notification. Capped at 5: this is a login-time popup, not the
 *  full search result table. */
async function getUpcomingHolidaysForNotification(): Promise<
  { date: string; name: string }[]
> {
  const now = DateTime.now();
  const res = await queryHolidays({
    op: "list",
    filters: { year: now.year, fromDate: now.toISODate() },
  });
  const rows: HolidayRow[] = res.holidays ?? [];
  const seen = new Set<string>();
  const out: { date: string; name: string }[] = [];
  for (const r of rows) {
    const key = `${r.date}|${r.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date: r.date, name: r.name });
    if (out.length >= 5) break;
  }
  return out;
}

export async function GET() {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  try {
    const dataSource = await getDb();
    const repo = dataSource.getRepository(HolidayNotificationSubscription);
    const sub = await repo.findOne({ where: { userId } });

    const upcoming = await getUpcomingHolidaysForNotification();

    if (!sub) {
      // Never registered -- the frontend shows the registration prompt,
      // not the notification itself.
      return NextResponse.json({
        registered: false,
        suppressAfterFirstView: false,
        shouldShowNotification: false,
        upcoming,
      });
    }

    // The suppress decision is made HERE, server-side -- never trust the
    // client to decide whether it's "allowed" to show itself again.
    const shouldShowNotification =
      !sub.suppressAfterFirstView || !sub.hasSeenFirstNotification;

    return NextResponse.json({
      registered: true,
      suppressAfterFirstView: sub.suppressAfterFirstView,
      shouldShowNotification,
      upcoming,
    });
  } catch (error: any) {
    console.error("holiday-notifications GET failed:", error);
    return NextResponse.json({ error: "Failed to load notification status" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  let suppressAfterFirstView = false; // the explicit default: show every fresh login
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.suppressAfterFirstView === "boolean") {
      suppressAfterFirstView = body.suppressAfterFirstView;
    }
  } catch {
    /* no body is fine -- use the default */
  }

  try {
    const dataSource = await getDb();
    const userRepo = dataSource.getRepository(User);
    const repo = dataSource.getRepository(HolidayNotificationSubscription);

    const userExists = await userRepo.findOne({ where: { id: userId } });
    if (!userExists) {
      return NextResponse.json({ error: "User not found in records" }, { status: 404 });
    }

    let sub = await repo.findOne({ where: { userId } });
    if (sub) {
      // Already registered -- treat a repeat POST as updating the
      // preference, not an error, so the registration UI can be re-shown
      // safely without needing to know the current state first.
      sub.suppressAfterFirstView = suppressAfterFirstView;
      sub.hasSeenFirstNotification = false;
      sub.updatedAt = DateTime.now();
      await repo.save(sub);
    } else {
      sub = repo.create({
        id: crypto.randomUUID(),
        userId,
        suppressAfterFirstView,
        hasSeenFirstNotification: false,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });
      await repo.save(sub);
    }

    return NextResponse.json({ registered: true, suppressAfterFirstView: sub.suppressAfterFirstView });
  } catch (error: any) {
    console.error("holiday-notifications POST failed:", error);
    return NextResponse.json({ error: "Failed to register for notifications" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  try {
    const body = await request.json().catch(() => ({}));
    const dataSource = await getDb();
    const repo = dataSource.getRepository(HolidayNotificationSubscription);
    const sub = await repo.findOne({ where: { userId } });
    if (!sub) {
      return NextResponse.json({ error: "Not registered yet" }, { status: 404 });
    }

    if (typeof body?.suppressAfterFirstView === "boolean") {
      sub.suppressAfterFirstView = body.suppressAfterFirstView;
      // Changing the preference resets whether "the one showing" has
      // happened -- a person who just turned suppression ON should still
      // get to see it once under the new rule, not have it retroactively
      // count as already used up.
      if (body.suppressAfterFirstView) sub.hasSeenFirstNotification = false;
    }
    if (body?.markSeen === true) {
      sub.hasSeenFirstNotification = true;
    }
    sub.updatedAt = DateTime.now();
    await repo.save(sub);

    return NextResponse.json({
      registered: true,
      suppressAfterFirstView: sub.suppressAfterFirstView,
      hasSeenFirstNotification: sub.hasSeenFirstNotification,
    });
  } catch (error: any) {
    console.error("holiday-notifications PATCH failed:", error);
    return NextResponse.json({ error: "Failed to update notification preferences" }, { status: 500 });
  }
}

export async function DELETE() {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  try {
    const dataSource = await getDb();
    const repo = dataSource.getRepository(HolidayNotificationSubscription);
    await repo.delete({ userId });
    return NextResponse.json({ unsubscribed: true });
  } catch (error: any) {
    console.error("holiday-notifications DELETE failed:", error);
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }
}
