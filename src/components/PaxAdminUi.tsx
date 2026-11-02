"use client";

// src/components/PaxAdminUi.tsx
//
// THE LOOK OF THE PAX DIRECTORY EDITOR (step 67a; owner, 1 Nov 2026: "implement it, keeping all the logic intact"). The same design family as the employee manager (glass cards, icon-led inputs with a live tick, a rail,
// a sticky action bar that says in words why the button is off) with its own character: TEAL instead of indigo, underline tabs, ONE "line" card with a three-node rail (PAX has three fields), and a telephone-line
// plate that shows how the entry will read in the directory.
// NOTHING HERE DECIDES ANYTHING: these components are given everything (values, errors, who may do what) and draw it. The requests, the state and every rule stay in PaxAdminPanel.tsx and in lib/pax.
// Plain text only (React escapes it). Every size is a Tailwind size the modal's own scale sheet (omniScale.css) knows, so the whole panel follows the modal's text scale.

import React from "react";
import { DateTime } from "luxon";
import { AlertCircle, AlertTriangle, ArrowRight, Building2, Check, CheckCircle2, Info, MapPin, Phone, Radio, Search, Sparkles } from "lucide-react";
import { IST } from "@/lib/dates";
import type { Acknowledge, PaxAdminOpen, PaxAuditView, PaxConflict, PaxEntryView } from "@/lib/pax/admin/types";
import { EMPTY_LOCATION } from "@/lib/pax/answer";
import { describeLine } from "@/lib/pax/admin/conflicts";
import { placeName } from "@/lib/pax/display";
import { PAX_NUMBER_RULE, validateEntry, type FieldErrors } from "@/lib/pax/admin/validate";

export interface FormValues { department: string; location: string; number: string }

// ---------------------------------------------------------------------------------------------------------------------------------
// the shared look
// ---------------------------------------------------------------------------------------------------------------------------------

const GRAD = "bg-gradient-to-br from-teal-500 via-cyan-500 to-sky-500";
const INPUT_BASE = "h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/80 pl-11 pr-10 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
export const FIELD = INPUT_BASE;
const INPUT_OK = "border-teal-200 bg-white";
const INPUT_BAD = "border-rose-300 bg-white";
export const PRIMARY = "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 via-cyan-600 to-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/30 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:shadow-none disabled:hover:brightness-100";
export const SECONDARY = "inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
/** The box of the typed confirmation of a deletion (shared component src/components/facility/TypedConfirm.tsx), in the PAX editor's colours. */
export const CONFIRM_INPUT = "h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-3 text-sm text-slate-900 shadow-inner outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-100";

export const DANGER = "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none";
const ROW_ACTION = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50";
const ROW_DANGER = "rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50";

/** A round avatar with the initials of a name, in the family gradient. */
export function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  return <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ${GRAD}`} aria-hidden="true">{initials}</span>;
}

/** The frame of the whole editor: a soft gradient with two blurred lights behind it (overflow-clip, so that the sticky action bar can stick). */
export function PaxShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate overflow-clip rounded-3xl border border-teal-100/80 bg-gradient-to-br from-white via-slate-50 to-teal-50/80 p-4 shadow-[0_24px_70px_-28px_rgba(13,148,136,0.45)] sm:p-5" data-pax-admin="true">
      <span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 -z-10 h-72 w-72 rounded-full bg-gradient-to-br from-teal-300/40 to-sky-300/30 blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 -z-10 h-72 w-72 rounded-full bg-gradient-to-tr from-emerald-200/40 to-cyan-200/30 blur-3xl" />
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/**
 * The top line of the editor (owner, 31 Oct 2026): the title, then the NAME of the person who is logged in, then the role label ("HOD of C&IT" or "Authorised executive"), with the same gap between the three.
 * The name is the login's (the server's answer to `me`), shown as soon as it arrives; until then the line has the title and the role.
 */
export function PaxAdminHeader({ authority, name }: { authority: PaxAdminOpen["role"]; name?: string | null }) {
  const hod = authority === "hod";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-pax-header="true">
      <span className={`flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg shadow-teal-500/30 ${GRAD}`}><Phone className="h-5 w-5" aria-hidden="true" /></span>
      <p className="text-base font-bold text-slate-900 [word-spacing:0.14em]" data-pax-title="true">PAX directory editor</p>
      {name ? <p className="text-sm font-semibold text-slate-600" data-pax-actor="true">{name}</p> : null}
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow-sm ${hod ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-gradient-to-r from-sky-500 to-teal-500"}`} data-role={authority}>
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        {hod ? "HOD of C&IT" : "Authorised executive"}
      </span>
    </div>
  );
}

/** Underline tabs with a glowing teal bar under the chosen one. */
export function PaxTabs<T extends string>({ tabs, tab, onTab }: { tabs: Array<{ id: T; label: string; icon: React.ReactNode; show: boolean }>; tab: T; onTab: (id: T) => void }) {
  return (
    <div role="tablist" aria-label="PAX directory editor" className="flex flex-wrap gap-x-1 border-b border-slate-200/80">
      {tabs.filter((t) => t.show).map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)}
          className={`relative -mb-px inline-flex items-center gap-2 rounded-t-xl border-b-[3px] px-4 py-3 text-sm font-semibold transition ${tab === t.id ? "border-teal-500 bg-gradient-to-t from-teal-50/90 to-transparent text-teal-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"}`}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  );
}

/** A message after an action: green for what worked, amber for what needs a look, rose for what did not. */
export function Notice({ tone, children }: { tone: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const ok = tone === "ok", warn = tone === "warn";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-sm ring-1 ${ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : warn ? "bg-amber-50 text-amber-950 ring-amber-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`}>
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" /> : warn ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />}
      <p>{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// TWO PEOPLE AT ONCE (step 67b): a save is refused because somebody else changed the line first
// ---------------------------------------------------------------------------------------------------------------------------------

const FIELD_WORDS: Record<keyof FormValues, string> = { department: "Department", location: "Location", number: "PAX number" };
export const wordOfField = (k: keyof FormValues): string => FIELD_WORDS[k];

/** What the OTHER person changed: the line the person opened against the line as it is now (an empty location reads Office, the table's own word). */
export function theirEntryChanges(original: PaxEntryView, current: PaxEntryView): Array<{ label: string; from: string; to: string }> {
  const rows: Array<[string, string, string]> = [["Department", original.department, current.department], ["Location", original.location || EMPTY_LOCATION, current.location || EMPTY_LOCATION], ["PAX number", original.number, current.number]];
  return rows.filter(([, a, b]) => a !== b).map(([label, from, to]) => ({ label, from, to }));
}

/**
 * THE THREE-WAY MERGE for a line. `base` is the form as it was when the person opened the line, `mine` what is in the form now, `theirs` the line as it is now. A field the person CHANGED keeps his value;
 * every other field takes THEIR value, so he can never put back what the other person changed. `overlaps` are the fields BOTH changed to different values (his is kept, and he is told to look).
 */
export function rebaseEntry(base: FormValues, mine: FormValues, theirs: FormValues): { values: FormValues; kept: Array<keyof FormValues>; overlaps: Array<keyof FormValues> } {
  const values: FormValues = { ...theirs };
  const kept: Array<keyof FormValues> = [], overlaps: Array<keyof FormValues> = [];
  for (const k of Object.keys(base) as Array<keyof FormValues>) {
    if (mine[k] !== base[k]) {
      values[k] = mine[k];
      kept.push(k);
      if (theirs[k] !== base[k] && theirs[k] !== mine[k]) overlaps.push(k);
    }
  }
  return { values, kept, overlaps };
}

/** The card: who changed the line and when (the last change recorded), what changed, and the two safe ways on. Nothing of the person's was saved. */
export function StaleCard(props: { who: { name: string; ticket: string; at: string } | null; changes: Array<{ label: string; from: string; to: string }>; busy: boolean; onTheirs: () => void; onMine: () => void }) {
  const when = props.who ? DateTime.fromISO(props.who.at).setZone(IST).setLocale("en-IN").toLocaleString({ dateStyle: "medium", timeStyle: "short" }) : "";
  return (
    <div role="alert" className="overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white text-sm text-amber-950 shadow-[0_18px_44px_-22px_rgba(217,119,6,0.5)]" data-pax-stale="true">
      <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-100/50 px-5 py-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /><p className="font-bold">Somebody else changed this line while you were editing it.</p></div>
      <div className="space-y-3 p-5">
        <p>{props.who ? <>{props.who.name} ({props.who.ticket}) saved a change on {when}.</> : "It was changed after you opened it."} <span className="font-semibold">Nothing of yours has been saved.</span></p>
        {props.changes.length > 0 ? (
          <table className="min-w-full text-left" data-pax-stale-changes="true">
            <thead className="text-xs uppercase tracking-wide text-amber-800/70"><tr><th className="py-1 pr-4 font-semibold">What they changed</th><th className="py-1 pr-4 font-semibold">It was</th><th className="py-1 font-semibold">It is now</th></tr></thead>
            <tbody>{props.changes.map((c) => (
              <tr key={c.label} className="border-t border-amber-100">
                <td className="py-1.5 pr-4 font-semibold">{c.label}</td>
                <td className="py-1.5 pr-4"><span className="rounded-md bg-white/80 px-2 py-0.5 text-slate-600 line-through decoration-slate-300">{c.from}</span></td>
                <td className="py-1.5"><span className="rounded-md bg-white px-2 py-0.5 font-semibold text-slate-900 ring-1 ring-amber-200">{c.to}</span></td>
              </tr>))}</tbody>
          </table>
        ) : <p className="rounded-xl bg-white/80 px-3 py-2 text-slate-700 ring-1 ring-amber-100">The line was saved again in the same words.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={PRIMARY} disabled={props.busy} onClick={props.onMine} data-pax-stale-mine="true">Keep my edits on top of their version</button>
          <button type="button" className={SECONDARY} disabled={props.busy} onClick={props.onTheirs} data-pax-stale-theirs="true">Show their version (drop my edits)</button>
        </div>
        <p className="text-xs text-amber-900/80">"Keep my edits" puts only what YOU changed on top of the new line: everything else is taken from theirs, so you cannot put back what they changed. Nothing is saved until you press the button of the form.</p>
      </div>
    </div>
  );
}

/** A box with its icon on the left, for the search boxes (the three form fields use Field below). */
export function IconField({ id, label, icon, children }: { id: string; label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</label>
      <div className="group relative">
        <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400 transition group-focus-within:text-teal-500">{icon}</span>
        {children}
      </div>
    </div>
  );
}

/** The search for a saved line (Change and Delete). */
export function SearchBar(props: { id: string; label: string; value: string; placeholder: string; busy: boolean; onChange: (v: string) => void; onSearch: () => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-sm backdrop-blur" data-pax-search="true">
      <div className="min-w-[12rem] flex-1">
        <IconField id={props.id} label={props.label} icon={<Search className="h-[18px] w-[18px]" aria-hidden="true" />}>
          <input id={props.id} type="text" value={props.value} onChange={(e) => props.onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); props.onSearch(); } }} placeholder={props.placeholder} autoComplete="off" className={FIELD} />
        </IconField>
      </div>
      <button type="button" className={SECONDARY} disabled={props.busy} onClick={props.onSearch}>Search</button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the form
// ---------------------------------------------------------------------------------------------------------------------------------

type Done = { department: boolean; location: boolean; number: boolean; all: boolean };
/** Which of the three are right, by the SAME validation the panel and the server use (this file adds no rule of its own). */
function doneOf(values: FormValues): Done {
  const v = validateEntry(values);
  const errs: FieldErrors = v.ok ? {} : v.errors;
  const d = (k: keyof FormValues) => values[k].trim() !== "" && !errs[k];
  return { department: d("department"), location: d("location"), number: d("number"), all: v.ok };
}

/** A compact three-node rail (the same idea as the employee form's progress, sized for three fields). */
function LineRail({ done }: { done: Done }) {
  const nodes = [{ label: "Department", done: done.department }, { label: "Location", done: done.location, optional: true }, { label: "PAX number", done: done.number }];
  const firstOpen = nodes.findIndex((n) => !n.done && !n.optional);
  return (
    <ol className="flex items-center rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm backdrop-blur" data-pax-rail="true">
      {nodes.map((n, i) => {
        const current = i === firstOpen;
        return (
          <li key={n.label} className="flex flex-1 items-center last:flex-none" data-pax-node={n.done ? "done" : current ? "current" : "waiting"}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-500 ${n.done ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md shadow-emerald-500/30" : current ? `${GRAD} text-white shadow-lg shadow-teal-500/40 ring-4 ring-teal-100` : "bg-slate-200 text-slate-400"}`}>
              {n.done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
            </span>
            <span className={`ml-2 text-xs font-semibold ${n.done ? "text-emerald-700" : current ? "text-teal-700" : "text-slate-400"}`}>{n.label}{n.optional ? <span className="ml-1 font-normal text-slate-400">(optional)</span> : null}</span>
            {i < nodes.length - 1 && (
              <span className="mx-3 h-1 min-w-4 flex-1 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                <span className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-700" style={{ width: n.done ? "100%" : "0%" }} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The telephone-line plate: how the entry looks, and how it will read in the directory. */
function LinePlate({ values, editing }: { values: FormValues; editing: boolean }) {
  const department = values.department.trim(), location = values.location.trim(), number = values.number.trim();
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-cyan-600 to-sky-600 p-5 text-white shadow-[0_28px_60px_-22px_rgba(8,145,178,0.75)]" data-pax-plate="true">
        <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-emerald-300/25 blur-2xl" />
        <div className="relative flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
          <span className="flex items-center gap-1.5"><Radio className="h-3.5 w-3.5" aria-hidden="true" />PAX line</span>
          <span className="whitespace-nowrap rounded-full bg-white/20 px-2.5 py-1 normal-case tracking-normal backdrop-blur">{editing ? "Editing" : "New line"}</span>
        </div>
        <p className={`relative mt-5 truncate text-lg font-extrabold leading-tight ${department ? "" : "text-white/50"}`}>{department || "Department"}</p>
        <p className={`relative mt-1 flex items-center gap-1.5 text-sm ${location ? "text-white/90" : "text-white/55"}`}><MapPin className="h-4 w-4" aria-hidden="true" />{location || EMPTY_LOCATION}</p>
        <div className="relative mt-6 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">PAX number</p>
            <p className="whitespace-nowrap font-mono text-2xl font-bold tracking-[0.25em]">{number || "4••••"}</p>
          </div>
          <div aria-hidden="true" className="grid grid-cols-3 gap-1.5">{Array.from({ length: 9 }).map((_, i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-white/70" />)}</div>
        </div>
      </div>
      <div className="rounded-2xl border border-teal-100 bg-white/80 p-3.5 shadow-sm backdrop-blur" data-pax-readsas="true">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-teal-700"><Info className="h-3.5 w-3.5" aria-hidden="true" />How it will read in the directory</p>
        <div className="grid grid-cols-[1.4fr_1fr_0.8fr] gap-2 border-b border-slate-100 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><span>Department</span><span>Location</span><span>PAX</span></div>
        <div className="grid grid-cols-[1.4fr_1fr_0.8fr] gap-2 pt-1.5 text-xs"><span className="truncate font-semibold text-slate-800">{department || "—"}</span><span className="truncate text-slate-600">{location || EMPTY_LOCATION}</span><span className="font-mono font-bold text-teal-700">{number || "—"}</span></div>
      </div>
    </div>
  );
}

export function EntryFormView(props: {
  idPrefix: string;
  values: FormValues;
  errors: FieldErrors;
  busy: boolean;
  submitLabel: string;
  /** The button stays off (greyed) while this is true, whatever else is true; `submitHint` says in words what is still needed. Enter in a field does nothing then either. */
  submitDisabled?: boolean;
  submitHint?: string;
  /** TRUE when a saved line is being changed (the plate says "Editing" instead of "New line"). */
  editing?: boolean;
  onChange: (next: FormValues) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  /** What belongs just above the action bar: the question asked when the entry clashes with a saved line. */
  children?: React.ReactNode;
}) {
  const { idPrefix, values, errors, busy, submitLabel, submitDisabled = false, submitHint, editing = false, onChange, onSubmit, onCancel, children } = props;
  const done = doneOf(values);
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!submitDisabled) onSubmit();
    }
  };
  const field = (key: keyof FormValues, label: string, hint: string, icon: React.ReactNode, extra: { inputMode?: "numeric"; maxLength?: number; placeholder: string; className?: string }) => {
    const ok = done[key] && !errors[key];
    return (
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-${key}`} className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</label>
        <div className="group relative">
          <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400 transition group-focus-within:text-teal-500">{icon}</span>
          <input
            id={`${idPrefix}-${key}`}
            type="text"
            value={values[key]}
            onChange={(e) => onChange({ ...values, [key]: e.target.value })}
            onKeyDown={enter}
            inputMode={extra.inputMode}
            maxLength={extra.maxLength}
            placeholder={extra.placeholder}
            autoComplete="off"
            aria-invalid={errors[key] ? true : undefined}
            aria-describedby={`${idPrefix}-${key}-note`}
            className={`${INPUT_BASE} ${errors[key] ? INPUT_BAD : ok ? INPUT_OK : ""} ${extra.className ?? ""}`}
          />
          {ok ? <CheckCircle2 className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-teal-500" aria-hidden="true" /> : null}
          {errors[key] ? <AlertCircle className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-rose-500" aria-hidden="true" /> : null}
        </div>
        <p id={`${idPrefix}-${key}-note`} className={`mt-1.5 min-h-4 text-xs ${errors[key] ? "font-medium text-rose-600" : "text-slate-500"}`} role={errors[key] ? "alert" : undefined}>{errors[key] ?? hint}</p>
      </div>
    );
  };
  return (
    <div className="space-y-4" data-pax-form={idPrefix}>
      <LineRail done={done} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17.5rem] xl:items-start">
        <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-[0_16px_44px_-18px_rgba(13,148,136,0.45)] ring-1 ring-teal-100">
          <header className="mb-4 flex items-center gap-3">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${GRAD}`}><Phone className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-slate-900">The line</h3><p className="text-xs text-slate-500">Where it is, and which number reaches it.</p></div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${done.all ? "bg-emerald-50 text-emerald-700" : "bg-teal-50 text-teal-700"}`}>{done.all ? "Complete" : "In progress"}</span>
          </header>
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {field("department", "Department", "For example CISF, Weigh Bridge, Fire Service.", <Building2 className="h-[18px] w-[18px]" aria-hidden="true" />, { placeholder: "Department", maxLength: 80 })}
            {field("location", "Location", `Leave empty if there is none: the table then shows ${EMPTY_LOCATION}.`, <MapPin className="h-[18px] w-[18px]" aria-hidden="true" />, { placeholder: "Location (optional)", maxLength: 80 })}
            <div className="sm:col-span-2">
              {field("number", "PAX number", PAX_NUMBER_RULE, <Phone className="h-[18px] w-[18px]" aria-hidden="true" />, { placeholder: "4xxxx", inputMode: "numeric", maxLength: 5, className: "font-mono text-base font-bold tracking-[0.3em]" })}
            </div>
          </div>
        </section>
        <aside className="order-first xl:order-none xl:sticky xl:top-3"><LinePlate values={values} editing={editing} /></aside>
      </div>
      {children}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center gap-3 rounded-b-3xl border-t border-white/80 bg-white/75 px-4 py-3 backdrop-blur-xl sm:-mx-5 sm:-mb-5 sm:px-5" data-pax-actions="true">
        <button type="button" className={PRIMARY} disabled={busy || submitDisabled} onClick={onSubmit} aria-describedby={submitDisabled && submitHint ? `${idPrefix}-submit-hint` : undefined}>
          {submitLabel}<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
        {onCancel && (
          <button type="button" className={SECONDARY} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
        {submitDisabled && submitHint ? (
          <p id={`${idPrefix}-submit-hint`} className="flex items-center gap-2 text-xs font-semibold text-slate-600" data-submit-hint="true"><Info className="h-4 w-4 shrink-0 text-teal-500" aria-hidden="true" />{submitHint}</p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the question asked when an entry clashes, the lists, the history
// ---------------------------------------------------------------------------------------------------------------------------------

/** The sentence for each kind of clash, in the table's own words. */
export function conflictText(c: PaxConflict, entry: FormValues): string {
  if (c.kind === "same-number") return `The number ${entry.number} is already assigned to ${Array.from(new Set(c.existing.map(placeName))).join("; ")}. A PAX number belongs to one place only.`;
  if (c.kind === "same-place") return `${placeName(c.existing[0])} is already saved with ${c.existing.map((e) => e.number).join(" / ")}.`;
  return `What you typed reads almost like ${c.existing.map(describeLine).join("; ")}.`;
}

export function ConflictView(props: {
  conflicts: PaxConflict[];
  acknowledgeable: Acknowledge[];
  entry: FormValues;
  busy: boolean;
  /** open a saved line for editing */
  onEdit: (line: PaxEntryView) => void;
  /** go back and correct what was typed */
  onFix: () => void;
  onAcknowledge: (a: Acknowledge) => void;
}) {
  const { conflicts, acknowledgeable, entry, busy, onEdit, onFix, onAcknowledge } = props;
  const editable = Array.from(new Map(conflicts.flatMap((c) => c.existing).map((l) => [l.id, l])).values());
  return (
    <div role="alert" className="overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white text-sm text-amber-950 shadow-[0_18px_44px_-22px_rgba(217,119,6,0.5)]" data-pax-conflict="true">
      <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-100/50 px-5 py-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /><p className="font-bold">This clashes with what is already saved.</p></div>
      <div className="space-y-3 p-5">
        {conflicts.length === 0 && <p>The table already holds a line with this department, location and number.</p>}
        <ul className="space-y-2">
          {conflicts.map((c, i) => (
            <li key={i} data-conflict={c.kind} className="flex gap-2"><span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />{conflictText(c, entry)}</li>
          ))}
        </ul>
        <p className="font-semibold">Do you want to edit an existing line, or have you made a mistake?</p>
        <div className="flex flex-wrap gap-2">
          {editable.map((l) => (
            <button key={l.id} type="button" className={SECONDARY} disabled={busy} onClick={() => onEdit(l)}>
              Edit {describeLine(l)}
            </button>
          ))}
          <button type="button" className={SECONDARY} disabled={busy} onClick={onFix}>
            I made a mistake: let me correct my entry
          </button>
        </div>
        {acknowledgeable.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-amber-200/70 pt-3">
            <span className="text-xs font-semibold">Or, only if it is true:</span>
            {acknowledgeable.includes("second-number") && (
              <button type="button" className={PRIMARY} disabled={busy} onClick={() => onAcknowledge("second-number")}>
                Yes, {entry.number} is another number of this place
              </button>
            )}
            {acknowledgeable.includes("different") && (
              <button type="button" className={PRIMARY} disabled={busy} onClick={() => onAcknowledge("different")}>
                It is a different place: add it
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function EntryList(props: { entries: PaxEntryView[]; actionLabel: string; actionClass: string; busy: boolean; onPick: (e: PaxEntryView) => void; truncatedAt?: number }) {
  const { entries, actionLabel, actionClass, busy, onPick, truncatedAt = 40 } = props;
  const shown = entries.slice(0, truncatedAt);
  if (entries.length === 0) return <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">No saved line matches.</p>;
  return (
    <div className="space-y-1.5">
      <div className="max-h-72 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">Department</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Location</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">PAX</th>
              <th scope="col" className="px-3 py-2.5"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 transition hover:bg-teal-50/50">
                <td className="px-4 py-2 font-semibold text-slate-900"><span className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600" aria-hidden="true"><Building2 className="h-4 w-4" /></span>{e.department}</span></td>
                <td className="px-3 py-2 text-slate-700">{e.location || EMPTY_LOCATION}</td>
                <td className="whitespace-nowrap px-3 py-2"><span className="rounded-lg bg-teal-50 px-2 py-1 font-mono text-xs font-bold text-teal-700">{e.number}</span></td>
                <td className="px-3 py-2 text-right">
                  <button type="button" className={actionClass === DANGER ? ROW_DANGER : ROW_ACTION} disabled={busy} onClick={() => onPick(e)} aria-label={`${actionLabel} ${describeLine(e)}`}>
                    {actionLabel}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length > shown.length && <p className="text-xs text-slate-500">{entries.length - shown.length} more: type more of the name or the number to narrow the list.</p>}
    </div>
  );
}

const ACTION_WORD: Record<PaxAuditView["action"], string> = { add: "Added", modify: "Changed", delete: "Deleted", grant: "Authorised", revoke: "Withdrawn" };
const ACTION_DOT: Record<PaxAuditView["action"], string> = { add: "bg-emerald-500 ring-emerald-100", modify: "bg-sky-500 ring-sky-100", delete: "bg-rose-500 ring-rose-100", grant: "bg-teal-500 ring-teal-100", revoke: "bg-amber-500 ring-amber-100" };

/**
 * The history as a table (owner, 31 Oct 2026): Department, Location, the number, and who did it (name, ticket number, designation). Two columns more say WHAT was done and WHEN, because without them
 * an added line and a deleted line look the same. For a change the new line is shown and the old one is said under "Changed"; for a deleted line, the line that went; an authorisation or a withdrawal has
 * no line, so the executive concerned is named under the action and the three line columns show a dash. A coloured dot marks the kind of action.
 */
export function HistoryList({ history }: { history: PaxAuditView[] }) {
  if (history.length === 0) return <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">No change has been made from this panel yet.</p>;
  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm" data-pax-history="true">
      <table className="min-w-full text-left text-xs sm:text-sm">
        <thead className="sticky top-0 bg-slate-50/95 text-slate-500 backdrop-blur">
          <tr>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">When</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">What</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Department</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Location</th>
            <th scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">PAX</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Done by</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h, i) => {
            const hasLine = h.action === "add" || h.action === "modify" || h.action === "delete";
            return (
              <tr key={i} className="border-t border-slate-100 align-top transition hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{DateTime.fromISO(h.at).setZone(IST).setLocale("en-IN").toLocaleString({ dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="px-3 py-2 text-slate-800">
                  <span className="flex items-center gap-2"><span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${ACTION_DOT[h.action]}`} /><span className="font-semibold">{ACTION_WORD[h.action]}</span></span>
                  {h.detail && <span className="block pl-5 text-xs text-slate-500">{h.action === "modify" ? `was ${h.detail}` : h.detail}</span>}
                </td>
                <td className="px-3 py-2 font-medium text-slate-800">{hasLine ? h.department : "—"}</td>
                <td className="px-3 py-2 text-slate-700">{hasLine ? h.location || EMPTY_LOCATION : "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">{hasLine ? <span className="rounded-lg bg-teal-50 px-2 py-1 font-mono text-xs font-bold text-teal-700">{h.number}</span> : "—"}</td>
                <td className="px-3 py-2 text-slate-800">
                  <span className="font-semibold">{h.actorName}</span> <span className="whitespace-nowrap text-slate-500">({h.actorTicket})</span>
                  <span className="block text-xs text-slate-500">{[h.actorDesignation, h.actorRole === "hod" ? "HOD of C&IT" : "authorised executive"].filter(Boolean).join(" · ")}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the confirmations and the people
// ---------------------------------------------------------------------------------------------------------------------------------

/** A confirmation that something will be removed: a rose card with a heading, the words, and the buttons (children). */
export function ConfirmCard(props: { kind: "delete" | "revoke"; ariaLabel: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const mark = props.kind === "delete" ? { "data-pax-delete": "true" } : { "data-pax-revoke": "true" };
  return (
    <div role="alertdialog" aria-label={props.ariaLabel} className="overflow-hidden rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white text-sm text-rose-950 shadow-[0_18px_44px_-22px_rgba(225,29,72,0.5)]" {...mark}>
      <div className="flex items-center gap-3 border-b border-rose-100 bg-rose-100/50 px-5 py-3 text-rose-600">{props.icon}<p className="font-bold text-rose-950">{props.title}</p></div>
      <div className="space-y-3 p-5">{props.children}</div>
    </div>
  );
}

/** The line that is about to go: its place and its number struck through. */
export function LineAboutToGo({ entry, hideNumber = false }: { entry: PaxEntryView; hideNumber?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-rose-100">
      <span className="font-semibold text-slate-800">{entry.department} · {entry.location || EMPTY_LOCATION}</span>
      {hideNumber
        ? <span className="rounded-lg bg-rose-50 px-2 py-1 font-mono text-sm font-bold text-rose-700" aria-label="the number is not shown here">•••••</span>
        : <span className="rounded-lg bg-rose-50 px-2 py-1 font-mono text-sm font-bold text-rose-700 line-through decoration-rose-300">{entry.number}</span>}
    </div>
  );
}

/** One person in the lists of authorised executives: an avatar, the name, a line under it, and a button. */
export function PersonRow(props: { name: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
      <span className="flex items-center gap-3"><Avatar name={props.name} /><span><span className="block font-semibold text-slate-900">{props.name}</span><span className="block text-xs text-slate-500">{props.children}</span></span></span>
      {props.action}
    </li>
  );
}

/** A card around the "authorise an executive" search. */
export function AuthoriseCard({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-sm backdrop-blur">{children}</div>;
}

/** The "Changing ..." line above the form of a saved line. */
export function ChangingBanner({ line }: { line: PaxEntryView }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-teal-100">
      <Avatar name={line.department} />
      <p className="text-sm text-slate-600">Changing <span className="font-bold text-slate-900">{describeLine(line)}</span></p>
    </div>
  );
}
