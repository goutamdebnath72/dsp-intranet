// src/lib/pax/admin/store.ts
//
// THE PAX ADMIN OPERATIONS (step 64a; owner, 31 Oct 2026): add, modify, delete a line; authorise and revoke an executive; read the history. Every operation
//   - runs in ONE transaction, under one lock (two people cannot add the same number at the same moment),
//   - checks the person's authority INSIDE the transaction (the HOD of C&IT by SUPERADMIN_TICKETS, or an executive the HOD has authorised and not revoked),
//   - writes its audit line in the same transaction: a change cannot be saved without the record of who made it (ticket and name from the login), and the line before and after.
// The database is reached through a tiny interface (PaxDb), so the same code runs against the application's connection and against a scratch database in the tests.
// SECURITY: like pax_directory, the tables here are closed to the public API roles; only the application's own connection (never the language model's read-only client) touches them.

import { toIsoInstant } from "../../dates";
import { sameVersion, versionOf } from "@/lib/concurrency/version";
import { isSuperAdmin } from "@/lib/superAdmin";
import { loadPaxRows, PORTAL_SOURCE, type QueryFn } from "../store";
import type { PaxRow } from "../matcher";
import { placeName } from "../display";
import { acknowledgementCovers, findConflicts, savedLines } from "./conflicts";
import type { Acknowledge, PaxAuditView, PaxConflict, PaxDelegateView, PaxEntryView, PaxLastChange } from "./types";
import { composeLabel, validateEntry, type EntryInput, type FieldErrors } from "./validate";

/** Runs the function inside one transaction (committed when it returns, rolled back when it throws). */
export interface PaxDb {
  run<T>(fn: (q: QueryFn) => Promise<T>): Promise<T>;
}

export interface Actor { ticket: string; name: string }
export type Authority = "hod" | "delegate";

const LOCK = "SELECT pg_advisory_xact_lock(hashtext('pax_directory')::bigint)";
const EXECUTIVE = /^4\d{5}$/;

/** Who the person is for this purpose: the HOD of C&IT (by ticket, from the environment), an authorised and not revoked executive, or nobody. */
export async function authorityOf(q: QueryFn, ticket: string | null | undefined): Promise<Authority | null> {
  const t = String(ticket ?? "").trim();
  if (!t) return null;
  if (isSuperAdmin(t)) return "hod";
  const r = await q(`SELECT 1 FROM public.pax_delegate WHERE ticket_no = $1 AND revoked_at IS NULL LIMIT 1`, [t]);
  return r.length > 0 ? "delegate" : null;
}

/** Takes the lock, then confirms the authority; the returned role is the one written in the history. Throws a Forbidden error when there is none. */
class Forbidden extends Error {}
async function begin(q: QueryFn, actor: Actor, needHod = false): Promise<Authority> {
  await q(LOCK);
  const a = await authorityOf(q, actor.ticket);
  if (!a || (needHod && a !== "hod")) throw new Forbidden();
  return a;
}

const snapshot = (l: { department: string; location: string; number: string; label?: string }) => ({ department: l.department, location: l.location, number: l.number, ...(l.label ? { label: l.label } : {}) });

async function audit(
  q: QueryFn, actor: Actor, role: Authority, action: "add" | "modify" | "delete" | "grant" | "revoke",
  paxId: number | null, targetTicket: string | null, before: unknown, after: unknown, note: string | null = null,
): Promise<void> {
  await q(
    `INSERT INTO public.pax_directory_audit (actor_ticket, actor_name, actor_role, action, pax_id, target_ticket, before, after, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
    [actor.ticket, actor.name, role, action, paxId, targetTicket, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), note],
  );
}

/** Which answers would let the person go on (none when the number itself clashes). */
export function acknowledgeable(conflicts: PaxConflict[]): Acknowledge[] {
  if (conflicts.some((c) => c.kind === "same-number")) return [];
  const out: Acknowledge[] = [];
  if (conflicts.some((c) => c.kind === "same-place")) out.push("second-number");
  if (conflicts.some((c) => c.kind === "similar-place")) out.push("different");
  return out;
}

export type EntryResult =
  | { status: "ok"; entry: PaxEntryView }
  | { status: "invalid"; errors: FieldErrors }
  | { status: "conflict"; conflicts: PaxConflict[]; acknowledgeable: Acknowledge[] }
  | { status: "unchanged" }
  /** The line is not what the person saw: somebody changed it first. Nothing was written. `current` is the line as it is now, `last` the change recorded last. */
  | { status: "stale"; current: PaxEntryView; last: PaxLastChange | null }
  | { status: "missing" }
  | { status: "forbidden" };

/**
 * THE VERSION of a line, worked out from the RAW row (its label, department, location and number), signed with the server's secret (src/lib/concurrency/version.ts). The same line, whatever the way it is read
 * (the list, a clash's "edit this line", the answer to a save), has the same version.
 */
export const versionOfRow = (r: { id?: number; label: string; deptName: string; location: string; number: string }): string => versionOf("pax", [r.id, r.label, r.deptName, r.location, r.number]);
const viewOfRow = (lines: PaxEntryView[], rows: PaxRow[]): PaxEntryView[] => lines.map((l) => { const row = rows.find((r) => r.id === l.id); return row ? { ...l, version: versionOfRow(row) } : l; });
const withVersions = (conflicts: PaxConflict[], rows: PaxRow[]): PaxConflict[] => conflicts.map((c) => ({ ...c, existing: viewOfRow(c.existing, rows) }));

/** LOCK the line's row BEFORE it is read for a change or a delete: any writer that does not know the global lock (a SQL script) must wait until this transaction ends, and the version check then sees what it did. */
async function lockEntry(q: QueryFn, id: number): Promise<void> {
  await q(`SELECT 1 FROM public.pax_directory WHERE id = $1 FOR UPDATE`, [id]);
}

/** What the editor last recorded for this line (an add or a change): who and when. Only the facts, never a value. */
async function lastChangeOf(q: QueryFn, id: number): Promise<PaxLastChange | null> {
  const r = (await q(`SELECT at, actor_name, actor_ticket, action FROM public.pax_directory_audit WHERE pax_id = $1 AND action IN ('add', 'modify') ORDER BY id DESC LIMIT 1`, [id]))[0];
  return r ? { at: toIsoInstant(r.at) ?? "", actorName: String(r.actor_name ?? ""), actorTicket: String(r.actor_ticket ?? ""), action: String(r.action ?? "") } : null;
}

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505";

/** Every saved line in the table's own words (department, location, number), in the order of the table. */
export async function listEntries(db: PaxDb, search = ""): Promise<PaxEntryView[]> {
  const rows = await db.run((q) => loadPaxRows(q));
  const lines = viewOfRow(savedLines(rows).map(({ id, department, location, number }) => ({ id, department, location, number })), rows);
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (l: PaxEntryView) => words.every((w) => `${l.department} ${l.location} ${l.number}`.toLowerCase().includes(w));
  return lines.filter(hit).sort((a, b) => a.department.localeCompare(b.department, "en", { numeric: true, sensitivity: "base" }) || a.location.localeCompare(b.location, "en", { numeric: true, sensitivity: "base" }) || a.number.localeCompare(b.number));
}

export async function addEntry(db: PaxDb, actor: Actor, raw: Partial<Record<keyof EntryInput, unknown>>, acks: Acknowledge[] = []): Promise<EntryResult> {
  const v = validateEntry(raw);
  if (!v.ok) return { status: "invalid", errors: v.errors };
  try {
    return await db.run(async (q): Promise<EntryResult> => {
      const role = await begin(q, actor);
      const rows = await loadPaxRows(q);
      const conflicts = findConflicts(rows, v.value);
      if (!acknowledgementCovers(conflicts, acks)) return { status: "conflict", conflicts: withVersions(conflicts, rows), acknowledgeable: acknowledgeable(conflicts) };
      const label = composeLabel(v.value.department, v.value.location);
      const ins = await q(
        // an empty location and no note are stored as a true empty (NULL): the live table REFUSES an empty text there (pax_directory_location_check, seen in the owner's log of 31 Oct 2026)
        `INSERT INTO public.pax_directory (dept_name, location, "number", label, note, source) VALUES ($1, NULLIF($2, ''), $3, $4, NULL, $5) RETURNING id`,
        [v.value.department, v.value.location, v.value.number, label, PORTAL_SOURCE],
      );
      const id = Number(ins[0].id);
      await audit(q, actor, role, "add", id, null, null, snapshot({ ...v.value, label }));
      return { status: "ok", entry: { id, department: v.value.department, location: v.value.location, number: v.value.number, version: versionOfRow({ id, label, deptName: v.value.department, location: v.value.location, number: v.value.number }) } };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    if (isUniqueViolation(e)) return { status: "conflict", conflicts: [], acknowledgeable: [] }; // the table's own rule (label and number) caught a duplicate the check could not see
    throw e;
  }
}

export async function modifyEntry(db: PaxDb, actor: Actor, id: number, raw: Partial<Record<keyof EntryInput, unknown>>, acks: Acknowledge[] = [], version?: string): Promise<EntryResult> {
  const v = validateEntry(raw);
  if (!v.ok) return { status: "invalid", errors: v.errors };
  try {
    return await db.run(async (q): Promise<EntryResult> => {
      const role = await begin(q, actor);
      await lockEntry(q, id);
      const rows = await loadPaxRows(q);
      const mine = savedLines(rows).find((l) => l.id === id);
      if (!mine) return { status: "missing" };
      const old = rows.find((r) => r.id === id) as PaxRow;
      // THE GUARD AGAINST A LOST UPDATE: the save is for the line AS THE PERSON SAW IT. If it is not that any more, nothing is written, and he is told what it is now and who changed it.
      if (!sameVersion(version, versionOfRow(old))) return { status: "stale", current: { id, department: mine.department, location: mine.location, number: mine.number, version: versionOfRow(old) }, last: await lastChangeOf(q, id) };
      if (mine.department === v.value.department && mine.location === v.value.location && mine.number === v.value.number) return { status: "unchanged" };
      const conflicts = findConflicts(rows, v.value, { ignoreId: id, keepsNumber: mine.number === v.value.number });
      if (!acknowledgementCovers(conflicts, acks)) return { status: "conflict", conflicts: withVersions(conflicts, rows), acknowledgeable: acknowledgeable(conflicts) };
      const label = composeLabel(v.value.department, v.value.location);
      await q(
        `UPDATE public.pax_directory SET dept_name = $1, location = NULLIF($2, ''), "number" = $3, label = $4, source = $5, updated_at = now() WHERE id = $6`,
        [v.value.department, v.value.location, v.value.number, label, PORTAL_SOURCE, id],
      );
      await audit(q, actor, role, "modify", id, null, snapshot({ department: mine.department, location: mine.location, number: mine.number, label: old.label }), snapshot({ ...v.value, label }));
      return { status: "ok", entry: { id, department: v.value.department, location: v.value.location, number: v.value.number, version: versionOfRow({ id, label, deptName: v.value.department, location: v.value.location, number: v.value.number }) } };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    if (isUniqueViolation(e)) return { status: "conflict", conflicts: [], acknowledgeable: [] };
    throw e;
  }
}

export async function deleteEntry(db: PaxDb, actor: Actor, id: number, version?: string): Promise<EntryResult> {
  try {
    return await db.run(async (q): Promise<EntryResult> => {
      const role = await begin(q, actor);
      await lockEntry(q, id);
      const rows = await loadPaxRows(q);
      const mine = savedLines(rows).find((l) => l.id === id);
      if (!mine) return { status: "missing" };
      const old = rows.find((r) => r.id === id) as PaxRow;
      // a line is deleted AS THE PERSON SAW IT: if it has been changed since, nothing is deleted and he looks again
      if (!sameVersion(version, versionOfRow(old))) return { status: "stale", current: { id, department: mine.department, location: mine.location, number: mine.number, version: versionOfRow(old) }, last: await lastChangeOf(q, id) };
      await q(`DELETE FROM public.pax_directory WHERE id = $1`, [id]);
      await audit(q, actor, role, "delete", id, null, snapshot({ department: mine.department, location: mine.location, number: mine.number, label: old.label }), null);
      return { status: "ok", entry: { id, department: mine.department, location: mine.location, number: mine.number } };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    throw e;
  }
}

// ---- delegation: only the HOD of C&IT authorises and revokes ----

export type DelegateResult =
  | { status: "ok" }
  | { status: "forbidden" }
  | { status: "invalid"; reason: string }
  | { status: "already" }
  | { status: "not-delegate" };

export async function listDelegates(db: PaxDb): Promise<PaxDelegateView[]> {
  const r = await db.run((q) => q(`SELECT ticket_no, name, granted_by_name, granted_by_ticket, granted_at FROM public.pax_delegate WHERE revoked_at IS NULL ORDER BY name`));
  return r.map((x) => ({ ticket: String(x.ticket_no), name: String(x.name), grantedByName: String(x.granted_by_name), grantedByTicket: String(x.granted_by_ticket), grantedAt: toIsoInstant(x.granted_at) ?? "" }));
}

export async function grantDelegate(db: PaxDb, actor: Actor, target: { ticket: string; name: string }): Promise<DelegateResult> {
  const ticket = String(target.ticket ?? "").trim();
  const name = String(target.name ?? "").replace(/\s+/g, " ").trim();
  if (!EXECUTIVE.test(ticket)) return { status: "invalid", reason: "Only an executive (a six-digit ticket number that starts with 4) can be authorised." };
  if (!name) return { status: "invalid", reason: "The executive's name is missing." };
  if (isSuperAdmin(ticket)) return { status: "invalid", reason: "The HOD of C&IT already has this authority." };
  try {
    return await db.run(async (q): Promise<DelegateResult> => {
      const role = await begin(q, actor, true);
      const active = await q(`SELECT 1 FROM public.pax_delegate WHERE ticket_no = $1 AND revoked_at IS NULL`, [ticket]);
      if (active.length > 0) return { status: "already" };
      await q(`INSERT INTO public.pax_delegate (ticket_no, name, granted_by_ticket, granted_by_name) VALUES ($1, $2, $3, $4)`, [ticket, name, actor.ticket, actor.name]);
      await audit(q, actor, role, "grant", null, ticket, null, { ticket, name });
      return { status: "ok" };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    if (isUniqueViolation(e)) return { status: "already" };
    throw e;
  }
}

export async function revokeDelegate(db: PaxDb, actor: Actor, ticketNo: string): Promise<DelegateResult> {
  const ticket = String(ticketNo ?? "").trim();
  try {
    return await db.run(async (q): Promise<DelegateResult> => {
      const role = await begin(q, actor, true);
      const r = await q(
        `UPDATE public.pax_delegate SET revoked_at = now(), revoked_by_ticket = $2, revoked_by_name = $3 WHERE ticket_no = $1 AND revoked_at IS NULL RETURNING name`,
        [ticket, actor.ticket, actor.name],
      );
      if (r.length === 0) return { status: "not-delegate" };
      await audit(q, actor, role, "revoke", null, ticket, { ticket, name: String(r[0].name) }, null);
      return { status: "ok" };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    throw e;
  }
}

// ---- the history ----

const line = (j: unknown): string => {
  const o = (j ?? null) as { department?: string; location?: string; number?: string } | null;
  return o && o.department ? `${placeName({ department: o.department, location: o.location ?? "" })} (${o.number})` : "";
};

export async function recentAudit(db: PaxDb, limit = 50): Promise<PaxAuditView[]> {
  const n = Math.min(200, Math.max(1, Math.floor(limit)));
  const r = await db.run((q) => q(`SELECT at, actor_ticket, actor_name, actor_role, action, target_ticket, before, after FROM public.pax_directory_audit ORDER BY at DESC, id DESC LIMIT ${n}`));
  return r.map((x) => {
    const action = String(x.action) as PaxAuditView["action"];
    const before = x.before, after = x.after as { name?: string; ticket?: string } | null;
    const shown = (action === "delete" ? before : action === "add" || action === "modify" ? after : null) as { department?: string; location?: string; number?: string } | null;
    const who = action === "grant" ? after : action === "revoke" ? (before as { name?: string; ticket?: string } | null) : null;
    const detail = action === "modify" ? line(before) : who ? `${who.name ?? ""} (${String(x.target_ticket)})` : "";
    const summary =
      action === "add" ? `Added ${line(after)}`
      : action === "modify" ? `Changed ${line(before)} to ${line(after)}`
      : action === "delete" ? `Deleted ${line(before)}`
      : action === "grant" ? `Authorised ${after?.name ?? ""} (${String(x.target_ticket)})`
      : `Withdrew the authority of ${(before as { name?: string } | null)?.name ?? ""} (${String(x.target_ticket)})`;
    return {
      at: toIsoInstant(x.at) ?? "", actorName: String(x.actor_name), actorTicket: String(x.actor_ticket), actorRole: String(x.actor_role) as "hod" | "delegate", actorDesignation: "",
      action, department: shown?.department ?? "", location: shown?.location ?? "", number: shown?.number ?? "", detail, summary,
    };
  });
}
