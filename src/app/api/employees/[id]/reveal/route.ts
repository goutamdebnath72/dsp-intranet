// src/app/api/employees/[id]/reveal/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/employees/:id/reveal   body: { field: "mobile" | "email" }
 *
 * Returns the UNMASKED contact value for one employee AND writes an audit row
 * recording who revealed it (viewer ticket), the viewer's IP, and the time.
 * Login-gated.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const viewerTicketNo = (session.user as any).ticketNo || null;
  if (!viewerTicketNo) {
    return NextResponse.json({ error: "No viewer identity" }, { status: 400 });
  }

  const viewedUserId = params.id;
  let field: string;
  try {
    const body = await request.json();
    field = body?.field;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (field !== "mobile" && field !== "email") {
    return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  }

  // Best-effort client IP (behind Vercel/proxies, x-forwarded-for is the chain).
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  try {
    const ds = await getDb();

    // Fetch the target employee's contact + ticket.
    const rows = await ds.query(
      `SELECT id, "ticketNo" AS "ticketNo", "contactNo" AS "contactNo", email
       FROM public."user" WHERE id = $1 LIMIT 1`,
      [viewedUserId],
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    const emp = rows[0];
    const value = field === "mobile" ? emp.contactNo : emp.email;

    // Write the audit row (never blocks the reveal on log failure, but we try).
    try {
      await ds.query(
        `INSERT INTO public.contact_access_log
           (id, "viewerTicketNo", "viewedUserId", "viewedTicketNo", field, "ipAddress", "userAgent", "accessedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [
          crypto.randomUUID(),
          viewerTicketNo,
          emp.id,
          emp.ticketNo,
          field,
          ip,
          userAgent,
        ],
      );
    } catch (logErr: any) {
      console.error("⚠️ contact_access_log write failed:", logErr?.message ?? logErr);
    }

    // Retention is handled by a scheduled pg_cron job (see setup SQL), so no
    // per-request purge here.

    return NextResponse.json({ field, value: value || null });
  } catch (error: any) {
    console.error("❌ Reveal failed:", error?.message ?? error);
    return NextResponse.json({ error: "Reveal failed" }, { status: 500 });
  }
}
