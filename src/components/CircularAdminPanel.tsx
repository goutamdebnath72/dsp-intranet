"use client";

// src/components/CircularAdminPanel.tsx
//
// CIRCULAR MANAGER FACILITY PANEL (Modular Facility Kit).
// Renders inside the Omnibar modal answer area when an authorised user asks to manage or post circulars.
// Features:
//   - Post / Upload new circular with dual-pass OCR & vector embeddings (or holiday bypass)
//   - Issue Date Picker (Luxon IST) & Drag-and-drop file upload (up to 15 MB)
//   - Browse recent official circulars with page counts & direct view links
//   - Authorise / Revoke delegates with NonExecutive confirmation (HOD-only)
//   - Complete History audit trail from public.facility_audit

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { DateTime } from "luxon";
import axios from "axios";
import { IST, toIsoInstant } from "@/lib/dates";
import { CIRCULAR_UPLOAD_ESTIMATED_SECONDS } from "@/lib/constants";
import type {
  CircularAdminOpen,
  CircularAuditView,
  CircularDelegateView,
  RecentCircularView,
} from "@/lib/circulars/admin/types";
import { NonExecutiveAsk } from "./facility/NonExecutive";
import { CircularViewerLightbox } from "./CircularViewerLightbox";
import { stickySuccess } from "@/lib/ui/stickyToast";
import {
  CircularAdminHeader,
  CircularRow,
  CircularShell,
  CircularTabs,
  ConfirmCard,
  DANGER,
  FIELD,
  HistoryList,
  Notice,
  PRIMARY,
  PersonRow,
  SECONDARY,
} from "./CircularAdminUi";

type Tab = "upload" | "recent" | "people" | "history";

const REQUEST_TIMEOUT_MS = 25_000;

async function call(payload: Record<string, any>): Promise<{ ok: boolean; status: number; body: any }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("/api/circulars/admin", {
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

const tabFor = (op: CircularAdminOpen["op"]): Tab => {
  if (op === "recent") return "recent";
  if (op === "delegate") return "people";
  if (op === "history") return "history";
  return "upload";
};

export function CircularAdminPanel({ open }: { open: CircularAdminOpen }) {
  const isHod = open.role === "hod";
  const [tab, setTab] = useState<Tab>(tabFor(open.op));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  // Tab 1: Upload / Post Circular
  const [headline, setHeadline] = useState(open.prefill?.headline ?? "");
  const [issueDate, setIssueDate] = useState<string>(() => DateTime.now().setZone(IST).toISODate() || "");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [readingNote, setReadingNote] = useState<string>("");
  const [uploadedCircularUrl, setUploadedCircularUrl] = useState<string | null>(null);
  const [uploadedCircularId, setUploadedCircularId] = useState<number | null>(null);
  const [viewingCircularId, setViewingCircularId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const serverPhaseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const serverPhaseStartRef = useRef<number | null>(null);

  // Tab 2: Recent Circulars
  const [recentCirculars, setRecentCirculars] = useState<RecentCircularView[] | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);

  // Tab 3: Authorise (HOD-only)
  const [delegates, setDelegates] = useState<CircularDelegateView[] | null>(null);
  const [who, setWho] = useState("");
  const [foundPeople, setFoundPeople] = useState<any[] | null>(null);
  const [revoking, setRevoking] = useState<CircularDelegateView | null>(null);
  const [askingNonExec, setAskingNonExec] = useState<string | null>(null);

  // Tab 4: History
  const [history, setHistory] = useState<CircularAuditView[] | null>(null);

  // ---------------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------------

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    const res = await call({ op: "recent", limit: 5 });
    setRecentLoading(false);
    if (res.ok && Array.isArray(res.body?.circulars)) {
      setRecentCirculars(res.body.circulars);
    }
  }, []);

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
    if (tab === "recent" && recentCirculars === null) {
      loadRecent();
    }
    if (tab === "people" && isHod && delegates === null) {
      loadDelegates();
    }
    if (tab === "history" && history === null) {
      loadHistory();
    }
  }, [tab, isHod, recentCirculars, delegates, history, loadRecent, loadDelegates, loadHistory]);

  // ---------------------------------------------------------------------------
  // Server-side OCR Progress Simulation
  // ---------------------------------------------------------------------------

  const startServerPhaseAnimation = useCallback(() => {
    if (serverPhaseIntervalRef.current) return;
    serverPhaseStartRef.current = Date.now();
    serverPhaseIntervalRef.current = setInterval(() => {
      const elapsedSeconds = (Date.now() - (serverPhaseStartRef.current ?? Date.now())) / 1000;
      const next = 95 - (95 - 15) * Math.exp(-elapsedSeconds / CIRCULAR_UPLOAD_ESTIMATED_SECONDS);
      setUploadProgress(Math.min(95, Math.round(next)));
    }, 500);
  }, []);

  const stopServerPhaseAnimation = useCallback(() => {
    if (serverPhaseIntervalRef.current) {
      clearInterval(serverPhaseIntervalRef.current);
      serverPhaseIntervalRef.current = null;
    }
    serverPhaseStartRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopServerPhaseAnimation();
  }, [stopServerPhaseAnimation]);

  // ---------------------------------------------------------------------------
  // File Handling
  // ---------------------------------------------------------------------------

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (busy || uploadStatus === "uploading") return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (chosen) validateAndSetFile(chosen);
  };

  const validateAndSetFile = (f: File) => {
    const allowed = [".pdf", ".png", ".jpg", ".jpeg"];
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.includes(ext)) {
      setNotice({ tone: "error", text: "Only PDF, PNG, or JPG files are supported." });
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      setNotice({ tone: "error", text: "File size exceeds the 15 MB limit." });
      return;
    }
    setFile(f);
    setNotice(null);
  };

  // ---------------------------------------------------------------------------
  // Circular Submission
  // ---------------------------------------------------------------------------

  const handlePostCircular = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!headline.trim() || !issueDate || !file || busy || uploadStatus === "uploading") return;

    setBusy(true);
    setUploadStatus("uploading");
    setUploadProgress(0);
    setNotice(null);
    setReadingNote("");
    setUploadedCircularUrl(null);

    const formData = new FormData();
    formData.append("headline", headline.trim());
    formData.append("publishedAt", issueDate);
    formData.append("file", file);

    try {
      const response = await axios.post("/api/circulars", formData, {
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total ?? 1));
          setUploadProgress(Math.min(15, Math.round(percent * 0.15)));
          if (percent >= 100) startServerPhaseAnimation();
        },
      });

      stopServerPhaseAnimation();
      setUploadProgress(100);
      setUploadStatus("success");
      setBusy(false);

      const data = response.data;
      const note = typeof data?.readingLine === "string" ? data.readingLine : "";
      setReadingNote(note);

      // The upload response is { message, circular: {id, fileUrls, ...}, warning?, readingLine, ... }. (The audit row is
      // written by the server in the same transaction as the circular: there is nothing to record from here.)
      const created = data?.circular;
      if (created?.id) setUploadedCircularId(Number(created.id));
      const firstFile = Array.isArray(created?.fileUrls) ? created.fileUrls[0] : null;
      if (typeof firstFile === "string" && firstFile) setUploadedCircularUrl(firstFile);
      const warning = typeof data?.warning === "string" ? data.warning : "";

      // The upload is finished at the back end (read, checked, chunked, embedded and saved): a toast at the top of the screen stays until its cross is clicked,
      // so it is seen even when the modal is closed meanwhile.
      stickySuccess(warning ? "✅ Circular uploaded. Please read the note in the panel." : "✅ Circular upload is successful!");

      setNotice(
        warning
          ? { tone: "warn", text: `Circular posted, but: ${warning}` }
          : { tone: "ok", text: `Official circular posted successfully! ${note ? `(${note})` : ""}` },
      );

      // Reset form fields
      setHeadline("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadRecent();
      loadHistory();
    } catch (err: any) {
      stopServerPhaseAnimation();
      setUploadStatus("error");
      setBusy(false);
      const errMsg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to post circular. Please verify file format and try again.";
      setNotice({ tone: "error", text: String(errMsg) });
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
        setNotice({ tone: "ok", text: `Authorised ${ticket} to post and manage circulars.` });
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
      setNotice({ tone: "ok", text: `Withdrew circular management authority from ${revoking.name} (${revoking.ticket}).` });
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
    { id: "upload" as Tab, label: "Post Circular", icon: <UploadCloud className="h-4 w-4" />, show: true },
    { id: "recent" as Tab, label: "Recent Circulars", icon: <FileText className="h-4 w-4" />, show: true },
    { id: "people" as Tab, label: "Authorise", icon: <ShieldCheck className="h-4 w-4" />, show: isHod },
    { id: "history" as Tab, label: "History", icon: <History className="h-4 w-4" />, show: true },
  ];

  return (
    <CircularShell>
      <CircularAdminHeader authority={open.role} name={open.name} />

      <CircularTabs tabs={tabs} tab={tab} onTab={(t) => { setTab(t); setNotice(null); }} />

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 1: UPLOAD / POST CIRCULAR                                       */}
      {/* ------------------------------------------------------------------- */}
      {tab === "upload" && (
        <form onSubmit={handlePostCircular} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="circular-headline" className="mb-1 block text-xs font-bold text-slate-700">
                Circular Headline / Title
              </label>
              <input
                id="circular-headline"
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={500}
                placeholder="e.g. Festival Advance Scheme for the Year 2026-27"
                className={FIELD}
                disabled={busy}
                required
              />
              <span className="mt-1 block text-right text-[11px] text-slate-400">
                {headline.length}/500
              </span>
            </div>

            <div>
              <label htmlFor="circular-issue-date" className="mb-1 block text-xs font-bold text-slate-700">
                Circular Issue Date
              </label>
              <input
                id="circular-issue-date"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className={FIELD}
                disabled={busy}
                required
              />
              <span className="mt-1 block text-xs text-slate-400">
                Official date on the circular
              </span>
            </div>
          </div>

          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-blue-300 bg-blue-50/50 p-6 text-center transition hover:border-blue-400 hover:bg-blue-100/40"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileSelect}
              className="hidden"
            />
            <UploadCloud className="mb-2 h-8 w-8 text-blue-600" aria-hidden="true" />
            <p className="text-sm font-bold text-blue-950">
              {file ? file.name : "Drag & drop circular PDF or image (up to 15 MB)"}
            </p>
            <p className="mt-1 text-xs text-blue-800">
              Scanned PDF, PNG, or JPG. OCR, tokenization, and vector embeddings are generated automatically.
            </p>
            {file && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                {(file.size / (1024 * 1024)).toFixed(2)} MB · Ready to upload
              </span>
            )}
          </div>

          {/* Progress Bar (during upload & OCR processing) */}
          {uploadStatus === "uploading" && (
            <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-blue-950">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  {uploadProgress < 15 ? "Uploading file to server…" : "Dual-pass OCR, text extraction, embedding & vectoring in progress…"}
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Please remain on this tab while pages are OCRed and vector embeddings are indexed into pgvector.
              </p>
            </div>
          )}

          {uploadedCircularUrl && (
            <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-900">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Circular file saved to Vercel Blob storage.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (uploadedCircularId) setViewingCircularId(uploadedCircularId);
                  else if (uploadedCircularUrl) window.open(uploadedCircularUrl, "_blank");
                }}
                className="inline-flex items-center gap-1 font-bold text-emerald-800 underline hover:text-emerald-950 cursor-pointer"
              >
                <span>View Circular</span>
                <FileText className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={busy || !headline.trim() || !issueDate || !file || uploadStatus === "uploading"}
              className={PRIMARY}
            >
              <UploadCloud className="h-4 w-4" />
              Post Circular
            </button>
          </div>
        </form>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 2: RECENT CIRCULARS                                             */}
      {/* ------------------------------------------------------------------- */}
      {tab === "recent" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600">
              Recently posted official circulars (last 5).
            </p>
            <button
              type="button"
              onClick={loadRecent}
              disabled={recentLoading}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${recentLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {recentLoading && recentCirculars === null ? (
            <p className="text-xs text-slate-500">Loading recent circulars…</p>
          ) : recentCirculars && recentCirculars.length > 0 ? (
            <div className="space-y-2">
              {recentCirculars.map((c) => (
                <CircularRow
                  key={c.id}
                  item={c}
                  onView={(id) => setViewingCircularId(id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No recent circulars found.</p>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 3: AUTHORISE (HOD Only)                                         */}
      {/* ------------------------------------------------------------------- */}
      {tab === "people" && isHod && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <ShieldCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
              Who may post and manage circulars
            </p>
            {delegates === null ? (
              <p className="text-sm text-slate-600">Loading…</p>
            ) : delegates.length === 0 ? (
              <p className="text-sm text-slate-600">
                Nobody else has been authorised: only you as HOD can post or manage circulars.
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
                title={`Withdraw circular management authority from ${revoking.name} (${revoking.ticket})?`}
                icon={<AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />}
              >
                <p className="text-xs text-rose-800">
                  He or she will no longer be able to post official circulars. Previously uploaded circulars remain untouched.
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
                Find Person
              </button>
            </div>

            {foundPeople && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-slate-600">Select person to authorise:</p>
                <ul className="space-y-1.5">
                  {foundPeople.map((p) => (
                    <li
                      key={p.ticket}
                      className="flex items-center justify-between rounded-xl border border-slate-200 p-2 text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900">{p.name}</span>{" "}
                        <span className="text-slate-500">({p.ticket}) · {p.department}</span>
                        {p.nonExecutive && (
                          <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            Non-executive
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className={PRIMARY}
                        disabled={busy}
                        onClick={() => grantDelegateAuthority(p.ticket, false)}
                      >
                        Authorise
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {askingNonExec && (
              <div className="mt-3">
                <NonExecutiveAsk
                  name={foundPeople?.find((p) => p.ticket === askingNonExec)?.name ?? askingNonExec}
                  ticket={askingNonExec}
                  busy={busy}
                  onYes={() => grantDelegateAuthority(askingNonExec, true)}
                  onNo={() => setAskingNonExec(null)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 4: HISTORY (Audit Trail)                                        */}
      {/* ------------------------------------------------------------------- */}
      {tab === "history" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Audit history of circular uploads and delegation permissions.
          </p>
          {history === null ? (
            <p className="text-xs text-slate-500">Loading audit history…</p>
          ) : (
            <HistoryList history={history} />
          )}
        </div>
      )}

      {viewingCircularId && (
        <CircularViewerLightbox
          circularId={viewingCircularId}
          onClose={() => setViewingCircularId(null)}
        />
      )}
    </CircularShell>
  );
}
