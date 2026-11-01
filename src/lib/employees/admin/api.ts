// src/lib/employees/admin/api.ts
//
// THE EMPLOYEE MANAGER'S REQUESTS (step 66a). One handler for every operation the panel can ask; the route (src/app/api/employees/admin/route.ts) only brings the logged-in person and the database.
// The person comes from the LOGIN SESSION and from nowhere else: whatever the browser says about itself (a ticket, a name, a role) is ignored. The rules are enforced here AND again inside the database
// transaction (store.ts), so the panel hiding a button is a courtesy, never the protection.
//   logged out                          -> 401
//   logged in, no authority             -> 403 for everything except "me"
//   an authorised executive             -> look up, add and change employees and read the history; NOT delete, NOT authorise or withdraw, and NEVER the two dates (birth, joining)
//   the HOD of C&IT (SUPERADMIN_TICKETS) -> everything, the dates included

import type { EmployeeResult } from "@/lib/search/employeeSearch";
import { findExecutives, isSameOrigin } from "@/lib/pax/admin/api";
import * as store from "./store";
import type { Actor, EmpDb } from "./store";
import type { AcknowledgeKind } from "./types";

export { isSameOrigin };
export interface ApiContext {
  actor: Actor | null;
  db: EmpDb;
  findByName: (name: string) => Promise<EmployeeResult[]>;
  findByTicket: (ticket: string) => Promise<EmployeeResult[]>;
}
export interface ApiReply { status: number; body: Record<string, unknown> }
const reply = (status: number, body: Record<string, unknown>): ApiReply => ({ status, body });

const OPS = new Set(["me", "lookups", "search", "get", "add", "modify", "delete", "delegates", "find-executive", "grant", "revoke", "audit"]);
const HOD_OPS = new Set(["delete", "delegates", "find-executive", "grant", "revoke"]);
const text = (v: unknown, max = 200): string => String(v ?? "").slice(0, max);
const idOf = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null);
const acksOf = (v: unknown): AcknowledgeKind[] => (Array.isArray(v) ? v.filter((x): x is AcknowledgeKind => x === "same-name") : []);
/** The fields of a form, and nothing else the browser may have added. */
const fieldsOf = (v: unknown): Record<string, unknown> => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ["ticketNo", "sailPno", "name", "gradeId", "departmentId", "position", "address", "emailNic", "webmail", "doctor", "dateOfBirth", "dateOfJoining"]) if (k in o) out[k] = o[k];
  return out;
};

/** The reply for an error the handler did not expect. A missing admin table (sql/15 not yet run) is named, so nobody has to read a server log to learn it. */
export function errorReply(e: unknown): ApiReply {
  const err = e as { code?: string; message?: string; driverError?: { code?: string } };
  const code = err?.code ?? err?.driverError?.code;
  if (code === "42P01" && /employee_admin_delegate|employee_admin_audit/.test(String(err?.message ?? ""))) {
    return reply(503, { error: "The employee manager's tables have not been created yet. Run src/lib/nl2sql/sql/15_employee_admin.sql once in the Supabase SQL editor, then try again.", setupNeeded: true });
  }
  return reply(500, { error: "The employee records could not be changed just now. Please try again; if it keeps happening, tell the C&IT department." });
}

export async function handleEmployeeAdmin(body: unknown, ctx: ApiContext): Promise<ApiReply> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const op = typeof b.op === "string" ? b.op : "";
  if (!OPS.has(op)) return reply(400, { error: "Unknown request." });
  if (!ctx.actor) return reply(401, { error: "Please log in." });
  const actor = ctx.actor;

  const authority = await ctx.db.run((q) => store.authorityOf(q, actor.ticket));
  if (op === "me") return reply(200, { role: authority, name: actor.name, ticket: actor.ticket });
  if (!authority) return reply(403, { error: "Only the HOD of C&IT, or an executive he has authorised, can change employee records." });
  if (HOD_OPS.has(op) && authority !== "hod") return reply(403, { error: "Only the HOD of C&IT can delete an employee, or authorise or withdraw an executive." });
  const hod = authority === "hod";

  if (op === "lookups") return reply(200, { lookups: await store.lookups(ctx.db), datesVisible: hod });
  if (op === "search") return reply(200, { employees: await store.searchEmployees(ctx.db, text(b.q, 80), hod) });
  if (op === "get") {
    const id = idOf(b.id);
    if (id === null) return reply(400, { error: "Which employee? (the id is missing)" });
    const e = await store.getEmployee(ctx.db, id, hod);
    return e ? reply(200, { employee: e }) : reply(404, { error: "This employee is not on the roll any more." });
  }
  if (op === "audit") {
    const history = await store.recentAudit(ctx.db, 50, hod);
    // the editor's post comes from the people directory (the history keeps ticket and name only); one look-up per person, a failing look-up leaves the post empty
    const posts = new Map<string, string>();
    for (const t of Array.from(new Set(history.map((h) => h.actorTicket)))) {
      const found = (await ctx.findByTicket(t).catch(() => [])).find((p) => String(p.ticketNo).trim() === t);
      posts.set(t, found?.designation ?? "");
    }
    return reply(200, { history: history.map((h) => ({ ...h, actorDesignation: posts.get(h.actorTicket) ?? "" })) });
  }
  if (op === "delegates") return reply(200, { delegates: await store.listDelegates(ctx.db) });
  if (op === "find-executive") return reply(200, { executives: await findExecutives(text(b.q, 80), ctx) });

  if (op === "add") return reply(200, { result: await store.addEmployee(ctx.db, actor, fieldsOf(b.fields), acksOf(b.acknowledge)) });
  if (op === "modify" || op === "delete") {
    const id = idOf(b.id);
    if (id === null) return reply(400, { error: "Which employee? (the id is missing)" });
    if (op === "modify") return reply(200, { result: await store.modifyEmployee(ctx.db, actor, id, fieldsOf(b.fields), acksOf(b.acknowledge)) });
    return reply(200, { result: await store.deleteEmployee(ctx.db, actor, id, { confirmTicket: text(b.confirmTicket, 20), removeLogin: b.removeLogin === true }) });
  }
  if (op === "grant") {
    const ticket = text(b.ticket, 20).trim();
    const person = (await ctx.findByTicket(ticket).catch(() => [])).find((p) => String(p.ticketNo).trim() === ticket);
    if (!person || !/^4\d{5}$/.test(String(person.ticketNo).trim())) return reply(200, { result: { status: "invalid", reason: "No executive with this ticket number was found." } });
    return reply(200, { result: await store.grantDelegate(ctx.db, actor, { ticket, name: person.name }) });
  }
  return reply(200, { result: await store.revokeDelegate(ctx.db, actor, text(b.ticket, 20).trim()) });
}
