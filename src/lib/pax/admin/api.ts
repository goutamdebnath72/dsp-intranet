// src/lib/pax/admin/api.ts
//
// THE PAX ADMIN REQUESTS (step 64a). One handler for every operation the panel can ask; the route (src/app/api/pax/admin/route.ts) only brings the logged-in person and the database.
// The person comes from the LOGIN SESSION and from nowhere else: whatever the browser says about itself (a ticket, a name, a role) is ignored. The rules of who may do what are enforced here AND again inside the
// database transaction (store.ts), so the panel hiding a button is a courtesy, never the protection.
//   logged out                                    -> 401
//   logged in, no authority (not the HOD, not authorised) -> 403 for everything except "me"
//   the HOD of C&IT (SUPERADMIN_TICKETS)             -> everything
//   an authorised executive                       -> entries (list, add, modify, delete) and the history; NOT authorising or revoking, NOT the list of authorised people
// The executive to authorise is looked up by the SERVER in the people directory (a typed name is never trusted): only an executive (ticket 4xxxxx) exists for this purpose.

import type { EmployeeResult } from "@/lib/search/employeeSearch";
import { namedPeople, isExecutiveTicket, MAX_NAME_WORDS, subjectWords } from "../people";
import { normalizePax } from "../matcher";
import * as store from "./store";
import type { PaxDb, Actor } from "./store";
import type { Acknowledge } from "./types";

export interface ApiContext {
  /** The logged-in person (ticket and name from the session and the people directory), or null. */
  actor: Actor | null;
  db: PaxDb;
  findByName: (name: string) => Promise<EmployeeResult[]>;
  findByTicket: (ticket: string) => Promise<EmployeeResult[]>;
}
export interface ApiReply { status: number; body: Record<string, unknown> }

const reply = (status: number, body: Record<string, unknown>): ApiReply => ({ status, body });

/** A request from another site must not act with this person's login: the page that sent it has to be this site. */
export function isSameOrigin(origin: string | null | undefined, host: string | null | undefined): boolean {
  if (!origin) return true; // a request without an Origin header is not a browser page of another site (the login cookie is also SameSite)
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

const OPS = new Set(["me", "list", "add", "modify", "delete", "delegates", "find-executive", "grant", "revoke", "audit"]);
const HOD_OPS = new Set(["delegates", "find-executive", "grant", "revoke"]);

const text = (v: unknown, max = 200): string => String(v ?? "").slice(0, max);
const acksOf = (v: unknown): Acknowledge[] => (Array.isArray(v) ? v.filter((x): x is Acknowledge => x === "second-number" || x === "different") : []);
const idOf = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null);

/** The reply for an error the handler did not expect. A missing shared table (sql/17 not yet run) is named, so nobody has to read a server log to learn it. */
export function errorReply(e: unknown): ApiReply {
  const err = e as { code?: string; message?: string; driverError?: { code?: string } };
  const code = err?.code ?? err?.driverError?.code;
  if (code === "42P01" && /facility_delegate|facility_audit/.test(String(err?.message ?? ""))) {
    return reply(503, { error: "The tables of the tools' authorisations and history have not been created yet. Run src/lib/nl2sql/sql/17_facility_kit.sql once in the Supabase SQL editor, then try again.", setupNeeded: true });
  }
  return reply(500, { error: "The PAX directory could not be changed just now. Please try again; if it keeps happening, tell the Telecom team." });
}

export async function findExecutives(q: string, ctx: Pick<ApiContext, "findByName" | "findByTicket">) {
  const typed = q.trim();
  if (!typed) return [];
  let found: EmployeeResult[];
  if (/^\d{6}$/.test(typed)) found = (await ctx.findByTicket(typed).catch(() => [])).filter((p) => String(p.ticketNo).trim() === typed);
  else {
    const words = normalizePax(typed).split(" ").filter(Boolean);
    const w = subjectWords(words);
    if (w.length === 0 || w.length > MAX_NAME_WORDS) return [];
    found = namedPeople(words, await ctx.findByName(w.join(" ")).catch(() => []));
  }
  return found
    .filter((p) => isExecutiveTicket(p.ticketNo))
    .slice(0, 8)
    .map((p) => ({ ticket: String(p.ticketNo).trim(), name: p.name, designation: p.designation ?? "", department: p.department ?? "" }));
}

export async function handlePaxAdmin(body: unknown, ctx: ApiContext): Promise<ApiReply> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const op = typeof b.op === "string" ? b.op : "";
  if (!OPS.has(op)) return reply(400, { error: "Unknown request." });
  if (!ctx.actor) return reply(401, { error: "Please log in." });
  const actor = ctx.actor;

  const authority = await ctx.db.run((q) => store.authorityOf(q, actor.ticket));
  if (op === "me") return reply(200, { role: authority, name: actor.name, ticket: actor.ticket });
  if (!authority) return reply(403, { error: "Only the HOD of C&IT, or an executive he has authorised, can change the PAX directory." });
  if (HOD_OPS.has(op) && authority !== "hod") return reply(403, { error: "Only the HOD of C&IT can authorise or withdraw an executive." });

  if (op === "list") return reply(200, { entries: await store.listEntries(ctx.db, text(b.q, 80)) });
  if (op === "audit") {
    const history = await store.recentAudit(ctx.db, 50);
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

  if (op === "add") return reply(200, { result: await store.addEntry(ctx.db, actor, { department: b.department, location: b.location, number: b.number }, acksOf(b.acknowledge)) });
  if (op === "modify" || op === "delete") {
    const id = idOf(b.id);
    if (id === null) return reply(400, { error: "Which line? (the id is missing)" });
    // the version the person SAW travels with every change and delete (src/lib/concurrency/version.ts): the store refuses a save whose version is not the line's now
    const version = String(b.version ?? "").slice(0, 64);
    if (op === "delete") return reply(200, { result: await store.deleteEntry(ctx.db, actor, id, version) });
    return reply(200, { result: await store.modifyEntry(ctx.db, actor, id, { department: b.department, location: b.location, number: b.number }, acksOf(b.acknowledge), version) });
  }

  if (op === "grant") {
    const ticket = text(b.ticket, 20).trim();
    const person = (await ctx.findByTicket(ticket).catch(() => [])).find((p) => String(p.ticketNo).trim() === ticket);
    if (!person || !isExecutiveTicket(person.ticketNo)) return reply(200, { result: { status: "invalid", reason: "No executive with this ticket number was found." } });
    return reply(200, { result: await store.grantDelegate(ctx.db, actor, { ticket, name: person.name }) });
  }
  // revoke
  return reply(200, { result: await store.revokeDelegate(ctx.db, actor, text(b.ticket, 20).trim()) });
}

