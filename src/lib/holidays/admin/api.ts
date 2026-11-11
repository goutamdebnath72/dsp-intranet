// src/lib/holidays/admin/api.ts
//
// API HANDLER FOR THE HOLIDAY MANAGER FACILITY.
// Enforces:
//   - Login required (401)
//   - Authority check via facility_delegate / SUPERADMIN_TICKETS (403)
//   - HOD-only actions for delegates/grant/revoke (403)
//   - Error mapping and resilient database replies

import type { EmployeeResult } from "@/lib/search/employeeSearch";
import { resolveGrantTarget } from "@/lib/facility/authorise";
import { authorityOf } from "@/lib/facility/authority";
import * as store from "./store";
import type { HolidayDb } from "./store";
import type { Actor } from "@/lib/facility/types";

export interface ApiContext {
  actor: Actor | null;
  db: HolidayDb;
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
  "years",
  "year-view",
  "seed",
  "clear",
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
    error: "The Holiday Manager could not process the request just now. Please try again.",
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

export async function handleHolidayAdmin(body: unknown, ctx: ApiContext): Promise<ApiReply> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const op = typeof b.op === "string" ? b.op : "";

  if (!OPS.has(op)) return reply(400, { error: "Unknown request." });
  if (!ctx.actor) return reply(401, { error: "Please log in." });
  const actor = ctx.actor;

  const authority = await ctx.db.run((q) => authorityOf(q, "holiday", actor.ticket));
  if (op === "me") return reply(200, { role: authority, name: actor.name, ticket: actor.ticket });
  if (!authority) return reply(403, { error: "Only the HOD of C&IT, or an authorised delegate, can manage holidays." });
  if (HOD_OPS.has(op) && authority !== "hod") return reply(403, { error: "Only the HOD of C&IT can authorise or withdraw delegates." });

  // 1. Available Years
  if (op === "years") {
    const years = await store.listAvailableYears(ctx.db);
    return reply(200, { years });
  }

  // 2. Year View & Version
  if (op === "year-view") {
    const year = num(b.year);
    if (!year) return reply(400, { error: "Missing or invalid year." });
    const view = await store.getYearView(ctx.db, year);
    return reply(200, { yearView: view });
  }

  // 3. Seed Year
  if (op === "seed") {
    const rawContent = typeof b.content === "string" ? b.content : "";
    const expectedYear = num(b.year) ?? undefined;
    const sentVersion = typeof b.version === "string" ? b.version : undefined;

    if (!rawContent.trim()) {
      return reply(400, { error: "No holiday content provided." });
    }

    const result = await store.seedYear(ctx.db, actor, { rawContent, expectedYear, sentVersion });
    return reply(200, { result });
  }

  // 4. Clear Year
  if (op === "clear") {
    const year = num(b.year);
    if (!year) return reply(400, { error: "Missing or invalid year." });
    const sentVersion = typeof b.version === "string" ? b.version : undefined;

    const result = await store.clearYear(ctx.db, actor, { year, sentVersion });
    return reply(200, { result });
  }

  // 6. Delegates
  if (op === "delegates") {
    return reply(200, { delegates: await store.listHolidayDelegates(ctx.db) });
  }

  if (op === "find-executive") {
    return reply(200, { executives: await findPeopleToAuthorise(text(b.q, 80), ctx) });
  }

  if (op === "grant") {
    const t = await resolveGrantTarget(b, ctx.findByTicket);
    if (!t.ok) return reply(200, { result: { status: "invalid", reason: t.reason } });
    const result = await store.grantHolidayDelegate(ctx.db, actor, {
      ticket: t.ticket,
      name: t.name,
      confirmNonExecutive: t.confirmNonExecutive,
    });
    return reply(200, { result });
  }

  if (op === "revoke") {
    const result = await store.revokeHolidayDelegate(ctx.db, actor, text(b.ticket, 20).trim());
    return reply(200, { result });
  }

  // 7. Audit History
  if (op === "audit") {
    const history = await store.recentHolidayAudit(ctx.db, 50);
    const posts = new Map<string, string>();
    for (const t of Array.from(new Set(history.map((h) => h.actorTicket)))) {
      const found = (await ctx.findByTicket(t).catch(() => [])).find((p) => String(p.ticketNo).trim() === t);
      posts.set(t, found?.designation ?? "");
    }
    return reply(200, {
      history: history.map((h) => ({
        ...h,
        actorDesignation: posts.get(h.actorTicket) ?? "",
      })),
    });
  }

  return reply(400, { error: "Unhandled operation." });
}
