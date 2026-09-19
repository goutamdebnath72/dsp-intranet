// src/app/api/employees/[id]/copy/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/employees/:id/copy   body: { field?: "record" | "mobile" | "email" | "name" }
 *
 * Records that a logged-in viewer COPIED an employee's directory record to the
 * clipboard. Writes an audit row with action='copy' (distinguishing it from a
 * 'reveal'). Login-gated. Returns { ok: true } — the clipboard write itself
 * happens client-side; this endpoint only logs the event.
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

  // Optional field label; default to "record" (the whole directory line).
  let field = "record";
  try {
    const body = await request.json();
    if (typeof body?.field === "string") field = body.field;
  } catch {
    // no body -> keep default
  }
  const allowed = new Set(["record", "mobile", "email", "name"]);
  if (!allowed.has(field)) field = "record";

  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  try {
    const ds = await getDb();

    // Resolve the viewed employee's ticket for the audit row.
    const rows = await ds.query(
      `SELECT id, "ticketNo" AS "ticketNo"
       FROM public."user" WHERE id = $1 LIMIT 1`,
      [viewedUserId],
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    const emp = rows[0];

    await ds.query(
      `INSERT INTO public.contact_access_log
         (id, "viewerTicketNo", "viewedUserId", "viewedTicketNo", field, action, "ipAddress", "userAgent", "accessedAt")
       VALUES ($1, $2, $3, $4, $5, 'copy', $6, $7, CURRENT_TIMESTAMP)`,
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

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("❌ Copy log failed:", error?.message ?? error);
    return NextResponse.json({ error: "Copy log failed" }, { status: 500 });
  }
}
