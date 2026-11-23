// src/components/employeeFormModel.ts
//
// This holds the rules behind the employee form (step 66e): what the form holds, how a typed department code and a chosen designation become ids, what changes between the saved record and the form, and WHICH SECTION IS OPEN.
// It is PURE: no React, no drawing. I keep the look of the form in EmployeeAdminUi.tsx; the requests and the state are in EmployeeAdminPanel.tsx.

import { normalizeMobile } from "@/lib/employees/admin/contact";
import { cohortOfTicket, departmentFitsCohort, isTicket } from "@/lib/employees/admin/validate";
import type { DepartmentRef, EmployeeRecord, FieldErrors, GradeRef, Lookups } from "@/lib/employees/admin/types";

export interface FormValues {
  ticketNo: string; sailPno: string; name: string; gradeId: string; departmentCode: string; address: string;
  emailNic: string; webmail: string; email: string; mobile: string; doctor: boolean; dateOfBirth: string; dateOfJoining: string;
}
export const EMPTY_FORM: FormValues = { ticketNo: "", sailPno: "", name: "", gradeId: "", departmentCode: "", address: "", emailNic: "", webmail: "", email: "", mobile: "", doctor: false, dateOfBirth: "", dateOfJoining: "" };
/** I load a person into the Change form with the mobile and the e-mails EMPTY: they are shown masked as a hint (typing replaces, empty keeps). */
export const formFromRecord = (r: EmployeeRecord, lookups: Lookups): FormValues => ({
  ticketNo: r.ticketNo, sailPno: r.sailPno, name: r.name, gradeId: String(r.gradeId), departmentCode: String(lookups.departments.find((d) => d.id === r.departmentId)?.code ?? ""),
  address: r.address, emailNic: "", webmail: "", email: "", mobile: "", doctor: r.doctor === true, dateOfBirth: r.dateOfBirth, dateOfJoining: r.dateOfJoining,
});

/** Returns the department a typed CODE stands for, among those that fit the cohort (the same code can exist for executives and for non-executives). */
export function resolveDepartment(code: string, lookups: Lookups, ticketNo: string): DepartmentRef | null {
  const t = code.trim();
  if (!/^\d+$/.test(t)) return null;
  const cohort = isTicket(ticketNo) ? cohortOfTicket(ticketNo) : null;
  const hits = lookups.departments.filter((d) => String(d.code) === t);
  return hits.find((d) => cohort && d.scope === cohort) ?? hits.find((d) => !cohort || departmentFitsCohort(d, cohort)) ?? null;
}
export const gradeLabel = (g: Pick<GradeRef, "code" | "title">): string => `${g.code} · ${g.title}`;

/** What validateEmployee is given for the values on the screen. The position is never typed: I let the server place him last in his grade. */
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

/** Returns the changes between the saved record and the form, field by field, for the review step. Dates only when the person may see them; a typed mobile or e-mail is shown masked (it REPLACES the one there). */
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
  // I show the NEW value as typed (the person checks what he typed); the stored one ("from") stays masked: I show no stored contact without the logged reveal
  const typed = (label: string, now: string, value: string) => { if (value.trim() !== "") out.push({ label, from: dash(now), to: `${value.trim()} (replaces it)` }); };
  typed("Mobile", original.mobileMasked, normalizeMobile(v.mobile));
  if (original.cohort === "executive") { typed("NIC mail", original.emailNic, v.emailNic.toLowerCase()); typed("Web-mail", original.webmail, v.webmail.toLowerCase()); }
  else typed("E-mail", original.emailMasked, v.email.toLowerCase());
  return out;
}


export interface Unlocked { posting: boolean; dates: boolean; contact: boolean }

/**
 * The order of the form (my words, 1 Nov 2026: "from top to bottom the sections get activated when the upper section is filled completely with all the constraints"). PURE.
 *   Identity   always open.   Posting opens when the Identity is complete (a ticket of 6 digits not starting with 0, the SAIL P.No. for a new employee, the name) and has no error.
 *   Dates      open when Posting is complete: a designation code, a department code that fits the ticket.
 *   Contact    opens when the dates are complete: both dates, valid (for anybody but the HOD there are no dates to fill, so Contact opens with Posting).
 * `errors` holds ALL the errors of the record as it stands, not only those already shown.
 */
export function unlockedSections(v: FormValues, lookups: Lookups, errors: FieldErrors, o: { mode: "add" | "modify"; datesVisible: boolean; loaded: boolean }): Unlocked {
  const identity = o.loaded && v.ticketNo.trim() !== "" && v.name.trim() !== "" && (o.mode === "modify" || v.sailPno.trim() !== "") && !errors.ticketNo && !errors.sailPno && !errors.name;
  const posting = identity && v.gradeId !== "" && resolveDepartment(v.departmentCode, lookups, v.ticketNo) !== null && !errors.gradeId && !errors.departmentId;
  const dates = posting && (!o.datesVisible || (v.dateOfBirth !== "" && v.dateOfJoining !== "" && !errors.dateOfBirth && !errors.dateOfJoining));
  return { posting: identity, dates: posting, contact: dates };
}


/**
 * Why the button is off: the first thing missing, in the ORDER OF THE FORM. An empty date is not an error, so I say "fill in the dates" before any contact error. PURE. Undefined = nothing is missing.
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

// ---------------------------------------------------------------------------------------------------------------------------------
// Two people at once (step 67b): when a save is refused because somebody else changed the record first, I decide here what the person is shown and what he can choose
// ---------------------------------------------------------------------------------------------------------------------------------

export const FIELD_LABELS: Record<keyof FormValues, string> = {
  ticketNo: "Ticket number", sailPno: "SAIL P.No.", name: "Name", gradeId: "Designation", departmentCode: "Department", address: "Address", emailNic: "NIC mail", webmail: "Web-mail",
  email: "E-mail", mobile: "Mobile", doctor: "Doctor", dateOfBirth: "Date of birth", dateOfJoining: "Date of joining",
};

/** Here I compare the record the person opened against the record as it is now, field by field, to show what the OTHER person changed; the person sees only what he may see (no dates for an executive, contact only as masked). */
export function theirChanges(original: EmployeeRecord, current: EmployeeRecord, datesVisible: boolean): Array<{ label: string; from: string; to: string }> {
  const yn = (d: boolean | null) => (d === true ? "Yes" : "No");
  const rows: Array<[string, string, string]> = [
    ["Name", original.name, current.name], ["SAIL P.No.", original.sailPno, current.sailPno], ["Designation", original.gradeTitle, current.gradeTitle], ["Department", original.departmentName, current.departmentName],
    ["Position in grade", String(original.position), String(current.position)], ["Address", original.address, current.address], ["Doctor", yn(original.doctor), yn(current.doctor)],
  ];
  if (datesVisible) rows.push(["Date of birth", original.dateOfBirth, current.dateOfBirth], ["Date of joining", original.dateOfJoining, current.dateOfJoining]);
  rows.push(["Mobile", original.mobileMasked, current.mobileMasked]);
  if (current.cohort === "executive") rows.push(["NIC mail", original.emailNic, current.emailNic], ["Web-mail", original.webmail, current.webmail]);
  else rows.push(["E-mail", original.emailMasked, current.emailMasked]);
  return rows.filter(([, a, b]) => a !== b).map(([label, from, to]) => ({ label, from: from || "—", to: to || "—" }));
}

/**
 * The three-way merge. `base` is the form as it was when the person opened the record, `mine` what is in the form now, `theirs` the form of the record as it is now.
 * A field the person CHANGED (mine is not base) keeps his value; every other field takes THEIR value. I want his work never lost and, above all, I do not let him put back what the other person changed by
 * saving a form that is out of date. `overlaps` are the fields BOTH changed to different values: his value is kept, and he is told to look at them. The ticket is never his to change.
 */
export function rebaseForm(base: FormValues, mine: FormValues, theirs: FormValues): { values: FormValues; kept: Array<keyof FormValues>; overlaps: Array<keyof FormValues> } {
  const values: Record<string, unknown> = { ...theirs };
  const kept: Array<keyof FormValues> = [], overlaps: Array<keyof FormValues> = [];
  for (const k of Object.keys(base) as Array<keyof FormValues>) {
    if (k === "ticketNo") continue;
    if (mine[k] !== base[k]) {
      values[k] = mine[k];
      kept.push(k);
      if (theirs[k] !== base[k] && theirs[k] !== mine[k]) overlaps.push(k);
    }
  }
  return { values: values as unknown as FormValues, kept, overlaps };
}
