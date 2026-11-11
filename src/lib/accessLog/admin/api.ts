// src/lib/accessLog/admin/api.ts
//
// HTTP dispatch for the Contact Access Log facility endpoint (Modular Facility Kit).

import type { DataSource } from "typeorm";
import { DateTime } from "luxon";
import { authorityOf } from "@/lib/facility/authority";
import { resolveGrantTarget } from "@/lib/facility/authorise";
import type { Actor } from "@/lib/facility/types";
import type { EmployeeResult } from "@/lib/search/employeeSearch";
import * as store from "./store";
import type { AccessLogDb } from "./store";
import type { AccessLogFilterInput } from "./types";

export interface ApiContext {
  actor: Actor | null;
  db: AccessLogDb;
  ds: DataSource;
  findByName: (name: string) => Promise<EmployeeResult[]>;
  findByTicket: (ticket: string) => Promise<EmployeeResult[]>;
}

export interface ApiReply {
  status: number;
  body: Record<string, unknown>;
}

const reply = (status: number, body: Record<string, unknown>): ApiReply => ({ status, body });

export function isSameOrigin(origin: string | null | undefined, host: string | null | undefined): boolean {
  if (!origin) return true;
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

const OPS = new Set([
  "me",
  "logs",
  "delegates",
  "find-executive",
  "grant",
  "revoke",
  "audit",
]);

const HOD_OPS = new Set(["delegates", "find-executive", "grant", "revoke"]);

const text = (v: unknown, max = 200): string => String(v ?? "").slice(0, max);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function errorReply(e: unknown): ApiReply {
  const err = e as { code?: string; message?: string; driverError?: { code?: string } };
  const code = err?.code ?? err?.driverError?.code;

  if (code === "42P01" && /facility_delegate|facility_audit/.test(String(err?.message ?? ""))) {
    return reply(503, {
      error: "The shared facility tables have not been created yet. Run src/lib/nl2sql/sql/17_facility_kit.sql once in Supabase SQL editor.",
      setupNeeded: true,
    });
  }
  return reply(500, {
    error: "The Contact Access Log could not process the request just now. Please try again.",
  });
}

export async function findPeopleToAuthorise(q: string, ctx: Pick<ApiContext, "findByName" | "findByTicket">) {
  const typed = q.trim();
  if (!typed) return [];
  const exactTicket = /^\d{6}$/.test(typed);
  let found: EmployeeResult[];

  if (exactTicket) {
    found = (await ctx.findByTicket(typed).catch(() => [])).filter((p) => String(p.ticketNo).trim() === typed);
  } else {
    found = await ctx.findByName(typed).catch(() => []);
  }

  return found.slice(0, 8).map((p) => ({
    ticket: String(p.ticketNo).trim(),
    name: p.name,
    designation: p.designation ?? "",
    department: p.department ?? "",
    nonExecutive: !/^4\d{5}$/.test(String(p.ticketNo)),
  }));
}

export async function handleAccessLogAdmin(body: unknown, ctx: ApiContext): Promise<ApiReply> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const op = typeof b.op === "string" ? b.op : "";
  if (!OPS.has(op)) return reply(400, { error: `Unknown operation: ${op}` });

  const { actor } = ctx;
  if (!actor) return reply(401, { error: "Please sign in to access the Contact Access Log." });

  const authority = await ctx.db.run((q) => authorityOf(q, "access_log", actor.ticket));
  if (op === "me") return reply(200, { role: authority, name: actor.name, ticket: actor.ticket });
  if (!authority) return reply(403, { error: "Only the HOD of C&IT, or an authorised delegate, can view the contact access log." });
  if (HOD_OPS.has(op) && authority !== "hod") return reply(403, { error: "Only the HOD of C&IT can authorise or withdraw delegates." });

  // 1. Query Access Logs
  if (op === "logs") {
    const filters: AccessLogFilterInput = {
      from: typeof b.from === "string" ? b.from : undefined,
      to: typeof b.to === "string" ? b.to : undefined,
      viewer: typeof b.viewer === "string" ? b.viewer : undefined,
      viewed: typeof b.viewed === "string" ? b.viewed : undefined,
      field: typeof b.field === "string" ? b.field : undefined,
      action: typeof b.action === "string" ? b.action : undefined,
      page: num(b.page) ?? 1,
      pageSize: num(b.pageSize) ?? 50,
      sort: typeof b.sort === "string" ? (b.sort as any) : "accessedAt",
      dir: b.dir === "asc" ? "asc" : "desc",
    };

    // A date must be a real calendar date: a bad string used to reach the database cast and come back as a 500.
    for (const [label, v] of [["from", filters.from], ["to", filters.to]] as const) {
      if (v && !(/^\d{4}-\d{2}-\d{2}$/.test(v) && DateTime.fromISO(v).isValid)) {
        return reply(400, { error: `The "${label}" date is not a valid date (use YYYY-MM-DD).` });
      }
    }

    const queryResult = await store.queryAccessLogs(ctx.ds, filters);

    // Looking at this log is itself recorded (who, when, with which filters, how many lines; never the lines). If the
    // record cannot be written the lines are NOT shown: a view that leaves no trace is exactly what this must prevent.
    // Only the filters count as "a distinct look": paging and sorting do not write another row.
    await store.recordAccessLogView(ctx.db, actor, {
      filters: { from: filters.from ?? null, to: filters.to ?? null, viewer: filters.viewer ?? null, viewed: filters.viewed ?? null, field: filters.field ?? null, action: filters.action ?? null },
      total: queryResult.total,
    });
    return reply(200, queryResult as unknown as Record<string, unknown>);
  }

  // 2. Delegation (HOD-only)
  if (op === "delegates") {
    const delegates = await store.listAccessLogDelegates(ctx.db);
    return reply(200, { delegates });
  }

  if (op === "find-executive") {
    const executives = await findPeopleToAuthorise(text(b.q, 100), ctx);
    return reply(200, { executives });
  }

  if (op === "grant") {
    const t = await resolveGrantTarget(b, ctx.findByTicket);
    if (!t.ok) return reply(200, { result: { status: "invalid", reason: t.reason } });
    
    // Strict safeguard: Contact Access Log never allows non-executives
    if (!/^4\d{5}$/.test(t.ticket)) {
      return reply(200, {
        result: {
          status: "invalid",
          reason: "The Contact Access Log contains confidential employee privacy records and cannot be delegated to non-executives.",
        },
      });
    }

    const result = await store.grantAccessLogDelegate(ctx.db, actor, {
      ticket: t.ticket,
      name: t.name,
    });
    return reply(200, { result });
  }

  if (op === "revoke") {
    const ticket = text(b.ticket, 20);
    if (!ticket) return reply(400, { error: "Missing ticket to withdraw." });
    const result = await store.revokeAccessLogDelegate(ctx.db, actor, ticket);
    return reply(200, { result });
  }

  // 3. Facility Audit Trail
  if (op === "audit") {
    const audit = await store.accessLogRecentAudit(ctx.db);
    return reply(200, { audit });
  }

  return reply(400, { error: "Unhandled operation." });
}
