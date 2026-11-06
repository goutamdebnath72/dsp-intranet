// src/lib/accessLog/admin/store.ts
//
// Database queries and storage logic for Contact Access Log facility (Modular Facility Kit).

import type { DataSource } from "typeorm";
import type { Actor, AuditRow, DelegateResult, DelegateView, FacilityDb } from "@/lib/facility/types";
import { listDelegates, grantDelegate, revokeDelegate } from "@/lib/facility/authority";
import { recentAuditRows } from "@/lib/facility/audit";
import type {
  AccessLogFilterInput,
  AccessLogQueryResult,
  AccessLogRowView,
  AccessLogStatsView,
} from "./types";
import { toIsoInstant } from "@/lib/dates";

export type AccessLogDb = FacilityDb;

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

  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize || 50));
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

  if (from) {
    params.push(from);
    where.push(`l."accessedAt" >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    where.push(`l."accessedAt" < ($${params.length}::date + INTERVAL '1 day')`);
  }
  if (viewer) {
    params.push(`%${viewer}%`);
    where.push(`(
      COALESCE(erv.name, uv.name) ILIKE $${params.length}
      OR l."viewerTicketNo" ILIKE $${params.length}
      OR COALESCE(dgv.title, uv.designation) ILIKE $${params.length}
      OR COALESCE(sdv.name, dv.name) ILIKE $${params.length}
    )`);
  }
  if (viewed) {
    params.push(`%${viewed}%`);
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
    LEFT JOIN public.employee_roster erd ON (erd.ticket_no = l."viewedTicketNo" OR (ud."ticketNo" IS NOT NULL AND erd.ticket_no = ud."ticketNo"))
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
    id: Number(r.id),
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
