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
// The database is reached through a tiny interface (EmpDb) so the same code runs against the application's connection and against a scratch database in the tests.

import { DateTime } from "luxon";
import { IST, toIsoInstant } from "@/lib/dates";
import { isSuperAdmin } from "@/lib/superAdmin";
import type { QueryFn } from "@/lib/pax/store";
import type { AcknowledgeKind, Authority, AuditView, ChangeView, DelegateView, DepartmentRef, EmployeeConflict, EmployeeRecord, FieldErrors, GradeRef, Lookups } from "./types";
import { cleanText, seniorityRank, validateEmployee } from "./validate";

export interface EmpDb { run<T>(fn: (q: QueryFn) => Promise<T>): Promise<T> }
export interface Actor { ticket: string; name: string }

const LOCK = "SELECT pg_advisory_xact_lock(hashtext('employee_roster')::bigint)";
const EXECUTIVE = /^4\d{5}$/;
export class Forbidden extends Error {}

export async function authorityOf(q: QueryFn, ticket: string | null | undefined): Promise<Authority | null> {
  const t = String(ticket ?? "").trim();
  if (!t) return null;
  if (isSuperAdmin(t)) return "hod";
  const r = await q(`SELECT 1 FROM public.employee_admin_delegate WHERE ticket_no = $1 AND revoked_at IS NULL LIMIT 1`, [t]);
  return r.length > 0 ? "delegate" : null;
}

async function begin(q: QueryFn, actor: Actor, needHod = false): Promise<Authority> {
  await q(LOCK);
  const a = await authorityOf(q, actor.ticket);
  if (!a || (needHod && a !== "hod")) throw new Forbidden();
  return a;
}

// ---- what the live tables look like (discovered, not assumed) ----
interface Cols { has: Set<string>; notNullNoDefault: Set<string>; deptScope: boolean }
async function discover(q: QueryFn): Promise<Cols> {
  const rows = await q(`SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('employee_roster', 'sail_department')`);
  const has = new Set<string>(), notNullNoDefault = new Set<string>();
  let deptScope = false;
  for (const r of rows) {
    if (r.table_name === "sail_department") { if (r.column_name === "cohort_scope") deptScope = true; continue; }
    has.add(String(r.column_name));
    if (r.is_nullable === "NO" && r.column_default === null) notNullNoDefault.add(String(r.column_name));
  }
  return { has, notNullNoDefault, deptScope };
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
       ${opt(c, "user_id")} AS user_id
  FROM public.employee_roster er JOIN public.designation_grade dg ON dg.id = er.designation_grade_id LEFT JOIN public.sail_department sd ON sd.id = er.sail_department_id`;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export function rowToRecord(r: Record<string, unknown>, canSeeDates: boolean): EmployeeRecord {
  return {
    id: Number(r.id), ticketNo: str(r.ticket_no).trim(), sailPno: str(r.sail_pno), name: str(r.name), cohort: r.cohort === "executive" ? "executive" : "nonexecutive",
    gradeId: Number(r.grade_id), gradeTitle: str(r.grade_title), departmentId: r.department_id === null || r.department_id === undefined ? null : Number(r.department_id), departmentName: str(r.department_name),
    position: Number(r.position), address: str(r.address), emailNic: str(r.email_nic), webmail: str(r.webmail), doctor: typeof r.doctor === "boolean" ? r.doctor : null,
    dateOfBirth: canSeeDates ? str(r.dob).slice(0, 10) : "", dateOfJoining: canSeeDates ? str(r.doj).slice(0, 10) : "", datesVisible: canSeeDates, hasLogin: r.user_id !== null && r.user_id !== undefined,
  };
}

/** What the history keeps of a person: every editable field, the dates included (the history is read by the HOD with the dates, by everybody else without). */
const snap = (r: EmployeeRecord) => ({
  ticketNo: r.ticketNo, sailPno: r.sailPno, name: r.name, gradeId: r.gradeId, gradeTitle: r.gradeTitle, departmentId: r.departmentId, departmentName: r.departmentName, position: r.position,
  address: r.address, emailNic: r.emailNic, webmail: r.webmail, doctor: r.doctor, dateOfBirth: r.dateOfBirth, dateOfJoining: r.dateOfJoining,
});
type Snap = ReturnType<typeof snap>;

async function getRow(q: QueryFn, cols: Cols, id: number) {
  const r = await q(`${SELECT(cols)} WHERE er.id = $1`, [id]);
  return r[0];
}

const escapeLike = (w: string) => w.replace(/[\\%_]/g, (m) => `\\${m}`);
export async function searchEmployees(db: EmpDb, text: string, canSeeDates: boolean, limit = 25): Promise<EmployeeRecord[]> {
  const words = cleanText(text, 80).toLowerCase().split(" ").filter(Boolean).slice(0, 5);
  if (words.length === 0) return [];
  return db.run(async (q) => {
    const cols = await discover(q);
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
    const row = await getRow(q, await discover(q), id);
    return row ? rowToRecord(row, canSeeDates) : null;
  });
}

export const lookups = (db: EmpDb): Promise<Lookups> => db.run((q) => loadLookups(q));

// ---- the audit line ----
async function audit(q: QueryFn, actor: Actor, role: Authority, action: "add" | "modify" | "delete" | "grant" | "revoke", employeeId: number | null, targetTicket: string | null, targetName: string | null, before: unknown, after: unknown, note: string | null = null) {
  await q(
    `INSERT INTO public.employee_admin_audit (actor_ticket, actor_name, actor_role, action, employee_id, target_ticket, target_name, before, after, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
    [actor.ticket, actor.name, role, action, employeeId, targetTicket, targetName, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), note],
  );
}

/** The name-search helper tables are refreshed after a name changes; a database without that function (or any failure in it) must never undo the change itself, hence the savepoint. */
async function refreshNameCodes(q: QueryFn): Promise<void> {
  await q("SAVEPOINT name_codes");
  try { await q("SELECT nlq.refresh_name_codes()"); await q("RELEASE SAVEPOINT name_codes"); } catch { await q("ROLLBACK TO SAVEPOINT name_codes"); }
}

const isUnique = (e: unknown) => (e as { code?: string })?.code === "23505";
const isCheck = (e: unknown) => (e as { code?: string })?.code === "23514";

export type SaveResult =
  | { status: "ok"; employee: EmployeeRecord }
  | { status: "invalid"; errors: FieldErrors; warnings?: string[] }
  | { status: "conflict"; conflicts: EmployeeConflict[]; acknowledgeable: AcknowledgeKind[] }
  | { status: "unchanged" }
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

export async function addEmployee(db: EmpDb, actor: Actor, raw: Record<string, unknown>, acks: AcknowledgeKind[] = []): Promise<SaveResult> {
  try {
    return await db.run(async (q): Promise<SaveResult> => {
      const role = await begin(q, actor);
      const cols = await discover(q);
      const lk = await loadLookups(q, cols);
      const now = DateTime.now().setZone(IST);
      const v = validateEmployee(raw, lk, { today: now, canEditDates: role === "hod" });
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
      addOpt("sail_pno", nullable(x.sailPno));
      addOpt("address", nullable(x.address));
      addOpt("email_nic", nullable(x.emailNic));
      addOpt("webmail_saildsp", nullable(x.webmail));
      if (x.doctor !== null) addOpt("doctor_override", x.doctor);
      if (role === "hod" && cols.has.has("date_of_birth") && cols.has.has("date_of_joining") && (x.dateOfBirth || x.dateOfJoining)) {
        names.push("date_of_birth", "date_of_joining"); vals.push(x.dateOfBirth, x.dateOfJoining);
        if (cols.has.has("dates_source")) { names.push("dates_source"); vals.push("hr"); }
      }
      if (cols.notNullNoDefault.has("source_snapshot_date") && !names.includes("source_snapshot_date")) { names.push("source_snapshot_date"); vals.push(now.toISODate()); }
      const ins = await q(`INSERT INTO public.employee_roster (${names.join(", ")}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`, vals);
      const id = Number(ins[0].id);
      const rec = rowToRecord(await getRow(q, cols, id), true);
      await audit(q, actor, role, "add", id, rec.ticketNo, rec.name, null, snap(rec));
      await refreshNameCodes(q);
      return { status: "ok", employee: rowToRecord(await getRow(q, cols, id), role === "hod") };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    if (isUnique(e)) return { status: "invalid", errors: { ticketNo: "This ticket number (or SAIL P.No.) is already on the roll." } };
    if (isCheck(e)) return { status: "invalid", errors: { dateOfJoining: "The database refused these dates: nobody joins before 18 (23 for a direct recruit, ticket 49xxxx)." } };
    throw e;
  }
}

const EDITABLE: Array<keyof Snap> = ["sailPno", "name", "gradeId", "departmentId", "position", "address", "emailNic", "webmail", "doctor", "dateOfBirth", "dateOfJoining"];

export async function modifyEmployee(db: EmpDb, actor: Actor, id: number, raw: Record<string, unknown>, acks: AcknowledgeKind[] = []): Promise<SaveResult> {
  try {
    return await db.run(async (q): Promise<SaveResult> => {
      const role = await begin(q, actor);
      const cols = await discover(q);
      const curRow = await getRow(q, cols, id);
      if (!curRow) return { status: "missing" };
      const cur = rowToRecord(curRow, true);
      const lk = await loadLookups(q, cols);
      const hod = role === "hod";
      const v = validateEmployee(raw, lk, { today: DateTime.now().setZone(IST), canEditDates: hod, fixedTicket: cur.ticketNo });
      if (!v.ok) return { status: "invalid", errors: v.errors };
      const x = v.value;
      const grade = lk.grades.find((g) => g.id === x.gradeId)!;

      let position = x.position;
      if (position === null) position = x.gradeId === cur.gradeId ? cur.position : Number((await q(`SELECT coalesce(max(within_grade_position), 0) + 1 AS n FROM public.employee_roster WHERE designation_grade_id = $1`, [grade.id]))[0].n);
      if (position > 9999) return { status: "invalid", errors: { position: "This grade is full (the position would pass 9999)." } };
      // for anybody but the HOD the dates stay as they are
      const next: Snap = {
        ...snap(cur), sailPno: x.sailPno, name: x.name, gradeId: x.gradeId as number, gradeTitle: grade.title, departmentId: x.departmentId, departmentName: lk.departments.find((d) => d.id === x.departmentId)?.name ?? "",
        position, address: x.address, emailNic: x.emailNic, webmail: x.webmail, doctor: x.doctor === null ? cur.doctor : x.doctor,
        dateOfBirth: hod ? (x.dateOfBirth ?? "") : cur.dateOfBirth, dateOfJoining: hod ? (x.dateOfJoining ?? "") : cur.dateOfJoining,
      };
      const before = snap(cur);
      const changed = EDITABLE.filter((f) => before[f] !== next[f]);
      if (changed.length === 0) return { status: "unchanged" };

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
      if (changed.includes("emailNic") && col("email_nic")) set("email_nic", nullable(next.emailNic));
      if (changed.includes("webmail") && col("webmail_saildsp")) set("webmail_saildsp", nullable(next.webmail));
      if (changed.includes("doctor") && col("doctor_override")) set("doctor_override", next.doctor);
      const datesTouched = hod && (changed.includes("dateOfBirth") || changed.includes("dateOfJoining")) && col("date_of_birth") && col("date_of_joining");
      if (datesTouched) {
        set("date_of_birth", nullable(next.dateOfBirth));
        set("date_of_joining", nullable(next.dateOfJoining));
        // a date the HOD sets by hand is a real date, no longer a sample; with both dates cleared the label goes too
        if (col("dates_source")) set("dates_source", next.dateOfBirth || next.dateOfJoining ? "hr" : null);
      }
      if (sets.length === 0) return { status: "unchanged" };
      vals.push(id);
      await q(`UPDATE public.employee_roster SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
      const rec = rowToRecord(await getRow(q, cols, id), true);
      await audit(q, actor, role, "modify", id, rec.ticketNo, rec.name, before, snap(rec));
      if (changed.includes("name")) await refreshNameCodes(q);
      return { status: "ok", employee: rowToRecord(await getRow(q, cols, id), hod) };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    if (isUnique(e)) return { status: "invalid", errors: { sailPno: "This SAIL P.No. is already on the roll." } };
    if (isCheck(e)) return { status: "invalid", errors: { dateOfJoining: "The database refused these dates: nobody joins before 18 (23 for a direct recruit, ticket 49xxxx)." } };
    throw e;
  }
}

export type DeleteResult =
  | { status: "ok"; name: string; ticketNo: string; loginRemoved: boolean }
  | { status: "invalid"; reason: string }
  | { status: "protected" }
  | { status: "missing" }
  | { status: "forbidden" };

/** Only the HOD of C&IT deletes. The ticket must be typed back; the HOD himself (and the actor's own record) can never be deleted. */
export async function deleteEmployee(db: EmpDb, actor: Actor, id: number, opts: { confirmTicket: string; removeLogin: boolean }): Promise<DeleteResult> {
  try {
    return await db.run(async (q): Promise<DeleteResult> => {
      const role = await begin(q, actor, true);
      const cols = await discover(q);
      const row = await getRow(q, cols, id);
      if (!row) return { status: "missing" };
      const cur = rowToRecord(row, true);
      if (String(opts.confirmTicket ?? "").trim() !== cur.ticketNo) return { status: "invalid", reason: "The ticket number typed does not match this employee." };
      if (isSuperAdmin(cur.ticketNo) || cur.ticketNo === actor.ticket) return { status: "protected" };
      const loginId = row.user_id === null || row.user_id === undefined ? null : String(row.user_id);
      const login = loginId ? (await q(`SELECT id, "ticketNo", name FROM public."user" WHERE id = $1`, [loginId]))[0] : undefined;
      await q(`DELETE FROM public.employee_roster WHERE id = $1`, [id]);
      let loginRemoved = false;
      if (opts.removeLogin && login) { await q(`DELETE FROM public."user" WHERE id = $1`, [loginId]); loginRemoved = true; }
      // somebody who was authorised to manage employees and is deleted loses it with the job
      const wasDelegate = await q(`UPDATE public.employee_admin_delegate SET revoked_at = now(), revoked_by_ticket = $2, revoked_by_name = $3 WHERE ticket_no = $1 AND revoked_at IS NULL RETURNING name`, [cur.ticketNo, actor.ticket, actor.name]);
      await audit(q, actor, role, "delete", id, cur.ticketNo, cur.name, snap(cur), { loginRemoved, ...(login ? { login: { id: String(login.id), ticketNo: str(login.ticketNo), name: str(login.name) } } : {}) });
      if (wasDelegate.length) await audit(q, actor, role, "revoke", null, cur.ticketNo, cur.name, { ticket: cur.ticketNo, name: cur.name }, null, "deleted with the employee");
      await refreshNameCodes(q);
      return { status: "ok", name: cur.name, ticketNo: cur.ticketNo, loginRemoved };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    throw e;
  }
}

// ---- delegation: only the HOD of C&IT authorises and withdraws ----
export type DelegateResult = { status: "ok" } | { status: "forbidden" } | { status: "invalid"; reason: string } | { status: "already" } | { status: "not-delegate" };

export async function listDelegates(db: EmpDb): Promise<DelegateView[]> {
  const r = await db.run((q) => q(`SELECT ticket_no, name, granted_by_name, granted_by_ticket, granted_at FROM public.employee_admin_delegate WHERE revoked_at IS NULL ORDER BY name`));
  return r.map((x) => ({ ticket: str(x.ticket_no), name: str(x.name), grantedByName: str(x.granted_by_name), grantedByTicket: str(x.granted_by_ticket), grantedAt: toIsoInstant(x.granted_at) ?? "" }));
}

export async function grantDelegate(db: EmpDb, actor: Actor, target: { ticket: string; name: string }): Promise<DelegateResult> {
  const ticket = String(target.ticket ?? "").trim();
  const name = String(target.name ?? "").replace(/\s+/g, " ").trim();
  if (!EXECUTIVE.test(ticket)) return { status: "invalid", reason: "Only an executive (a six-digit ticket number that starts with 4) can be authorised." };
  if (!name) return { status: "invalid", reason: "The executive's name is missing." };
  if (isSuperAdmin(ticket)) return { status: "invalid", reason: "The HOD of C&IT already has this authority." };
  try {
    return await db.run(async (q): Promise<DelegateResult> => {
      const role = await begin(q, actor, true);
      const active = await q(`SELECT 1 FROM public.employee_admin_delegate WHERE ticket_no = $1 AND revoked_at IS NULL`, [ticket]);
      if (active.length > 0) return { status: "already" };
      await q(`INSERT INTO public.employee_admin_delegate (ticket_no, name, granted_by_ticket, granted_by_name) VALUES ($1, $2, $3, $4)`, [ticket, name, actor.ticket, actor.name]);
      await audit(q, actor, role, "grant", null, ticket, name, null, { ticket, name });
      return { status: "ok" };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    if (isUnique(e)) return { status: "already" };
    throw e;
  }
}

export async function revokeDelegate(db: EmpDb, actor: Actor, ticketNo: string): Promise<DelegateResult> {
  const ticket = String(ticketNo ?? "").trim();
  try {
    return await db.run(async (q): Promise<DelegateResult> => {
      const role = await begin(q, actor, true);
      const r = await q(`UPDATE public.employee_admin_delegate SET revoked_at = now(), revoked_by_ticket = $2, revoked_by_name = $3 WHERE ticket_no = $1 AND revoked_at IS NULL RETURNING name`, [ticket, actor.ticket, actor.name]);
      if (r.length === 0) return { status: "not-delegate" };
      await audit(q, actor, role, "revoke", null, ticket, str(r[0].name), { ticket, name: str(r[0].name) }, null);
      return { status: "ok" };
    });
  } catch (e) {
    if (e instanceof Forbidden) return { status: "forbidden" };
    throw e;
  }
}

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
  const n = Math.min(200, Math.max(1, Math.floor(limit)));
  const r = await db.run((q) => q(`SELECT at, actor_ticket, actor_name, actor_role, action, target_ticket, target_name, before, after, note FROM public.employee_admin_audit ORDER BY at DESC, id DESC LIMIT ${n}`));
  return r.map((x): AuditView => {
    const action = String(x.action) as AuditView["action"];
    const targetName = str(x.target_name), targetTicket = str(x.target_ticket);
    const who = `${targetName} (${targetTicket})`;
    const after = x.after as (Partial<Snap> & { loginRemoved?: boolean }) | null;
    const changes = action === "modify" ? diffSnapshots(x.before as Partial<Snap> | null, after, canSeeDates) : [];
    const summary =
      action === "add" ? `Added ${who}${after?.gradeTitle ? `, ${after.gradeTitle}` : ""}${after?.departmentName ? `, ${after.departmentName}` : ""}`
      : action === "modify" ? `Changed ${who}`
      : action === "delete" ? `Deleted ${who}${after?.loginRemoved ? " and his login account" : ""}`
      : action === "grant" ? `Authorised ${who}`
      : `Withdrew the authority of ${who}${x.note ? ` (${str(x.note)})` : ""}`;
    return { at: toIsoInstant(x.at) ?? "", actorName: str(x.actor_name), actorTicket: str(x.actor_ticket), actorRole: str(x.actor_role) as Authority, actorDesignation: "", action, targetTicket, targetName, changes, summary };
  });
}
