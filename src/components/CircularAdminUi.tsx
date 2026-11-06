"use client";

// src/components/CircularAdminUi.tsx
//
// Presentational UI for the Circular Manager Facility (Modular Facility Kit).
// Matches the visual language of the Employee Manager, PAX Directory Editor,
// and Holiday Manager: glass cards, live validation, underline tabs, sapphire/indigo styling,
// sticky action bars, TypedConfirm integration, and NonExecutive delegation cards.

import React from "react";
import { DateTime } from "luxon";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  Info,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import { IST } from "@/lib/dates";
import { formatCircularTitle } from "@/lib/circularTitle";
import type {
  CircularAdminOpen,
  CircularAuditView,
  CircularDelegateView,
  RecentCircularView,
} from "@/lib/circulars/admin/types";
import { NONEXEC_ROW, NonExecutiveChip } from "./facility/NonExecutive";

const GRAD = "bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-600";
export const FIELD =
  "h-12 w-full rounded-2xl border border-slate-200 bg-white/95 px-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
export const SELECT =
  "h-12 w-full appearance-none rounded-2xl border border-slate-200 bg-white/95 pl-4 pr-11 text-sm font-bold text-slate-900 shadow-sm outline-none transition hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
export const PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:shadow-none";
export const SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
export const DANGER =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:shadow-none";

export function CircularShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Circular Manager"
      className="relative flex flex-col gap-4 rounded-3xl border border-white/60 bg-gradient-to-br from-white/95 via-white/85 to-blue-50/60 p-6 shadow-2xl backdrop-blur-xl"
    >
      {children}
    </section>
  );
}

export function CircularAdminHeader({
  authority,
  name,
}: {
  authority: "hod" | "delegate";
  name?: string | null;
}) {
  const isHod = authority === "hod";
  return (
    <div className="space-y-1.5 border-b border-slate-200/60 pb-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-circular-header="true">
        <span className={`flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg shadow-blue-500/30 ${GRAD}`}>
          <FileText className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-base font-bold text-slate-900 [word-spacing:0.14em]" data-circular-title="true">
          Circular Manager
        </p>
        {name ? (
          <p className="inline-flex items-center text-sm font-semibold text-slate-600 translate-y-px" data-circular-actor="true">
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
        Official circular scanning, OCR embeddings, vectoring and distribution
      </p>
    </div>
  );
}

export function CircularTabs<T extends string>({
  tabs,
  tab,
  onTab,
}: {
  tabs: { id: T; label: string; icon: React.ReactNode; show?: boolean }[];
  tab: T;
  onTab: (tab: T) => void;
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200/80 pb-2" aria-label="Circular Manager Tabs">
      {tabs
        .filter((t) => t.show !== false)
        .map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
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

export function CircularRow({
  item,
  onView,
}: {
  item: RecentCircularView;
  onView?: (id: number) => void;
}) {
  const published = item.publishedAt ? DateTime.fromISO(item.publishedAt).setZone(IST).toFormat("dd MMM yyyy") : "—";
  const uploaded = item.uploadedAt ? DateTime.fromISO(item.uploadedAt).setZone(IST).toFormat("dd MMM yyyy, hh:mm a") : "—";
  const displayTitle = formatCircularTitle(item.headline);

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
            Issue: {published}
          </span>
          {item.pageCount > 0 ? (
            <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              {item.pageCount} page{item.pageCount > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onView?.(item.id)}
          className="text-left font-bold text-slate-900 transition hover:text-blue-600 hover:underline line-clamp-2 cursor-pointer"
        >
          {displayTitle}
        </button>
        <p className="text-xs text-slate-500">
          Posted by {item.authorName || item.authorTicketNo} · {uploaded}
        </p>
      </div>

      <div className="flex shrink-0 items-center pt-2 sm:pt-0">
        <button
          type="button"
          onClick={() => onView?.(item.id)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 cursor-pointer"
        >
          <span>View PDF</span>
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
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
    <li className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/95 p-3.5 shadow-sm ${nonExecutive ? NONEXEC_ROW : ""}`}>
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold text-xs" aria-hidden="true">
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-slate-900">{name}</span>
            {nonExecutive && <NonExecutiveChip />}
          </div>
          <p className="text-xs text-slate-500">{children}</p>
        </div>
      </div>
      {action && <div>{action}</div>}
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
    <div className="rounded-2xl border border-rose-300 bg-rose-50/70 p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        {icon || <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />}
        <div className="space-y-2">
          <p className="text-sm font-bold text-rose-950">{title}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function HistoryList({ history }: { history: CircularAuditView[] }) {
  if (history.length === 0) {
    return <p className="text-xs text-slate-500">No circular audit logs recorded yet.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {history.map((row, idx) => {
        const time = DateTime.fromISO(row.at).setZone(IST).toFormat("dd MMM yyyy, hh:mm a");
        return (
          <li
            key={`${row.at}-${row.actorTicket}-${idx}`}
            className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm text-xs text-slate-700 space-y-1"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 capitalize">
                {row.action === "add" ? "Uploaded Circular" : row.action === "grant" ? "Granted Delegate" : "Withdrew Delegate"}
              </span>
              <span className="text-[11px] text-slate-500">{time}</span>
            </div>
            <p>
              Actor: <span className="font-semibold text-slate-800">{row.actorName} ({row.actorTicket})</span> [{row.actorRole}]
            </p>
            {row.note && <p className="text-slate-600 italic">Note: {row.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}
