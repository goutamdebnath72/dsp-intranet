"use client";

// src/components/EmployeeAdminUi.tsx
//
// THE LOOK OF THE EMPLOYEE MANAGER (step 66e; owner, 1 Nov 2026: "not modern, not eye catching, very traditional: rethink the whole design"). NOTHING HERE DECIDES ANYTHING: these components are given everything
// (values, errors, which sections are open) and draw it; the rules are in employeeFormModel.ts and in validate.ts, the requests and the state in EmployeeAdminPanel.tsx.
//   A progress rail of four steps; step cards that are LOCKED (dimmed, dashed), ACTIVE (glowing) or DONE (green); icon-led inputs with a live tick or alert inside the box; ONE drawn arrow for both dropdowns;
//   a live ID card; a sticky action bar that says in words why the button is off.
// Plain text only (React escapes it). Every size is a Tailwind size the modal's own scale sheet (omniScale.css) knows, so the whole panel follows the modal's text scale.

import React from "react";
import { DateTime } from "luxon";
import { AlertCircle, AlertTriangle, ArrowRight, AtSign, BadgeCheck, Briefcase, Building2, CalendarCheck, CalendarDays, Check, CheckCircle2, History, Info, Lock, Mail, MapPin, Pencil, Phone, ShieldCheck, Sparkles, Stethoscope, Trash2, User, UserPlus, Users, Hash } from "lucide-react";
import { IST } from "@/lib/dates";
import { MOBILE_HINT_EXECUTIVE, MOBILE_HINT_NONEXECUTIVE, NIC_DOMAIN, WEBMAIL_DOMAIN } from "@/lib/employees/admin/contact";
import { cohortOfTicket, departmentFitsCohort, describeDates, gradeFitsCohort, isTicket } from "@/lib/employees/admin/validate";
import type { AuditView, Authority, EmployeeConflict, EmployeeRecord, FieldErrors, GradeRef, Lookups } from "@/lib/employees/admin/types";
import { PhotoField, photoUrlOf, type PhotoUiState } from "./facility/PhotoField";
import { ORIGIN_TEXT, gradeLabel, initialsOf, resolveDepartment, type FormValues, type Unlocked } from "./employeeFormModel";

export type Tab = "add" | "modify" | "delete" | "people" | "history";

// ---------------------------------------------------------------------------------------------------------------------------------
// the shared look
// ---------------------------------------------------------------------------------------------------------------------------------

/** ONE arrow for the two dropdowns that sit side by side: the same drawn chevron at the same place in both (the native arrows, a thin one and a heavy black one, are switched off). */
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%236366f1' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 7.5l5 5 5-5'/%3E%3C/svg%3E")`;
export const DROPDOWN_STYLE: React.CSSProperties = { backgroundImage: CHEVRON, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.85rem center", backgroundSize: "1.25rem 1.25rem" };
const NATIVE_INDICATOR_AS_CLICK_AREA = "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-y-0 [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-auto [&::-webkit-calendar-picker-indicator]:w-11 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0";

const INPUT =
  "h-11 w-full rounded-xl border border-slate-200 bg-white/90 pl-10 pr-10 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100/70 disabled:text-slate-400";
export const FIELD = INPUT;
const INPUT_BAD = "border-rose-300 hover:border-rose-300 focus:border-rose-400 focus:ring-rose-100";
const INPUT_OK = "border-emerald-200 hover:border-emerald-300";
const DROPDOWN = `${INPUT} relative appearance-none pr-11 ${NATIVE_INDICATOR_AS_CLICK_AREA}`;
const DATE_BOX = `${INPUT} pr-3 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-50`;
const emptyDateStyle = (value: string): React.CSSProperties | undefined => (value ? undefined : { color: "#9ca3af" });

export const PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110 hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:shadow-none disabled:hover:brightness-100";
export const SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
export const DANGER =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none";

const GRADIENT_AVATAR = "bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500";

/** A round avatar with the initials, in the same gradient as the ID card. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-sm ${GRADIENT_AVATAR} ${size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"}`} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

/** The frame of the whole manager: a soft gradient with two blurred lights behind it. */
export function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate overflow-clip rounded-3xl border border-indigo-100/80 bg-gradient-to-br from-white via-slate-50 to-indigo-50/80 p-4 shadow-[0_24px_70px_-28px_rgba(79,70,229,0.45)] sm:p-5" data-emp-panel="true">
      <span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 -z-10 h-72 w-72 rounded-full bg-gradient-to-br from-indigo-300/40 to-fuchsia-300/30 blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 -z-10 h-72 w-72 rounded-full bg-gradient-to-tr from-sky-200/40 to-violet-200/30 blur-3xl" />
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/** A message after an action: green for what worked, amber for what needs a look, rose for what did not. */
export function Banner({ tone, children }: { tone: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const ok = tone === "ok", warn = tone === "warn";
  return (
    <div className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-sm ring-1 ${ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : warn ? "bg-amber-50 text-amber-950 ring-amber-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`} role={tone === "error" ? "alert" : "status"} data-emp-message={tone}>
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" /> : warn ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />}
      <p>{children}</p>
    </div>
  );
}

/**
 * "SOMEBODY ELSE CHANGED THIS RECORD WHILE YOU WERE EDITING IT" (step 67b): a save was refused because the record is not what the person opened. Nothing of his was saved. The card says who and when
 * (the last change the manager recorded), lists WHAT changed, and offers the two safe ways on: take their version (his edits are dropped), or keep his edits on top of it (a three-way merge: only the fields he
 * changed are his, everything else is theirs, so he cannot put back what they changed).
 */
export function StaleCard(props: { who: { name: string; ticket: string; at: string } | null; changes: Array<{ label: string; from: string; to: string }>; busy: boolean; onTheirs: () => void; onMine: () => void }) {
  const when = props.who ? DateTime.fromISO(props.who.at).setZone(IST).setLocale("en-IN").toLocaleString({ dateStyle: "medium", timeStyle: "short" }) : "";
  return (
    <div role="alert" className="overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white text-sm text-amber-950 shadow-[0_18px_44px_-22px_rgba(217,119,6,0.5)]" data-emp-stale="true">
      <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-100/50 px-5 py-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /><p className="font-bold">Somebody else changed this record while you were editing it.</p></div>
      <div className="space-y-3 p-5">
        <p>{props.who ? <>{props.who.name} ({props.who.ticket}) saved a change on {when}.</> : "It was changed after you opened it."} <span className="font-semibold">Nothing of yours has been saved.</span></p>
        {props.changes.length > 0 ? (
          <table className="min-w-full text-left" data-emp-stale-changes="true">
            <thead className="text-xs uppercase tracking-wide text-amber-800/70"><tr><th className="py-1 pr-4 font-semibold">What they changed</th><th className="py-1 pr-4 font-semibold">It was</th><th className="py-1 font-semibold">It is now</th></tr></thead>
            <tbody>{props.changes.map((c) => (
              <tr key={c.label} className="border-t border-amber-100">
                <td className="py-1.5 pr-4 font-semibold">{c.label}</td>
                <td className="py-1.5 pr-4"><span className="rounded-md bg-white/80 px-2 py-0.5 text-slate-600 line-through decoration-slate-300">{c.from}</span></td>
                <td className="py-1.5"><span className="rounded-md bg-white px-2 py-0.5 font-semibold text-slate-900 ring-1 ring-amber-200">{c.to}</span></td>
              </tr>))}</tbody>
          </table>
        ) : <p className="rounded-xl bg-white/80 px-3 py-2 text-slate-700 ring-1 ring-amber-100">A detail that is not shown here (a contact number) was changed.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={PRIMARY} disabled={props.busy} onClick={props.onMine} data-emp-stale-mine="true">Keep my edits on top of their version</button>
          <button type="button" className={SECONDARY} disabled={props.busy} onClick={props.onTheirs} data-emp-stale-theirs="true">Show their version (drop my edits)</button>
        </div>
        <p className="text-xs text-amber-900/80">"Keep my edits" puts only the fields YOU changed on top of the new version: everything else is taken from theirs, so you cannot put back what they changed. You will see the review before anything is saved.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the header and the tabs
// ---------------------------------------------------------------------------------------------------------------------------------

export function EmployeeAdminHeader({ authority, name }: { authority: Authority; name?: string | null }) {
  const hod = authority === "hod";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-emp-header="true">
      <span className={`flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-lg shadow-indigo-500/30 ${GRADIENT_AVATAR}`}>
        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-base font-bold text-slate-900" data-emp-title="true">Employee manager</p>
      {name ? <p className="text-sm font-semibold text-slate-600" data-emp-actor="true">{name}</p> : null}
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow-sm ${hod ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-gradient-to-r from-sky-500 to-indigo-500"}`} data-role={authority}>
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        {hod ? "HOD of C&IT" : "Authorised executive"}
      </span>
    </div>
  );
}

export function TabBar({ tab, authority, onTab }: { tab: Tab; authority: Authority; onTab: (t: Tab) => void }) {
  const tabs: Array<[Tab, string, React.ReactNode, boolean]> = [
    ["add", "Add", <UserPlus key="a" className="h-4 w-4" />, true], ["modify", "Modify", <Pencil key="m" className="h-4 w-4" />, true],
    ["delete", "Delete", <Trash2 key="d" className="h-4 w-4" />, authority === "hod"], ["people", "Authorised people", <Users key="p" className="h-4 w-4" />, authority === "hod"], ["history", "Recent changes", <History key="h" className="h-4 w-4" />, true],
  ];
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-slate-100/90 p-1 ring-1 ring-slate-200/70" role="tablist" aria-label="Employee manager">
      {tabs.filter(([, , , show]) => show).map(([key, label, icon]) => (
        <button key={key} type="button" role="tab" aria-selected={tab === key} data-emp-tab={key} onClick={() => onTab(key)}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${tab === key ? "bg-white text-indigo-700 shadow-md shadow-slate-300/50 ring-1 ring-indigo-100" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}>
          {icon}{label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the ID card (the live preview)
// ---------------------------------------------------------------------------------------------------------------------------------

const COHORT_CHIP = (ticketNo: string): string => {
  if (!isTicket(ticketNo)) return "New employee";
  if (cohortOfTicket(ticketNo) === "nonexecutive") return "Non-executive";
  return /^49\d{4}$/.test(ticketNo) ? "Executive · MT" : "Executive · promoted";
};

/** How the person will look: an ID card that fills in as the form is filled. */
export function EmployeePreviewCard({ values, gradeTitle, departmentName, photoUrl = null }: { values: FormValues; gradeTitle: string; departmentName: string; photoUrl?: string | null }) {
  const name = values.name.trim().replace(/\s+/g, " ").toUpperCase();
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-5 text-white shadow-[0_28px_60px_-22px_rgba(99,102,241,0.75)]" data-emp-preview="true">
      <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-fuchsia-300/25 blur-2xl" />
      <div className="relative flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
        <span className="whitespace-nowrap">Employee</span>
        <span className="whitespace-nowrap rounded-full bg-white/20 px-2.5 py-1 normal-case tracking-normal backdrop-blur">{COHORT_CHIP(values.ticketNo)}</span>
      </div>
      <div className="relative mt-5 flex items-center gap-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/95 shadow-lg ring-4 ring-white/30" data-emp-photo="true"><img src={photoUrl} alt="" className="h-full w-full object-cover" /></div>
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/95 text-xl font-extrabold text-indigo-700 shadow-lg ring-4 ring-white/30" aria-hidden="true">{initialsOf(name)}</div>
        )}
        <div className="min-w-0">
          <p className={`truncate text-lg font-extrabold leading-tight ${name ? "" : "text-white/50"}`}>{name || "NAME"}</p>
          <p className={`truncate text-sm ${gradeTitle ? "text-white/95" : "text-white/50"}`}>{gradeTitle || "Designation"}</p>
          <p className={`truncate text-xs ${departmentName ? "text-white/80" : "text-white/50"}`}>{departmentName || "Department"}</p>
        </div>
      </div>
      <div className="relative mt-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">Ticket</p>
          <p className="font-mono text-base font-bold tracking-[0.3em]">{values.ticketNo.trim() || "••••••"}</p>
        </div>
        <span aria-hidden="true" className="h-8 w-24 rounded-sm opacity-80" style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.9) 0 2px, transparent 2px 4px, rgba(255,255,255,0.9) 4px 5px, transparent 5px 8px, rgba(255,255,255,0.9) 8px 11px, transparent 11px 13px)" }} />
      </div>
    </div>
  );
}

/** A few lines of what the form expects, for the kind of employee being typed. */
function Guide({ cohort }: { cohort: "executive" | "nonexecutive" | null }) {
  const lines =
    cohort === "executive"
      ? ["The ticket starts with 4; 49 and four digits is a direct recruit (MT).", `The NIC mail ends with ${NIC_DOMAIN}, the web-mail with ${WEBMAIL_DOMAIN}.`, "The CUG mobile is optional: it can be added later in Modify."]
      : cohort === "nonexecutive"
        ? ["Any other ticket of 6 digits is a non-executive.", "One e-mail, any address, and an optional mobile."]
        : ["A ticket has 6 digits and never starts with 0.", "Fill the sections from the top: each one opens when the one above is complete."];
  return (
    <div className="rounded-2xl border border-indigo-100 bg-white/70 p-4 shadow-sm backdrop-blur" data-emp-guide="true">
      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600"><Info className="h-4 w-4" aria-hidden="true" />At a glance</p>
      <ul className="space-y-1.5 text-xs text-slate-600">
        {lines.map((l) => <li key={l} className="flex gap-2"><span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-300" />{l}</li>)}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the steps
// ---------------------------------------------------------------------------------------------------------------------------------

type StepState = "done" | "current" | "locked";

function ProgressRail({ steps }: { steps: Array<{ label: string; state: StepState }> }) {
  const done = steps.filter((s) => s.state === "done").length;
  const all = done === steps.length;
  return (
    <div className={`rounded-2xl border p-3.5 shadow-sm backdrop-blur transition-colors duration-500 ${all ? "border-emerald-200 bg-gradient-to-r from-emerald-50 to-white" : "border-white/70 bg-white/70"}`} data-emp-progress="true">
      <div className="mb-2.5 flex items-center justify-between text-xs">
        <span className="font-bold uppercase tracking-wider text-slate-500">Progress</span>
        <span className={`inline-flex items-center gap-1.5 font-semibold ${all ? "text-emerald-700" : "text-indigo-600"}`}>{all ? <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> : null}{done} of {steps.length} sections complete{all ? " · ready to review" : ""}</span>
      </div>
      <ol className="flex items-center">
        {steps.map((s, i) => (
          <li key={s.label} className="flex flex-1 items-center last:flex-none" data-emp-step={s.state}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-500 ${s.state === "done" ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md shadow-emerald-500/30" : s.state === "current" ? `${GRADIENT_AVATAR} text-white shadow-lg shadow-indigo-500/40 ring-4 ring-indigo-100` : "bg-slate-200 text-slate-400"}`}>
              {s.state === "done" ? <Check className="h-4 w-4" aria-hidden="true" /> : s.state === "locked" ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
            </span>
            <span className={`ml-2 hidden text-xs font-semibold sm:inline ${s.state === "locked" ? "text-slate-400" : s.state === "current" ? "text-indigo-700" : "text-emerald-700"}`}>{s.label}</span>
            {i < steps.length - 1 && (
              <span className="mx-3 h-1 min-w-4 flex-1 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                <span className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-indigo-400 transition-all duration-700" style={{ width: s.state === "done" ? "100%" : "0%" }} />
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepCard({ n, title, note, state, chip, notYours, children }: { n: number; title: string; note?: string; state: StepState; chip?: string; notYours?: boolean; children: React.ReactNode }) {
  const locked = state === "locked";
  const frame =
    notYours
      ? "border-slate-200 bg-slate-50/80 shadow-sm"
      : state === "current"
      ? "border-indigo-200 bg-white shadow-[0_16px_44px_-18px_rgba(79,70,229,0.5)] ring-1 ring-indigo-100"
      : state === "done"
        ? "border-emerald-200/80 bg-white/90 shadow-sm"
        : "border-dashed border-slate-300 bg-slate-50/70";
  return (
    <section className={`relative rounded-2xl border p-4 transition-all duration-500 ${frame} ${locked ? "opacity-70" : ""}`} data-emp-section={title} data-emp-locked={locked ? "true" : undefined} data-emp-state={state}>
      {state === "current" && <span aria-hidden="true" className="absolute inset-x-6 -top-px h-0.5 rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400" />}
      <header className="mb-3.5 flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${notYours ? "bg-slate-200 text-slate-500" : state === "done" ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white" : state === "current" ? `${GRADIENT_AVATAR} text-white` : "bg-slate-200 text-slate-400"}`}>
          {notYours ? <Lock className="h-4 w-4" aria-hidden="true" /> : state === "done" ? <Check className="h-4 w-4" aria-hidden="true" /> : locked ? <Lock className="h-4 w-4" aria-hidden="true" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={`text-sm font-bold ${locked ? "text-slate-500" : "text-slate-900"}`}>{title}</h3>
          {note ? <p className="text-xs text-slate-500">{note}</p> : null}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${notYours ? "bg-slate-200/80 text-slate-600" : state === "done" ? "bg-emerald-50 text-emerald-700" : state === "current" ? "bg-indigo-50 text-indigo-700" : "bg-slate-200/70 text-slate-500"}`}>
          {chip ?? (state === "done" ? "Complete" : state === "current" ? "In progress" : "Locked")}
        </span>
      </header>
      {children}
    </section>
  );
}

function Field(props: { id: string; label: string; hint?: string; error?: string; icon?: React.ReactNode; status?: "ok" | "bad" | null; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${props.className ?? ""}`}>
      <label htmlFor={props.id} className="mb-1.5 block text-xs font-semibold text-slate-700">{props.label}</label>
      <div className="group relative">
        {props.icon ? <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-400 transition group-focus-within:text-indigo-500">{props.icon}</span> : null}
        {props.children}
        {props.status === "ok" ? <CheckCircle2 className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-500" aria-hidden="true" /> : null}
        {props.status === "bad" ? <AlertCircle className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-rose-500" aria-hidden="true" /> : null}
      </div>
      <p id={`${props.id}-note`} className={`mt-1.5 min-h-4 text-xs ${props.error ? "font-medium text-rose-600" : "text-slate-500"}`} role={props.error ? "alert" : undefined}>{props.error ?? props.hint ?? "\u00a0"}</p>
    </div>
  );
}

const ico = "h-[18px] w-[18px]";

export interface EmployeeFormProps {
  /** The photo of the employee (optional): its state and what to do when a file is chosen or the photo is removed. Without it the form has no photo field (and the ID card shows the initials). */
  photo?: { state: PhotoUiState; onPick: (file: File) => void; onRemove: () => void; disabled?: boolean };
  mode: "add" | "modify";
  idPrefix: string;
  values: FormValues;
  lookups: Lookups;
  /** Shown under the fields (live errors for the fields the person has been in, server errors after a save). */
  errors: FieldErrors;
  /** ALL the errors of the record as it stands (not only those shown): they decide the tick or the alert inside a box. Defaults to `errors`. */
  allErrors?: FieldErrors;
  warnings: string[];
  /** The HOD of C&IT only: for anybody else the dates are a locked card and nothing is sent. */
  datesVisible: boolean;
  /** Which sections are OPEN: from top to bottom, a section opens only when the one above it is complete and right. */
  unlocked: Unlocked;
  /** The whole record is complete and right (the last step is done). */
  complete?: boolean;
  /** The person being changed (for the masked "now" hints), or null when adding. */
  original: EmployeeRecord | null;
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
  const { values: v, lookups, errors, idPrefix, original } = p;
  const all = p.allErrors ?? errors;
  const cohort = isTicket(v.ticketNo) ? cohortOfTicket(v.ticketNo) : null;
  const grades = lookups.grades.filter((g) => !cohort || gradeFitsCohort(g, cohort));
  const departments = lookups.departments.filter((d) => !cohort || departmentFitsCohort(d, cohort));
  const dept = resolveDepartment(v.departmentCode, lookups, v.ticketNo);
  const grade = lookups.grades.find((g) => String(g.id) === v.gradeId);
  const id = (k: string) => `${idPrefix}-${k}`;
  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => p.onChange({ ...v, [k]: e.target.value } as FormValues, k);
  /** A box that is typed in CAPITALS whatever the keys do (the name; owner, 2 Nov 2026): the capitals show at once and the caret stays where it was. */
  const setUpper = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const start = el.selectionStart, end = el.selectionEnd, upper = el.value.toUpperCase();
    p.onChange({ ...v, [k]: upper } as FormValues, k);
    if (start !== null && end !== null && upper !== el.value) {
      const later = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f: () => void) => setTimeout(f, 0);
      later(() => { try { el.setSelectionRange(start, end); } catch { /* the box is gone */ } });
    }
  };
  const live = describeDates(v.dateOfBirth || null, v.dateOfJoining || null, p.today);
  const groups: Array<[string, GradeRef[]]> = [["Managerial", grades.filter((g) => g.track === "managerial")], ["Medical", grades.filter((g) => g.track === "medical")], ["Non-executive", grades.filter((g) => g.track === "nonexec")]];
  const todayIso = p.today.toISODate() as string;
  const posting = p.unlocked.posting;         // designation and department: only after the Identity is complete and right
  const datesOpen = p.unlocked.dates;         // the dates: only after Posting is complete and right
  const contact = p.unlocked.contact;         // contact and address: only after the dates (or, for anybody but the HOD, after Posting)
  const executive = cohort === "executive";
  const lockedHint = undefined; // the card says "Locked" and what to complete first, once
  const nowHint = (now: string | undefined, rule: string) => (now ? `Now ${now}. Type a new one to replace it. ${rule}` : rule);
  const waitText = "Fill in the ticket number, the SAIL P.No. and the name first.";
  const filled = (k: keyof FormValues) => String(v[k]).trim() !== "";
  const status = (k: keyof FormValues, errKey: keyof FieldErrors = k as keyof FieldErrors): "ok" | "bad" | null => (errors[errKey] ? "bad" : filled(k) && !all[errKey] ? "ok" : null);
  const cls = (k: keyof FormValues, errKey: keyof FieldErrors = k as keyof FieldErrors) => `${INPUT} ${errors[errKey] ? INPUT_BAD : filled(k) && !all[errKey] ? INPUT_OK : ""}`;

  const identityDone = p.unlocked.posting;
  const stateOf = (open: boolean, done: boolean): StepState => (!open ? "locked" : done ? "done" : "current");
  const steps: Array<{ label: string; state: StepState }> = [
    { label: "Identity", state: stateOf(true, identityDone) },
    { label: "Posting", state: stateOf(posting, p.unlocked.dates) },
    { label: "Service dates", state: p.datesVisible ? stateOf(datesOpen, p.unlocked.contact) : stateOf(datesOpen, true) },
    { label: "Contact", state: stateOf(contact, !!p.complete) },
  ];

  return (
    <div className="space-y-4" data-emp-form={p.mode}>
      <ProgressRail steps={steps} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17.5rem]">
        <div className="space-y-3">
          <StepCard n={1} title="Identity" state={steps[0].state} note="Who he is.">
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              <Field id={id("ticketNo")} label="Ticket number" error={errors.ticketNo} hint={p.mode === "modify" ? "The ticket cannot be changed here." : ORIGIN_TEXT(v.ticketNo)} icon={<Hash className={ico} />} status={status("ticketNo")}>
                <input id={id("ticketNo")} data-emp-field="ticketNo" className={cls("ticketNo")} value={v.ticketNo} onChange={set("ticketNo")} disabled={p.mode === "modify"} inputMode="numeric" maxLength={6} placeholder="6 digits" autoComplete="off" aria-invalid={errors.ticketNo ? true : undefined} />
              </Field>
              <Field id={id("sailPno")} label="SAIL P.No." error={errors.sailPno} hint="His first password: letters and digits." icon={<BadgeCheck className={ico} />} status={status("sailPno")}>
                <input id={id("sailPno")} data-emp-field="sailPno" className={cls("sailPno")} value={v.sailPno} onChange={set("sailPno")} maxLength={15} placeholder="For example D107659" autoComplete="off" aria-invalid={errors.sailPno ? true : undefined} />
              </Field>
              <Field id={id("name")} label="Name" error={errors.name} hint="Kept in capitals." icon={<User className={ico} />} status={status("name")} className="sm:col-span-2">
                <input id={id("name")} data-emp-field="name" className={cls("name")} value={v.name} onChange={setUpper("name")} maxLength={80} placeholder="Full name" autoComplete="off" aria-invalid={errors.name ? true : undefined} />
              </Field>
              {p.photo && <PhotoField id={id("photo")} state={p.photo.state} onPick={p.photo.onPick} onRemove={p.photo.onRemove} disabled={p.photo.disabled} />}
            </div>
          </StepCard>

          <StepCard n={2} title="Posting" state={steps[1].state} note={posting ? "Where he serves." : waitText}>
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              <Field id={id("gradeId")} label="Designation code" error={errors.gradeId} hint={grade ? `${grade.title} · ${grade.track === "nonexec" ? "non-executive" : grade.track === "medical" ? "medical" : "managerial"}` : posting ? "Only the codes that fit the ticket." : lockedHint} icon={<Briefcase className={ico} />}>
                <select id={id("gradeId")} data-emp-field="gradeId" className={`${DROPDOWN} ${errors.gradeId ? INPUT_BAD : ""}`} style={DROPDOWN_STYLE} value={v.gradeId} onChange={set("gradeId")} disabled={!posting} aria-invalid={errors.gradeId ? true : undefined}>
                  <option value="">{posting ? "Choose the code…" : "—"}</option>
                  {posting && groups.filter(([, list]) => list.length > 0).map(([label, list]) => (
                    <optgroup key={label} label={label}>
                      {list.map((g) => <option key={g.id} value={String(g.id)}>{gradeLabel(g)}</option>)}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field id={id("departmentCode")} label="Department code" error={errors.departmentId} hint={dept ? dept.name : posting ? "Choose a code from the list." : lockedHint} icon={<Building2 className={ico} />}>
                <input id={id("departmentCode")} data-emp-field="departmentCode" list={posting ? id("departments") : undefined} className={`${DROPDOWN} ${errors.departmentId ? INPUT_BAD : ""}`} style={DROPDOWN_STYLE} value={v.departmentCode} onChange={set("departmentCode")} disabled={!posting} inputMode="numeric" maxLength={6} placeholder={posting ? "Code" : "—"} autoComplete="off" aria-invalid={errors.departmentId ? true : undefined} />
                {posting && (
                  <datalist id={id("departments")}>
                    {departments.map((d) => <option key={d.id} value={String(d.code)} label={d.name} />)}
                  </datalist>
                )}
              </Field>
            </div>
            {executive && (
              <label className={`mt-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs ${posting ? "cursor-pointer text-slate-700" : "cursor-not-allowed text-slate-400"}`}>
                <input type="checkbox" className="peer sr-only" data-emp-field="doctor" checked={v.doctor} onChange={(e) => p.onChange({ ...v, doctor: e.target.checked }, "doctor")} disabled={!posting} />
                <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition peer-checked:bg-indigo-500 peer-focus-visible:ring-4 peer-focus-visible:ring-indigo-100 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition after:content-[''] peer-checked:after:translate-x-5" />
                <span className="flex items-center gap-1.5"><Stethoscope className="h-4 w-4" aria-hidden="true" />A doctor who holds an ordinary managerial designation</span>
              </label>
            )}
          </StepCard>

          {p.datesVisible ? (
            <StepCard n={3} title="Service dates" state={steps[2].state} note={datesOpen ? "Only you, as the HOD of C&IT, see and set these." : "Complete Posting first."}>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <Field id={id("dateOfBirth")} label="Date of birth" error={errors.dateOfBirth} hint={live.age ? `Age ${live.age} · retires on ${live.retiresOn}` : datesOpen ? "Required to continue." : lockedHint} icon={<CalendarDays className={ico} />}>
                  <input id={id("dateOfBirth")} data-emp-field="dateOfBirth" type="date" min="1930-01-01" max={todayIso} className={`${DATE_BOX} ${errors.dateOfBirth ? INPUT_BAD : ""}`} style={emptyDateStyle(v.dateOfBirth)} value={v.dateOfBirth} onChange={set("dateOfBirth")} disabled={!datesOpen} aria-invalid={errors.dateOfBirth ? true : undefined} />
                </Field>
                <Field id={id("dateOfJoining")} label="Date of joining" error={errors.dateOfJoining} hint={live.service ? `Service ${live.service} · 25 years on ${live.jubileeOn}` : datesOpen ? "Required to continue." : lockedHint} icon={<CalendarCheck className={ico} />}>
                  <input id={id("dateOfJoining")} data-emp-field="dateOfJoining" type="date" max={todayIso} className={`${DATE_BOX} ${errors.dateOfJoining ? INPUT_BAD : ""}`} style={emptyDateStyle(v.dateOfJoining)} value={v.dateOfJoining} onChange={set("dateOfJoining")} disabled={!datesOpen} aria-invalid={errors.dateOfJoining ? true : undefined} />
                </Field>
              </div>
              {p.warnings.map((w) => <p key={w} className="mt-2 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900 ring-1 ring-rose-300" data-emp-warning="true"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{w}</p>)}
            </StepCard>
          ) : (
            <StepCard n={3} title="Service dates" state={steps[2].state} chip="HOD only" notYours>
              <p className="text-xs text-slate-600" data-emp-dates-locked="true">The date of birth and the date of joining are seen and set only by the HOD of C&IT.</p>
            </StepCard>
          )}

          <StepCard n={4} title="Contact" state={steps[3].state} note={contact ? (executive ? "Executive" : "Non-executive") : p.datesVisible ? "Complete the service dates first." : "Complete Posting first."}>
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {executive ? (
                <>
                  <Field id={id("emailNic")} label={`NIC mail (${NIC_DOMAIN})`} error={errors.emailNic} hint={contact ? nowHint(original?.emailNic, "Optional.") : lockedHint} icon={<AtSign className={ico} />} status={contact ? status("emailNic") : null}>
                    <input id={id("emailNic")} data-emp-field="emailNic" className={cls("emailNic")} value={v.emailNic} onChange={set("emailNic")} disabled={!contact} maxLength={120} placeholder={`name${NIC_DOMAIN}`} autoComplete="off" aria-invalid={errors.emailNic ? true : undefined} />
                  </Field>
                  <Field id={id("webmail")} label={`Web-mail (${WEBMAIL_DOMAIN})`} error={errors.webmail} hint={contact ? nowHint(original?.webmail, "Optional.") : lockedHint} icon={<Mail className={ico} />} status={contact ? status("webmail") : null}>
                    <input id={id("webmail")} data-emp-field="webmail" className={cls("webmail")} value={v.webmail} onChange={set("webmail")} disabled={!contact} maxLength={120} placeholder={`name${WEBMAIL_DOMAIN}`} autoComplete="off" aria-invalid={errors.webmail ? true : undefined} />
                  </Field>
                </>
              ) : (
                <Field id={id("email")} label="E-mail" error={errors.email} hint={contact ? nowHint(original?.emailMasked, "Optional; any address.") : lockedHint} icon={<Mail className={ico} />} status={contact ? status("email") : null}>
                  <input id={id("email")} data-emp-field="email" className={cls("email")} value={v.email} onChange={set("email")} disabled={!contact} maxLength={120} placeholder="name@gmail.com" autoComplete="off" aria-invalid={errors.email ? true : undefined} />
                </Field>
              )}
              <Field id={id("mobile")} label={executive ? "CUG mobile number" : "Mobile number"} error={errors.mobile} hint={contact ? nowHint(original?.mobileMasked, executive ? MOBILE_HINT_EXECUTIVE : MOBILE_HINT_NONEXECUTIVE) : lockedHint} icon={<Phone className={ico} />} status={contact ? status("mobile") : null}>
                <input id={id("mobile")} data-emp-field="mobile" className={cls("mobile")} value={v.mobile} onChange={set("mobile")} disabled={!contact} inputMode="numeric" maxLength={16} placeholder={executive ? "94347…" : "10 digits"} autoComplete="off" aria-invalid={errors.mobile ? true : undefined} />
              </Field>
              <Field id={id("address")} label="Address" error={errors.address} hint={contact ? "Optional." : lockedHint} icon={<MapPin className={ico} />} className="sm:col-span-2">
                <textarea id={id("address")} data-emp-field="address" className={`${INPUT} h-auto min-h-[4.25rem] py-2.5`} value={v.address} onChange={set("address")} disabled={!contact} maxLength={300} placeholder="Residential address" />
              </Field>
            </div>
          </StepCard>
        </div>
        <aside className="order-first space-y-3 xl:order-none xl:sticky xl:top-3 xl:self-start">
          <EmployeePreviewCard values={v} gradeTitle={grade?.title ?? ""} departmentName={dept?.name ?? ""} photoUrl={p.photo ? photoUrlOf(p.photo.state) : null} />
          <Guide cohort={cohort} />
        </aside>
      </div>
      {errors.form && <p className="text-xs font-semibold text-rose-700" role="alert">{errors.form}</p>}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center gap-3 rounded-b-3xl border-t border-white/80 bg-white/75 px-4 py-3 backdrop-blur-xl sm:-mx-5 sm:-mb-5 sm:px-5" data-emp-actions="true">
        <button type="button" data-emp-submit={p.mode} className={PRIMARY} disabled={p.busy || p.submitDisabled} onClick={p.onSubmit} aria-describedby={p.submitDisabled && p.submitHint ? `${idPrefix}-submit-hint` : undefined}>
          {p.submitLabel}<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
        {p.onCancel && <button type="button" className={SECONDARY} disabled={p.busy} onClick={p.onCancel}>Cancel</button>}
        {p.submitDisabled && p.submitHint ? (
          <p id={`${idPrefix}-submit-hint`} className="flex items-center gap-2 text-xs font-semibold text-slate-600" data-submit-hint="true"><Info className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />{p.submitHint}</p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the review, the list, the history
// ---------------------------------------------------------------------------------------------------------------------------------

/** The step between typing and saving: exactly what will be written. */
export function ReviewView(props: { mode: "add" | "modify"; title: string; changes: Array<{ label: string; from: string; to: string }>; summary: Array<[string, string]>; warnings: string[]; conflicts: EmployeeConflict[]; busy: boolean; onConfirm: (acknowledge: boolean) => void; onBack: () => void }) {
  const conflict = props.conflicts.length > 0;
  return (
    <div className="overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-[0_24px_60px_-28px_rgba(79,70,229,0.5)]" data-emp-review={props.mode}>
      <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-4 text-white">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80"><Sparkles className="h-4 w-4" aria-hidden="true" />Last look before saving</p>
        <p className="mt-1 text-base font-extrabold">{props.title}</p>
      </div>
      <div className="space-y-4 p-5">
        {props.mode === "modify" ? (
          <table className="min-w-full text-left text-sm" data-emp-changes="true">
            <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-1.5 pr-4 font-semibold">What</th><th className="py-1.5 pr-4 font-semibold">Now</th><th className="py-1.5 font-semibold">Will become</th></tr></thead>
            <tbody>{props.changes.map((c) => (
              <tr key={c.label} className="border-t border-slate-100">
                <td className="py-2 pr-4 font-semibold text-slate-800">{c.label}</td>
                <td className="py-2 pr-4"><span className="rounded-md bg-rose-50 px-2 py-0.5 text-rose-700 line-through decoration-rose-300">{c.from}</span></td>
                <td className="py-2"><span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">{c.to}</span></td>
              </tr>))}</tbody>
          </table>
        ) : (
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2" data-emp-summary="true">
            {props.summary.map(([k, val]) => (
              <div key={k} className="flex items-baseline gap-3 border-b border-slate-100 pb-1.5">
                <dt className="w-36 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
                <dd className="font-semibold text-slate-900">{val || "—"}</dd>
              </div>
            ))}
          </dl>
        )}
        {props.warnings.map((w) => <p key={w} className="mt-2 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900 ring-1 ring-rose-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{w}</p>)}
        {conflict && (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-300" data-emp-conflict="true">
            <p className="font-bold">This name is already in that department.</p>
            {props.conflicts.map((c) => <p key={c.with.id}>{c.text}</p>)}
            <p className="mt-1 font-semibold">Is this a different person?</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" data-emp-confirm="true" className={PRIMARY} disabled={props.busy} onClick={() => props.onConfirm(conflict)}>{conflict ? "Yes, a different person: save" : props.mode === "add" ? "Save the employee" : "Save the changes"}<Check className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className={SECONDARY} disabled={props.busy} onClick={props.onBack}>{conflict ? "No: go back" : "Back to the form"}</button>
        </div>
      </div>
    </div>
  );
}

export function EmployeeList({ employees, onEdit, onDelete, canDelete }: { employees: EmployeeRecord[]; onEdit: (e: EmployeeRecord) => void; onDelete: (e: EmployeeRecord) => void; canDelete: boolean }) {
  if (employees.length === 0) return <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500" data-emp-empty="true">No employee matches.</p>;
  return (
    <div className="max-h-80 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm" data-emp-results="true">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur"><tr><th className="px-4 py-2.5 font-semibold">Name</th><th className="px-3 py-2.5 font-semibold">Ticket</th><th className="px-3 py-2.5 font-semibold">Designation</th><th className="px-3 py-2.5 font-semibold">Department</th><th className="px-3 py-2.5" /></tr></thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id} className="border-t border-slate-100 transition hover:bg-indigo-50/50">
              <td className="px-4 py-2"><span className="flex items-center gap-3"><Avatar name={e.name} size="sm" /><span className="font-semibold text-slate-900">{e.name}</span></span></td>
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">{e.ticketNo}</td>
              <td className="px-3 py-2 text-slate-700">{e.gradeTitle}</td>
              <td className="px-3 py-2 text-slate-700">{e.departmentName}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                <button type="button" data-emp-edit={e.id} className="mr-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50" onClick={() => onEdit(e)}>Modify</button>
                {canDelete && <button type="button" data-emp-delete={e.id} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700" onClick={() => onDelete(e)}>Delete</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ACTION_DOT: Record<AuditView["action"], string> = { add: "bg-emerald-500 ring-emerald-100", modify: "bg-sky-500 ring-sky-100", delete: "bg-rose-500 ring-rose-100", grant: "bg-violet-500 ring-violet-100", revoke: "bg-amber-500 ring-amber-100" };

export function EmployeeHistory({ history }: { history: AuditView[] }) {
  if (history.length === 0) return <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">No change has been made from this manager yet.</p>;
  return (
    <div className="max-h-96 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm" data-emp-history="true">
      <table className="min-w-full text-left text-xs sm:text-sm">
        <thead className="sticky top-0 bg-slate-50/95 text-slate-500 backdrop-blur"><tr><th className="whitespace-nowrap px-4 py-2.5 font-semibold">When</th><th className="px-3 py-2.5 font-semibold">What</th><th className="px-3 py-2.5 font-semibold">Details</th><th className="px-3 py-2.5 font-semibold">Done by</th></tr></thead>
        <tbody>
          {history.map((h, i) => (
            <tr key={i} className="border-t border-slate-100 align-top transition hover:bg-slate-50/70">
              <td className="whitespace-nowrap px-4 py-2 text-slate-600">{DateTime.fromISO(h.at).setZone(IST).setLocale("en-IN").toLocaleString({ dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="px-3 py-2"><span aria-hidden="true" className={`mr-2.5 inline-block h-2.5 w-2.5 rounded-full ring-4 ${ACTION_DOT[h.action]}`} /><span className="font-semibold text-slate-800">{h.summary}</span></td>
              <td className="px-3 py-2 text-slate-700">
                {h.changes.length === 0 ? "—" : h.changes.map((c) => <span key={c.field} className="block">{c.label}: <span className="text-slate-500">{c.from}</span> → <span className="font-semibold">{c.to}</span></span>)}
              </td>
              <td className="px-3 py-2 text-slate-800"><span className="font-semibold">{h.actorName}</span> <span className="whitespace-nowrap text-slate-500">({h.actorTicket})</span>
                <span className="block text-xs text-slate-500">{[h.actorDesignation, h.actorRole === "hod" ? "HOD of C&IT" : "authorised executive"].filter(Boolean).join(" · ")}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
