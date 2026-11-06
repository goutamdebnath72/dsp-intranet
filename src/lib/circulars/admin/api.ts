// src/lib/circulars/admin/api.ts
//
// HTTP dispatch for the Circular Manager facility endpoint (Modular Facility Kit).

import { authorityOf } from "@/lib/facility/authority";
import { resolveGrantTarget } from "@/lib/facility/authorise";
import type { Actor } from "@/lib/facility/types";
import type { EmployeeResult } from "@/lib/search/employeeSearch";
import * as store from "./store";
import type { CircularDb } from "./store";

export interface ApiContext {
  actor: Actor | null;
  db: CircularDb;
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
  "record-audit",
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
    error: "The Circular Manager could not process the request just now. Please try again.",
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

export async function handleCircularAdmin(body: unknown, ctx: ApiContext): Promise<ApiReply> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const op = typeof b.op === "string" ? b.op : "";
  if (!OPS.has(op)) return reply(400, { error: `Unknown operation: ${op}` });

  const { actor } = ctx;
  if (!actor) return reply(401, { error: "Please sign in to access the Circular Manager." });

  const authority = await ctx.db.run((q) => authorityOf(q, "circular", actor.ticket));
  if (op === "me") return reply(200, { role: authority, name: actor.name, ticket: actor.ticket });
  if (!authority) return reply(403, { error: "Only the HOD of C&IT, or an authorised delegate, can manage circulars." });
  if (HOD_OPS.has(op) && authority !== "hod") return reply(403, { error: "Only the HOD of C&IT can authorise or withdraw delegates." });

  // 1. List Recent Circulars (default last 5)
  if (op === "recent") {
    const limit = num(b.limit) ?? 5;
    const circulars = await store.listRecentCirculars(ctx.db, limit);
    return reply(200, { circulars });
  }

  // 2. Record Circular Upload Audit
  if (op === "record-audit") {
    const circularId = num(b.circularId);
    const headline = text(b.headline, 500);
    const note = text(b.note, 200) || "circular uploaded";
    if (!circularId) return reply(400, { error: "Missing circularId." });
    await store.recordCircularAudit(ctx.db, actor, circularId, headline, note);
    return reply(200, { status: "ok" });
  }

  // 3. Delegation (HOD-only)
  if (op === "delegates") {
    const delegates = await store.listCircularDelegates(ctx.db);
    return reply(200, { delegates });
  }

  if (op === "find-executive") {
    const executives = await findPeopleToAuthorise(text(b.q, 100), ctx);
    return reply(200, { executives });
  }

  if (op === "grant") {
    const t = await resolveGrantTarget(b, ctx.findByTicket);
    if (!t.ok) return reply(200, { result: { status: "invalid", reason: t.reason } });
    const result = await store.grantCircularDelegate(ctx.db, actor, {
      ticket: t.ticket,
      name: t.name,
      confirmNonExecutive: t.confirmNonExecutive,
    });
    return reply(200, { result });
  }

  if (op === "revoke") {
    const ticket = text(b.ticket, 6);
    const result = await store.revokeCircularDelegate(ctx.db, actor, ticket);
    return reply(200, { result });
  }

  // 4. Audit History
  if (op === "audit") {
    const history = await store.listCircularAudit(ctx.db, 50);
    return reply(200, { history });
  }

  return reply(400, { error: "Unreachable operation" });
}
