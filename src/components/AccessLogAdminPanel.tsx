"use client";

// src/components/AccessLogAdminPanel.tsx
//
// CONTACT ACCESS LOG FACILITY PANEL (Modular Facility Kit).
// Renders inside the Omnibar modal answer area when an authorised user asks to inspect contact access logs.
// Features:
//   - Filterable & searchable audit log of all contact reveals and copies (mobile / email)
//   - Live summary statistics cards (Total events, reveals, copies, mobile, email, unique viewers)
//   - Date range presets (Today, Last 7 Days, Last 30 Days, All time)
//   - Authorise / Revoke delegates strictly restricted to Executives (allowNonExecutive: false)
//   - Append-only Facility Audit trail from public.facility_audit

import React, { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  Copy,
  Eye,
  Filter,
  History,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { DateTime } from "luxon";
import { IST } from "@/lib/dates";
import type {
  AccessLogAdminOpen,
  AccessLogAuditView,
  AccessLogDelegateView,
  AccessLogRowView,
  AccessLogStatsView,
} from "@/lib/accessLog/admin/types";
import {
  AccessLogAdminHeader,
  AccessLogShell,
  AccessLogTabs,
  ConfirmCard,
  DANGER,
  FIELD,
  HistoryList,
  LogRow,
  Notice,
  PersonRow,
  PRIMARY,
  SECONDARY,
  StatsCard,
} from "./AccessLogAdminUi";

type Tab = "logs" | "people" | "history";

const REQUEST_TIMEOUT_MS = 25_000;

async function call(payload: Record<string, any>): Promise<{ ok: boolean; status: number; body: any }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("/api/access-log/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
      signal: ctl.signal,
    });
    let body: any = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: "The network did not answer. Please try again." } };
  } finally {
    clearTimeout(timer);
  }
}

const tabFor = (op: AccessLogAdminOpen["op"]): Tab => {
  if (op === "delegate") return "people";
  if (op === "history") return "history";
  return "logs";
};

export function AccessLogAdminPanel({ open }: { open: AccessLogAdminOpen }) {
  const isHod = open.role === "hod";
  const [tab, setTab] = useState<Tab>(tabFor(open.op));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  // --------------------------------------------------------------------------
  // Tab 1: Access Logs State & Filters
  // --------------------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState(open.prefill?.viewer || open.prefill?.viewed || "");
  const [actionFilter, setActionFilter] = useState<"all" | "reveal" | "copy">(open.prefill?.action || "all");
  const [fieldFilter, setFieldFilter] = useState<"all" | "mobile" | "email">(open.prefill?.field || "all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  const [rows, setRows] = useState<AccessLogRowView[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<AccessLogStatsView>({
    total: 0,
    reveals: 0,
    copies: 0,
    mobileCount: 0,
    emailCount: 0,
    uniqueViewers: 0,
  });
  const [loadingLogs, setLoadingLogs] = useState(false);

  // --------------------------------------------------------------------------
  // Tab 2: Delegation State (HOD only)
  // --------------------------------------------------------------------------
  const [delegates, setDelegates] = useState<AccessLogDelegateView[]>([]);
  const [personSearch, setPersonSearch] = useState("");
  const [peopleFound, setPeopleFound] = useState<
    Array<{ ticket: string; name: string; designation: string; department: string; nonExecutive: boolean }>
  >([]);
  const [personToRevoke, setPersonToRevoke] = useState<AccessLogDelegateView | null>(null);

  // --------------------------------------------------------------------------
  // Tab 3: History State
  // --------------------------------------------------------------------------
  const [history, setHistory] = useState<AccessLogAuditView[]>([]);

  // --------------------------------------------------------------------------
  // Fetch Functions
  // --------------------------------------------------------------------------
  const fetchLogs = useCallback(
    async (targetPage = page) => {
      setLoadingLogs(true);
      try {
        const payload: Record<string, any> = {
          op: "logs",
          page: targetPage,
          pageSize,
        };

        if (searchQuery.trim()) {
          // If query looks like ticket or name, search viewer
          payload.viewer = searchQuery.trim();
        }
        if (actionFilter !== "all") {
          payload.action = actionFilter;
        }
        if (fieldFilter !== "all") {
          payload.field = fieldFilter;
        }
        if (fromDate) payload.from = fromDate;
        if (toDate) payload.to = toDate;

        const res = await call(payload);
        if (res.ok) {
          setRows(res.body.rows || []);
          setTotal(res.body.total || 0);
          setTotalPages(res.body.totalPages || 1);
          if (res.body.stats) setStats(res.body.stats);
        } else {
          setNotice({ tone: "error", text: res.body.error || "Failed to load access logs." });
        }
      } catch {
        setNotice({ tone: "error", text: "Error loading contact access logs." });
      } finally {
        setLoadingLogs(false);
      }
    },
    [searchQuery, actionFilter, fieldFilter, fromDate, toDate, page, pageSize],
  );

  const fetchDelegates = useCallback(async () => {
    if (!isHod) return;
    try {
      const res = await call({ op: "delegates" });
      if (res.ok) {
        setDelegates(res.body.delegates || []);
      }
    } catch {
      // ignore
    }
  }, [isHod]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await call({ op: "audit" });
      if (res.ok) {
        setHistory(res.body.audit || []);
      }
    } catch {
      // ignore
    }
  }, []);

  // Initial tab loading
  useEffect(() => {
    if (tab === "logs") {
      fetchLogs(1);
    } else if (tab === "people") {
      fetchDelegates();
    } else if (tab === "history") {
      fetchHistory();
    }
  }, [tab, fetchLogs, fetchDelegates, fetchHistory]);

  // Executive search debounce
  useEffect(() => {
    if (tab !== "people" || !personSearch.trim()) {
      setPeopleFound([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await call({ op: "find-executive", q: personSearch.trim() });
      if (res.ok) {
        setPeopleFound(res.body.executives || []);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [tab, personSearch]);

  // Date range presets helper
  const applyPreset = (preset: "today" | "week" | "month" | "all") => {
    const now = DateTime.now().setZone(IST);
    if (preset === "today") {
      const d = now.toISODate() ?? "";
      setFromDate(d);
      setToDate(d);
    } else if (preset === "week") {
      setFromDate(now.minus({ days: 7 }).toISODate() ?? "");
      setToDate(now.toISODate() ?? "");
    } else if (preset === "month") {
      setFromDate(now.minus({ days: 30 }).toISODate() ?? "");
      setToDate(now.toISODate() ?? "");
    } else {
      setFromDate("");
      setToDate("");
    }
    setPage(1);
  };

  // Delegation Actions
  const handleGrant = async (target: { ticket: string; name: string; nonExecutive: boolean }) => {
    if (target.nonExecutive) {
      setNotice({
        tone: "error",
        text: "Under C&IT privacy guidelines, the Contact Access Log cannot be delegated to non-executives.",
      });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const res = await call({
        op: "grant",
        ticket: target.ticket,
        name: target.name,
      });

      if (res.ok && res.body.result?.status === "ok") {
        setNotice({ tone: "ok", text: `Successfully authorised ${target.name} (${target.ticket}) for Contact Access Log.` });
        setPersonSearch("");
        setPeopleFound([]);
        await fetchDelegates();
      } else {
        setNotice({
          tone: "error",
          text: res.body.result?.reason || res.body.error || "Failed to grant authority.",
        });
      }
    } catch {
      setNotice({ tone: "error", text: "Network error while granting authority." });
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!personToRevoke) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await call({ op: "revoke", ticket: personToRevoke.ticket });
      if (res.ok && res.body.result?.status === "ok") {
        setNotice({ tone: "ok", text: `Authority for ${personToRevoke.name} has been withdrawn.` });
        setPersonToRevoke(null);
        await fetchDelegates();
      } else {
        setNotice({ tone: "error", text: res.body.error || "Failed to withdraw authority." });
      }
    } catch {
      setNotice({ tone: "error", text: "Network error while revoking authority." });
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { id: "logs" as const, label: "Access Logs", icon: <ShieldCheck className="h-4 w-4" /> },
    { id: "people" as const, label: "Authorise", icon: <Users className="h-4 w-4" />, show: isHod },
    { id: "history" as const, label: "History", icon: <History className="h-4 w-4" /> },
  ];

  return (
    <AccessLogShell>
      <AccessLogAdminHeader authority={open.role} name={open.name} />

      <AccessLogTabs tabs={tabs} tab={tab} onTab={(t) => setTab(t)} />

      {notice && (
        <Notice tone={notice.tone}>
          <div className="flex items-center justify-between gap-2">
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/50 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </Notice>
      )}

      {/* ================================================================== */}
      {/* Tab 1: Access Logs                                                 */}
      {/* ================================================================== */}
      {tab === "logs" && (
        <div className="space-y-4">
          {/* Summary Statistics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <StatsCard
              label="Total Access"
              value={stats.total}
              icon={ShieldCheck}
              color="blue"
            />
            <StatsCard
              label="Reveals"
              value={stats.reveals}
              icon={Eye}
              color="slate"
            />
            <StatsCard
              label="Copies"
              value={stats.copies}
              icon={Copy}
              color="indigo"
            />
            <StatsCard
              label="Mobile Lookups"
              value={stats.mobileCount}
              icon={Phone}
              color="emerald"
            />
            <StatsCard
              label="Email Lookups"
              value={stats.emailCount}
              icon={Mail}
              color="amber"
            />
            <StatsCard
              label="Unique Viewers"
              value={stats.uniqueViewers}
              icon={Users}
              color="blue"
            />
          </div>

          {/* Filter Bar */}
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3.5 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
              {/* Search input */}
              <div className="sm:col-span-5 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by name, ticket, designation, department…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setPage(1);
                      fetchLogs(1);
                    }
                  }}
                  className={`${FIELD} pl-9`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Action Filter */}
              <div className="sm:col-span-3 flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setActionFilter("all");
                    setPage(1);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-center transition cursor-pointer ${
                    actionFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  All Actions
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionFilter("reveal");
                    setPage(1);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-center transition cursor-pointer ${
                    actionFilter === "reveal" ? "bg-white text-sky-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Reveals
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionFilter("copy");
                    setPage(1);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-center transition cursor-pointer ${
                    actionFilter === "copy" ? "bg-white text-purple-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Copies
                </button>
              </div>

              {/* Field Filter */}
              <div className="sm:col-span-3 flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setFieldFilter("all");
                    setPage(1);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-center transition cursor-pointer ${
                    fieldFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  All Fields
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFieldFilter("mobile");
                    setPage(1);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-center transition cursor-pointer ${
                    fieldFilter === "mobile" ? "bg-white text-emerald-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Mobile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFieldFilter("email");
                    setPage(1);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-center transition cursor-pointer ${
                    fieldFilter === "email" ? "bg-white text-amber-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Email
                </button>
              </div>

              {/* Refresh / Apply Button */}
              <div className="sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setPage(1);
                    fetchLogs(1);
                  }}
                  disabled={loadingLogs}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 transition cursor-pointer disabled:opacity-50"
                  title="Refresh access logs"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingLogs ? "animate-spin text-blue-600" : ""}`} />
                </button>
              </div>
            </div>

            {/* Date Range Row */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-500">Date Range:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
                />
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset("today")}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("week")}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Last 7 Days
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("month")}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Last 30 Days
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("all")}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  All
                </button>
              </div>
            </div>
          </div>

          {/* Results List */}
          {loadingLogs ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
              <p className="mt-2 text-xs font-medium">Loading contact access records…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 py-12 text-center">
              <ShieldAlert className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-bold text-slate-700">No contact access events found</p>
              <p className="text-xs text-slate-400">Try adjusting your filters, search term, or date range.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>
                  Showing {rows.length} of {total.toLocaleString()} total logged events
                </span>
                <span>
                  Page {page} of {totalPages}
                </span>
              </div>

              {rows.map((row) => (
                <LogRow key={row.id} row={row} />
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.max(1, page - 1);
                      setPage(next);
                      fetchLogs(next);
                    }}
                    disabled={page <= 1 || loadingLogs}
                    className={SECONDARY}
                  >
                    Previous
                  </button>
                  <span className="text-xs font-semibold text-slate-600 px-3">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.min(totalPages, page + 1);
                      setPage(next);
                      fetchLogs(next);
                    }}
                    disabled={page >= totalPages || loadingLogs}
                    className={SECONDARY}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* Tab 2: Authorise (HOD-only)                                        */}
      {/* ================================================================== */}
      {tab === "people" && isHod && (
        <div className="space-y-4">
          {/* Safeguard Alert */}
          <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900">
            <ShieldAlert className="h-5 w-5 shrink-0 text-blue-600 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Executive Authority Restriction</p>
              <p className="text-blue-800">
                The Contact Access Log contains confidential employee privacy audit records. Under C&IT security
                governance, this facility can strictly be delegated to <span className="font-bold">Executives</span> (ticket numbers beginning with 4). Non-executives cannot be authorized.
              </p>
            </div>
          </div>

          {/* Search to Delegate */}
          <div className="space-y-2">
            <label htmlFor="access-log-exec-search" className="block text-xs font-bold text-slate-700">
              Authorise Executive
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="access-log-exec-search"
                type="text"
                placeholder="Type executive name or 6-digit ticket (e.g. 4xxxxx)…"
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                className={`${FIELD} pl-9.5`}
              />
            </div>

            {/* Found People */}
            {peopleFound.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
                {peopleFound.map((p) => (
                  <PersonRow
                    key={p.ticket}
                    name={p.name}
                    nonExecutive={p.nonExecutive}
                    action={
                      p.nonExecutive ? (
                        <span className="text-[11px] font-semibold text-rose-600 italic">
                          Non-executive (restricted)
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleGrant(p)}
                          disabled={busy}
                          className={PRIMARY}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Authorise
                        </button>
                      )
                    }
                  >
                    Ticket {p.ticket} · {p.designation || "Executive"} · {p.department}
                  </PersonRow>
                ))}
              </ul>
            )}
          </div>

          {/* Confirmation to Revoke */}
          {personToRevoke && (
            <ConfirmCard
              title={`Withdraw authority from ${personToRevoke.name}?`}
              body={
                <p>
                  This executive ({personToRevoke.ticket}) will immediately lose permission to access or view contact privacy logs.
                </p>
              }
              confirmLabel="Yes, withdraw"
              onConfirm={handleRevoke}
              onCancel={() => setPersonToRevoke(null)}
              busy={busy}
            />
          )}

          {/* Current Delegates */}
          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Active Authorised Executives ({delegates.length})
            </h3>
            {delegates.length === 0 ? (
              <p className="text-xs text-slate-500">No delegates currently authorised. Only the HOD can view the contact access log.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
                {delegates.map((d) => (
                  <PersonRow
                    key={d.ticket}
                    name={d.name}
                    nonExecutive={d.nonExecutive}
                    action={
                      <button
                        type="button"
                        onClick={() => setPersonToRevoke(d)}
                        disabled={busy}
                        className={DANGER}
                      >
                        Revoke
                      </button>
                    }
                  >
                    Ticket {d.ticket} · Authorised on{" "}
                    {d.grantedAt
                      ? DateTime.fromISO(d.grantedAt).setZone(IST).toFormat("dd MMM yyyy, hh:mm a")
                      : "—"}
                  </PersonRow>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Tab 3: History                                                     */}
      {/* ================================================================== */}
      {tab === "history" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Facility Audit Trail
            </h3>
            <button
              type="button"
              onClick={fetchHistory}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
          <HistoryList history={history} />
        </div>
      )}
    </AccessLogShell>
  );
}
