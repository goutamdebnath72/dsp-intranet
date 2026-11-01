"use client";

// src/components/EmployeeAdminPanel.tsx
//
// THE EMPLOYEE MANAGER (step 66a; owner, 1 Nov 2026). It opens in the answer area of the search bar when the HOD of C&IT (or an executive he has authorised) types that he wants to add, change or delete an
// employee, or to authorise or withdraw an executive. Nothing is protected by what this panel hides: the SERVER decides who may do what (src/lib/employees/admin/api.ts) and checks every rule again.
// The panel only tells the person early: the same validation function runs here as the person types (so a mistake is shown at once and the button stays off until the record is right) and again on the server.
//   Four sections: Identity (ticket, SAIL P.No., name), Posting (designation, department, position), Service dates (the HOD of C&IT ONLY: an authorised executive sees a locked card), Contact (e-mails, address).
//   A live card shows how the person will appear; a review step shows exactly what will change before anything is saved; a delete asks for the ticket number to be typed back.
// Plain text only (React escapes it). No <form> tag: the search modal already holds a text area, and forms must not nest; Enter in a field is left alone (the buttons act).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { CalendarDays, History, Lock, Pencil, Search, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { IST } from "@/lib/dates";
import { cohortOfTicket, departmentFitsCohort, describeDates, gradeFitsCohort, validateEmployee } from "@/lib/employees/admin/validate";
import type { AuditView, Authority, DelegateView, DepartmentRef, EmployeeConflict, EmployeeRecord, EmployeeAdminOpen, FieldErrors, GradeRef, Lookups } from "@/lib/employees/admin/types";

type Tab = "add" | "modify" | "delete" | "people" | "history";

const FIELD = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500";
const PRIMARY = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY = "rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";
const DANGER = "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50";

// ---------------------------------------------------------------------------------------------------------------------------------
// the form's values (everything is text while it is typed)
// ---------------------------------------------------------------------------------------------------------------------------------
export interface FormValues {
  ticketNo: string; sailPno: string; name: string; gradeId: string; departmentText: string; position: string;
  address: string; emailNic: string; webmail: string; doctor: boolean; dateOfBirth: string; dateOfJoining: string;
}
export const EMPTY_FORM: FormValues = { ticketNo: "", sailPno: "", name: "", gradeId: "", departmentText: "", position: "", address: "", emailNic: "", webmail: "", doctor: false, dateOfBirth: "", dateOfJoining: "" };
export const formFromRecord = (r: EmployeeRecord): FormValues => ({
  ticketNo: r.ticketNo, sailPno: r.sailPno, name: r.name, gradeId: String(r.gradeId), departmentText: r.departmentName, position: String(r.position),
  address: r.address, emailNic: r.emailNic, webmail: r.webmail, doctor: r.doctor === true, dateOfBirth: r.dateOfBirth, dateOfJoining: r.dateOfJoining,
});

/** The department a typed name stands for: the exact name (any case), among those that fit the cohort when the ticket is known. */
export function resolveDepartment(text: string, lookups: Lookups, ticketNo: string): DepartmentRef | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const cohort = /^\d{6}$/.test(ticketNo) ? cohortOfTicket(ticketNo) : null;
  const hits = lookups.departments.filter((d) => d.name.trim().toLowerCase() === t);
  return hits.find((d) => cohort && d.scope === cohort) ?? hits.find((d) => !cohort || departmentFitsCohort(d, cohort)) ?? hits[0] ?? null;
}

/** What validateEmployee is given for the values on the screen. */
export function rawOf(v: FormValues, lookups: Lookups, original: EmployeeRecord | null): Record<string, unknown> {
  const dept = resolveDepartment(v.departmentText, lookups, v.ticketNo);
  return {
    ticketNo: v.ticketNo, sailPno: v.sailPno, name: v.name, gradeId: v.gradeId === "" ? null : Number(v.gradeId), departmentId: dept ? dept.id : null,
    position: v.position === "" ? null : Number(v.position), address: v.address, emailNic: v.emailNic, webmail: v.webmail,
    doctor: v.doctor ? true : original?.doctor === true ? false : null, dateOfBirth: v.dateOfBirth, dateOfJoining: v.dateOfJoining,
  };
}

const ORIGIN_TEXT = (ticketNo: string): string => {
  if (!/^\d{6}$/.test(ticketNo)) return "Type the 6-digit ticket number";
  if (cohortOfTicket(ticketNo) === "nonexecutive") return "Non-executive";
  return /^49\d{4}$/.test(ticketNo) ? "Executive · direct recruit (Management Trainee)" : "Executive · promoted from the non-executives";
};

export const initialsOf = (name: string): string => {
  const w = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return w.length === 0 ? "?" : (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
};

/** The changes between the saved record and the form, field by field, for the review step. Dates only when the person may see them. */
export function changesOf(original: EmployeeRecord, v: FormValues, lookups: Lookups, datesVisible: boolean): Array<{ label: string; from: string; to: string }> {
  const dash = (s: string) => (s === "" ? "—" : s);
  const grade = lookups.grades.find((g) => String(g.id) === v.gradeId);
  const dept = resolveDepartment(v.departmentText, lookups, original.ticketNo);
  const rows: Array<[string, string, string]> = [
    ["Name", original.name, v.name.trim().replace(/\s+/g, " ").toUpperCase()],
    ["SAIL P.No.", original.sailPno, v.sailPno.trim().toUpperCase()],
    ["Designation", original.gradeTitle, grade?.title ?? ""],
    ["Department", original.departmentName, dept?.name ?? v.departmentText.trim()],
    ["Position in grade", String(original.position), v.position.trim() === "" ? (grade && String(grade.id) !== String(original.gradeId) ? "last in the new grade" : String(original.position)) : v.position.trim()],
    ["E-mail (NIC)", original.emailNic, v.emailNic.trim().toLowerCase()],
    ["Web-mail (SAIL DSP)", original.webmail, v.webmail.trim().toLowerCase()],
    ["Address", original.address, v.address.trim()],
    ["Doctor", original.doctor === true ? "Yes" : "No", v.doctor ? "Yes" : "No"],
  ];
  if (datesVisible) rows.push(["Date of birth", original.dateOfBirth, v.dateOfBirth.trim()], ["Date of joining", original.dateOfJoining, v.dateOfJoining.trim()]);
  return rows.filter(([, a, b]) => a !== b).map(([label, a, b]) => ({ label, from: dash(a), to: dash(b) }));
}

// ---------------------------------------------------------------------------------------------------------------------------------
// display pieces (no state: they are given everything, so they can be drawn and tested alone)
// ---------------------------------------------------------------------------------------------------------------------------------

export function EmployeeAdminHeader({ authority, name }: { authority: Authority; name?: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-emp-header="true">
      <ShieldCheck className="h-4 w-4 text-blue-700" aria-hidden="true" />
      <p className="text-sm font-bold text-neutral-900" data-emp-title="true">Employee manager</p>
      {name ? <p className="text-sm font-semibold text-neutral-700" data-emp-actor="true">{name}</p> : null}
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700" data-role={authority}>
        {authority === "hod" ? "HOD of C&IT" : "Authorised executive"}
      </span>
    </div>
  );
}

function Section({ icon, title, note, children }: { icon: React.ReactNode; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm" data-emp-section={title}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">{icon}</span>
        <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
        {note ? <span className="text-xs text-neutral-500">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Field(props: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${props.className ?? ""}`}>
      <label htmlFor={props.id} className="mb-1 block text-xs font-semibold text-neutral-700">{props.label}</label>
      {props.children}
      <p id={`${props.id}-note`} className={`mt-1 text-xs ${props.error ? "font-semibold text-red-700" : "text-neutral-500"}`} role={props.error ? "alert" : undefined}>{props.error ?? props.hint ?? "\u00a0"}</p>
    </div>
  );
}

/** How the person will look in the lists of the home page (the same card as the People & Events widget). */
export function EmployeePreviewCard({ values, gradeTitle, departmentName }: { values: FormValues; gradeTitle: string; departmentName: string }) {
  const name = values.name.trim().replace(/\s+/g, " ").toUpperCase();
  return (
    <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-3" data-emp-preview="true">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-blue-800">How he will appear</p>
      <div className="flex items-center gap-3 rounded-md border border-neutral-200 bg-white p-2 shadow-sm">
        <div className="flex h-20 w-16 flex-shrink-0 items-center justify-center rounded-sm bg-gradient-to-br from-slate-200 to-slate-300 text-lg font-bold text-slate-600" aria-hidden="true">{initialsOf(name)}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-800">{name || "NAME"}</p>
          <p className="truncate text-xs text-neutral-600">{gradeTitle || "Designation"}</p>
          <p className="truncate text-xs text-neutral-500">{departmentName || "Department"}</p>
          <p className="mt-1 text-[11px] font-medium text-blue-800">{ORIGIN_TEXT(values.ticketNo)}</p>
        </div>
      </div>
    </div>
  );
}

export interface EmployeeFormProps {
  mode: "add" | "modify";
  idPrefix: string;
  values: FormValues;
  lookups: Lookups;
  /** Shown under the fields (live errors for the fields the person has been in, server errors after a save). */
  errors: FieldErrors;
  warnings: string[];
  /** The HOD of C&IT only: for anybody else the dates are a locked card and nothing is sent. */
  datesVisible: boolean;
  today: DateTime;
  busy: boolean;
  submitLabel: string;
  submitDisabled: boolean;
  submitHint?: string;
  onChange: (next: FormValues, touched: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}

export function EmployeeForm(p: EmployeeFormProps) {
  const { values: v, lookups, errors, idPrefix } = p;
  const cohort = /^\d{6}$/.test(v.ticketNo) ? cohortOfTicket(v.ticketNo) : null;
  const grades = lookups.grades.filter((g) => !cohort || gradeFitsCohort(g, cohort));
  const departments = lookups.departments.filter((d) => !cohort || departmentFitsCohort(d, cohort));
  const dept = resolveDepartment(v.departmentText, lookups, v.ticketNo);
  const grade = lookups.grades.find((g) => String(g.id) === v.gradeId);
  const id = (k: string) => `${idPrefix}-${k}`;
  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => p.onChange({ ...v, [k]: e.target.value } as FormValues, k);
  const live = describeDates(v.dateOfBirth || null, v.dateOfJoining || null, p.today);
  const groups: Array<[string, GradeRef[]]> = [["Managerial", grades.filter((g) => g.track === "managerial")], ["Medical", grades.filter((g) => g.track === "medical")], ["Non-executive", grades.filter((g) => g.track === "nonexec")]];
  const todayIso = p.today.toISODate() as string;
  return (
    <div className="space-y-3" data-emp-form={p.mode}>
      <div className="grid gap-3 xl:grid-cols-[1fr_16rem]">
        <div className="space-y-3">
          <Section icon={<UserPlus className="h-4 w-4" />} title="Identity">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id={id("ticketNo")} label="Ticket number" error={errors.ticketNo} hint={p.mode === "modify" ? "The ticket cannot be changed here." : ORIGIN_TEXT(v.ticketNo)}>
                <input id={id("ticketNo")} data-emp-field="ticketNo" className={`${FIELD} ${errors.ticketNo ? "border-red-500" : ""}`} value={v.ticketNo} onChange={set("ticketNo")} disabled={p.mode === "modify"} inputMode="numeric" maxLength={6} placeholder="6 digits" autoComplete="off" aria-invalid={errors.ticketNo ? true : undefined} />
              </Field>
              <Field id={id("sailPno")} label="SAIL P.No." error={errors.sailPno} hint="Optional.">
                <input id={id("sailPno")} data-emp-field="sailPno" className={`${FIELD} ${errors.sailPno ? "border-red-500" : ""}`} value={v.sailPno} onChange={set("sailPno")} maxLength={15} placeholder="For example D107659" autoComplete="off" aria-invalid={errors.sailPno ? true : undefined} />
              </Field>
              <Field id={id("name")} label="Name" error={errors.name} hint="Kept in capitals." className="sm:col-span-2">
                <input id={id("name")} data-emp-field="name" className={`${FIELD} ${errors.name ? "border-red-500" : ""}`} value={v.name} onChange={set("name")} maxLength={80} placeholder="Full name" autoComplete="off" aria-invalid={errors.name ? true : undefined} />
              </Field>
            </div>
          </Section>

          <Section icon={<Pencil className="h-4 w-4" />} title="Posting">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id={id("gradeId")} label="Designation" error={errors.gradeId} hint={cohort ? "Only the designations that fit the ticket." : "Type the ticket first."}>
                <select id={id("gradeId")} data-emp-field="gradeId" className={`${FIELD} ${errors.gradeId ? "border-red-500" : ""}`} value={v.gradeId} onChange={set("gradeId")} aria-invalid={errors.gradeId ? true : undefined}>
                  <option value="">Choose…</option>
                  {groups.filter(([, list]) => list.length > 0).map(([label, list]) => (
                    <optgroup key={label} label={label}>
                      {list.map((g) => <option key={g.id} value={String(g.id)}>{g.title}</option>)}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field id={id("departmentText")} label="Department" error={errors.departmentId} hint="Start typing, then choose one from the list.">
                <input id={id("departmentText")} data-emp-field="departmentText" list={id("departments")} className={`${FIELD} ${errors.departmentId ? "border-red-500" : ""}`} value={v.departmentText} onChange={set("departmentText")} maxLength={80} placeholder="Department" autoComplete="off" aria-invalid={errors.departmentId ? true : undefined} />
                <datalist id={id("departments")}>
                  {departments.map((d) => <option key={d.id} value={d.name} />)}
                </datalist>
              </Field>
              <Field id={id("position")} label="Position in the grade" error={errors.position} hint="Leave empty to place him last.">
                <input id={id("position")} data-emp-field="position" className={`${FIELD} ${errors.position ? "border-red-500" : ""}`} value={v.position} onChange={set("position")} inputMode="numeric" maxLength={4} placeholder="Optional" autoComplete="off" aria-invalid={errors.position ? true : undefined} />
              </Field>
            </div>
            {cohort === "executive" && (
              <label className="mt-2 flex items-center gap-2 text-xs text-neutral-700">
                <input type="checkbox" data-emp-field="doctor" checked={v.doctor} onChange={(e) => p.onChange({ ...v, doctor: e.target.checked }, "doctor")} />
                A doctor who holds an ordinary managerial designation
              </label>
            )}
          </Section>

          {p.datesVisible ? (
            <Section icon={<CalendarDays className="h-4 w-4" />} title="Service dates" note="Only you, as the HOD of C&IT, see and set these.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id={id("dateOfBirth")} label="Date of birth" error={errors.dateOfBirth} hint={live.age ? `Age ${live.age} · retires on ${live.retiresOn}` : "Optional."}>
                  <input id={id("dateOfBirth")} data-emp-field="dateOfBirth" type="date" min="1930-01-01" max={todayIso} className={`${FIELD} ${errors.dateOfBirth ? "border-red-500" : ""}`} value={v.dateOfBirth} onChange={set("dateOfBirth")} aria-invalid={errors.dateOfBirth ? true : undefined} />
                </Field>
                <Field id={id("dateOfJoining")} label="Date of joining" error={errors.dateOfJoining} hint={live.service ? `Service ${live.service} · 25 years on ${live.jubileeOn}` : "Optional."}>
                  <input id={id("dateOfJoining")} data-emp-field="dateOfJoining" type="date" max={todayIso} className={`${FIELD} ${errors.dateOfJoining ? "border-red-500" : ""}`} value={v.dateOfJoining} onChange={set("dateOfJoining")} aria-invalid={errors.dateOfJoining ? true : undefined} />
                </Field>
              </div>
              {p.warnings.map((w) => <p key={w} className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900" data-emp-warning="true">{w}</p>)}
            </Section>
          ) : (
            <Section icon={<Lock className="h-4 w-4" />} title="Service dates">
              <p className="text-xs text-neutral-600" data-emp-dates-locked="true">The date of birth and the date of joining are seen and set only by the HOD of C&IT.</p>
            </Section>
          )}

          <Section icon={<Users className="h-4 w-4" />} title="Contact">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id={id("emailNic")} label="E-mail (NIC)" error={errors.emailNic} hint="Optional.">
                <input id={id("emailNic")} data-emp-field="emailNic" className={`${FIELD} ${errors.emailNic ? "border-red-500" : ""}`} value={v.emailNic} onChange={set("emailNic")} maxLength={120} placeholder="name@nic.in" autoComplete="off" aria-invalid={errors.emailNic ? true : undefined} />
              </Field>
              <Field id={id("webmail")} label="Web-mail (SAIL DSP)" error={errors.webmail} hint="Optional.">
                <input id={id("webmail")} data-emp-field="webmail" className={`${FIELD} ${errors.webmail ? "border-red-500" : ""}`} value={v.webmail} onChange={set("webmail")} maxLength={120} placeholder="name@sail-dsp.in" autoComplete="off" aria-invalid={errors.webmail ? true : undefined} />
              </Field>
              <Field id={id("address")} label="Address" error={errors.address} hint="Optional." className="sm:col-span-2">
                <textarea id={id("address")} data-emp-field="address" className={`${FIELD} min-h-[3.5rem]`} value={v.address} onChange={set("address")} maxLength={300} placeholder="Residential address" />
              </Field>
            </div>
          </Section>
        </div>
        <div className="space-y-3 xl:sticky xl:top-2 xl:self-start">
          <EmployeePreviewCard values={v} gradeTitle={grade?.title ?? ""} departmentName={dept?.name ?? ""} />
        </div>
      </div>
      {errors.form && <p className="text-xs font-semibold text-red-700" role="alert">{errors.form}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-emp-submit={p.mode} className={PRIMARY} disabled={p.busy || p.submitDisabled} onClick={p.onSubmit} aria-describedby={p.submitDisabled && p.submitHint ? `${idPrefix}-submit-hint` : undefined}>{p.submitLabel}</button>
        {p.onCancel && <button type="button" className={SECONDARY} disabled={p.busy} onClick={p.onCancel}>Cancel</button>}
        {p.submitDisabled && p.submitHint && <p id={`${idPrefix}-submit-hint`} className="text-xs font-semibold text-neutral-600" data-submit-hint="true">{p.submitHint}</p>}
      </div>
    </div>
  );
}

/** The step between typing and saving: exactly what will be written. */
export function ReviewView(props: { mode: "add" | "modify"; title: string; changes: Array<{ label: string; from: string; to: string }>; summary: Array<[string, string]>; warnings: string[]; conflicts: EmployeeConflict[]; busy: boolean; onConfirm: (acknowledge: boolean) => void; onBack: () => void }) {
  const conflict = props.conflicts.length > 0;
  return (
    <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4" data-emp-review={props.mode}>
      <p className="text-sm font-bold text-neutral-900">{props.title}</p>
      {props.mode === "modify" ? (
        <table className="min-w-full text-left text-sm" data-emp-changes="true">
          <thead className="text-xs text-neutral-600"><tr><th className="py-1 pr-4 font-semibold">What</th><th className="py-1 pr-4 font-semibold">Now</th><th className="py-1 font-semibold">Will become</th></tr></thead>
          <tbody>{props.changes.map((c) => <tr key={c.label} className="border-t border-blue-100"><td className="py-1 pr-4 font-semibold text-neutral-800">{c.label}</td><td className="py-1 pr-4 text-neutral-600">{c.from}</td><td className="py-1 font-semibold text-neutral-900">{c.to}</td></tr>)}</tbody>
        </table>
      ) : (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" data-emp-summary="true">
          {props.summary.map(([k, val]) => <div key={k} className="flex gap-2"><dt className="w-36 flex-shrink-0 text-neutral-600">{k}</dt><dd className="font-semibold text-neutral-900">{val || "—"}</dd></div>)}
        </dl>
      )}
      {props.warnings.map((w) => <p key={w} className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">{w}</p>)}
      {conflict && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-emp-conflict="true">
          <p className="font-bold">This name is already in that department.</p>
          {props.conflicts.map((c) => <p key={c.with.id}>{c.text}</p>)}
          <p className="mt-1 font-semibold">Is this a different person?</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" data-emp-confirm="true" className={PRIMARY} disabled={props.busy} onClick={() => props.onConfirm(conflict)}>{conflict ? "Yes, a different person: save" : props.mode === "add" ? "Save the employee" : "Save the changes"}</button>
        <button type="button" className={SECONDARY} disabled={props.busy} onClick={props.onBack}>{conflict ? "No: go back" : "Back to the form"}</button>
      </div>
    </div>
  );
}

export function EmployeeList({ employees, onEdit, onDelete, canDelete }: { employees: EmployeeRecord[]; onEdit: (e: EmployeeRecord) => void; onDelete: (e: EmployeeRecord) => void; canDelete: boolean }) {
  if (employees.length === 0) return <p className="text-sm text-neutral-600" data-emp-empty="true">No employee matches.</p>;
  return (
    <div className="max-h-72 overflow-auto rounded-xl border border-neutral-200 bg-white" data-emp-results="true">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-600"><tr><th className="px-3 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Ticket</th><th className="px-3 py-2 font-semibold">Designation</th><th className="px-3 py-2 font-semibold">Department</th><th className="px-3 py-2" /></tr></thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id} className="border-t border-neutral-100">
              <td className="px-3 py-1.5 font-semibold text-neutral-900">{e.name}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-neutral-700">{e.ticketNo}</td>
              <td className="px-3 py-1.5 text-neutral-700">{e.gradeTitle}</td>
              <td className="px-3 py-1.5 text-neutral-700">{e.departmentName}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right">
                <button type="button" data-emp-edit={e.id} className="mr-2 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold text-neutral-800 hover:bg-neutral-50" onClick={() => onEdit(e)}>Change</button>
                {canDelete && <button type="button" data-emp-delete={e.id} className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700" onClick={() => onDelete(e)}>Delete</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmployeeHistory({ history }: { history: AuditView[] }) {
  if (history.length === 0) return <p className="text-sm text-neutral-600">No change has been made from this manager yet.</p>;
  return (
    <div className="max-h-96 overflow-auto rounded-xl border border-neutral-200 bg-white" data-emp-history="true">
      <table className="min-w-full text-left text-xs sm:text-sm">
        <thead className="sticky top-0 bg-neutral-50 text-neutral-600"><tr><th className="whitespace-nowrap px-3 py-2 font-semibold">When</th><th className="px-3 py-2 font-semibold">What</th><th className="px-3 py-2 font-semibold">Details</th><th className="px-3 py-2 font-semibold">Done by</th></tr></thead>
        <tbody>
          {history.map((h, i) => (
            <tr key={i} className="border-t border-neutral-100 align-top">
              <td className="whitespace-nowrap px-3 py-1.5 text-neutral-600">{DateTime.fromISO(h.at).setZone(IST).setLocale("en-IN").toLocaleString({ dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="px-3 py-1.5 font-semibold text-neutral-800">{h.summary}</td>
              <td className="px-3 py-1.5 text-neutral-700">
                {h.changes.length === 0 ? "—" : h.changes.map((c) => <span key={c.field} className="block">{c.label}: <span className="text-neutral-500">{c.from}</span> → <span className="font-semibold">{c.to}</span></span>)}
              </td>
              <td className="px-3 py-1.5 text-neutral-800"><span className="font-semibold">{h.actorName}</span> <span className="whitespace-nowrap text-neutral-500">({h.actorTicket})</span>
                <span className="block text-xs text-neutral-500">{[h.actorDesignation, h.actorRole === "hod" ? "HOD of C&IT" : "authorised executive"].filter(Boolean).join(" · ")}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TabBar({ tab, authority, onTab }: { tab: Tab; authority: Authority; onTab: (t: Tab) => void }) {
  const tabs: Array<[Tab, string, React.ReactNode, boolean]> = [
    ["add", "Add", <UserPlus key="a" className="h-3.5 w-3.5" />, true], ["modify", "Change", <Pencil key="m" className="h-3.5 w-3.5" />, true],
    ["delete", "Delete", <Trash2 key="d" className="h-3.5 w-3.5" />, authority === "hod"], ["people", "Authorised people", <Users key="p" className="h-3.5 w-3.5" />, authority === "hod"], ["history", "Recent changes", <History key="h" className="h-3.5 w-3.5" />, true],
  ];
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Employee manager">
      {tabs.filter(([, , , show]) => show).map(([key, label, icon]) => (
        <button key={key} type="button" role="tab" aria-selected={tab === key} data-emp-tab={key} onClick={() => onTab(key)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === key ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}>{icon}{label}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the panel
// ---------------------------------------------------------------------------------------------------------------------------------
type Reply = { ok: boolean; status: number; body: Record<string, unknown> };
const TIMEOUT_MS = 20000;

export function EmployeeAdminPanel({ open }: { open: EmployeeAdminOpen }) {
  const role: Authority = open.role;
  const isHod = role === "hod";
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []); // StrictMode mounts, unmounts and mounts again: switch on at EVERY mount

  const initialTab: Tab = open.op === "modify" ? "modify" : open.op === "delete" && isHod ? "delete" : open.op === "delegate" && isHod ? "people" : "add";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [datesVisible, setDatesVisible] = useState(isHod);
  const today = useMemo(() => DateTime.now().setZone(IST).startOf("day"), []);

  const call = useCallback(async (body: Record<string, unknown>): Promise<Reply> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("/api/employees/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: res.ok, status: res.status, body: json };
    } catch {
      return { ok: false, status: 0, body: { error: "The server did not answer in time. Please try again." } };
    } finally {
      clearTimeout(timer);
    }
  }, []);
  const fail = (r: Reply) => setMessage({ tone: "error", text: typeof r.body.error === "string" ? r.body.error : "That did not work. Please try again." });

  useEffect(() => {
    void (async () => {
      const [m, l] = await Promise.all([call({ op: "me" }), call({ op: "lookups" })]);
      if (!alive.current) return;
      if (m.ok && typeof m.body.name === "string" && m.body.name.trim()) setMe(m.body.name.trim());
      if (l.ok && l.body.lookups) { setLookups(l.body.lookups as Lookups); setDatesVisible(l.body.datesVisible === true); }
      else if (!l.ok) fail(l);
    })();
  }, [call]);

  // ---- the form (one at a time: adding, or changing the chosen person) ----
  const [values, setValues] = useState<FormValues>({ ...EMPTY_FORM, name: open.op === "add" ? (open.prefill?.name ?? "") : "", ticketNo: open.op === "add" ? (open.prefill?.ticket ?? "") : "" });
  const [original, setOriginal] = useState<EmployeeRecord | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [review, setReview] = useState(false);
  const [conflicts, setConflicts] = useState<EmployeeConflict[]>([]);
  const lk: Lookups = lookups ?? { grades: [], departments: [] };
  const mode: "add" | "modify" = tab === "modify" && original ? "modify" : "add";

  const validation = useMemo(
    () => (lookups ? validateEmployee(rawOf(values, lk, mode === "modify" ? original : null), lk, { today, canEditDates: datesVisible, fixedTicket: mode === "modify" ? original?.ticketNo : undefined }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, lookups, original, mode, datesVisible, today],
  );
  const liveErrors: FieldErrors = validation && !validation.ok ? validation.errors : {};
  const warnings = validation && validation.ok ? validation.warnings : [];
  const shownErrors: FieldErrors = useMemo(() => {
    const out: FieldErrors = {};
    for (const [k, msg] of Object.entries(liveErrors)) {
      const field = k === "departmentId" ? "departmentText" : k;
      if (touched.has(field) || touched.has(k)) (out as Record<string, string>)[k] = msg as string;
    }
    return { ...out, ...serverErrors };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validation, touched, serverErrors]);

  const changeList = mode === "modify" && original ? changesOf(original, values, lk, datesVisible) : [];
  const valid = !!validation && validation.ok;
  const submitDisabled = !lookups || !valid || (mode === "modify" && changeList.length === 0);
  const submitHint = !lookups ? "Loading…" : !valid ? (Object.values(liveErrors)[0] as string | undefined) ?? "Fill in the record." : mode === "modify" && changeList.length === 0 ? "Change something to save." : undefined;

  // a new designation puts a person LAST in that grade: the old position number belonged to the old grade, so it is cleared (an explicit one would collide with somebody already there)
  const onFormChange = (next: FormValues, field: string) => { if (field === "gradeId" && mode === "modify" && original && next.gradeId !== String(original.gradeId)) next = { ...next, position: "" }; setValues(next); setTouched((t) => new Set(t).add(field)); setServerErrors({}); setConflicts([]); setMessage(null); };
  const resetForm = () => { setValues({ ...EMPTY_FORM }); setOriginal(null); setTouched(new Set()); setServerErrors({}); setReview(false); setConflicts([]); };

  const fieldsOut = () => {
    const raw = rawOf(values, lk, mode === "modify" ? original : null);
    return raw;
  };
  const save = async (acknowledge: boolean) => {
    setBusy(true); setMessage(null);
    const r = mode === "modify" && original
      ? await call({ op: "modify", id: original.id, fields: fieldsOut(), acknowledge: acknowledge ? ["same-name"] : [] })
      : await call({ op: "add", fields: fieldsOut(), acknowledge: acknowledge ? ["same-name"] : [] });
    if (!alive.current) return;
    setBusy(false);
    if (!r.ok) return fail(r);
    const res = r.body.result as { status: string; employee?: EmployeeRecord; errors?: FieldErrors; conflicts?: EmployeeConflict[] };
    if (res.status === "ok" && res.employee) {
      setMessage({ tone: "ok", text: mode === "modify" ? `Saved: ${res.employee.name} (${res.employee.ticketNo}) has been changed.` : `Saved: ${res.employee.name} (${res.employee.ticketNo}) is on the roll.` });
      if (mode === "modify") { setOriginal(res.employee); setValues(formFromRecord(res.employee)); setReview(false); } else resetForm();
    } else if (res.status === "conflict") { setConflicts(res.conflicts ?? []); setReview(true); }
    else if (res.status === "invalid") { setServerErrors(res.errors ?? {}); setReview(false); setMessage({ tone: "error", text: "Please correct what is marked." }); }
    else if (res.status === "unchanged") { setMessage({ tone: "ok", text: "Nothing was changed." }); setReview(false); }
    else if (res.status === "missing") { setMessage({ tone: "error", text: "This employee is not on the roll any more." }); setReview(false); }
    else setMessage({ tone: "error", text: "You are not allowed to do that." });
  };

  // ---- the search (Change and Delete) ----
  const [query, setQuery] = useState(open.prefill?.query ?? open.prefill?.ticket ?? "");
  const [results, setResults] = useState<EmployeeRecord[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (tab !== "modify" && tab !== "delete") return;
    if (tab === "modify" && original) return;
    const text = query.trim();
    if (text.length < 2) { setResults(null); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      const r = await call({ op: "search", q: text });
      if (!alive.current) return;
      setSearching(false);
      if (r.ok) setResults((r.body.employees as EmployeeRecord[]) ?? []); else fail(r);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, tab, original, call]);
  const startChange = (e: EmployeeRecord) => { setOriginal(e); setValues(formFromRecord(e)); setTouched(new Set()); setServerErrors({}); setReview(false); setConflicts([]); setMessage(null); setTab("modify"); };

  // ---- delete ----
  const [target, setTarget] = useState<EmployeeRecord | null>(null);
  const [confirmTicket, setConfirmTicket] = useState("");
  const [removeLogin, setRemoveLogin] = useState(true);
  const doDelete = async () => {
    if (!target || confirmTicket.trim() !== target.ticketNo) return;
    setBusy(true); setMessage(null);
    const r = await call({ op: "delete", id: target.id, confirmTicket: confirmTicket.trim(), removeLogin });
    if (!alive.current) return;
    setBusy(false);
    if (!r.ok) return fail(r);
    const res = r.body.result as { status: string; name?: string; ticketNo?: string; loginRemoved?: boolean; reason?: string };
    if (res.status === "ok") { setMessage({ tone: "ok", text: `Deleted: ${res.name} (${res.ticketNo})${res.loginRemoved ? " and his login account" : ""}. The history keeps the record.` }); setTarget(null); setConfirmTicket(""); setResults(null); setQuery(""); }
    else if (res.status === "protected") setMessage({ tone: "error", text: "The HOD of C&IT, and your own record, cannot be deleted." });
    else if (res.status === "invalid") setMessage({ tone: "error", text: res.reason ?? "The ticket number typed does not match." });
    else if (res.status === "missing") setMessage({ tone: "error", text: "This employee is not on the roll any more." });
    else setMessage({ tone: "error", text: "You are not allowed to do that." });
  };

  // ---- people and history ----
  const [delegates, setDelegates] = useState<DelegateView[] | null>(null);
  const [find, setFind] = useState("");
  const [found, setFound] = useState<Array<{ ticket: string; name: string; designation: string; department: string }> | null>(null);
  const [history, setHistory] = useState<AuditView[] | null>(null);
  const loadDelegates = useCallback(async () => { const r = await call({ op: "delegates" }); if (alive.current) { if (r.ok) setDelegates((r.body.delegates as DelegateView[]) ?? []); else setMessage({ tone: "error", text: typeof r.body.error === "string" ? r.body.error : "That did not work." }); } }, [call]);
  const loadHistory = useCallback(async () => { const r = await call({ op: "audit" }); if (alive.current) { if (r.ok) setHistory((r.body.history as AuditView[]) ?? []); else setMessage({ tone: "error", text: typeof r.body.error === "string" ? r.body.error : "That did not work." }); } }, [call]);
  useEffect(() => { if (tab === "people" && isHod) void loadDelegates(); if (tab === "history") void loadHistory(); }, [tab, isHod, loadDelegates, loadHistory]);
  const doFind = async () => { setBusy(true); const r = await call({ op: "find-executive", q: find }); if (!alive.current) return; setBusy(false); if (r.ok) setFound((r.body.executives as typeof found) ?? []); else fail(r); };
  const grant = async (ticket: string) => { setBusy(true); const r = await call({ op: "grant", ticket }); if (!alive.current) return; setBusy(false); if (!r.ok) return fail(r); const res = r.body.result as { status: string; reason?: string }; if (res.status === "ok") { setMessage({ tone: "ok", text: "Authorised. From now on this executive can add and change employees (not the dates, and not delete)." }); setFound(null); setFind(""); void loadDelegates(); } else setMessage({ tone: "error", text: res.status === "already" ? "He is already authorised." : res.reason ?? "That did not work." }); };
  const revoke = async (ticket: string) => { setBusy(true); const r = await call({ op: "revoke", ticket }); if (!alive.current) return; setBusy(false); if (!r.ok) return fail(r); setMessage({ tone: "ok", text: "The authority is withdrawn." }); void loadDelegates(); };

  const onTab = (t: Tab) => { setTab(t); setMessage(null); if (t === "add") { setOriginal(null); } };
  const grade = lk.grades.find((g) => String(g.id) === values.gradeId);
  const dept = resolveDepartment(values.departmentText, lk, values.ticketNo);
  const summary: Array<[string, string]> = [
    ["Ticket number", values.ticketNo], ["Name", values.name.trim().replace(/\s+/g, " ").toUpperCase()], ["SAIL P.No.", values.sailPno.trim().toUpperCase()], ["Designation", grade?.title ?? ""], ["Department", dept?.name ?? ""],
    ["Position in grade", values.position.trim() || "last in the grade"], ["E-mail (NIC)", values.emailNic.trim().toLowerCase()], ["Web-mail", values.webmail.trim().toLowerCase()], ["Address", values.address.trim()],
    ...(datesVisible ? ([["Date of birth", values.dateOfBirth], ["Date of joining", values.dateOfJoining]] as Array<[string, string]>) : []),
  ];

  return (
    <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/30 p-3 sm:p-4" data-emp-panel="true">
      <EmployeeAdminHeader authority={role} name={me} />
      <TabBar tab={tab} authority={role} onTab={onTab} />
      {message && <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${message.tone === "ok" ? "border border-emerald-300 bg-emerald-50 text-emerald-900" : "border border-red-300 bg-red-50 text-red-900"}`} role={message.tone === "error" ? "alert" : "status"} data-emp-message={message.tone}>{message.text}</p>}

      {(tab === "add" || (tab === "modify" && original)) && (
        review && valid ? (
          <ReviewView mode={mode} title={mode === "modify" ? `Review the changes to ${original?.name} (${original?.ticketNo})` : "Review the new employee"} changes={changeList} summary={summary} warnings={warnings} conflicts={conflicts} busy={busy} onConfirm={(ack) => void save(ack)} onBack={() => { setReview(false); setConflicts([]); }} />
        ) : (
          <>
            {tab === "modify" && original && <p className="text-sm text-neutral-700">Changing <span className="font-bold">{original.name}</span> ({original.ticketNo})</p>}
            <EmployeeForm mode={mode} idPrefix={`emp-${mode}`} values={values} lookups={lk} errors={shownErrors} warnings={warnings} datesVisible={datesVisible} today={today} busy={busy}
              submitLabel={mode === "modify" ? "Review the changes" : "Review and save"} submitDisabled={submitDisabled} submitHint={submitHint}
              onChange={onFormChange} onSubmit={() => setReview(true)} onCancel={mode === "modify" ? () => { setOriginal(null); resetForm(); setResults(null); } : undefined} />
          </>
        )
      )}

      {((tab === "modify" && !original) || (tab === "delete" && !target)) && (
        <div className="space-y-2" data-emp-search="true">
          <label htmlFor="emp-search" className="block text-xs font-semibold text-neutral-700">{tab === "delete" ? "Find the employee to delete" : "Find the employee to change"}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" aria-hidden="true" />
            <input id="emp-search" data-emp-field="search" className={`${FIELD} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, ticket number or SAIL P.No." autoComplete="off" />
          </div>
          {searching && <p className="text-xs text-neutral-500">Searching…</p>}
          {results && <EmployeeList employees={results} canDelete={isHod && tab === "delete"} onEdit={startChange} onDelete={(e) => { setTarget(e); setConfirmTicket(""); setMessage(null); }} />}
        </div>
      )}

      {tab === "delete" && target && (
        <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4" data-emp-delete-confirm="true">
          <p className="text-sm font-bold text-red-950">Delete {target.name} ({target.ticketNo})?</p>
          <p className="text-sm text-red-900">{target.gradeTitle}, {target.departmentName}. He leaves the roll at once. The history keeps the whole record and who deleted it.</p>
          {target.hasLogin && (
            <label className="flex items-center gap-2 text-sm text-red-950">
              <input type="checkbox" data-emp-remove-login="true" checked={removeLogin} onChange={(e) => setRemoveLogin(e.target.checked)} /> Also delete his login account (and what hangs on it: sessions, read marks)
            </label>
          )}
          <Field id="emp-confirm" label={`Type his ticket number, ${target.ticketNo}, to confirm`} hint=" ">
            <input id="emp-confirm" data-emp-field="confirm" className={FIELD} value={confirmTicket} onChange={(e) => setConfirmTicket(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="off" />
          </Field>
          <div className="flex gap-2">
            <button type="button" data-emp-delete-go="true" className={DANGER} disabled={busy || confirmTicket.trim() !== target.ticketNo} onClick={() => void doDelete()}>Yes, delete him</button>
            <button type="button" className={SECONDARY} disabled={busy} onClick={() => { setTarget(null); setConfirmTicket(""); }}>No, keep him</button>
          </div>
        </div>
      )}

      {tab === "people" && isHod && (
        <div className="space-y-3" data-emp-people="true">
          <p className="text-sm font-bold text-neutral-900">Executives who may add and change employees</p>
          {delegates === null ? <p className="text-sm text-neutral-600">Loading…</p> : delegates.length === 0 ? <p className="text-sm text-neutral-600">Nobody else has been authorised: only you can change the employee records.</p> : (
            <ul className="space-y-1">{delegates.map((d) => (
              <li key={d.ticket} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm">
                <span><span className="font-semibold">{d.name}</span> <span className="text-neutral-500">({d.ticket}) · authorised by {d.grantedByName} on {DateTime.fromISO(d.grantedAt).setZone(IST).setLocale("en-IN").toLocaleString({ dateStyle: "medium" })}</span></span>
                <button type="button" className={SECONDARY} disabled={busy} onClick={() => void revoke(d.ticket)}>Withdraw</button>
              </li>))}</ul>
          )}
          <div className="space-y-2 border-t border-neutral-200 pt-3">
            <label htmlFor="emp-find" className="block text-xs font-semibold text-neutral-700">Authorise an executive (name or ticket number)</label>
            <div className="flex gap-2">
              <input id="emp-find" className={FIELD} value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (find.trim()) void doFind(); } }} placeholder="For example Rakesh Ojha or 412345" autoComplete="off" />
              <button type="button" className={SECONDARY} disabled={busy || !find.trim()} onClick={() => void doFind()}>Find</button>
            </div>
            <p className="text-xs text-neutral-500">Only an executive (a ticket that starts with 4) can be authorised. He can add and change employees; he cannot see or set the dates, delete anybody, or authorise others.</p>
            {found && (found.length === 0 ? <p className="text-sm text-neutral-600">No executive matches.</p> : (
              <ul className="space-y-1">{found.map((f) => (
                <li key={f.ticket} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm">
                  <span><span className="font-semibold">{f.name}</span> <span className="text-neutral-500">({f.ticket}) · {f.designation}{f.department ? `, ${f.department}` : ""}</span></span>
                  <button type="button" className={PRIMARY} disabled={busy} onClick={() => void grant(f.ticket)}>Authorise</button>
                </li>))}</ul>
            ))}
          </div>
        </div>
      )}

      {tab === "history" && (history === null ? <p className="text-sm text-neutral-600">Loading…</p> : <EmployeeHistory history={history} />)}
    </div>
  );
}
