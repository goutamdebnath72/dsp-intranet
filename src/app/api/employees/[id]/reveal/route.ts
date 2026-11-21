// src/app/api/employees/[id]/reveal/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { mayReveal, mayRevealPno } from "@/lib/security/revealCap";

export const dynamic = "force-dynamic";

/**
 * POST /api/employees/:id/reveal   body: { field: "mobile" | "email" | "sailpno" | "ticket" }
 *
 * Returns the UNMASKED value of one field of one employee (mobile, e-mail, SAIL P.No., ticket number) AND writes an audit row
 * recording who revealed it (viewer ticket), the viewer's IP, and the time (the field is logged as mobile, email, sailpno or ticket).
 * Login-gated. The P.No. is also the first password, so its reveals have a cap of their own (src/lib/security/revealCap.ts).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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

  const viewedUserId = (await params).id;
  let field: string;
  try {
    const body = await request.json();
    field = body?.field;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (field !== "mobile" && field !== "email" && field !== "sailpno" && field !== "ticket") {
    return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  }

  // Best-effort client IP (behind Vercel/proxies, x-forwarded-for is the chain).
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  try {
    const ds = await getDb();

    // A CAP, so that the directory cannot be copied out one reveal at a time: the audit table is the counter (src/lib/security/revealCap.ts)
    if (!(await mayReveal((sql, params) => ds.query(sql, params as never[]), String(viewerTicketNo)))) {
      return NextResponse.json({ error: "You have revealed a great many contact details in the last hour. Please try again later." }, { status: 429, headers: { "Retry-After": "600", "Cache-Control": "no-store" } });
    }

    // The P.No. is the first password: a cap of its own, far below the general one.
    if (field === "sailpno" && !(await mayRevealPno((sql, params) => ds.query(sql, params as never[]), String(viewerTicketNo)))) {
      return NextResponse.json({ error: "You have revealed a great many personal numbers in the last hour. Please try again later." }, { status: 429, headers: { "Retry-After": "900", "Cache-Control": "no-store" } });
    }

    // Fetch the target employee's contact, ticket and P.No. A card with no login account behind it has the id "roster:<n>" (the roster row), which has a ticket and a P.No. but no contact.
    const rosterId = /^roster:(\d{1,9})$/.exec(viewedUserId)?.[1];
    const rows = rosterId
      ? await ds.query(`SELECT NULL::text AS id, ticket_no AS "ticketNo", NULL::text AS "contactNo", NULL::text AS email, sail_pno AS "sailPNo" FROM public.employee_roster WHERE id = $1 LIMIT 1`, [Number(rosterId)])
      : await ds.query(
          `SELECT id, "ticketNo" AS "ticketNo", "contactNo" AS "contactNo", email, "sailPNo" AS "sailPNo"
           FROM public."user" WHERE id = $1 LIMIT 1`,
          [viewedUserId],
        );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    const emp = rows[0];
    const value = field === "mobile" ? emp.contactNo : field === "email" ? emp.email : field === "sailpno" ? emp.sailPNo : emp.ticketNo;

    // Write the audit row. A mobile or e-mail reveal is not blocked by a log failure (we try, and say so in the server log); a P.No. reveal IS: it is the first password, and the log is also what counts the cap.
    let logged = true;
    try {
      await ds.query(
        `INSERT INTO public.contact_access_log
           (id, "viewerTicketNo", "viewedUserId", "viewedTicketNo", field, "ipAddress", "userAgent", "accessedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [
          crypto.randomUUID(),
          viewerTicketNo,
          emp.id ?? viewedUserId,
          emp.ticketNo,
          field,
          ip,
          userAgent,
        ],
      );
    } catch (logErr: any) {
      logged = false;
      console.error("⚠️ contact_access_log write failed:", logErr?.message ?? logErr);
    }
    if (field === "sailpno" && !logged) {
      return NextResponse.json({ error: "The personal number could not be shown just now. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }

    // Retention is handled by a scheduled pg_cron job (see setup SQL), so no
    // per-request purge here.

    return NextResponse.json({ field, value: value || null });
  } catch (error: any) {
    console.error("❌ Reveal failed:", error?.message ?? error);
    return NextResponse.json({ error: "Reveal failed" }, { status: 500 });
  }
}
