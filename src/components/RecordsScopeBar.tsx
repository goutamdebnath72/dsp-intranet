"use client";
// src/components/RecordsScopeBar.tsx
//
// THE FIXED SELECTIONS under the search box (src/records): Everything (the bar decides, as always), People, PAX, Hospital OPD, Holidays, Degrees, Circulars & Notices. A chosen selection is answered by its own
// engines only; for People there are three ways to look (Name or number, Department & designation, Ask in words), and the middle one is two pick-lists, so nothing has to be understood at all.
// Under Everything, a line whose words name a selection earns a small suggestion (planLine, pure, in the browser).

import { useMemo } from "react";
import useSWR from "swr";
import { CalendarDays, FileText, GraduationCap, Layers, ListFilter, Phone, ShieldCheck, Sparkles, Stethoscope, Users, Wrench, type LucideIcon } from "lucide-react";
import { ADMIN_CHOICE, DOMAINS, EDS_CHOICE, PEOPLE_FACETS, domainById, facetById } from "@/records/domains";
import { AUTO_SELECTION, finderReady } from "@/records/scope";
import type { DomainId, ScopeId, Selection } from "@/records/types";
import { ToolSelect, type SelectOption } from "@/components/tools/toolKit";

const ICONS: Record<ScopeId, LucideIcon> = { auto: Sparkles, people: Users, pax: Phone, hospital: Stethoscope, holidays: CalendarDays, degrees: GraduationCap, documents: FileText, eds: Layers, admin: ShieldCheck };

interface Options { departments: { id: number; name: string }[]; designations: { id: number; name: string }[] }
const fetchOptions = async (url: string): Promise<Options> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error("lists");
  return r.json();
};

export interface RecordsScopeBarProps {
  selection: Selection;
  onChange: (next: Selection) => void;
  /** under Everything: the selection the typed line looks like it is for (planLine), or null */
  suggestion: DomainId | null;
  /** a tap on an example line */
  onExample: (line: string) => void;
  /** the finder's button */
  onRunFinder: (labels: { deptName: string | null; gradeName: string | null }) => void;
  /** the Utility Services page is open now */
  utilitiesOpen: boolean;
  /** a tap on the Utility Services button: the page of all the utilities opens */
  onUtilities: () => void;
  /** a sentence under the choices (EDS asked by a signed-in person who is not an executive) */
  notice?: string | null;
  /** the person may use Executive Deep Search (a signed-in executive): only then are its hint and example questions shown; for anyone else the prompt or the notice stands alone */
  edsReady?: boolean;
  /** a signed-in person pressed Admin: the hint and the examples may show (before that, the prompt asks who is asking) */
  adminReady?: boolean;
  /** the Admin button is pointed at, touched or focused: the management page can be fetched ahead (so pressing it shows the page at once) */
  onAdminHint?: () => void;
}

const chip = (on: boolean, hinted: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
    on
      ? "border-sky-600 bg-gradient-to-b from-sky-600 to-sky-700 text-white shadow-sm"
      : hinted
        ? "border-dashed border-sky-400 bg-sky-50 text-sky-800 hover:bg-sky-100"
        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
  }`;

export function RecordsScopeBar({ selection, onChange, suggestion, onExample, onRunFinder, utilitiesOpen, onUtilities, notice, edsReady, adminReady, onAdminHint }: RecordsScopeBarProps) {
  const { scope, facet } = selection;
  const domain = domainById(scope);
  const finder = scope === "people" && facet === "roster";
  const { data: lists, error: listsError } = useSWR<Options>(finder ? "/api/records/options" : null, fetchOptions, { revalidateOnFocus: false });
  const deptOptions = useMemo<SelectOption[]>(() => [{ id: "", label: "Any department" }, ...(lists?.departments ?? []).map((d) => ({ id: String(d.id), label: d.name }))], [lists]);
  const gradeOptions = useMemo<SelectOption[]>(() => [{ id: "", label: "Any designation" }, ...(lists?.designations ?? []).map((d) => ({ id: String(d.id), label: d.name }))], [lists]);
  const choose = (s: ScopeId) => onChange({ ...AUTO_SELECTION, scope: s, facet: "find" });
  const facetInfo = facetById(facet);
  const edsLocked = scope === "eds" && !edsReady; // the prompt (or the notice) says what EDS is: the same words must not stand beneath the button as well
  const adminLocked = scope === "admin" && !adminReady; // the prompt asks first: nothing about the admin pages stands beneath the button before that
  // under Executive Deep Search the questions to try are the shelf in the window (src/components/EdsExamples.tsx), not buttons under the bar
  const examples = edsLocked || adminLocked ? [] : scope === "people" ? facetInfo?.examples ?? [] : scope === "eds" ? [] : scope === "admin" ? ADMIN_CHOICE.examples : domain?.examples ?? [];
  const hint = scope === "auto" || edsLocked || adminLocked ? null : scope === "people" ? facetInfo?.hint : scope === "eds" ? EDS_CHOICE.hint : scope === "admin" ? ADMIN_CHOICE.hint : domain?.hint;
  const label = (id: string, opts: SelectOption[]) => opts.find((o) => o.id === id && o.id !== "")?.label ?? null;

  return (
    <div data-records-bar className="border-b border-neutral-200 bg-gradient-to-b from-white to-neutral-50/60 px-4 pb-2.5 pt-2">
      {/* BOTH ROWS IN ONE GRID: the column of labels is as wide as the widest label ("More tools"), so no label wraps and the two rows of chips start at the same place (on a phone the labels are left out and the rows stack) */}
      <div className="grid grid-cols-1 gap-y-1.5 sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-3">
      <div className="contents">
        <span className="hidden self-start whitespace-nowrap pt-[0.6em] text-[11px] font-bold uppercase tracking-wider text-neutral-400 sm:inline">Search in</span>
        <div role="radiogroup" aria-label="Search in" className="flex min-w-0 flex-wrap gap-1.5 py-0.5">
          {[{ id: "auto" as ScopeId, label: "Everything" }, ...DOMAINS.map((d) => ({ id: d.id as ScopeId, label: d.label }))].map((c) => {
            const Icon = ICONS[c.id];
            const on = scope === c.id;
            const hinted = !on && scope === "auto" && suggestion === c.id;
            return (
              <button key={c.id} type="button" role="radio" aria-checked={on} data-records-chip={c.id} {...(hinted ? { "data-suggested": "" } : {})} onClick={() => choose(c.id)} className={chip(on, hinted)}>
                <Icon size={13} aria-hidden="true" />
                {c.label}
                {hinted && (<><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-sky-600" /><span className="sr-only">(suggested)</span></>)}
              </button>
            );
          })}
        </div>
      </div>

      {/* MORE TOOLS: the choices that are not records, on their own row: the Utility Services (opens its page), Executive Deep Search (a different kind of answer, for executives) and Admin (the management pages, for those authorised) */}
      <div data-records-more className="contents">
        <span className="hidden self-start whitespace-nowrap pt-[0.6em] text-[11px] font-bold uppercase tracking-wider text-neutral-400 sm:inline">More tools</span>
        <div role="radiogroup" aria-label="More tools" className="flex min-w-0 flex-wrap gap-1.5 py-0.5">
          <button type="button" role="radio" aria-checked={utilitiesOpen} data-records-utility onClick={onUtilities} className={chip(utilitiesOpen, false).replace("from-sky-600 to-sky-700", "from-emerald-600 to-emerald-700").replace("border-sky-600", "border-emerald-600")}>
            <Wrench size={13} aria-hidden="true" />
            Utility Services
          </button>
          <button type="button" role="radio" aria-checked={scope === "eds"} data-records-chip="eds" onClick={() => choose("eds")} className={chip(scope === "eds", false).replace("from-sky-600 to-sky-700", "from-amber-500 to-amber-600").replace("border-sky-600", "border-amber-600")}>
            <Layers size={13} aria-hidden="true" />
            {EDS_CHOICE.label}
          </button>
          <button type="button" role="radio" aria-checked={scope === "admin"} data-records-chip="admin" onClick={() => choose("admin")} onPointerEnter={onAdminHint} onPointerDown={onAdminHint} onFocus={onAdminHint} className={chip(scope === "admin", false).replace("from-sky-600 to-sky-700", "from-rose-600 to-rose-700").replace("border-sky-600", "border-rose-600")}>
            <ShieldCheck size={13} aria-hidden="true" />
            {ADMIN_CHOICE.label}
          </button>
        </div>
      </div>
      </div>
      {notice && <p role="status" data-records-notice className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">{notice}</p>}

      {scope === "people" && (
        <div role="radiogroup" aria-label="How to look for a person" className="mt-2 flex flex-wrap gap-1.5">
          {PEOPLE_FACETS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={facet === f.id} data-records-facet={f.id} onClick={() => onChange({ ...selection, facet: f.id })} className={chip(facet === f.id, false).replace("from-sky-600 to-sky-700", "from-emerald-600 to-emerald-700").replace("border-sky-600", "border-emerald-600")}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {hint && <p data-records-hint className="mt-2 text-xs leading-snug text-neutral-500">{hint}</p>}
      {scope === "auto" && suggestion && (
        <p data-records-suggestion className="mt-2 text-xs leading-snug text-sky-800">
          Looks like a <strong>{domainById(suggestion)?.label}</strong> question. Choose <strong>{domainById(suggestion)?.label}</strong> to search only there, or press Enter to search everything.
        </p>
      )}

      {finder && (
        <div data-records-finder className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <ToolSelect value={selection.dept} options={deptOptions} onChange={(id) => onChange({ ...selection, dept: id })} ariaLabel="Department" tone="emerald" />
          <ToolSelect value={selection.grade} options={gradeOptions} onChange={(id) => onChange({ ...selection, grade: id })} ariaLabel="Designation" tone="emerald" />
          <input
            type="text"
            value={selection.nm}
            maxLength={40}
            onChange={(e) => onChange({ ...selection, nm: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && finderReady(selection)) { e.preventDefault(); onRunFinder({ deptName: label(selection.dept, deptOptions), gradeName: label(selection.grade, gradeOptions) }); } }}
            placeholder="Optional: part of a name"
            aria-label="Part of a name (optional)"
            className="h-11 rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white"
          />
          <button
            type="button"
            data-records-run
            disabled={!finderReady(selection)}
            onClick={() => onRunFinder({ deptName: label(selection.dept, deptOptions), gradeName: label(selection.grade, gradeOptions) })}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-emerald-600 to-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-500 hover:to-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ListFilter size={15} aria-hidden="true" /> List the people
          </button>
          {listsError && <p role="alert" className="text-xs text-rose-700 sm:col-span-2">The lists could not be loaded just now. Close and open the search again.</p>}
          {!lists && !listsError && <p className="text-xs text-neutral-500 sm:col-span-2">Loading the departments and designations…</p>}
        </div>
      )}

      {!finder && scope !== "auto" && examples.length > 0 && (
        <div data-records-examples className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Try</span>
          {examples.map((e) => (
            <button key={e} type="button" onClick={() => onExample(e)} className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
