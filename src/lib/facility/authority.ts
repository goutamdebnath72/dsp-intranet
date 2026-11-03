// src/lib/facility/authority.ts
//
// WHO MAY USE A TOOL, in one place (it was written twice, once for the employee manager and once for the PAX editor, word for word).
// The HOD is known by ticket (SUPERADMIN_TICKETS); every other person only if the HOD authorised him for THIS tool (a row in public.facility_delegate that is not withdrawn). Asked from the database on every request:
// a withdrawal takes effect at once.

import { isSuperAdmin } from "@/lib/superAdmin";
import { toIsoInstant } from "@/lib/dates";
import { writeAudit } from "./audit";
import { FACILITIES, lockSql, isFacilityKey, type FacilityKey } from "./registry";
import type { Actor, Authority, DelegateResult, DelegateView, FacilityDb, QueryFn } from "./types";

export class Forbidden extends Error {}

const EXECUTIVE = /^4\d{5}$/;
/** Any employee's ticket: six digits, not starting with 0. */
const ANY_TICKET = /^[1-9]\d{5}$/;
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const isUnique = (e: unknown): boolean => (e as { code?: string })?.code === "23505";

function must(facility: string): asserts facility is FacilityKey {
  if (!isFacilityKey(facility)) throw new Error(`unknown tool: ${String(facility)}`);
}

/** HOD, delegate, or null for this ticket and this tool. */
export async function authorityOf(q: QueryFn, facility: FacilityKey, ticket: string | null | undefined): Promise<Authority | null> {
  must(facility);
  const t = String(ticket ?? "").trim();
  if (!t) return null;
  if (isSuperAdmin(t)) return "hod";
  const r = await q(`SELECT 1 FROM public.facility_delegate WHERE facility = $1 AND ticket_no = $2 AND revoked_at IS NULL LIMIT 1`, [facility, t]);
  return r.length > 0 ? "delegate" : null;
}

/** The start of every write of a tool: take the tool's global write lock, then decide who is acting. Throws Forbidden when this person may not (or, with needHod, is not the HOD). */
export async function begin(q: QueryFn, facility: FacilityKey, actor: Actor, needHod = false): Promise<Authority> {
  must(facility);
  await q(lockSql(facility));
  const a = await authorityOf(q, facility, actor.ticket);
  if (!a || (needHod && a !== "hod")) throw new Forbidden();
  return a;
}

export async function listDelegates(db: FacilityDb, facility: FacilityKey): Promise<DelegateView[]> {
  must(facility);
  const r = await db.run((q) => q(`SELECT ticket_no, name, granted_by_name, granted_by_ticket, granted_at FROM public.facility_delegate WHERE facility = $1 AND revoked_at IS NULL ORDER BY name`, [facility]));
  return r.map((x) => ({ ticket: str(x.ticket_no), name: str(x.name), grantedByName: str(x.granted_by_name), grantedByTicket: str(x.granted_by_ticket), grantedAt: toIsoInstant(x.granted_at) ?? "", nonExecutive: !EXECUTIVE.test(str(x.ticket_no)) }));
}

/**
 * Only the HOD authorises. An executive at once; a NON-executive (a ticket that does not start with 4) only when the HOD has confirmed it (`confirmNonExecutive`), and only for a tool that allows it.
 * Authorising someone who already is authorised changes nothing ("already").
 */
export async function grantDelegate(db: FacilityDb, facility: FacilityKey, actor: Actor, target: { ticket: string; name: string; confirmNonExecutive?: boolean }): Promise<DelegateResult> {
  must(facility);
  const ticket = String(target.ticket ?? "").trim();
  const name = String(target.name ?? "").replace(/\s+/g, " ").trim();
  if (!ANY_TICKET.test(ticket)) return { status: "invalid", reason: "This is not a ticket number: six digits that do not start with 0." };
  if (!name) return { status: "invalid", reason: "The employee's name is missing." };
  if (isSuperAdmin(ticket)) return { status: "invalid", reason: "The HOD of C&IT already has this authority." };
  const nonExecutive = !EXECUTIVE.test(ticket);
  if (nonExecutive && !FACILITIES[facility].allowNonExecutive) return { status: "invalid", reason: "This tool cannot be given to a non-executive." };
  try {
    return await db.run(async (q): Promise<DelegateResult> => {
      const role = await begin(q, facility, actor, true);
      if (nonExecutive && target.confirmNonExecutive !== true) return { status: "needs-confirmation", reason: "This is a non-executive. Are you sure you want to authorise a non-executive?" };
      const active = await q(`SELECT 1 FROM public.facility_delegate WHERE facility = $1 AND ticket_no = $2 AND revoked_at IS NULL`, [facility, ticket]);
      if (active.length > 0) return { status: "already" };
      await q(`INSERT INTO public.facility_delegate (facility, ticket_no, name, granted_by_ticket, granted_by_name) VALUES ($1, $2, $3, $4, $5)`, [facility, ticket, name, actor.ticket, actor.name]);
      await writeAudit(q, facility, actor, role, "grant", { targetTicket: ticket, targetName: name, after: { ticket, name, ...(nonExecutive ? { nonExecutive: true } : {}) }, note: nonExecutive ? "non-executive, confirmed" : null });
      return { status: "ok" };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    if (isUnique(e)) return { status: "already" };
    throw e;
  }
}

/** Only the HOD withdraws. The row stays as history. */
export async function revokeDelegate(db: FacilityDb, facility: FacilityKey, actor: Actor, ticketNo: string): Promise<DelegateResult> {
  must(facility);
  const ticket = String(ticketNo ?? "").trim();
  try {
    return await db.run(async (q): Promise<DelegateResult> => {
      const role = await begin(q, facility, actor, true);
      const r = await q(`UPDATE public.facility_delegate SET revoked_at = now(), revoked_by_ticket = $3, revoked_by_name = $4 WHERE facility = $1 AND ticket_no = $2 AND revoked_at IS NULL RETURNING name`, [facility, ticket, actor.ticket, actor.name]);
      if (r.length === 0) return { status: "not-delegate" };
      await writeAudit(q, facility, actor, role, "revoke", { targetTicket: ticket, targetName: str(r[0].name), before: { ticket, name: str(r[0].name) } });
      return { status: "ok" };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    throw e;
  }
}

/**
 * Withdraw EVERY active authorisation of one person, in every tool at once (owner, 2 Nov 2026: an employee who is deleted must lose the authority of every tool, not only of the employee manager).
 * One history line per tool, in that tool's own history, in the SAME transaction as what caused it (the deletion): both happen or neither. Returns the tools he lost (empty when he had none).
 */
export async function revokeEverywhere(q: QueryFn, actor: Actor, role: Authority, ticket: string, note: string): Promise<Array<{ facility: string; name: string }>> {
  const t = String(ticket ?? "").trim();
  const r = await q(`UPDATE public.facility_delegate SET revoked_at = now(), revoked_by_ticket = $2, revoked_by_name = $3 WHERE ticket_no = $1 AND revoked_at IS NULL RETURNING facility, name`, [t, actor.ticket, actor.name]);
  const lost = r.map((x) => ({ facility: str(x.facility), name: str(x.name) })).sort((a, b) => (a.facility < b.facility ? -1 : a.facility > b.facility ? 1 : 0));
  for (const l of lost) await writeAudit(q, l.facility as FacilityKey, actor, role, "revoke", { targetTicket: t, targetName: l.name, before: { ticket: t, name: l.name }, note });
  return lost;
}
