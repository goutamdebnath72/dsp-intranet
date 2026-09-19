// src/app/api/admin/access-log/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/superAdmin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET /api/admin/access-log
 *   ?from=&to=            inclusive date range (YYYY-MM-DD)
 *   &viewer=&viewed=      substring match on name OR ticket
 *   &field=mobile,email   CSV of contact fields
 *   &action=reveal,copy   CSV of actions
 *   &sort=accessedAt|viewer|viewed|field|action  &dir=asc|desc
 *   &page=&pageSize=
 *
 * SUPER-ADMIN ONLY (HOD C&IT, by ticket — NOT the role='admin' facilities).
 * Schema-resilient: shows an "action" column (reveal vs copy) if it exists,
 * else reports every row as "reveal".
 */
export async function GET(request: Request) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const ticketNo = (session?.user as any)?.ticketNo as string | undefined;
  if (!isSuperAdmin(ticketNo)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = (searchParams.get("from") || "").trim();
  const to = (searchParams.get("to") || "").trim();
  const viewer = (searchParams.get("viewer") || "").trim();
  const viewed = (searchParams.get("viewed") || "").trim();
  const fieldList = (searchParams.get("field") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const actionList = (searchParams.get("action") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const sortKey = (searchParams.get("sort") || "accessedAt").trim();
  const dir = (searchParams.get("dir") || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10) || 50));
  const offset = (page - 1) * pageSize;

  try {
    const ds = await getDb();

    // Detect optional "action" column (present once the copy feature ships).
    const colRows = await ds.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='contact_access_log'
         AND column_name='action' LIMIT 1`,
    );
    const hasAction = Array.isArray(colRows) && colRows.length > 0;
    const actionExpr = hasAction ? `l."action"` : `'reveal'::text`;

    // ---- Build WHERE from filters (shared by count, breakdown, rows) --------
    const where: string[] = [];
    const params: any[] = [];
    if (from) { params.push(from); where.push(`l."accessedAt" >= $${params.length}::date`); }
    if (to)   { params.push(to);   where.push(`l."accessedAt" < ($${params.length}::date + INTERVAL '1 day')`); }
    if (viewer) {
      params.push(`%${viewer}%`);
      where.push(`(uv.name ILIKE $${params.length} OR l."viewerTicketNo" ILIKE $${params.length})`);
    }
    if (viewed) {
      params.push(`%${viewed}%`);
      where.push(`(COALESCE(ud.name, uw.name) ILIKE $${params.length} OR l."viewedTicketNo" ILIKE $${params.length})`);
    }
    if (fieldList.length) {
      params.push(fieldList);
      where.push(`l.field = ANY($${params.length})`);
    }
    if (actionList.length) {
      if (hasAction) {
        params.push(actionList);
        where.push(`l."action" = ANY($${params.length})`);
      } else if (!actionList.includes("reveal")) {
        // no "action" column yet => every row is a reveal; a copy-only filter matches nothing
        where.push(`FALSE`);
      }
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // The joins referenced by filters/sort must exist for count too.
    const joins = `
      LEFT JOIN public."user" uv ON uv."ticketNo" = l."viewerTicketNo"
      LEFT JOIN public."user" ud ON ud.id         = l."viewedUserId"
      LEFT JOIN public."user" uw ON uw."ticketNo" = l."viewedTicketNo"`;

    // ---- Total + action breakdown (respect current filters) ----------------
    const countRows = await ds.query(
      `SELECT COUNT(*)::int AS total FROM public.contact_access_log l ${joins} ${whereSql}`,
      params,
    );
    const total = countRows?.[0]?.total ?? 0;

    const breakdownRows = await ds.query(
      `SELECT ${actionExpr} AS "action", COUNT(*)::int AS n
       FROM public.contact_access_log l ${joins} ${whereSql}
       GROUP BY 1`,
      params,
    );
    const counts: Record<string, number> = {};
    for (const r of breakdownRows ?? []) counts[r.action] = r.n;

    // ---- Sort (whitelisted) + page -----------------------------------------
    const sortMap: Record<string, string> = {
      accessedAt: `l."accessedAt"`,
      viewer: `uv.name`,
      viewed: `COALESCE(ud.name, uw.name)`,
      field: `l.field`,
      action: actionExpr,
    };
    const sortCol = sortMap[sortKey] || sortMap.accessedAt;

    const rowParams = [...params, pageSize, offset];
    const rows = await ds.query(
      `SELECT
         l."accessedAt"             AS "accessedAt",
         l."viewerTicketNo"         AS "viewerTicketNo",
         uv.name                    AS "viewerName",
         l."viewedTicketNo"         AS "viewedTicketNo",
         COALESCE(ud.name, uw.name) AS "viewedName",
         l.field                    AS "field",
         ${actionExpr}              AS "action"
       FROM public.contact_access_log l ${joins}
       ${whereSql}
       ORDER BY ${sortCol} ${dir} NULLS LAST, l."accessedAt" DESC
       LIMIT $${rowParams.length - 1} OFFSET $${rowParams.length}`,
      rowParams,
    );

    return NextResponse.json({ rows: rows ?? [], total, counts, page, pageSize, hasAction });
  } catch (error: any) {
    console.error("❌ Admin access-log fetch failed:", error?.message ?? error);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
