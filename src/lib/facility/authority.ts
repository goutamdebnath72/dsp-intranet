// src/lib/facility/authority.ts
//
// WHO MAY USE A TOOL, in one place (it was written twice, once for the employee manager and once for the PAX editor, word for word).
// The HOD is known by ticket (SUPERADMIN_TICKETS); every other person only if the HOD authorised him for THIS tool (a row in public.facility_delegate that is not withdrawn). Asked from the database on every request:
// a withdrawal takes effect at once.

import { isSuperAdmin } from "@/lib/superAdmin";
import { toIsoInstant } from "@/lib/dates";
import { writeAudit } from "./audit";
import { lockSql, isFacilityKey, type FacilityKey } from "./registry";
import type { Actor, Authority, DelegateResult, DelegateView, FacilityDb, QueryFn } from "./types";

export class Forbidden extends Error {}

const EXECUTIVE = /^4\d{5}$/;
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
  return r.map((x) => ({ ticket: str(x.ticket_no), name: str(x.name), grantedByName: str(x.granted_by_name), grantedByTicket: str(x.granted_by_ticket), grantedAt: toIsoInstant(x.granted_at) ?? "" }));
}

/** Only the HOD authorises, and only an executive. Authorising someone who already is authorised changes nothing ("already"). */
export async function grantDelegate(db: FacilityDb, facility: FacilityKey, actor: Actor, target: { ticket: string; name: string }): Promise<DelegateResult> {
  must(facility);
  const ticket = String(target.ticket ?? "").trim();
  const name = String(target.name ?? "").replace(/\s+/g, " ").trim();
  if (!EXECUTIVE.test(ticket)) return { status: "invalid", reason: "Only an executive (a six-digit ticket number that starts with 4) can be authorised." };
  if (!name) return { status: "invalid", reason: "The executive's name is missing." };
  if (isSuperAdmin(ticket)) return { status: "invalid", reason: "The HOD of C&IT already has this authority." };
  try {
    return await db.run(async (q): Promise<DelegateResult> => {
      const role = await begin(q, facility, actor, true);
      const active = await q(`SELECT 1 FROM public.facility_delegate WHERE facility = $1 AND ticket_no = $2 AND revoked_at IS NULL`, [facility, ticket]);
      if (active.length > 0) return { status: "already" };
      await q(`INSERT INTO public.facility_delegate (facility, ticket_no, name, granted_by_ticket, granted_by_name) VALUES ($1, $2, $3, $4, $5)`, [facility, ticket, name, actor.ticket, actor.name]);
      await writeAudit(q, facility, actor, role, "grant", { targetTicket: ticket, targetName: name, after: { ticket, name } });
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
