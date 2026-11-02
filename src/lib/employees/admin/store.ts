// src/lib/employees/admin/store.ts
//
// THE EMPLOYEE MANAGER'S OPERATIONS (step 66a; owner, 1 Nov 2026): add, change and delete an employee; authorise and withdraw an executive; read the history. Like the PAX editor's store, every operation
//   - runs in ONE transaction, under one lock (two people cannot add the same ticket at the same moment),
//   - checks the person's authority INSIDE the transaction (the HOD of C&IT by SUPERADMIN_TICKETS, or an executive the HOD has authorised and not withdrawn),
//   - writes its audit line in the same transaction: a change cannot be saved without the record of who made it and of the record before and after.
// WHAT IS DIFFERENT FROM PAX:
//   - the two DATES (birth, joining) are the HOD's alone: for anybody else they are neither shown nor changed, in the form and in the history (the owner: "no user can search the dob and doj ... except the HOD");
//   - only the HOD DELETES a person (it can never be the HOD himself), and he may remove the person's login account with him;
//   - the table is the live roster, whose exact columns this code does not assume: the optional ones (address, e-mails, the doctor flag, the dates, source_snapshot_date) are DISCOVERED in the database.
// THE LOGIN ACCOUNT (step 66b): the mobile number and the general e-mail of an employee are kept in his login account (public."user": contactNo, email: what the search cards mask and reveal), so adding an employee
// also creates that account, with his SAIL P.No. as the first password (bcrypt, as the other accounts are); a person who has an account already (the same ticket) is linked, not duplicated. A change keeps the
// account's name, P.No., designation, mobile and e-mail in step with the roster and NEVER touches the password. The manager never shows a whole mobile number or e-mail: the masks of the search cards.
// The database is reached through a tiny interface (EmpDb) so the same code runs against the application's connection and against a scratch database in the tests.

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { DateTime } from "luxon";
import { IST, toIsoInstant } from "@/lib/dates";
import { isSuperAdmin } from "@/lib/superAdmin";
import type { QueryFn } from "@/lib/pax/store";
import type { AcknowledgeKind, Authority, AuditView, ChangeView, DelegateView, DepartmentRef, EmployeeConflict, EmployeeRecord, FieldErrors, GradeRef, Lookups, LastChange } from "./types";
import { sameVersion, versionOf } from "@/lib/concurrency/version";
import { Forbidden, authorityOf as sharedAuthorityOf, begin as sharedBegin, grantDelegate as sharedGrant, listDelegates as sharedList, revokeDelegate as sharedRevoke, revokeEverywhere } from "@/lib/facility/authority";
import { lastChangeOf as sharedLastChange, recentAuditRows, writeAudit } from "@/lib/facility/audit";
import type { DelegateResult } from "@/lib/facility/types";
import { NIC_DOMAIN, WEBMAIL_DOMAIN, endsWithDomain, maskEmail, maskMobile } from "./contact";
import { cleanText, seniorityRank, validateEmployee } from "./validate";

export interface EmpDb {
  run<T>(fn: (q: QueryFn) => Promise<T>): Promise<T>;
  /** What the remembered table layout and code lists hang on (the database connection): without it nothing is remembered and every call reads them again (as the tests' wrappers do). */
  cacheKey?: object;
}
export interface Actor { ticket: string; name: string }

const EXECUTIVE = /^4\d{5}$/;
/** One Forbidden for every tool (src/lib/facility/authority.ts): the kit's `begin` throws it and this store's catch blocks recognise it. */
export { Forbidden };
/** A login-account rule that refuses the whole change (carries the field errors); thrown inside the transaction so that nothing is kept, caught outside it. */
class LoginRefused extends Error { constructor(public errors: FieldErrors) { super("login refused"); } }

export const authorityOf = (q: QueryFn, ticket: string | null | undefined): Promise<Authority | null> => sharedAuthorityOf(q, "employee", ticket);

/** The start of every write: the tool's global write lock, then who is acting (the kit's, src/lib/facility/authority.ts). */
const begin = (q: QueryFn, actor: Actor, needHod = false): Promise<Authority> => sharedBegin(q, "employee", actor, needHod);

// ---- what the live tables look like (discovered, not assumed) ----
interface Cols { has: Set<string>; notNullNoDefault: Set<string>; deptScope: boolean; user: Set<string> }
async function discover(q: QueryFn): Promise<Cols> {
  const rows = await q(`SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('employee_roster', 'sail_department', 'user')`);
  const has = new Set<string>(), notNullNoDefault = new Set<string>(), user = new Set<string>();
  let deptScope = false;
  for (const r of rows) {
    if (r.table_name === "user") { user.add(String(r.column_name)); continue; }
    if (r.table_name === "sail_department") { if (r.column_name === "cohort_scope") deptScope = true; continue; }
    has.add(String(r.column_name));
    if (r.is_nullable === "NO" && r.column_default === null) notNullNoDefault.add(String(r.column_name));
  }
  return { has, notNullNoDefault, deptScope, user };
}

export async function loadLookups(q: QueryFn, cols?: Cols): Promise<Lookups> {
  const c = cols ?? (await discover(q));
  const g = await q(`SELECT id, code, title, track, rank_order FROM public.designation_grade ORDER BY rank_order, id`);
  const d = await q(`SELECT id, code, name, ${c.deptScope ? "cohort_scope" : "'shared'"} AS scope FROM public.sail_department ORDER BY name, id`);
  return {
    grades: g.map((x): GradeRef => ({ id: Number(x.id), code: Number(x.code), title: String(x.title), track: String(x.track), rankOrder: Number(x.rank_order) })),
    departments: d.map((x): DepartmentRef => ({ id: Number(x.id), code: Number(x.code), name: String(x.name), scope: (["executive", "nonexecutive"].includes(String(x.scope)) ? String(x.scope) : "shared") as DepartmentRef["scope"] })),
  };
}

// ---- reading a person ----
const opt = (c: Cols, col: string, cast = "") => (c.has.has(col) ? `er.${col}${cast}` : "NULL");
const SELECT = (c: Cols) => `SELECT er.id, er.ticket_no, ${opt(c, "sail_pno")} AS sail_pno, er.name, er.cohort, er.designation_grade_id AS grade_id, dg.title AS grade_title,
       er.sail_department_id AS department_id, sd.name AS department_name, er.within_grade_position AS position, ${opt(c, "address")} AS address, ${opt(c, "email_nic")} AS email_nic,
       ${opt(c, "webmail_saildsp")} AS webmail, ${opt(c, "doctor_override")} AS doctor, ${opt(c, "date_of_birth", "::text")} AS dob, ${opt(c, "date_of_joining", "::text")} AS doj,
       ${opt(c, "user_id")} AS user_id, ${c.user.has("contactNo") ? 'u."contactNo"' : "NULL"} AS contact_no, ${c.user.has("email") ? "u.email" : "NULL"} AS user_email
  FROM public.employee_roster er JOIN public.designation_grade dg ON dg.id = er.designation_grade_id LEFT JOIN public.sail_department sd ON sd.id = er.sail_department_id
  LEFT JOIN public."user" u ON u.id = ${c.has.has("user_id") ? "er.user_id" : "NULL"}`;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * THE VERSION of a row, worked out from the RAW values of every field the manager can change (the real mobile and e-mails, not the masks), signed with the server's secret (src/lib/concurrency/version.ts).
 * The dates are part of it only for somebody who may see them: an authorised executive's version does not move when the HOD changes only a date he cannot even see.
 */
export function versionOfRow(r: Record<string, unknown>, canSeeDates: boolean): string {
  return versionOf("employee", [
    r.id, r.sail_pno, r.name, r.grade_id, r.department_id, r.position, r.address, r.email_nic, r.webmail, r.doctor, r.contact_no, r.user_email, r.user_id,
    ...(canSeeDates ? [str(r.dob).slice(0, 10), str(r.doj).slice(0, 10)] : []),
  ]);
}

export function rowToRecord(r: Record<string, unknown>, canSeeDates: boolean): EmployeeRecord {
  return {
    id: Number(r.id), ticketNo: str(r.ticket_no).trim(), sailPno: str(r.sail_pno), name: str(r.name), cohort: r.cohort === "executive" ? "executive" : "nonexecutive",
    gradeId: Number(r.grade_id), gradeTitle: str(r.grade_title), departmentId: r.department_id === null || r.department_id === undefined ? null : Number(r.department_id), departmentName: str(r.department_name),
    position: Number(r.position), address: str(r.address), emailNic: maskEmail(str(r.email_nic)), webmail: maskEmail(str(r.webmail)), mobileMasked: maskMobile(str(r.contact_no)), emailMasked: maskEmail(str(r.user_email)), doctor: typeof r.doctor === "boolean" ? r.doctor : null,
    dateOfBirth: canSeeDates ? str(r.dob).slice(0, 10) : "", dateOfJoining: canSeeDates ? str(r.doj).slice(0, 10) : "", datesVisible: canSeeDates, hasLogin: r.user_id !== null && r.user_id !== undefined, version: versionOfRow(r, canSeeDates),
  };
}

/** What the history keeps of a person: every editable field, the dates included (the history is read by the HOD with the dates, by everybody else without). */
const snap = (r: EmployeeRecord) => ({
  ticketNo: r.ticketNo, sailPno: r.sailPno, name: r.name, gradeId: r.gradeId, gradeTitle: r.gradeTitle, departmentId: r.departmentId, departmentName: r.departmentName, position: r.position,
  address: r.address, emailNic: r.emailNic, webmail: r.webmail, mobile: r.mobileMasked, email: r.emailMasked, doctor: r.doctor, dateOfBirth: r.dateOfBirth, dateOfJoining: r.dateOfJoining,
});
type Snap = ReturnType<typeof snap>;

async function getRow(q: QueryFn, cols: Cols, id: number) {
  const r = await q(`${SELECT(cols)} WHERE er.id = $1`, [id]);
  return r[0];
}

/**
 * LOCK the person's row (and his login account's) BEFORE it is read for a change or a delete. The global write lock every save takes already makes two saves of this manager wait for each other; this row lock
 * closes the gap for any writer that does not know that lock (a SQL script, another program): it has to wait until this transaction ends, and the version check that follows then sees what it did.
 */
async function lockRow(q: QueryFn, cols: Cols, id: number): Promise<void> {
  await q(`SELECT 1 FROM public.employee_roster WHERE id = $1 FOR UPDATE`, [id]);
  if (cols.has.has("user_id") && cols.user.has("id")) await q(`SELECT 1 FROM public."user" WHERE id = (SELECT user_id FROM public.employee_roster WHERE id = $1) FOR UPDATE`, [id]);
}

/** What the manager last recorded for this person (an add or a change): who and when. Only the facts, never a value, so that nothing the reader may not see is told. */
const lastChangeOf = (q: QueryFn, id: number): Promise<LastChange | null> => sharedLastChange(q, "employee", id);

const escapeLike = (w: string) => w.replace(/[\\%_]/g, (m) => `\\${m}`);
// ---------------------------------------------------------------------------------------------------------------------------------
// REMEMBERING THE TABLE LAYOUT AND THE CODE LISTS (step 67d; owner, 1 Nov 2026: "speed up saves by remembering the table layout and the code lists for a few minutes instead of reading them on every save").
// Every search, add, change and delete first asked the database what columns the tables have (discover) and, for add and change, for the whole list of designations and departments (loadLookups): three
// round trips to Supabase, each about half a second on a development machine, on EVERY save. They change only when somebody runs a migration, so they are remembered for 5 minutes, SEPARATELY (the layout and the lists).
// WHERE: on the database connection (`db.cacheKey`), not in a global: another database, a test database or a restarted server never sees this memory, and a wrapper without a key remembers nothing.
// WHY IT CANNOT MAKE A SAVE WRONG:
//   * when a panel opens (the `lookups` request) both are read FRESH and remembered, so what is on the screen is never staler than the moment it was opened;
//   * a save refused only because a designation or department is not in the REMEMBERED list reads the real list and checks again before it gives up (a designation added by a script a minute ago works at once);
//   * a designation or department removed since it was remembered is refused by the database (a foreign key): that becomes a clear message, the memory is cleared, and nothing is half written.
// Only the layout and the codes and titles are remembered: nothing about a person, so nothing private.
// ---------------------------------------------------------------------------------------------------------------------------------
export const SCHEMA_MEMORY_MS = 5 * 60 * 1000;
interface Remembered { cols?: { v: Cols; at: number }; lookups?: { v: Lookups; at: number } }
const memory = new WeakMap<object, Remembered>();
/** `now` can be moved by a test; `clear(db)` forgets everything of one database. */
export const schemaMemory = {
  now: (): number => Date.now(),
  ttlMs: SCHEMA_MEMORY_MS,
  clear(db: EmpDb): void { if (db.cacheKey) memory.delete(db.cacheKey); },
};
const alive = (e: { at: number } | undefined): boolean => !!e && schemaMemory.now() - e.at <= schemaMemory.ttlMs;
const keep = (db: EmpDb, patch: Remembered): void => { if (db.cacheKey) memory.set(db.cacheKey, { ...(memory.get(db.cacheKey) ?? {}), ...patch }); };

/** The table layout: from the memory while it is fresh, else read (and remembered). */
async function colsFor(db: EmpDb, q: QueryFn): Promise<Cols> {
  const m = db.cacheKey ? memory.get(db.cacheKey) : undefined;
  if (m?.cols && alive(m.cols)) return m.cols.v;
  const v = await discover(q);
  keep(db, { cols: { v, at: schemaMemory.now() } });
  return v;
}
/** The designations and departments: from the memory while fresh (`cached` says so), else read (and remembered). */
async function lookupsFor(db: EmpDb, q: QueryFn, cols: Cols): Promise<{ lk: Lookups; cached: boolean }> {
  const m = db.cacheKey ? memory.get(db.cacheKey) : undefined;
  if (m?.lookups && alive(m.lookups)) return { lk: m.lookups.v, cached: true };
  const v = await loadLookups(q, cols);
  keep(db, { lookups: { v, at: schemaMemory.now() } });
  return { lk: v, cached: false };
}
/** Read the real lists NOW and remember them. */
async function freshLookups(db: EmpDb, q: QueryFn, cols: Cols): Promise<Lookups> {
  const v = await loadLookups(q, cols);
  keep(db, { lookups: { v, at: schemaMemory.now() } });
  return v;
}
/**
 * Validate a record against the lists. If the lists came from the MEMORY and the only trouble is that a designation or department is not in them, the real lists are read and the record is checked once more:
 * the memory can be a few minutes old, and a refusal must never be because of that.
 */
async function validateHealing(db: EmpDb, q: QueryFn, cols: Cols, raw: Record<string, unknown>, opts: Parameters<typeof validateEmployee>[2], first: { lk: Lookups; cached: boolean }): Promise<{ lk: Lookups; v: ReturnType<typeof validateEmployee> }> {
  let lk = first.lk;
  let v = validateEmployee(raw, lk, opts);
  if (!v.ok && first.cached && (v.errors.gradeId || v.errors.departmentId)) {
    lk = await freshLookups(db, q, cols);
    v = validateEmployee(raw, lk, opts);
  }
  return { lk, v };
}

export async function searchEmployees(db: EmpDb, text: string, canSeeDates: boolean, limit = 25): Promise<EmployeeRecord[]> {
  const words = cleanText(text, 80).toLowerCase().split(" ").filter(Boolean).slice(0, 5);
  if (words.length === 0) return [];
  return db.run(async (q) => {
    const cols = await colsFor(db, q);
    const params: unknown[] = [];
    const conds = words.map((w) => {
      params.push(escapeLike(w));
      const n = params.length;
      return /^\d+$/.test(w) ? `er.ticket_no LIKE $${n} || '%'` : `(lower(er.name) LIKE '%' || $${n} || '%' ${cols.has.has("sail_pno") ? `OR lower(coalesce(er.sail_pno, '')) = $${n}` : ""})`;
    });
    const rows = await q(`${SELECT(cols)} WHERE ${conds.join(" AND ")} ORDER BY er.global_seniority_rank, er.name LIMIT ${Math.min(50, Math.max(1, Math.floor(limit)))}`, params);
    return rows.map((r) => rowToRecord(r, canSeeDates));
  });
}

export async function getEmployee(db: EmpDb, id: number, canSeeDates: boolean): Promise<EmployeeRecord | null> {
  return db.run(async (q) => {
    const row = await getRow(q, await colsFor(db, q), id);
    return row ? rowToRecord(row, canSeeDates) : null;
  });
}

/** Asked once when a panel opens: reads the layout AND the lists fresh from the database and remembers them, so that what the person sees is as fresh as the moment he opened the panel. */
export const lookups = (db: EmpDb): Promise<Lookups> => db.run(async (q) => {
  const cols = await discover(q);
  keep(db, { cols: { v: cols, at: schemaMemory.now() } });
  return freshLookups(db, q, cols);
});

// ---- the audit line ----
async function audit(q: QueryFn, actor: Actor, role: Authority, action: "add" | "modify" | "delete" | "grant" | "revoke", employeeId: number | null, targetTicket: string | null, targetName: string | null, before: unknown, after: unknown, note: string | null = null) {
  await writeAudit(q, "employee", actor, role, action, { targetId: employeeId, targetTicket, targetName, before, after, note });
}

/** The name-search helper tables are refreshed after a name changes; a database without that function (or any failure in it) must never undo the change itself, hence the savepoint. */
async function refreshNameCodes(q: QueryFn): Promise<void> {
  await q("SAVEPOINT name_codes");
  try { await q("SELECT nlq.refresh_name_codes()"); await q("RELEASE SAVEPOINT name_codes"); } catch { await q("ROLLBACK TO SAVEPOINT name_codes"); }
}

const isUnique = (e: unknown) => (e as { code?: string })?.code === "23505";
const isCheck = (e: unknown) => (e as { code?: string })?.code === "23514";
/** A foreign key refused the write: a designation or a department that was in the remembered list is no longer in the table. */
const isForeignKey = (e: unknown) => (e as { code?: string })?.code === "23503";
const LISTS_CHANGED: FieldErrors = { form: "The list of designations or departments has just changed: please open the form again and choose once more." };

export type SaveResult =
  | { status: "ok"; employee: EmployeeRecord }
  | { status: "invalid"; errors: FieldErrors; warnings?: string[] }
  | { status: "conflict"; conflicts: EmployeeConflict[]; acknowledgeable: AcknowledgeKind[] }
  | { status: "unchanged" }
  /** The record is not what the person saw: somebody changed it first. Nothing was written. `current` is the record as it is now (as this person may see it), `last` the change recorded last. */
  | { status: "stale"; current: EmployeeRecord; last: LastChange | null }
  | { status: "missing" }
  | { status: "forbidden" };

async function sameNameElsewhere(q: QueryFn, name: string, departmentId: number | null, exceptId: number | null): Promise<EmployeeConflict[]> {
  if (departmentId === null) return [];
  const r = await q(
    `SELECT er.id, er.ticket_no, er.name, sd.name AS department_name FROM public.employee_roster er LEFT JOIN public.sail_department sd ON sd.id = er.sail_department_id
      WHERE upper(er.name) = $1 AND er.sail_department_id = $2 AND ($3::int IS NULL OR er.id <> $3) LIMIT 5`,
    [name, departmentId, exceptId],
  );
  return r.map((x) => ({ kind: "same-name" as const, text: `${str(x.name)} (${str(x.ticket_no).trim()}) is already in ${str(x.department_name)}.`, with: { id: Number(x.id), ticketNo: str(x.ticket_no).trim(), name: str(x.name), departmentName: str(x.department_name) } }));
}

const nullable = (s: string) => (s === "" ? null : s);

/** The roster's two corporate mail columns for an input: an executive's own two fields; a non-executive's one e-mail goes to a column only when it IS a SAIL address (the rare privilege). */
export function rosterMails(cohort: "executive" | "nonexecutive", x: { emailNic: string; webmail: string; email: string }, keep: { emailNic: string; webmail: string }): { emailNic: string; webmail: string } {
  if (cohort === "executive") return { emailNic: x.emailNic, webmail: x.webmail };
  return { emailNic: endsWithDomain(x.email, NIC_DOMAIN) ? x.email : keep.emailNic, webmail: endsWithDomain(x.email, WEBMAIL_DOMAIN) ? x.email : keep.webmail };
}
/** The e-mail the login account carries: an executive's NIC mail (else his web-mail); a non-executive's own e-mail. */
export const loginEmailOf = (cohort: "executive" | "nonexecutive", x: { emailNic: string; webmail: string; email: string }): string => (cohort === "executive" ? x.emailNic || x.webmail : x.email);

const newLoginId = () => `c${randomBytes(12).toString("hex")}`;
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/**
 * The employee's login account (public."user"): created when there is none (his SAIL P.No. is the first password, hashed like every other), or linked when the same ticket already has one; its mobile and e-mail are
 * set from what was typed (empty = leave as it is). Only the columns that exist are written. The password of an account that exists is NEVER changed. Returns the field errors when an e-mail is already another login's.
 */
async function ensureLogin(q: QueryFn, cols: Cols, p: { rosterId: number; ticketNo: string; name: string; sailPno: string; gradeTitle: string; mobile: string; loginEmail: string; emailField: "emailNic" | "email" }): Promise<{ errors?: FieldErrors }> {
  if (!cols.user.has("id") || !cols.user.has("ticketNo")) return {};
  const existing = await q(`SELECT id FROM public."user" WHERE "ticketNo" = $1 LIMIT 1`, [p.ticketNo]);
  if (p.loginEmail && cols.user.has("email")) {
    const clash = await q(`SELECT 1 FROM public."user" WHERE lower(email) = $1 AND "ticketNo" <> $2 LIMIT 1`, [p.loginEmail, p.ticketNo]);
    if (clash.length) return { errors: { [p.emailField]: "This e-mail already belongs to another login account." } };
  }
  let id: string;
  if (existing.length) {
    id = String(existing[0].id);
    const sets: string[] = [], vals: unknown[] = [];
    if (p.mobile && cols.user.has("contactNo")) { vals.push(p.mobile); sets.push(`"contactNo" = $${vals.length}`); }
    if (p.loginEmail && cols.user.has("email")) { vals.push(p.loginEmail); sets.push(`email = $${vals.length}`); }
    if (sets.length) { vals.push(id); await q(`UPDATE public."user" SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals); }
  } else {
    id = newLoginId();
    const names = ["id", `"ticketNo"`], vals: unknown[] = [id, p.ticketNo];
    const add = (c: string, col: string, v: unknown) => { if (cols.user.has(c)) { names.push(col); vals.push(v); } };
    add("name", "name", p.name);
    add("password", "password", await bcrypt.hash(p.sailPno, 10));
    add("sailPNo", `"sailPNo"`, nullable(p.sailPno));
    add("designation", "designation", nullable(p.gradeTitle));
    add("contactNo", `"contactNo"`, nullable(p.mobile));
    add("email", "email", nullable(p.loginEmail));
    await q(`INSERT INTO public."user" (${names.join(", ")}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(", ")})`, vals);
  }
  if (cols.has.has("user_id")) await q(`UPDATE public.employee_roster SET user_id = $1 WHERE id = $2`, [id, p.rosterId]);
  return {};
}

export async function addEmployee(db: EmpDb, actor: Actor, raw: Record<string, unknown>, acks: AcknowledgeKind[] = []): Promise<SaveResult> {
  try {
    return await db.run(async (q): Promise<SaveResult> => {
      const role = await begin(q, actor);
      const cols = await colsFor(db, q);
      const now = DateTime.now().setZone(IST);
      const { lk, v } = await validateHealing(db, q, cols, raw, { today: now, canEditDates: role === "hod", requirePno: true }, await lookupsFor(db, q, cols));
      if (!v.ok) return { status: "invalid", errors: v.errors };
      const x = v.value;
      const dup = await q(`SELECT name FROM public.employee_roster WHERE ticket_no = $1 LIMIT 1`, [x.ticketNo]);
      if (dup.length) return { status: "invalid", errors: { ticketNo: `Ticket ${x.ticketNo} already belongs to ${str(dup[0].name)}.` } };
      if (x.sailPno && cols.has.has("sail_pno")) {
        const p = await q(`SELECT name, ticket_no FROM public.employee_roster WHERE upper(sail_pno) = $1 LIMIT 1`, [x.sailPno]);
        if (p.length) return { status: "invalid", errors: { sailPno: `The SAIL P.No. ${x.sailPno} already belongs to ${str(p[0].name)} (${str(p[0].ticket_no).trim()}).` } };
      }
      const same = await sameNameElsewhere(q, x.name, x.departmentId, null);
      if (same.length && !acks.includes("same-name")) return { status: "conflict", conflicts: same, acknowledgeable: ["same-name"] };

      const grade = lk.grades.find((g) => g.id === x.gradeId)!;
      let position = x.position;
      if (position === null) position = Number((await q(`SELECT coalesce(max(within_grade_position), 0) + 1 AS n FROM public.employee_roster WHERE designation_grade_id = $1`, [grade.id]))[0].n);
      if (position > 9999) return { status: "invalid", errors: { position: "This grade is full (the position would pass 9999)." } };
      const cohort = /^4\d{5}$/.test(x.ticketNo) ? "executive" : "nonexecutive";

      const names: string[] = ["ticket_no", "name", "designation_grade_id", "sail_department_id", "cohort", "within_grade_position", "global_seniority_rank"];
      const vals: unknown[] = [x.ticketNo, x.name, grade.id, x.departmentId, cohort, position, seniorityRank(grade, position)];
      const addOpt = (col: string, value: unknown) => { if (cols.has.has(col)) { names.push(col); vals.push(value); } };
      // THE LIVE ROSTER'S id HAS NO AUTOMATIC NUMBERING (its rows were loaded with fixed ids; seen in the owner's log of 1 Nov 2026: "null value in column id violates not-null constraint"): then the next id is taken here, with the
      // table locked against every writer (also one that does not know the global lock: a SQL script waits until this transaction ends), so that two inserts can never take the same number. A table that numbers its own ids is left alone.
      if (cols.notNullNoDefault.has("id")) {
        await q(`LOCK TABLE public.employee_roster IN SHARE ROW EXCLUSIVE MODE`);
        names.push("id"); vals.push(Number((await q(`SELECT coalesce(max(id), 0) + 1 AS n FROM public.employee_roster`))[0].n));
      }
      addOpt("sail_pno", nullable(x.sailPno));
      addOpt("address", nullable(x.address));
      const mails = rosterMails(cohort, x, { emailNic: "", webmail: "" });
      addOpt("email_nic", nullable(mails.emailNic));
      addOpt("webmail_saildsp", nullable(mails.webmail));
      if (x.doctor !== null) addOpt("doctor_override", x.doctor);
      if (role === "hod" && cols.has.has("date_of_birth") && cols.has.has("date_of_joining") && (x.dateOfBirth || x.dateOfJoining)) {
        names.push("date_of_birth", "date_of_joining"); vals.push(x.dateOfBirth, x.dateOfJoining);
        if (cols.has.has("dates_source")) { names.push("dates_source"); vals.push("hr"); }
      }
      if (cols.notNullNoDefault.has("source_snapshot_date") && !names.includes("source_snapshot_date")) { names.push("source_snapshot_date"); vals.push(now.toISODate()); }
      const ins = await q(`INSERT INTO public.employee_roster (${names.join(", ")}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`, vals);
      const id = Number(ins[0].id);
      // his login account: created (SAIL P.No. = first password) or linked; an e-mail that is another login's is refused and NOTHING of the addition is kept
      const login = await ensureLogin(q, cols, { rosterId: id, ticketNo: x.ticketNo, name: x.name, sailPno: x.sailPno, gradeTitle: grade.title, mobile: x.mobile, loginEmail: loginEmailOf(cohort, x), emailField: cohort === "executive" ? "emailNic" : "email" });
      if (login.errors) throw new LoginRefused(login.errors); // thrown inside the transaction: it is rolled back, nothing of the addition is kept
      const rec = rowToRecord(await getRow(q, cols, id), true);
      await audit(q, actor, role, "add", id, rec.ticketNo, rec.name, null, snap(rec), rec.hasLogin ? "login account made, first password = SAIL P.No." : null);
      await refreshNameCodes(q);
      return { status: "ok", employee: rowToRecord(await getRow(q, cols, id), role === "hod") };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    if (e instanceof LoginRefused) return { status: "invalid", errors: e.errors };
    if (isForeignKey(e)) { schemaMemory.clear(db); return { status: "invalid", errors: LISTS_CHANGED }; }
    if (isUnique(e)) return { status: "invalid", errors: { ticketNo: "This ticket number (or SAIL P.No.) is already on the roll." } };
    if (isCheck(e)) return { status: "invalid", errors: { dateOfJoining: "The database refused these dates: nobody joins before 18 (23 for a direct recruit, ticket 49xxxx)." } };
    throw e;
  }
}

const EDITABLE: Array<keyof Snap> = ["sailPno", "name", "gradeId", "departmentId", "position", "address", "doctor", "dateOfBirth", "dateOfJoining"];

export async function modifyEmployee(db: EmpDb, actor: Actor, id: number, raw: Record<string, unknown>, acks: AcknowledgeKind[] = [], version?: string): Promise<SaveResult> {
  try {
    return await db.run(async (q): Promise<SaveResult> => {
      const role = await begin(q, actor);
      const cols = await colsFor(db, q);
      await lockRow(q, cols, id);
      const curRow = await getRow(q, cols, id);
      if (!curRow) return { status: "missing" };
      const hod = role === "hod";
      // THE GUARD AGAINST A LOST UPDATE: the save is for the record AS THE PERSON SAW IT. If it is not that any more, nothing is written (not even a part), and he is told what it is now and who changed it.
      if (!sameVersion(version, versionOfRow(curRow, hod))) return { status: "stale", current: rowToRecord(curRow, hod), last: await lastChangeOf(q, id) };
      const cur = rowToRecord(curRow, true);
      const { lk, v } = await validateHealing(db, q, cols, raw, { today: DateTime.now().setZone(IST), canEditDates: hod, fixedTicket: cur.ticketNo, requirePno: cur.sailPno !== "", hasMobile: digits(curRow.contact_no) !== "" }, await lookupsFor(db, q, cols));
      if (!v.ok) return { status: "invalid", errors: v.errors };
      const x = v.value;
      const grade = lk.grades.find((g) => g.id === x.gradeId)!;

      let position = x.position;
      if (position === null) position = x.gradeId === cur.gradeId ? cur.position : Number((await q(`SELECT coalesce(max(within_grade_position), 0) + 1 AS n FROM public.employee_roster WHERE designation_grade_id = $1`, [grade.id]))[0].n);
      if (position > 9999) return { status: "invalid", errors: { position: "This grade is full (the position would pass 9999)." } };
      // the roster's two mail columns by cohort (a non-executive's own columns stay as they are unless he typed a SAIL address); the login account's mobile and e-mail: changed only when something was typed
      const curNic = str(curRow.email_nic), curWeb = str(curRow.webmail);
      // empty keeps (a mail is shown masked, so typing is replacing); an executive's own two fields, a non-executive's SAIL address kept as such
      const mails = cur.cohort === "executive" ? { emailNic: x.emailNic || curNic, webmail: x.webmail || curWeb } : rosterMails(cur.cohort, x, { emailNic: curNic, webmail: curWeb });
      const nicChanged = mails.emailNic !== curNic, webChanged = mails.webmail !== curWeb;
      const loginEmail = loginEmailOf(cur.cohort, x);
      const mobileChanged = x.mobile !== "" && x.mobile !== digits(curRow.contact_no);
      const emailChanged = loginEmail !== "" && loginEmail !== str(curRow.user_email).toLowerCase();
      // for anybody but the HOD the dates stay as they are
      const next: Snap = {
        ...snap(cur), sailPno: x.sailPno, name: x.name, gradeId: x.gradeId as number, gradeTitle: grade.title, departmentId: x.departmentId, departmentName: lk.departments.find((d) => d.id === x.departmentId)?.name ?? "",
        position, address: x.address, emailNic: maskEmail(mails.emailNic), webmail: maskEmail(mails.webmail), doctor: x.doctor === null ? cur.doctor : x.doctor,
        dateOfBirth: hod ? (x.dateOfBirth ?? "") : cur.dateOfBirth, dateOfJoining: hod ? (x.dateOfJoining ?? "") : cur.dateOfJoining,
      };
      const before = snap(cur);
      const changed = EDITABLE.filter((f) => before[f] !== next[f]);
      if (changed.length === 0 && !mobileChanged && !emailChanged && !nicChanged && !webChanged) return { status: "unchanged" };

      if (changed.includes("sailPno") && next.sailPno && cols.has.has("sail_pno")) {
        const p = await q(`SELECT name, ticket_no FROM public.employee_roster WHERE upper(sail_pno) = $1 AND id <> $2 LIMIT 1`, [next.sailPno, id]);
        if (p.length) return { status: "invalid", errors: { sailPno: `The SAIL P.No. ${next.sailPno} already belongs to ${str(p[0].name)} (${str(p[0].ticket_no).trim()}).` } };
      }
      if (changed.includes("name") || changed.includes("departmentId")) {
        const same = await sameNameElsewhere(q, next.name, next.departmentId, id);
        if (same.length && !acks.includes("same-name")) return { status: "conflict", conflicts: same, acknowledgeable: ["same-name"] };
      }

      const sets: string[] = [], vals: unknown[] = [];
      const set = (col: string, value: unknown) => { vals.push(value); sets.push(`${col} = $${vals.length}`); };
      const col = (c: string) => cols.has.has(c);
      if (changed.includes("name")) set("name", next.name);
      if (changed.includes("sailPno") && col("sail_pno")) set("sail_pno", nullable(next.sailPno));
      if (changed.includes("gradeId")) set("designation_grade_id", next.gradeId);
      if (changed.includes("departmentId")) set("sail_department_id", next.departmentId);
      if (changed.includes("gradeId") || changed.includes("position")) { set("within_grade_position", next.position); set("global_seniority_rank", seniorityRank(grade, next.position)); }
      if (changed.includes("address") && col("address")) set("address", nullable(next.address));
      if (nicChanged && col("email_nic")) set("email_nic", nullable(mails.emailNic));
      if (webChanged && col("webmail_saildsp")) set("webmail_saildsp", nullable(mails.webmail));
      if (changed.includes("doctor") && col("doctor_override")) set("doctor_override", next.doctor);
      const datesTouched = hod && (changed.includes("dateOfBirth") || changed.includes("dateOfJoining")) && col("date_of_birth") && col("date_of_joining");
      if (datesTouched) {
        set("date_of_birth", nullable(next.dateOfBirth));
        set("date_of_joining", nullable(next.dateOfJoining));
        // a date the HOD sets by hand is a real date, no longer a sample; with both dates cleared the label goes too
        if (col("dates_source")) set("dates_source", next.dateOfBirth || next.dateOfJoining ? "hr" : null);
      }
      if (sets.length === 0 && !mobileChanged && !emailChanged && !nicChanged && !webChanged) return { status: "unchanged" };
      if (sets.length > 0) {
        vals.push(id);
        await q(`UPDATE public.employee_roster SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
      }
      // the login account: mobile and e-mail replaced when typed; name, P.No. and designation kept in step; the PASSWORD is never touched. A person without an account who is given a mobile or e-mail gets one (it needs his P.No.).
      const hasLogin = curRow.user_id !== null && curRow.user_id !== undefined;
      if (mobileChanged || emailChanged) {
        const pno = next.sailPno || cur.sailPno;
        if (!hasLogin && !pno) throw new LoginRefused({ sailPno: "A login account needs the SAIL P.No. (it is his first password): type it first." });
        const login = await ensureLogin(q, cols, { rosterId: id, ticketNo: cur.ticketNo, name: next.name, sailPno: pno, gradeTitle: next.gradeTitle, mobile: mobileChanged ? x.mobile : "", loginEmail: emailChanged ? loginEmail : "", emailField: cur.cohort === "executive" ? "emailNic" : "email" });
        if (login.errors) throw new LoginRefused(login.errors);
      }
      if (hasLogin || mobileChanged || emailChanged) {
        const us: string[] = [], uv: unknown[] = [];
        const uset = (c: string, col: string, v: unknown) => { if (cols.user.has(c)) { uv.push(v); us.push(`${col} = $${uv.length}`); } };
        if (changed.includes("name")) uset("name", "name", next.name);
        if (changed.includes("sailPno")) uset("sailPNo", `"sailPNo"`, nullable(next.sailPno));
        if (changed.includes("gradeId")) uset("designation", "designation", nullable(next.gradeTitle));
        if (us.length) { uv.push(cur.ticketNo); await q(`UPDATE public."user" SET ${us.join(", ")} WHERE "ticketNo" = $${uv.length}`, uv); }
      }
      const rec = rowToRecord(await getRow(q, cols, id), true);
      const contactNote = [mobileChanged ? "mobile number replaced" : "", nicChanged ? "NIC mail replaced" : "", webChanged ? "web-mail replaced" : "", emailChanged && !nicChanged && !webChanged ? "e-mail replaced" : ""].filter(Boolean).join("; ") || null;
      await audit(q, actor, role, "modify", id, rec.ticketNo, rec.name, before, snap(rec), contactNote);
      if (changed.includes("name")) await refreshNameCodes(q);
      return { status: "ok", employee: rowToRecord(await getRow(q, cols, id), hod) };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    if (e instanceof LoginRefused) return { status: "invalid", errors: e.errors };
    if (isForeignKey(e)) { schemaMemory.clear(db); return { status: "invalid", errors: LISTS_CHANGED }; }
    if (isUnique(e)) return { status: "invalid", errors: { sailPno: "This SAIL P.No. is already on the roll." } };
    if (isCheck(e)) return { status: "invalid", errors: { dateOfJoining: "The database refused these dates: nobody joins before 18 (23 for a direct recruit, ticket 49xxxx)." } };
    throw e;
  }
}

export type DeleteResult =
  | { status: "ok"; name: string; ticketNo: string; loginRemoved: boolean }
  | { status: "invalid"; reason: string }
  | { status: "protected" }
  /** The record has changed since the person saw it: nothing was deleted; he is shown the record as it is now. */
  | { status: "stale"; current: EmployeeRecord; last: LastChange | null }
  | { status: "missing" }
  | { status: "forbidden" };

/** Only the HOD of C&IT deletes. The ticket must be typed back; the HOD himself (and the actor's own record) can never be deleted. */
export async function deleteEmployee(db: EmpDb, actor: Actor, id: number, opts: { confirmTicket: string; removeLogin: boolean; version?: string }): Promise<DeleteResult> {
  try {
    return await db.run(async (q): Promise<DeleteResult> => {
      const role = await begin(q, actor, true);
      const cols = await colsFor(db, q);
      await lockRow(q, cols, id);
      const row = await getRow(q, cols, id);
      if (!row) return { status: "missing" };
      // a person is deleted AS THE HOD SAW HIM: if he has been changed since, nothing is deleted and the HOD looks again
      if (!sameVersion(opts.version, versionOfRow(row, true))) return { status: "stale", current: rowToRecord(row, true), last: await lastChangeOf(q, id) };
      const cur = rowToRecord(row, true);
      if (String(opts.confirmTicket ?? "").trim() !== cur.ticketNo) return { status: "invalid", reason: "The ticket number typed does not match this employee." };
      if (isSuperAdmin(cur.ticketNo) || cur.ticketNo === actor.ticket) return { status: "protected" };
      const loginId = row.user_id === null || row.user_id === undefined ? null : String(row.user_id);
      const login = loginId ? (await q(`SELECT id, "ticketNo", name FROM public."user" WHERE id = $1`, [loginId]))[0] : undefined;
      await q(`DELETE FROM public.employee_roster WHERE id = $1`, [id]);
      let loginRemoved = false;
      if (opts.removeLogin && login) { await q(`DELETE FROM public."user" WHERE id = $1`, [loginId]); loginRemoved = true; }
      await audit(q, actor, role, "delete", id, cur.ticketNo, cur.name, snap(cur), { loginRemoved, ...(login ? { login: { id: String(login.id), ticketNo: str(login.ticketNo), name: str(login.name) } } : {}) });
      // an employee who was authorised for ANY tool and is deleted loses every one of those authorities with the job (owner's decision, 2 Nov 2026): one history line in each tool, in this same transaction
      await revokeEverywhere(q, actor, role, cur.ticketNo, "deleted with the employee");
      await refreshNameCodes(q);
      return { status: "ok", name: cur.name, ticketNo: cur.ticketNo, loginRemoved };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    throw e;
  }
}

// ---- delegation: only the HOD of C&IT authorises and withdraws ----
export type { DelegateResult };

/** The authorised executives, the authorising and the withdrawing are the kit's (src/lib/facility/authority.ts): the same code, the same rules and words, for every tool. */
export const listDelegates = (db: EmpDb): Promise<DelegateView[]> => sharedList(db, "employee");
export const grantDelegate = (db: EmpDb, actor: Actor, target: { ticket: string; name: string }): Promise<DelegateResult> => sharedGrant(db, "employee", actor, target);
export const revokeDelegate = (db: EmpDb, actor: Actor, ticketNo: string): Promise<DelegateResult> => sharedRevoke(db, "employee", actor, ticketNo);

// ---- the history ----
const LABEL: Record<string, string> = {
  ticketNo: "Ticket", sailPno: "SAIL P.No.", name: "Name", gradeTitle: "Designation", departmentName: "Department", position: "Position in grade", address: "Address",
  emailNic: "E-mail (NIC)", webmail: "Web-mail (SAIL DSP)", doctor: "Doctor", dateOfBirth: "Date of birth", dateOfJoining: "Date of joining",
};
const DATE_FIELDS = new Set(["dateOfBirth", "dateOfJoining"]);
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : v === true ? "Yes" : v === false ? "No" : String(v));

export function diffSnapshots(before: Partial<Snap> | null, after: Partial<Snap> | null, canSeeDates: boolean): ChangeView[] {
  if (!before || !after) return [];
  const out: ChangeView[] = [];
  for (const f of ["name", "sailPno", "gradeTitle", "departmentName", "position", "address", "emailNic", "webmail", "doctor", "dateOfBirth", "dateOfJoining"] as const) {
    const a = (before as Record<string, unknown>)[f], b = (after as Record<string, unknown>)[f];
    if ((a ?? "") === (b ?? "")) continue;
    out.push(DATE_FIELDS.has(f) && !canSeeDates ? { field: f, label: LABEL[f], from: "hidden", to: "hidden" } : { field: f, label: LABEL[f], from: show(a), to: show(b) });
  }
  return out;
}

export async function recentAudit(db: EmpDb, limit = 50, canSeeDates = false): Promise<AuditView[]> {
  const lines = await recentAuditRows(db, "employee", limit);
  return lines.map((x): AuditView => {
    const action = x.action as AuditView["action"];
    const targetName = x.targetName, targetTicket = x.targetTicket;
    const who = `${targetName} (${targetTicket})`;
    const after = x.after as (Partial<Snap> & { loginRemoved?: boolean }) | null;
    const changes = action === "modify" ? diffSnapshots(x.before as Partial<Snap> | null, after, canSeeDates) : [];
    const summary =
      action === "add" ? `Added ${who}${after?.gradeTitle ? `, ${after.gradeTitle}` : ""}${after?.departmentName ? `, ${after.departmentName}` : ""}`
      : action === "modify" ? `Changed ${who}${x.note ? ` (${x.note})` : ""}`
      : action === "delete" ? `Deleted ${who}${after?.loginRemoved ? " and his login account" : ""}`
      : action === "grant" ? `Authorised ${who}`
      : `Withdrew the authority of ${who}${x.note ? ` (${x.note})` : ""}`;
    return { at: x.at, actorName: x.actorName, actorTicket: x.actorTicket, actorRole: x.actorRole, actorDesignation: "", action, targetTicket, targetName, changes, summary };
  });
}
