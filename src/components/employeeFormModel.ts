// src/components/employeeFormModel.ts
//
// THE RULES BEHIND THE EMPLOYEE FORM (step 66e): what the form holds, how a typed department code and a chosen designation become ids, what changes between the saved record and the form, and WHICH SECTION IS OPEN.
// PURE: no React, no drawing. The look of the form is in EmployeeAdminUi.tsx; the requests and the state are in EmployeeAdminPanel.tsx.

import { maskEmail, maskMobile, normalizeMobile } from "@/lib/employees/admin/contact";
import { cohortOfTicket, departmentFitsCohort, isTicket } from "@/lib/employees/admin/validate";
import type { DepartmentRef, EmployeeRecord, FieldErrors, GradeRef, Lookups } from "@/lib/employees/admin/types";

export interface FormValues {
  ticketNo: string; sailPno: string; name: string; gradeId: string; departmentCode: string; address: string;
  emailNic: string; webmail: string; email: string; mobile: string; doctor: boolean; dateOfBirth: string; dateOfJoining: string;
}
export const EMPTY_FORM: FormValues = { ticketNo: "", sailPno: "", name: "", gradeId: "", departmentCode: "", address: "", emailNic: "", webmail: "", email: "", mobile: "", doctor: false, dateOfBirth: "", dateOfJoining: "" };
/** A person loaded into the Change form: the mobile and the e-mails start EMPTY (they are shown masked as a hint: typing replaces, empty keeps). */
export const formFromRecord = (r: EmployeeRecord, lookups: Lookups): FormValues => ({
  ticketNo: r.ticketNo, sailPno: r.sailPno, name: r.name, gradeId: String(r.gradeId), departmentCode: String(lookups.departments.find((d) => d.id === r.departmentId)?.code ?? ""),
  address: r.address, emailNic: "", webmail: "", email: "", mobile: "", doctor: r.doctor === true, dateOfBirth: r.dateOfBirth, dateOfJoining: r.dateOfJoining,
});

/** The department a typed CODE stands for: among those that fit the cohort (the same code can exist for executives and for non-executives). */
export function resolveDepartment(code: string, lookups: Lookups, ticketNo: string): DepartmentRef | null {
  const t = code.trim();
  if (!/^\d+$/.test(t)) return null;
  const cohort = isTicket(ticketNo) ? cohortOfTicket(ticketNo) : null;
  const hits = lookups.departments.filter((d) => String(d.code) === t);
  return hits.find((d) => cohort && d.scope === cohort) ?? hits.find((d) => !cohort || departmentFitsCohort(d, cohort)) ?? null;
}
export const gradeLabel = (g: Pick<GradeRef, "code" | "title">): string => `${g.code} · ${g.title}`;

/** What validateEmployee is given for the values on the screen (the position is never typed: the server places him last in his grade). */
export function rawOf(v: FormValues, lookups: Lookups, original: EmployeeRecord | null): Record<string, unknown> {
  const dept = resolveDepartment(v.departmentCode, lookups, v.ticketNo);
  return {
    ticketNo: v.ticketNo, sailPno: v.sailPno, name: v.name, gradeId: v.gradeId === "" ? null : Number(v.gradeId), departmentId: dept ? dept.id : null,
    position: null, address: v.address, emailNic: v.emailNic, webmail: v.webmail, email: v.email, mobile: v.mobile,
    doctor: v.doctor ? true : original?.doctor === true ? false : null, dateOfBirth: v.dateOfBirth, dateOfJoining: v.dateOfJoining,
  };
}

export const ORIGIN_TEXT = (ticketNo: string): string => {
  if (!/^\d{6}$/.test(ticketNo)) return "Type the 6-digit ticket number";
  if (cohortOfTicket(ticketNo) === "nonexecutive") return "Non-executive";
  return /^49\d{4}$/.test(ticketNo) ? "Executive · direct recruit (Management Trainee)" : "Executive · promoted from the non-executives";
};

export const initialsOf = (name: string): string => {
  const w = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return w.length === 0 ? "?" : (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
};

/** The changes between the saved record and the form, field by field, for the review step. Dates only when the person may see them; a typed mobile or e-mail is shown masked (it REPLACES the one there). */
export function changesOf(original: EmployeeRecord, v: FormValues, lookups: Lookups, datesVisible: boolean): Array<{ label: string; from: string; to: string }> {
  const dash = (x: string) => (x === "" ? "—" : x);
  const grade = lookups.grades.find((g) => String(g.id) === v.gradeId);
  const dept = resolveDepartment(v.departmentCode, lookups, original.ticketNo);
  const rows: Array<[string, string, string]> = [
    ["Name", original.name, v.name.trim().replace(/\s+/g, " ").toUpperCase()],
    ["SAIL P.No.", original.sailPno, v.sailPno.trim().toUpperCase()],
    ["Designation", original.gradeTitle, grade?.title ?? ""],
    ["Department", original.departmentName, dept?.name ?? v.departmentCode.trim()],
    ["Position in grade", String(original.position), grade && String(grade.id) !== String(original.gradeId) ? "last in the new grade" : String(original.position)],
    ["Address", original.address, v.address.trim()],
    ["Doctor", original.doctor === true ? "Yes" : "No", v.doctor ? "Yes" : "No"],
  ];
  if (datesVisible) rows.push(["Date of birth", original.dateOfBirth, v.dateOfBirth.trim()], ["Date of joining", original.dateOfJoining, v.dateOfJoining.trim()]);
  const out = rows.filter(([, a, b]) => a !== b).map(([label, a, b]) => ({ label, from: dash(a), to: dash(b) }));
  const typed = (label: string, now: string, value: string, mask: (x: string) => string) => { if (value.trim() !== "") out.push({ label, from: dash(now), to: `${mask(value.trim())} (replaces it)` }); };
  typed("Mobile", original.mobileMasked, normalizeMobile(v.mobile), maskMobile);
  if (original.cohort === "executive") { typed("NIC mail", original.emailNic, v.emailNic.toLowerCase(), maskEmail); typed("Web-mail", original.webmail, v.webmail.toLowerCase(), maskEmail); }
  else typed("E-mail", original.emailMasked, v.email.toLowerCase(), maskEmail);
  return out;
}


export interface Unlocked { posting: boolean; dates: boolean; contact: boolean }

/**
 * THE ORDER OF THE FORM (owner, 1 Nov 2026: "from top to bottom the sections get activated when the upper section is filled completely with all the constraints"). PURE.
 *   Identity   always open.   Posting opens when the Identity is complete (a ticket of 6 digits not starting with 0, the SAIL P.No. for a new employee, the name) and has no error.
 *   Dates      open when Posting is complete: a designation code, a department code that fits the ticket.
 *   Contact    opens when the dates are complete: both dates, valid (for anybody but the HOD there are no dates to fill, so Contact opens with Posting).
 * `errors` are ALL the errors of the record as it stands (not only those already shown).
 */
export function unlockedSections(v: FormValues, lookups: Lookups, errors: FieldErrors, o: { mode: "add" | "modify"; datesVisible: boolean; loaded: boolean }): Unlocked {
  const identity = o.loaded && v.ticketNo.trim() !== "" && v.name.trim() !== "" && (o.mode === "modify" || v.sailPno.trim() !== "") && !errors.ticketNo && !errors.sailPno && !errors.name;
  const posting = identity && v.gradeId !== "" && resolveDepartment(v.departmentCode, lookups, v.ticketNo) !== null && !errors.gradeId && !errors.departmentId;
  const dates = posting && (!o.datesVisible || (v.dateOfBirth !== "" && v.dateOfJoining !== "" && !errors.dateOfBirth && !errors.dateOfJoining));
  return { posting: identity, dates: posting, contact: dates };
}


/**
 * WHY THE BUTTON IS OFF: the first thing missing, in the ORDER OF THE FORM (an empty date is not an error, so "fill in the dates" is said before any contact error). PURE. Undefined = nothing is missing.
 */
export function reasonFor(errors: FieldErrors, unlocked: Unlocked, o: { loaded: boolean; valid: boolean; mode: "add" | "modify"; changes: number }): string | undefined {
  if (!o.loaded) return "Loading…";
  const firstOf = (keys: ReadonlyArray<keyof FieldErrors>) => keys.map((k) => errors[k]).find(Boolean);
  return (
    firstOf(["ticketNo", "sailPno", "name", "gradeId", "departmentId", "dateOfBirth", "dateOfJoining"]) ??
    (!unlocked.contact ? "Fill in both service dates to continue." : firstOf(["emailNic", "webmail", "email", "mobile", "address"])) ??
    (!o.valid ? "Fill in the record." : o.mode === "modify" && o.changes === 0 ? "Change something to save." : undefined)
  );
}
