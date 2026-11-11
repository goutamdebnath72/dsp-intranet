// src/lib/facility/audit.ts
//
// THE HISTORY, in one place: one append-only table (public.facility_audit) for every tool. A tool writes a line with `writeAudit`, reads its recent lines with `recentAuditRows` and the last add or change of one
// record with `lastChangeOf`. How a line is turned into a sentence is the tool's own business (it knows its fields).

import { toIsoInstant } from "@/lib/dates";
import type { FacilityKey } from "./registry";
import type { Actor, AuditRow, Authority, FacilityDb, LastChange, QueryFn } from "./types";

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const json = (v: unknown): string | null => (v === null || v === undefined ? null : JSON.stringify(v));

export interface AuditEntry {
  targetId?: number | null;
  targetTicket?: string | null;
  targetName?: string | null;
  before?: unknown;
  after?: unknown;
  note?: string | null;
}

export async function writeAudit(q: QueryFn, facility: FacilityKey, actor: Actor, role: Authority, action: string, e: AuditEntry = {}): Promise<void> {
  await q(
    `INSERT INTO public.facility_audit (facility, actor_ticket, actor_name, actor_role, action, target_id, target_ticket, target_name, before, after, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)`,
    [facility, actor.ticket, actor.name, role, action, e.targetId ?? null, e.targetTicket ?? null, e.targetName ?? null, json(e.before), json(e.after), e.note ?? null],
  );
}

/** The latest lines of one tool, newest first (at most 200). */
export async function recentAuditRows(db: FacilityDb, facility: FacilityKey, limit = 50): Promise<AuditRow[]> {
  const n = Math.min(200, Math.max(1, Math.floor(limit)));
  const r = await db.run((q) => q(`SELECT at, actor_ticket, actor_name, actor_role, action, target_id, target_ticket, target_name, before, after, note FROM public.facility_audit WHERE facility = $1 ORDER BY at DESC, id DESC LIMIT ${n}`, [facility]));
  return r.map((x): AuditRow => ({
    at: toIsoInstant(x.at) ?? "",
    actorTicket: str(x.actor_ticket),
    actorName: str(x.actor_name),
    actorRole: str(x.actor_role) as Authority,
    action: str(x.action),
    targetId: x.target_id === null || x.target_id === undefined ? null : Number(x.target_id),
    targetTicket: str(x.target_ticket),
    targetName: str(x.target_name),
    before: x.before ?? null,
    after: x.after ?? null,
    note: str(x.note),
  }));
}

/** Who last added or changed this record, and when (never a value): what a refused, out-of-date save tells the person. Every action that changes a record counts (add, modify, delete, seed, clear, confirm ...); only authorising people and merely viewing do not. */
export async function lastChangeOf(q: QueryFn, facility: FacilityKey, targetId: number): Promise<LastChange | null> {
  const r = (await q(`SELECT at, actor_name, actor_ticket, action FROM public.facility_audit WHERE facility = $1 AND target_id = $2 AND action NOT IN ('grant', 'revoke', 'view') ORDER BY id DESC LIMIT 1`, [facility, targetId]))[0];
  return r ? { at: toIsoInstant(r.at) ?? "", actorName: str(r.actor_name), actorTicket: str(r.actor_ticket), action: str(r.action) } : null;
}
