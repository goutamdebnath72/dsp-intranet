// src/lib/accessLog/admin/store.ts
//
// Database queries and storage logic for Contact Access Log facility (Modular Facility Kit).

import type { DataSource } from "typeorm";
import type { Actor, AuditRow, DelegateResult, DelegateView, FacilityDb } from "@/lib/facility/types";
import { begin, listDelegates, grantDelegate, revokeDelegate } from "@/lib/facility/authority";
import { recentAuditRows, writeAudit } from "@/lib/facility/audit";
import type {
  AccessLogFilterInput,
  AccessLogQueryResult,
  AccessLogRowView,
  AccessLogStatsView,
} from "./types";
import { toIsoInstant } from "@/lib/dates";

export type AccessLogDb = FacilityDb;

/** A typed % or _ is a letter to look for, not a wildcard (backslash is Postgres' default LIKE escape). */
const likeEscape = (v: string) => v.replace(/[\\%_]/g, (c) => "\\" + c);

export async function queryAccessLogs(
  ds: DataSource,
  filters: AccessLogFilterInput = {},
): Promise<AccessLogQueryResult> {
  const from = (filters.from || "").trim();
  const to = (filters.to || "").trim();
  const viewer = (filters.viewer || "").trim();
  const viewed = (filters.viewed || "").trim();

  const fieldList = (filters.field || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s !== "all");

  const actionList = (filters.action || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s !== "all");

  // whole numbers only (a fraction made the LIMIT/OFFSET cast fail with a 500; a huge page is capped)
  const page = Math.min(100000, Math.max(1, Math.trunc(Number(filters.page) || 1)));
  const pageSize = Math.min(200, Math.max(1, Math.trunc(Number(filters.pageSize) || 50)));
  const offset = (page - 1) * pageSize;

  const sortKey = (filters.sort || "accessedAt").trim();
  const dir = (filters.dir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  // Check if optional "action" column exists in public.contact_access_log
  const colRows = await ds.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='contact_access_log'
       AND column_name='action' LIMIT 1`,
  );
  const hasAction = Array.isArray(colRows) && colRows.length > 0;
  const actionExpr = hasAction ? `l."action"` : `'reveal'::text`;

  // Build WHERE clauses
  const where: string[] = [];
  const params: unknown[] = [];

  // A day means the INDIA day (the old route did the same): the database clock is UTC, so "to 7 Oct" must end at the end of
  // 7 Oct IST, not at 05:30 IST on the 8th.
  if (from) {
    params.push(from);
    where.push(`l."accessedAt" >= ($${params.length}::date)::timestamp AT TIME ZONE 'Asia/Kolkata'`);
  }
  if (to) {
    params.push(to);
    where.push(`l."accessedAt" < ($${params.length}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'`);
  }
  if (viewer) {
    params.push(`%${likeEscape(viewer)}%`);
    where.push(`(
      COALESCE(erv.name, uv.name) ILIKE $${params.length}
      OR l."viewerTicketNo" ILIKE $${params.length}
      OR COALESCE(dgv.title, uv.designation) ILIKE $${params.length}
      OR COALESCE(sdv.name, dv.name) ILIKE $${params.length}
    )`);
  }
  if (viewed) {
    params.push(`%${likeEscape(viewed)}%`);
    where.push(`(
      COALESCE(erd.name, ud.name, uw.name) ILIKE $${params.length}
      OR l."viewedTicketNo" ILIKE $${params.length}
      OR COALESCE(dgd.title, ud.designation, uw.designation) ILIKE $${params.length}
      OR COALESCE(sdd.name, dd.name, dw.name) ILIKE $${params.length}
    )`);
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
      where.push(`FALSE`);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const joins = `
    LEFT JOIN public."user" uv ON uv."ticketNo" = l."viewerTicketNo"
    LEFT JOIN public.departments dv ON dv.id   = uv."departmentId"
    LEFT JOIN public.employee_roster erv ON erv.ticket_no = l."viewerTicketNo"
    LEFT JOIN public.designation_grade dgv ON dgv.id = erv.designation_grade_id
    LEFT JOIN public.sail_department sdv ON sdv.id = erv.sail_department_id

    LEFT JOIN public."user" ud ON ud.id         = l."viewedUserId"
    LEFT JOIN public.departments dd ON dd.id   = ud."departmentId"
    LEFT JOIN public."user" uw ON uw."ticketNo" = l."viewedTicketNo"
    LEFT JOIN public.departments dw ON dw.id   = uw."departmentId"
    LEFT JOIN LATERAL (
      SELECT er.name, er.designation_grade_id, er.sail_department_id
        FROM public.employee_roster er
       WHERE er.ticket_no = COALESCE(NULLIF(l."viewedTicketNo", ''), ud."ticketNo")
       ORDER BY er.id
       LIMIT 1
    ) erd ON TRUE
    LEFT JOIN public.designation_grade dgd ON dgd.id = erd.designation_grade_id
    LEFT JOIN public.sail_department sdd ON sdd.id = erd.sail_department_id`;

  // 1. Total and Unique Viewers Count
  const countRows = await ds.query(
    `SELECT COUNT(*)::int AS total, COUNT(DISTINCT l."viewerTicketNo")::int AS "uniqueViewers"
     FROM public.contact_access_log l ${joins} ${whereSql}`,
    params,
  );
  const total = Number(countRows?.[0]?.total ?? 0);
  const uniqueViewers = Number(countRows?.[0]?.uniqueViewers ?? 0);

  // 2. Action Breakdown
  const actionRows = await ds.query(
    `SELECT ${actionExpr} AS "action", COUNT(*)::int AS n
     FROM public.contact_access_log l ${joins} ${whereSql}
     GROUP BY 1`,
    params,
  );
  const actionCounts: Record<string, number> = {};
  for (const r of actionRows ?? []) {
    actionCounts[r.action] = Number(r.n) || 0;
  }

  // 3. Field Breakdown
  const fieldRows = await ds.query(
    `SELECT l.field AS "field", COUNT(*)::int AS n
     FROM public.contact_access_log l ${joins} ${whereSql}
     GROUP BY 1`,
    params,
  );
  const fieldCounts: Record<string, number> = {};
  for (const r of fieldRows ?? []) {
    fieldCounts[r.field] = Number(r.n) || 0;
  }

  const stats: AccessLogStatsView = {
    total,
    reveals: actionCounts["reveal"] ?? 0,
    copies: actionCounts["copy"] ?? 0,
    mobileCount: fieldCounts["mobile"] ?? 0,
    emailCount: fieldCounts["email"] ?? 0,
    uniqueViewers,
  };

  // 4. Sort map
  const sortMap: Record<string, string> = {
    accessedAt: `l."accessedAt"`,
    viewer: `COALESCE(erv.name, uv.name)`,
    viewed: `COALESCE(erd.name, ud.name, uw.name)`,
    field: `l.field`,
    action: actionExpr,
  };
  const sortCol = sortMap[sortKey] || sortMap.accessedAt;

  const rowParams = [...params, pageSize, offset];
  const rows = await ds.query(
    `SELECT
       l.id                                               AS "id",
       l."accessedAt"                                     AS "accessedAt",
       l."viewerTicketNo"                                 AS "viewerTicketNo",
       COALESCE(erv.name, uv.name)                        AS "viewerName",
       COALESCE(dgv.title, uv.designation)                AS "viewerDesignation",
       COALESCE(sdv.name, dv.name)                        AS "viewerDepartment",
       l."viewedTicketNo"                                 AS "viewedTicketNo",
       COALESCE(erd.name, ud.name, uw.name)               AS "viewedName",
       COALESCE(dgd.title, ud.designation, uw.designation) AS "viewedDesignation",
       COALESCE(sdd.name, dd.name, dw.name)               AS "viewedDepartment",
       l.field                                            AS "field",
       ${actionExpr}                                      AS "action"
     FROM public.contact_access_log l ${joins}
     ${whereSql}
     ORDER BY ${sortCol} ${dir} NULLS LAST, l."accessedAt" DESC
     LIMIT $${rowParams.length - 1} OFFSET $${rowParams.length}`,
    rowParams,
  );

  const formattedRows: AccessLogRowView[] = (rows ?? []).map((r: any) => ({
    id: String(r.id),
    accessedAt: toIsoInstant(r.accessedAt) ?? String(r.accessedAt),
    viewerTicketNo: String(r.viewerTicketNo || "").trim(),
    viewerName: r.viewerName ? String(r.viewerName).trim() : null,
    viewerDesignation: r.viewerDesignation ? String(r.viewerDesignation).trim() : null,
    viewerDepartment: r.viewerDepartment ? String(r.viewerDepartment).trim() : null,
    viewedTicketNo: String(r.viewedTicketNo || "").trim(),
    viewedName: r.viewedName ? String(r.viewedName).trim() : null,
    viewedDesignation: r.viewedDesignation ? String(r.viewedDesignation).trim() : null,
    viewedDepartment: r.viewedDepartment ? String(r.viewedDepartment).trim() : null,
    field: String(r.field || "").toLowerCase(),
    action: String(r.action || "reveal").toLowerCase(),
  }));

  const totalPages = Math.ceil(total / pageSize) || 1;

  return {
    rows: formattedRows,
    total,
    stats,
    page,
    pageSize,
    totalPages,
    hasAction,
  };
}

// ----------------------------------------------------------------------------
// Shared Delegation & Audit Helpers
// ----------------------------------------------------------------------------

export async function listAccessLogDelegates(db: AccessLogDb): Promise<DelegateView[]> {
  return listDelegates(db, "access_log");
}

export async function grantAccessLogDelegate(
  db: AccessLogDb,
  actor: Actor,
  target: { ticket: string; name: string },
): Promise<DelegateResult> {
  // allowNonExecutive: false is enforced in registry for "access_log"
  return grantDelegate(db, "access_log", actor, target);
}

export async function revokeAccessLogDelegate(
  db: AccessLogDb,
  actor: Actor,
  ticketNo: string,
): Promise<DelegateResult> {
  return revokeDelegate(db, "access_log", actor, ticketNo);
}

export async function accessLogRecentAudit(db: AccessLogDb): Promise<AuditRow[]> {
  return recentAuditRows(db, "access_log", 50);
}

/**
 * The log of who saw private contact data is itself private: LOOKING at it is recorded (action "view": who, when, with
 * which filters and how many lines were returned; never the lines themselves). One row per distinct look: the same person
 * with the same filters within two minutes (paging back and forth, a refresh) does not write another row, so the history
 * stays readable. The authority is decided again here under the tool's lock.
 */
export async function recordAccessLogView(
  db: AccessLogDb,
  actor: Actor,
  summary: { filters: Record<string, unknown>; total: number },
): Promise<void> {
  const note = `Viewed the contact access log (${summary.total} line${summary.total === 1 ? "" : "s"} matched)`;
  const after = { filters: summary.filters };
  await db.run(async (q) => {
    const role = await begin(q, "access_log", actor);
    const recent = await q(
      `SELECT 1 FROM public.facility_audit
        WHERE facility = 'access_log' AND action = 'view' AND actor_ticket = $1
          AND at > now() - interval '2 minutes' AND after = $2::jsonb
        LIMIT 1`,
      [actor.ticket, JSON.stringify(after)],
    );
    if (recent.length) return;
    await writeAudit(q, "access_log", actor, role, "view", { after, note });
  });
}
