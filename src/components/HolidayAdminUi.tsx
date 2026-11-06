"use client";

// src/components/HolidayAdminUi.tsx
//
// Presentational UI for the Holiday Manager Facility (Modular Facility Kit).
// Matches the visual language of the Employee Manager and PAX Directory Editor:
// glass cards, live validation, underline tabs, amber/emerald festive styling,
// sticky action bars, TypedConfirm integration, and NonExecutive delegation cards.

import React from "react";
import { DateTime } from "luxon";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  FileText,
  Info,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import { IST } from "@/lib/dates";
import type {
  HolidayAdminOpen,
  HolidayAuditView,
  HolidayDelegateView,
  HolidayYearView,
  PendingExtractionView,
} from "@/lib/holidays/admin/types";
import { NONEXEC_ROW, NonExecutiveChip } from "./facility/NonExecutive";

const GRAD = "bg-gradient-to-br from-amber-500 via-orange-500 to-emerald-500";
export const FIELD =
  "h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
export const SELECT =
  "h-12 w-full appearance-none rounded-2xl border border-slate-200 bg-white/95 pl-4 pr-11 text-sm font-bold text-slate-900 shadow-sm outline-none transition hover:border-amber-300 focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

export function YearSelect({
  id,
  value,
  years,
  onChange,
  disabled,
  className,
}: {
  id?: string;
  value: number;
  years: number[];
  onChange: (year: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className={SELECT}
      >
        {years.map((y) => (
          <option key={y} value={y} className="font-semibold text-slate-800">
            Year {y}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-600 transition"
        aria-hidden="true"
      />
    </div>
  );
}
export const PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:shadow-none";
export const SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
export const DANGER =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none";
export const CONFIRM_INPUT =
  "h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 text-sm text-slate-900 shadow-inner outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-100";

export function HolidayShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative isolate overflow-clip rounded-3xl border border-amber-100/80 bg-gradient-to-br from-white via-slate-50 to-amber-50/60 p-4 shadow-[0_24px_70px_-28px_rgba(245,158,11,0.35)] sm:p-5"
      data-holiday-admin="true"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-28 -z-10 h-72 w-72 rounded-full bg-gradient-to-br from-amber-300/40 to-orange-300/30 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-24 -z-10 h-72 w-72 rounded-full bg-gradient-to-tr from-emerald-200/40 to-amber-200/30 blur-3xl"
      />
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function HolidayAdminHeader({
  authority,
  name,
}: {
  authority: HolidayAdminOpen["role"];
  name?: string | null;
}) {
  const hod = authority === "hod";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-holiday-header="true">
      <span className={`flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg shadow-amber-500/30 ${GRAD}`}>
        <Calendar className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-base font-bold text-slate-900 [word-spacing:0.14em]" data-holiday-title="true">
        Holiday Manager
      </p>
      {name ? (
        <p className="inline-flex items-center text-sm font-semibold text-slate-600 translate-y-px" data-holiday-actor="true">
          {name}
        </p>
      ) : null}
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow-sm ${
          hod ? "bg-gradient-to-r from-amber-500 to-orange-500" : "bg-gradient-to-r from-emerald-500 to-teal-500"
        }`}
        data-role={authority}
      >
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        {hod ? "HOD of C&IT" : "Authorised delegate"}
      </span>
    </div>
  );
}

export function HolidayTabs<T extends string>({
  tabs,
  tab,
  onTab,
}: {
  tabs: Array<{ id: T; label: string; icon: React.ReactNode; show: boolean }>;
  tab: T;
  onTab: (id: T) => void;
}) {
  return (
    <div role="tablist" aria-label="Holiday Manager tabs" className="flex flex-wrap gap-x-1 border-b border-slate-200/80">
      {tabs
        .filter((t) => t.show)
        .map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`relative -mb-px inline-flex items-center gap-2 rounded-t-xl border-b-[3px] px-4 py-3 text-sm font-semibold transition ${
              tab === t.id
                ? "border-amber-500 bg-gradient-to-t from-amber-50/90 to-transparent text-amber-800"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
    </div>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "error";
  children: React.ReactNode;
}) {
  const ok = tone === "ok";
  const warn = tone === "warn";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-sm ring-1 ${
        ok
          ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
          : warn
          ? "bg-amber-50 text-amber-950 ring-amber-200"
          : "bg-rose-50 text-rose-900 ring-rose-200"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
      ) : warn ? (
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
      )}
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function YearBadge({ view }: { view: HolidayYearView }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-lg bg-emerald-100 px-2 py-1 font-bold text-emerald-800">
        {view.totalHolidays} Holidays Total
      </span>
      <span className="rounded-lg bg-blue-100 px-2 py-1 font-semibold text-blue-800">
        {view.chCount} Closed (CH)
      </span>
      <span className="rounded-lg bg-amber-100 px-2 py-1 font-semibold text-amber-800">
        {view.fhCount} Festival (FH)
      </span>
      <span className="rounded-lg bg-purple-100 px-2 py-1 font-semibold text-purple-800">
        {view.rhCount} Restricted (RH)
      </span>
      <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700">
        {view.rhQuotaCount} Quotas
      </span>
      {view.policyChunkCount > 0 ? (
        <span className="rounded-lg bg-teal-100 px-2 py-1 font-semibold text-teal-800">
          {view.policyChunkCount} AI Search Embeddings
        </span>
      ) : null}
    </div>
  );
}

export function StaleCard({
  who,
  busy,
  onRefresh,
}: {
  who?: { name: string; ticket: string; at: string } | null;
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 shadow-sm ring-1 ring-amber-200">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-amber-950">Holiday data was modified by another administrator</p>
          <p className="text-xs text-amber-800">
            {who
              ? `${who.name} (${who.ticket}) updated this year's holidays on ${DateTime.fromISO(who.at).setZone(IST).setLocale("en-IN").toLocaleString({ dateStyle: "medium", timeStyle: "short" })}.`
              : "The records for this year were changed concurrently. Please reload to inspect the current state."}
          </p>
          <div className="pt-2">
            <button
              type="button"
              className={SECONDARY}
              disabled={busy}
              onClick={onRefresh}
            >
              Reload current year data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PersonRow({
  name,
  nonExecutive,
  children,
  action,
  below,
}: {
  name: string;
  nonExecutive?: boolean;
  children?: React.ReactNode;
  action?: React.ReactNode;
  below?: React.ReactNode;
}) {
  return (
    <li className={`flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-slate-300 ${nonExecutive ? NONEXEC_ROW : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-slate-900">{name}</p>
          {nonExecutive ? <NonExecutiveChip /> : null}
          {children ? <p className="text-xs text-slate-500">{children}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {below ? <div className="pt-1">{below}</div> : null}
    </li>
  );
}

export function ConfirmCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm ring-1 ring-rose-200">
      <div className="flex items-start gap-3">
        {icon}
        <div className="space-y-2 flex-1">
          <p className="text-sm font-bold text-rose-950">{title}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function HistoryList({ history }: { history: HolidayAuditView[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-slate-600">No holiday management changes recorded yet.</p>;
  }

  return (
    <ul className="space-y-2" data-holiday-history="true">
      {history.map((h, idx) => (
        <li
          key={`${h.at}-${idx}`}
          className="rounded-2xl border border-slate-200 bg-white p-3.5 text-xs shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="font-bold text-slate-800">
              {h.actorName} ({h.actorTicket})
            </span>
            <span className="text-slate-400">
              {DateTime.fromISO(h.at)
                .setZone(IST)
                .setLocale("en-IN")
                .toLocaleString({ dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
          <p className="mt-1 font-semibold text-amber-900">
            Action: <span className="uppercase">{h.action}</span> {h.targetId ? `(Year ${h.targetId})` : ""}
          </p>
          {h.note ? <p className="mt-0.5 text-slate-600">{h.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}
