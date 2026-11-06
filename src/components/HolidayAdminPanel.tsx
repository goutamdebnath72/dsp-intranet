"use client";

// src/components/HolidayAdminPanel.tsx
//
// HOLIDAY MANAGER FACILITY PANEL (Modular Facility Kit).
// Renders inside the Omnibar modal answer area when an authorised user asks to manage holidays.
// Features:
//   - Seed Year from verified JSON / TXT file (or direct paste)
//   - Clear Year protected by TypedConfirm (lost-update guarded)
//   - Pending Circular Extraction Staging review (1-click Confirm / Reject)
//   - Authorise / Revoke delegates with NonExecutive confirmation (HOD-only)
//   - Complete History audit trail from public.facility_audit

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  History,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import { HOLIDAY_REVIEW_YEAR_MIN, HOLIDAY_REVIEW_YEAR_MAX } from "@/lib/constants";
import type {
  HolidayAdminOpen,
  HolidayAuditView,
  HolidayDelegateView,
  HolidayYearView,
} from "@/lib/holidays/admin/types";
import { TypedConfirm } from "./facility/TypedConfirm";
import { NonExecutiveAsk } from "./facility/NonExecutive";
import {
  CONFIRM_INPUT,
  ConfirmCard,
  DANGER,
  FIELD,
  HistoryList,
  HolidayAdminHeader,
  HolidayShell,
  HolidayTabs,
  Notice,
  PRIMARY,
  PersonRow,
  SECONDARY,
  SELECT,
  StaleCard,
  YearBadge,
  YearSelect,
} from "./HolidayAdminUi";

type Tab = "seed" | "clear" | "people" | "history";

const ALL_REVIEW_YEARS = Array.from(
  { length: HOLIDAY_REVIEW_YEAR_MAX - HOLIDAY_REVIEW_YEAR_MIN + 1 },
  (_, i) => HOLIDAY_REVIEW_YEAR_MAX - i,
);

const REQUEST_TIMEOUT_MS = 25_000;

async function call(payload: Record<string, any>): Promise<{ ok: boolean; status: number; body: any }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("/api/holidays/admin", {
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

const tabFor = (op: HolidayAdminOpen["op"]): Tab => {
  if (op === "clear") return "clear";
  if (op === "delegate") return "people";
  if (op === "history") return "history";
  return "seed";
};

export function HolidayAdminPanel({ open }: { open: HolidayAdminOpen }) {
  const isHod = open.role === "hod";
  const [tab, setTab] = useState<Tab>(tabFor(open.op));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  // Year state
  const currentYear = new Date().getFullYear();
  const [years, setYears] = useState<number[]>(ALL_REVIEW_YEARS);
  const [selectedYear, setSelectedYear] = useState<number>(open.prefill?.year ?? currentYear);
  const [yearView, setYearView] = useState<HolidayYearView | null>(null);
  const [yearLoading, setYearLoading] = useState(false);
  const [stale, setStale] = useState<boolean>(false);

  // Seed / Upload tab
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear Year tab
  const [typedConfirmClear, setTypedConfirmClear] = useState("");

  // People / Authorise tab
  const [delegates, setDelegates] = useState<HolidayDelegateView[] | null>(null);
  const [who, setWho] = useState("");
  const [foundPeople, setFoundPeople] = useState<any[] | null>(null);
  const [revoking, setRevoking] = useState<HolidayDelegateView | null>(null);
  const [askingNonExec, setAskingNonExec] = useState<string | null>(null);

  // History tab
  const [history, setHistory] = useState<HolidayAuditView[] | null>(null);

  // ---------------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------------

  const loadYears = useCallback(async () => {
    const res = await call({ op: "years" });
    if (res.ok && Array.isArray(res.body?.years)) {
      const merged = Array.from(new Set([...res.body.years, ...ALL_REVIEW_YEARS])).sort((a, b) => b - a);
      setYears(merged);
    }
  }, []);

  const loadYearView = useCallback(async (year: number) => {
    setYearLoading(true);
    const res = await call({ op: "year-view", year });
    setYearLoading(false);
    if (res.ok && res.body?.yearView) {
      setYearView(res.body.yearView);
      setStale(false);
    } else {
      setYearView({
        year,
        totalHolidays: 0,
        chCount: 0,
        fhCount: 0,
        rhCount: 0,
        rhQuotaCount: 0,
        policyChunkCount: 0,
        version: "",
        lastChange: null,
      });
      setStale(false);
    }
  }, []);

  const onSelectYear = (yr: number) => {
    setSelectedYear(yr);
    setTypedConfirmClear("");
    setNotice(null);
    void loadYearView(yr);
  };

  const loadDelegates = useCallback(async () => {
    if (!isHod) return;
    const res = await call({ op: "delegates" });
    if (res.ok && Array.isArray(res.body?.delegates)) {
      setDelegates(res.body.delegates);
    }
  }, [isHod]);

  const loadHistory = useCallback(async () => {
    const res = await call({ op: "audit" });
    if (res.ok && Array.isArray(res.body?.history)) {
      setHistory(res.body.history);
    }
  }, []);

  useEffect(() => {
    loadYears();
    loadYearView(selectedYear);
  }, [loadYears, loadYearView, selectedYear]);

  useEffect(() => {
    if (tab === "people" && isHod && delegates === null) {
      loadDelegates();
    }
    if (tab === "history" && history === null) {
      loadHistory();
    }
  }, [tab, isHod, delegates, history, loadDelegates, loadHistory]);

  // ---------------------------------------------------------------------------
  // Seed Operation
  // ---------------------------------------------------------------------------

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  };

  const readFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result ?? "");
      setRawText(content);
      setNotice(null);
    };
    reader.readAsText(file);
  };

  const submitSeed = async () => {
    if (!rawText.trim() || busy) return;
    setBusy(true);
    setNotice(null);

    const res = await call({
      op: "seed",
      content: rawText,
      year: selectedYear,
      version: yearView?.version,
    });

    setBusy(false);

    if (!res.ok) {
      setNotice({ tone: "error", text: res.body?.error || "Failed to seed holiday year." });
      return;
    }

    const r = res.body?.result;
    if (r?.status === "stale") {
      setStale(true);
      if (r.current) setYearView(r.current);
      setNotice({
        tone: "warn",
        text: "The holiday data for this year was changed concurrently by another administrator.",
      });
      return;
    }

    if (r?.status === "invalid") {
      setNotice({ tone: "error", text: r.reason });
      return;
    }

    if (r?.status === "ok") {
      setNotice({
        tone: "ok",
        text: `Successfully seeded ${r.holidayCount} holidays, ${r.rhQuotaCount} RH quotas, and generated ${r.policyChunkCount} search embeddings for year ${r.year}.`,
      });
      setRawText("");
      setFileName(null);
      loadYearView(selectedYear);
      loadYears();
      loadHistory();
    }
  };

  // ---------------------------------------------------------------------------
  // Clear Year Operation
  // ---------------------------------------------------------------------------

  const submitClearYear = async () => {
    if (typedConfirmClear.trim().toUpperCase() !== "CLEAR" || busy) return;
    setBusy(true);
    setNotice(null);

    const res = await call({
      op: "clear",
      year: selectedYear,
      version: yearView?.version,
    });

    setBusy(false);

    if (!res.ok) {
      setNotice({ tone: "error", text: res.body?.error || "Failed to clear holiday year." });
      return;
    }

    const r = res.body?.result;
    if (r?.status === "stale") {
      setStale(true);
      if (r.current) setYearView(r.current);
      setNotice({
        tone: "warn",
        text: "This year's holiday data was changed concurrently. Please review before clearing.",
      });
      return;
    }

    if (r?.status === "ok") {
      setNotice({
        tone: "ok",
        text: `Cleared holiday data for year ${r.year} (${r.holidaysRemoved} holidays and quotas removed).`,
      });
      setTypedConfirmClear("");
      loadYearView(selectedYear);
      loadYears();
      loadHistory();
    }
  };

  // ---------------------------------------------------------------------------
  // Delegation Actions (HOD-only)
  // ---------------------------------------------------------------------------

  const searchPeople = async () => {
    if (!who.trim() || busy) return;
    setBusy(true);
    const res = await call({ op: "find-executive", q: who.trim() });
    setBusy(false);
    if (res.ok) {
      setFoundPeople(res.body?.executives ?? []);
    }
  };

  const grantDelegateAuthority = async (ticket: string, confirmNonExec = false) => {
    if (busy) return;
    setBusy(true);
    const res = await call({ op: "grant", ticket, confirmNonExecutive: confirmNonExec });
    setBusy(false);
    setAskingNonExec(null);

    if (res.ok) {
      const r = res.body?.result;
      if (r?.status === "ok") {
        setNotice({ tone: "ok", text: `Authorised ${ticket} to manage holidays.` });
        setWho("");
        setFoundPeople(null);
        loadDelegates();
        loadHistory();
      } else if (r?.status === "needs-confirmation") {
        setAskingNonExec(ticket);
      } else if (r?.reason) {
        setNotice({ tone: "error", text: r.reason });
      }
    }
  };

  const confirmRevokeDelegate = async () => {
    if (!revoking || busy) return;
    setBusy(true);
    const res = await call({ op: "revoke", ticket: revoking.ticket });
    setBusy(false);

    if (res.ok && res.body?.result?.status === "ok") {
      setNotice({ tone: "ok", text: `Withdrew holiday management authority from ${revoking.name} (${revoking.ticket}).` });
      setRevoking(null);
      loadDelegates();
      loadHistory();
    } else {
      setNotice({ tone: "error", text: res.body?.error || "Failed to withdraw authority." });
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const tabs = [
    { id: "seed" as Tab, label: "Seed / Upload", icon: <UploadCloud className="h-4 w-4" />, show: true },
    { id: "clear" as Tab, label: "Clear Year", icon: <Trash2 className="h-4 w-4" />, show: true },
    { id: "people" as Tab, label: "Authorise", icon: <ShieldCheck className="h-4 w-4" />, show: isHod },
    { id: "history" as Tab, label: "History", icon: <History className="h-4 w-4" />, show: true },
  ];

  return (
    <HolidayShell>
      <HolidayAdminHeader authority={open.role} name={open.name} />

      <HolidayTabs tabs={tabs} tab={tab} onTab={(t) => { setTab(t); setNotice(null); }} />

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {stale ? <StaleCard busy={busy} onRefresh={() => loadYearView(selectedYear)} /> : null}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 1: SEED / UPLOAD                                                */}
      {/* ------------------------------------------------------------------- */}
      {tab === "seed" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="holiday-seed-year" className="mb-1 block text-xs font-bold text-slate-700">
                Target Holiday Year
              </label>
              <YearSelect
                id="holiday-seed-year"
                value={selectedYear}
                years={years}
                onChange={onSelectYear}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col justify-end">
              {yearLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-2.5 text-xs text-slate-500 shadow-sm">
                  Loading database records for {selectedYear}…
                </div>
              ) : yearView && yearView.totalHolidays > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
                  <p className="mb-1 text-[11px] font-bold text-slate-500">Currently in Database ({selectedYear}):</p>
                  <YearBadge view={yearView} />
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-2.5 text-xs text-slate-400">
                  No holidays currently seeded for year {selectedYear}.
                </div>
              )}
            </div>
          </div>

          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-6 text-center transition hover:border-amber-400 hover:bg-amber-100/50"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.txt"
              onChange={handleFileSelect}
              className="hidden"
            />
            <UploadCloud className="mb-2 h-8 w-8 text-amber-600" aria-hidden="true" />
            <p className="text-sm font-bold text-amber-950">
              {fileName ? fileName : "Drag & drop official holiday file (.txt or .json)"}
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Upload the verified JSON transcribed from the official scanned circular, or click to browse.
            </p>
          </div>

          {/* Or Paste JSON */}
          <div>
            <label htmlFor="holiday-json-paste" className="mb-1 block text-xs font-bold text-slate-700">
              Or Paste Verified JSON Text Directly
            </label>
            <textarea
              id="holiday-json-paste"
              rows={4}
              value={rawText}
              onChange={(e) => { setRawText(e.target.value); setNotice(null); }}
              placeholder='{ "year": 2026, "holidays": [ ... ], "rhQuota": [ ... ], "policyNotes": [ ... ] }'
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-3 font-mono text-xs text-slate-900 shadow-inner outline-none transition hover:border-slate-300 focus:border-amber-400 focus:bg-white"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              disabled={busy || !rawText.trim()}
              onClick={submitSeed}
              className={PRIMARY}
            >
              Upload & Seed Holidays ({selectedYear})
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 2: CLEAR YEAR (Protected by TypedConfirm)                       */}
      {/* ------------------------------------------------------------------- */}
      {tab === "clear" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
            <p className="text-sm font-bold text-rose-950">Select Year to Clear</p>
            <p className="mt-1 text-xs text-rose-800">
              Clearing a year only removes this year&apos;s dates, quotas, and AI search embeddings from the calendar.
              The official holiday circular PDF remains completely safe and untouched.
            </p>
            <div className="mt-3 max-w-xs">
              <YearSelect
                id="holiday-clear-year"
                value={selectedYear}
                years={years}
                onChange={onSelectYear}
                disabled={busy}
              />
            </div>
            <div className="mt-3">
              {yearLoading ? (
                <span className="text-xs text-rose-700">Loading database records for {selectedYear}…</span>
              ) : yearView && yearView.totalHolidays > 0 ? (
                <YearBadge view={yearView} />
              ) : (
                <span className="text-xs text-rose-700">No holidays currently seeded for year {selectedYear}.</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <TypedConfirm
              id="confirm-holiday-year-clear"
              label={`Type CLEAR to confirm clearing holidays for year ${selectedYear}`}
              value={typedConfirmClear}
              onChange={setTypedConfirmClear}
              className={CONFIRM_INPUT}
              inputMode="text"
              maxLength={5}
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className={DANGER}
                disabled={busy || typedConfirmClear.trim().toUpperCase() !== "CLEAR" || !yearView || yearView.totalHolidays === 0}
                onClick={submitClearYear}
              >
                Yes, clear year {selectedYear}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 3: AUTHORISE (HOD Only)                                         */}
      {/* ------------------------------------------------------------------- */}
      {tab === "people" && isHod && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              Who may manage holidays
            </p>
            {delegates === null ? (
              <p className="text-sm text-slate-600">Loading…</p>
            ) : delegates.length === 0 ? (
              <p className="text-sm text-slate-600">
                Nobody else has been authorised: only you as HOD can seed or clear holidays.
              </p>
            ) : (
              <ul className="space-y-2">
                {delegates.map((d) => (
                  <PersonRow
                    key={d.ticket}
                    name={d.name}
                    nonExecutive={d.nonExecutive}
                    action={
                      <button
                        type="button"
                        className={SECONDARY}
                        disabled={busy}
                        onClick={() => { setRevoking(d); setNotice(null); }}
                        aria-label={`Withdraw the authority of ${d.name}`}
                      >
                        Withdraw
                      </button>
                    }
                  >
                    ({d.ticket}) · authorised by {d.grantedByName}
                  </PersonRow>
                ))}
              </ul>
            )}

            {revoking && (
              <ConfirmCard
                title={`Withdraw the authority of ${revoking.name} (${revoking.ticket})?`}
                icon={<AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />}
              >
                <p className="text-xs text-rose-800">
                  He or she will no longer be able to seed or clear holiday calendars. What was already done remains in history.
                </p>
                <div className="flex gap-2 pt-1">
                  <button type="button" className={DANGER} disabled={busy} onClick={confirmRevokeDelegate}>
                    Yes, withdraw it
                  </button>
                  <button type="button" className={SECONDARY} disabled={busy} onClick={() => setRevoking(null)}>
                    No
                  </button>
                </div>
              </ConfirmCard>
            )}
          </div>

          {/* Authorise New Person */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-slate-800">Authorise Delegate</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1">
                <input
                  type="text"
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void searchPeople();
                    }
                  }}
                  placeholder="Employee name or 6-digit ticket (e.g. 498880)"
                  className={FIELD}
                />
              </div>
              <button
                type="button"
                className={SECONDARY}
                disabled={busy || !who.trim()}
                onClick={searchPeople}
              >
                Find
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              An executive (ticket starting with 4) is authorised immediately; a non-executive requires explicit confirmation.
            </p>

            {foundPeople && (
              <div className="mt-3">
                {foundPeople.length === 0 ? (
                  <p className="text-sm font-semibold text-rose-700">No employee found with this name or ticket number.</p>
                ) : (
                  <ul className="space-y-2">
                    {foundPeople.map((p) => (
                      <PersonRow
                        key={p.ticket}
                        name={p.name}
                        nonExecutive={p.nonExecutive}
                        below={
                          p.nonExecutive && askingNonExec === p.ticket ? (
                            <NonExecutiveAsk
                              name={p.name}
                              ticket={p.ticket}
                              busy={busy}
                              onYes={() => grantDelegateAuthority(p.ticket, true)}
                              onNo={() => setAskingNonExec(null)}
                            />
                          ) : undefined
                        }
                        action={
                          <button
                            type="button"
                            className={PRIMARY}
                            disabled={busy}
                            onClick={() => (p.nonExecutive ? setAskingNonExec(p.ticket) : grantDelegateAuthority(p.ticket))}
                          >
                            Authorise
                          </button>
                        }
                      >
                        ({p.ticket}) · {[p.designation, p.department].filter(Boolean).join(", ")}
                      </PersonRow>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 5: HISTORY                                                      */}
      {/* ------------------------------------------------------------------- */}
      {tab === "history" && (
        <div className="space-y-2">
          {history === null ? <p className="text-sm text-slate-600">Loading…</p> : <HistoryList history={history} />}
        </div>
      )}
    </HolidayShell>
  );
}
