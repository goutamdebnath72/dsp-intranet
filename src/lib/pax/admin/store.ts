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
import { Forbidden, authorityOf as sharedAuthorityOf, begin as sharedBegin, grantDelegate as sharedGrant, listDelegates as sharedList, revokeDelegate as sharedRevoke } from "@/lib/facility/authority";
import { lastChangeOf as sharedLastChange, recentAuditRows, writeAudit } from "@/lib/facility/audit";
import type { DelegateResult } from "@/lib/facility/types";
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

const EXECUTIVE = /^4\d{5}$/;

/** Who the person is for this purpose: the HOD of C&IT (by ticket, from the environment), an authorised and not revoked executive, or nobody. The kit's (src/lib/facility/authority.ts), the same for every tool. */
export const authorityOf = (q: QueryFn, ticket: string | null | undefined): Promise<Authority | null> => sharedAuthorityOf(q, "pax", ticket);

/** Takes the tool's global write lock, then confirms the authority; the returned role is the one written in the history. Throws the kit's Forbidden error when there is none. */
const begin = (q: QueryFn, actor: Actor, needHod = false): Promise<Authority> => sharedBegin(q, "pax", actor, needHod);

const snapshot = (l: { department: string; location: string; number: string; label?: string }) => ({ department: l.department, location: l.location, number: l.number, ...(l.label ? { label: l.label } : {}) });

async function audit(
  q: QueryFn, actor: Actor, role: Authority, action: "add" | "modify" | "delete" | "grant" | "revoke",
  paxId: number | null, targetTicket: string | null, before: unknown, after: unknown, note: string | null = null,
): Promise<void> {
  await writeAudit(q, "pax", actor, role, action, { targetId: paxId, targetTicket, before, after, note });
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
const lastChangeOf = (q: QueryFn, id: number): Promise<PaxLastChange | null> => sharedLastChange(q, "pax", id);

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

export type { DelegateResult };

/** The authorised executives, the authorising and the withdrawing are the kit's (src/lib/facility/authority.ts): the same code, the same rules and words, for every tool. */
export const listDelegates = (db: PaxDb): Promise<PaxDelegateView[]> => sharedList(db, "pax");
export const grantDelegate = (db: PaxDb, actor: Actor, target: { ticket: string; name: string }): Promise<DelegateResult> => sharedGrant(db, "pax", actor, target);
export const revokeDelegate = (db: PaxDb, actor: Actor, ticketNo: string): Promise<DelegateResult> => sharedRevoke(db, "pax", actor, ticketNo);

// ---- the history ----

const line = (j: unknown): string => {
  const o = (j ?? null) as { department?: string; location?: string; number?: string } | null;
  return o && o.department ? `${placeName({ department: o.department, location: o.location ?? "" })} (${o.number})` : "";
};

export async function recentAudit(db: PaxDb, limit = 50): Promise<PaxAuditView[]> {
  const lines = await recentAuditRows(db, "pax", limit);
  return lines.map((x) => {
    const action = x.action as PaxAuditView["action"];
    const before = x.before, after = x.after as { name?: string; ticket?: string } | null;
    const shown = (action === "delete" ? before : action === "add" || action === "modify" ? after : null) as { department?: string; location?: string; number?: string } | null;
    const who = action === "grant" ? after : action === "revoke" ? (before as { name?: string; ticket?: string } | null) : null;
    const detail = action === "modify" ? line(before) : who ? `${who.name ?? ""} (${x.targetTicket})` : "";
    const summary =
      action === "add" ? `Added ${line(after)}`
      : action === "modify" ? `Changed ${line(before)} to ${line(after)}`
      : action === "delete" ? `Deleted ${line(before)}`
      : action === "grant" ? `Authorised ${after?.name ?? ""} (${x.targetTicket})`
      : `Withdrew the authority of ${(before as { name?: string } | null)?.name ?? ""} (${x.targetTicket})`;
    return {
      at: x.at, actorName: x.actorName, actorTicket: x.actorTicket, actorRole: x.actorRole, actorDesignation: "",
      action, department: shown?.department ?? "", location: shown?.location ?? "", number: shown?.number ?? "", detail, summary,
    };
  });
}
