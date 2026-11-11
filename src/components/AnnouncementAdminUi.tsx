// src/components/AnnouncementAdminUi.tsx
//
// Presentational UI for the Announcement Manager Facility (Modular Facility Kit).
// Matches the visual language of the Employee Manager, PAX Directory Editor,
// Holiday Manager, and Circular Manager: glass cards, live validation, underline tabs,
// consistent header inline layout, and NonExecutive delegation cards.

import { sanitizeAnnouncementHtml } from "@/lib/announcements/contentProcessing";
import React from "react";
import { DateTime } from "luxon";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit2,
  ExternalLink,
  History,
  Info,
  Megaphone,
  Pencil,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { IST } from "@/lib/dates";
import type {
  AnnouncementAdminOpen,
  AnnouncementAuditView,
  AnnouncementDelegateView,
  AnnouncementItemView,
} from "@/lib/announcements/admin/types";
import { NONEXEC_ROW, NonExecutiveChip } from "./facility/NonExecutive";

const GRAD = "bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-600";
export const FIELD =
  "h-12 w-full rounded-2xl border border-slate-200 bg-white/95 px-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
export const PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:shadow-none";
export const SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
export const DANGER =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:shadow-none";

export function AnnouncementShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Announcement Manager"
      className="relative flex flex-col gap-4 rounded-3xl border border-white/60 bg-gradient-to-br from-white/95 via-white/85 to-blue-50/60 p-6 shadow-2xl backdrop-blur-xl"
    >
      {children}
    </section>
  );
}

export function AnnouncementAdminHeader({
  authority,
  name,
}: {
  authority: "hod" | "delegate";
  name?: string | null;
}) {
  const isHod = authority === "hod";
  return (
    <div className="space-y-1.5 border-b border-slate-200/60 pb-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-announcement-header="true">
        <span className={`flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg shadow-indigo-500/30 ${GRAD}`}>
          <Megaphone className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-base font-bold text-slate-900 [word-spacing:0.14em]" data-announcement-title="true">
          Announcement Manager
        </p>
        {name ? (
          <p className="inline-flex items-center text-sm font-semibold text-slate-600 translate-y-px" data-announcement-actor="true">
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
        Official plant announcements, notices, and instant broadcasts
      </p>
    </div>
  );
}

export function AnnouncementTabs<T extends string>({
  tabs,
  tab,
  onTab,
}: {
  tabs: { id: T; label: string; icon: React.ReactNode; show?: boolean }[];
  tab: T;
  onTab: (tab: T) => void;
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200/80 pb-2" aria-label="Announcement Manager Tabs">
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

export function AnnouncementCard({
  item,
  onEdit,
  onDelete,
  busy,
}: {
  item: AnnouncementItemView;
  onEdit?: (item: AnnouncementItemView) => void;
  onDelete?: (item: AnnouncementItemView) => void;
  busy?: boolean;
}) {
  const formattedDate = DateTime.fromISO(item.date).setZone(IST).toFormat("dd MMM yyyy, hh:mm a");

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800">
            {formattedDate}
          </span>
          <span className="text-xs text-slate-500">
            by <span className="font-semibold text-slate-700">{item.authorName || item.authorTicketNo}</span>
          </span>
        </div>

        {item.canEdit && (
          <div className="flex items-center gap-1.5">
            {item.hoursLeft > 0 && (
              <span className="text-[10px] text-slate-400 font-medium mr-1">
                {item.hoursLeft}h left to edit
              </span>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(item)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 cursor-pointer disabled:opacity-50"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(item)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
        {item.content ? (
          <div
            className="prose prose-sm max-w-none text-xs text-slate-600 line-clamp-3"
            dangerouslySetInnerHTML={{ __html: sanitizeAnnouncementHtml(item.content) }} /* sanitised again on render, as in AnnouncementModal: a row saved before the sanitiser existed, or inserted by SQL, must never inject markup */
          />
        ) : item.contentText ? (
          <p className="text-xs text-slate-600 line-clamp-3">{item.contentText}</p>
        ) : null}
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

export function HistoryList({ history }: { history: AnnouncementAuditView[] }) {
  if (history.length === 0) {
    return <p className="text-xs text-slate-500">No announcement audit logs recorded yet.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {history.map((row, idx) => {
        const time = DateTime.fromISO(row.at).setZone(IST).toFormat("dd MMM yyyy, hh:mm a");
        const actionLabel =
          row.action === "add"
            ? "Published Announcement"
            : row.action === "modify"
            ? "Updated Announcement"
            : row.action === "delete"
            ? "Deleted Announcement"
            : row.action === "grant"
            ? "Granted Delegate"
            : "Withdrew Delegate";

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
            {row.note && <p className="text-slate-600 italic">Note: {row.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}
