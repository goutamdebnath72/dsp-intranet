// src/lib/announcements/admin/api.ts
//
// HTTP dispatch for the Announcement Manager facility endpoint (Modular Facility Kit).

import { authorityOf } from "@/lib/facility/authority";
import { resolveGrantTarget } from "@/lib/facility/authorise";
import type { Actor } from "@/lib/facility/types";
import type { EmployeeResult } from "@/lib/search/employeeSearch";
import * as store from "./store";
import type { AnnouncementDb } from "./store";

export interface ApiContext {
  actor: Actor | null;
  db: AnnouncementDb;
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
  "recent",
  "publish",
  "modify",
  "delete",
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

  if (code === "23514" && /facility_delegate_ticket_no_check/.test(String(err?.message ?? ""))) {
    return reply(503, {
      error: "Giving a tool to a non-executive needs setup in the database. Run src/lib/nl2sql/sql/18_facility_nonexecutive.sql once in Supabase SQL editor.",
      setupNeeded: true,
    });
  }
  if (code === "42P01" && /facility_delegate|facility_audit/.test(String(err?.message ?? ""))) {
    return reply(503, {
      error: "The shared facility tables have not been created yet. Run src/lib/nl2sql/sql/17_facility_kit.sql once in Supabase SQL editor.",
      setupNeeded: true,
    });
  }
  return reply(500, {
    error: "The Announcement Manager could not process the request just now. Please try again.",
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

export async function handleAnnouncementAdmin(body: unknown, ctx: ApiContext): Promise<ApiReply> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const op = typeof b.op === "string" ? b.op : "";
  if (!OPS.has(op)) return reply(400, { error: `Unknown operation: ${op}` });

  const { actor } = ctx;
  if (!actor) return reply(401, { error: "Please sign in to access the Announcement Manager." });

  const authority = await ctx.db.run((q) => authorityOf(q, "announcement", actor.ticket));
  if (op === "me") return reply(200, { role: authority, name: actor.name, ticket: actor.ticket });
  if (!authority) return reply(403, { error: "Only the HOD of C&IT, or an authorised delegate, can manage announcements." });
  if (HOD_OPS.has(op) && authority !== "hod") return reply(403, { error: "Only the HOD of C&IT can authorise or withdraw delegates." });

  // 1. List Recent Announcements (default last 5)
  if (op === "recent") {
    const limit = num(b.limit) ?? 5;
    const announcements = await store.listRecentAnnouncements(ctx.db, actor, limit);
    return reply(200, { announcements });
  }

  // 2. Publish New Announcement
  if (op === "publish") {
    const title = text(b.title, 500);
    const content = typeof b.content === "string" ? b.content : "";
    const date = typeof b.date === "string" ? b.date : undefined;
    const res = await store.publishAnnouncement(ctx.db, actor, { title, content, date });
    if (res.status === "invalid") return reply(400, { error: res.reason });
    return reply(200, { status: "ok", id: res.id });
  }

  // 3. Modify Announcement (Protected with Concurrency Guard)
  if (op === "modify") {
    const id = num(b.id);
    if (!id) return reply(400, { error: "Missing announcement id." });
    const title = text(b.title, 500);
    const content = typeof b.content === "string" ? b.content : "";
    const sentVersion = typeof b.version === "string" ? b.version : undefined;

    const res = await store.modifyAnnouncement(ctx.db, actor, { id, title, content, sentVersion });
    if (res.status === "not-found") return reply(404, { error: "Announcement not found." });
    if (res.status === "forbidden") return reply(403, { error: res.reason });
    if (res.status === "stale") {
      return reply(409, {
        stale: true,
        current: res.current,
        last: res.last,
        error: "This announcement was modified by another user while you were viewing it.",
      });
    }
    if (res.status === "invalid") return reply(400, { error: res.reason });
    return reply(200, { status: "ok" });
  }

  // 4. Delete Announcement (Protected with Concurrency Guard)
  if (op === "delete") {
    const id = num(b.id);
    if (!id) return reply(400, { error: "Missing announcement id." });
    const sentVersion = typeof b.version === "string" ? b.version : undefined;

    const res = await store.deleteAnnouncement(ctx.db, actor, { id, sentVersion });
    if (res.status === "not-found") return reply(404, { error: "Announcement not found." });
    if (res.status === "forbidden") return reply(403, { error: res.reason });
    if (res.status === "stale") {
      return reply(409, {
        stale: true,
        current: res.current,
        last: res.last,
        error: "This announcement was modified by another user. Please review the updated version.",
      });
    }
    return reply(200, { status: "ok" });
  }

  // 5. Delegation (HOD-only)
  if (op === "delegates") {
    const delegates = await store.listAnnouncementDelegates(ctx.db);
    return reply(200, { delegates });
  }

  if (op === "find-executive") {
    const executives = await findPeopleToAuthorise(text(b.q, 100), ctx);
    return reply(200, { executives });
  }

  if (op === "grant") {
    const t = await resolveGrantTarget(b, ctx.findByTicket);
    if (!t.ok) return reply(200, { result: { status: "invalid", reason: t.reason } });
    const result = await store.grantAnnouncementDelegate(ctx.db, actor, {
      ticket: t.ticket,
      name: t.name,
      confirmNonExecutive: t.confirmNonExecutive,
    });
    return reply(200, { result });
  }

  if (op === "revoke") {
    const ticket = text(b.ticket, 6);
    const result = await store.revokeAnnouncementDelegate(ctx.db, actor, ticket);
    return reply(200, { result });
  }

  // 6. Audit History
  if (op === "audit") {
    const history = await store.listAnnouncementAudit(ctx.db, 50);
    return reply(200, { history });
  }

  return reply(400, { error: "Unreachable operation" });
}
