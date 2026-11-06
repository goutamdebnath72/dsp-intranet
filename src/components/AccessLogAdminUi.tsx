// src/components/AccessLogAdminUi.tsx
//
// Presentational UI for Contact Access Log Facility (Modular Facility Kit).
// Matches the visual language of the Employee Manager, PAX Directory Editor,
// Holiday Manager, Circular Manager, and Announcement Manager.

import React from "react";
import { DateTime } from "luxon";
import {
  AlertCircle,
  AlertTriangle,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Eye,
  History,
  Info,
  Mail,
  Phone,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { IST } from "@/lib/dates";
import type {
  AccessLogAuditView,
  AccessLogDelegateView,
  AccessLogRowView,
  AccessLogStatsView,
} from "@/lib/accessLog/admin/types";
import { NONEXEC_ROW, NonExecutiveChip } from "./facility/NonExecutive";

const GRAD = "bg-gradient-to-br from-blue-700 via-indigo-600 to-sky-600";
export const FIELD =
  "h-10 w-full rounded-2xl border border-slate-200 bg-white/95 px-3.5 text-xs text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
export const PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-500/25 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:shadow-none cursor-pointer";
export const SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
export const DANGER =
  "inline-flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-rose-500/30 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:shadow-none cursor-pointer";

export function AccessLogShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Contact Access Log"
      className="relative flex flex-col gap-4 rounded-3xl border border-white/60 bg-gradient-to-br from-white/95 via-white/85 to-blue-50/50 p-6 shadow-2xl backdrop-blur-xl"
    >
      {children}
    </section>
  );
}

export function AccessLogAdminHeader({
  authority,
  name,
}: {
  authority: "hod" | "delegate";
  name?: string | null;
}) {
  const isHod = authority === "hod";
  return (
    <div className="space-y-1.5 border-b border-slate-200/60 pb-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-accesslog-header="true">
        <span className={`flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg shadow-indigo-500/30 ${GRAD}`}>
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-base font-bold text-slate-900 [word-spacing:0.14em]" data-accesslog-title="true">
          Contact Access Log
        </p>
        {name ? (
          <p className="inline-flex items-center text-sm font-semibold text-slate-600 translate-y-px" data-accesslog-actor="true">
            {name}
          </p>
        ) : null}
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow-sm ${
            isHod ? "bg-gradient-to-r from-amber-500 to-orange-500" : "bg-gradient-to-r from-emerald-500 to-teal-500"
          }`}
          data-role={authority}
        >
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {isHod ? "HOD of C&IT" : "Authorised delegate"}
        </span>
      </div>
      <p className="text-xs font-medium text-slate-500 pl-13">
        Audit, inspection, and tracking of employee contact reveals and copies
      </p>
    </div>
  );
}

export function AccessLogTabs<T extends string>({
  tabs,
  tab,
  onTab,
}: {
  tabs: { id: T; label: string; icon: React.ReactNode; show?: boolean }[];
  tab: T;
  onTab: (tab: T) => void;
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200/80 pb-2" aria-label="Access Log Tabs">
      {tabs
        .filter((t) => t.show !== false)
        .map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                active
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
    </nav>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "error";
  children: React.ReactNode;
}) {
  const styles =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50/80 text-emerald-900"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50/80 text-amber-900"
      : "border-rose-200 bg-rose-50/80 text-rose-900";
  const Icon = tone === "ok" ? CheckCircle2 : AlertCircle;

  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border p-3.5 text-xs ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function StatsCard({
  label,
  value,
  sublabel,
  icon: Icon,
  color = "blue",
}: {
  label: string;
  value: number;
  sublabel?: string;
  icon: React.ElementType;
  color?: "blue" | "emerald" | "indigo" | "amber" | "slate";
}) {
  const colorMap = {
    blue: "bg-blue-50 border-blue-200 text-blue-700 icon-blue",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700 icon-emerald",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700 icon-indigo",
    amber: "bg-amber-50 border-amber-200 text-amber-700 icon-amber",
    slate: "bg-slate-50 border-slate-200 text-slate-700 icon-slate",
  };

  return (
    <div className={`flex items-center gap-3.5 rounded-2xl border p-3 shadow-xs ${colorMap[color]}`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-xs">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-base font-extrabold text-slate-900">{value.toLocaleString()}</p>
        {sublabel && <p className="text-[10px] text-slate-500">{sublabel}</p>}
      </div>
    </div>
  );
}

export function LogRow({ row }: { row: AccessLogRowView }) {
  const time = DateTime.fromISO(row.accessedAt).setZone(IST).toFormat("dd MMM yyyy, hh:mm:ss a");
  const isCopy = row.action.toLowerCase() === "copy";
  const isEmail = row.field.toLowerCase() === "email";

  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 shadow-xs transition hover:border-blue-300 hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-500">
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-medium text-slate-600">{time}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Action badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              isCopy
                ? "border border-purple-200 bg-purple-50 text-purple-700"
                : "border border-sky-200 bg-sky-50 text-sky-700"
            }`}
          >
            {isCopy ? <Copy className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
            {isCopy ? "Copied" : "Revealed"}
          </span>

          {/* Field badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              isEmail
                ? "border border-amber-200 bg-amber-50 text-amber-700"
                : "border border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {isEmail ? <Mail className="h-2.5 w-2.5" /> : <Phone className="h-2.5 w-2.5" />}
            {isEmail ? "Email" : "Mobile"}
          </span>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Viewer */}
        <div className="flex items-start gap-2.5 rounded-xl bg-slate-50/70 p-3 border border-slate-200/80">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 border border-slate-200 shadow-xs">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Viewer</span>
              <span className="font-mono text-[10px] font-bold text-slate-600 bg-white px-1.5 py-0.5 rounded-md border border-slate-200 shadow-xs">
                #{row.viewerTicketNo}
              </span>
            </div>
            <p className="truncate font-bold text-slate-900 text-xs">
              {row.viewerName || "Unknown"}
            </p>
            <div className="flex flex-col gap-0.5 pt-0.5 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-600">
                <Briefcase className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate font-medium">{row.viewerDesignation || "Designation not recorded"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600">
                <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate font-medium">{row.viewerDepartment || "Department not recorded"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Viewed Employee */}
        <div className="flex items-start gap-2.5 rounded-xl bg-blue-50/40 p-3 border border-blue-200/70">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 border border-blue-200 shadow-xs">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Viewed Contact</span>
              <span className="font-mono text-[10px] font-bold text-blue-700 bg-white px-1.5 py-0.5 rounded-md border border-blue-200 shadow-xs">
                #{row.viewedTicketNo || "—"}
              </span>
            </div>
            <p className="truncate font-bold text-slate-900 text-xs">
              {row.viewedName || "Unknown Employee"}
            </p>
            <div className="flex flex-col gap-0.5 pt-0.5 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-700">
                <Briefcase className="h-3 w-3 shrink-0 text-blue-500" />
                <span className="truncate font-medium">{row.viewedDesignation || "Designation not recorded"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-700">
                <Building2 className="h-3 w-3 shrink-0 text-blue-500" />
                <span className="truncate font-medium">{row.viewedDepartment || "Department not recorded"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PersonRow({
  name,
  nonExecutive,
  action,
  children,
}: {
  name: string;
  nonExecutive?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className={NONEXEC_ROW}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-slate-900">{name}</p>
          {nonExecutive && <NonExecutiveChip />}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">{children}</div>
      </div>
      {action && <div className="ml-3 shrink-0">{action}</div>}
    </li>
  );
}

export function ConfirmCard({
  title,
  body,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  busy = false,
}: {
  title: string;
  body: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  busy?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm">
      <h4 className="text-sm font-bold text-rose-950">{title}</h4>
      <div className="mt-1 text-xs text-rose-800">{body}</div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={SECONDARY}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={DANGER}>
          {busy ? "Processing…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

export function HistoryList({ history }: { history: AccessLogAuditView[] }) {
  if (history.length === 0) {
    return <p className="text-xs text-slate-500">No access log audit logs recorded yet.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {history.map((row, idx) => {
        const time = DateTime.fromISO(row.at).setZone(IST).toFormat("dd MMM yyyy, hh:mm a");
        const actionLabel =
          row.action === "grant"
            ? "Granted Access Log Authority"
            : row.action === "revoke"
            ? "Withdrew Access Log Authority"
            : row.action;

        return (
          <li
            key={`${row.at}-${row.actorTicket}-${idx}`}
            className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm text-xs text-slate-700 space-y-1"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 capitalize">{actionLabel}</span>
              <span className="text-[11px] text-slate-500">{time}</span>
            </div>
            <p>
              Actor: <span className="font-semibold text-slate-800">{row.actorName} ({row.actorTicket})</span> [{row.actorRole}]
            </p>
            {row.targetTicket && (
              <p>
                Target: <span className="font-semibold text-slate-800">{row.targetName || row.targetTicket} ({row.targetTicket})</span>
              </p>
            )}
            {row.note && <p className="text-slate-600 italic">Note: {row.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}
