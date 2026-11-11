"use client";

// src/components/AnnouncementAdminPanel.tsx
//
// ANNOUNCEMENT MANAGER FACILITY PANEL (Modular Facility Kit).
// Renders inside the Omnibar modal answer area when an authorised user asks to manage or publish announcements.
// Features:
//   - Publish / Edit plant announcements with Title and RichTextEditor (HTML + Gemini embeddings)
//   - Live Read-Only IST Date & Time clock matching official administration standards
//   - Concurrency & Race Condition Guard (HMAC Versioning protects against lost updates)
//   - Last 5 Recent Announcements with inline edit/delete and remaining-window calculation
//   - Authorise / Revoke delegates with NonExecutive confirmation (HOD-only)
//   - Complete History audit trail from public.facility_audit

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  Megaphone,
  Pencil,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { DateTime } from "luxon";
import { IST, toIsoInstant } from "@/lib/dates";
import type {
  AnnouncementAdminOpen,
  AnnouncementAuditView,
  AnnouncementDelegateView,
  AnnouncementItemView,
} from "@/lib/announcements/admin/types";
import RichTextEditor from "@/components/RichTextEditor";
import { stickySuccess } from "@/lib/ui/stickyToast";
import { EDIT_DELETE_WINDOW_HOURS } from "@/lib/constants";
import { NonExecutiveAsk } from "./facility/NonExecutive";
import {
  AnnouncementAdminHeader,
  AnnouncementCard,
  AnnouncementShell,
  AnnouncementTabs,
  ConfirmCard,
  DANGER,
  FIELD,
  HistoryList,
  Notice,
  PRIMARY,
  PersonRow,
  SECONDARY,
} from "./AnnouncementAdminUi";

type Tab = "publish" | "recent" | "people" | "history";

const REQUEST_TIMEOUT_MS = 25_000;

async function call(payload: Record<string, any>): Promise<{ ok: boolean; status: number; body: any }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("/api/announcements/admin", {
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

const tabFor = (op: AnnouncementAdminOpen["op"]): Tab => {
  if (op === "recent") return "recent";
  if (op === "delegate") return "people";
  if (op === "history") return "history";
  return "publish";
};

export function AnnouncementAdminPanel({ open }: { open: AnnouncementAdminOpen }) {
  const isHod = open.role === "hod";
  const [tab, setTab] = useState<Tab>(tabFor(open.op));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  // Tab 1: Publish / Edit Announcement
  const [title, setTitle] = useState(open.prefill?.title ?? "");
  const [content, setContent] = useState("");
  const [currentDateTime, setCurrentDateTime] = useState(() => DateTime.now().setZone(IST));
  const [editingId, setEditingId] = useState<number | null>(open.prefill?.editId ?? null);
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [staleConflict, setStaleConflict] = useState<{ current: AnnouncementItemView; last: any } | null>(null);

  // Live IST Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(DateTime.now().setZone(IST));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Tab 2: Recent Announcements (Last 5)
  const [recentAnnouncements, setRecentAnnouncements] = useState<AnnouncementItemView[] | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);
  const [deletingAnnouncement, setDeletingAnnouncement] = useState<AnnouncementItemView | null>(null);

  // Tab 3: Authorise (HOD-only)
  const [delegates, setDelegates] = useState<AnnouncementDelegateView[] | null>(null);
  const [who, setWho] = useState("");
  const [foundPeople, setFoundPeople] = useState<any[] | null>(null);
  const [revoking, setRevoking] = useState<AnnouncementDelegateView | null>(null);
  const [askingNonExec, setAskingNonExec] = useState<string | null>(null);

  // Tab 4: History
  const [history, setHistory] = useState<AnnouncementAuditView[] | null>(null);

  // ---------------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------------

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    const res = await call({ op: "recent", limit: 5 });
    setRecentLoading(false);
    if (res.ok && Array.isArray(res.body?.announcements)) {
      setRecentAnnouncements(res.body.announcements);
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
    if (tab === "recent" && recentAnnouncements === null) {
      loadRecent();
    }
    if (tab === "people" && isHod && delegates === null) {
      loadDelegates();
    }
    if (tab === "history" && history === null) {
      loadHistory();
    }
  }, [tab, isHod, recentAnnouncements, delegates, history, loadRecent, loadDelegates, loadHistory]);

  // ---------------------------------------------------------------------------
  // Publish / Edit Submission (Protected against Race Conditions)
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;

    setBusy(true);
    setNotice(null);
    setStaleConflict(null);

    if (editingId) {
      // Modify Existing Announcement
      const res = await call({
        op: "modify",
        id: editingId,
        title: title.trim(),
        content,
        version: editingVersion,
      });

      setBusy(false);
      if (res.ok) {
        stickySuccess("✅ Announcement updated successfully!"); // stays until its cross is clicked
        setNotice({ tone: "ok", text: "Announcement updated successfully!" });
        setEditingId(null);
        setEditingVersion(null);
        setTitle("");
        setContent("");
        loadRecent();
        loadHistory();
      } else if (res.status === 409 && res.body?.stale) {
        setStaleConflict({ current: res.body.current, last: res.body.last });
        setNotice({
          tone: "warn",
          text: "Conflict detected: another executive modified this announcement while you were editing.",
        });
      } else {
        setNotice({ tone: "error", text: res.body?.error || "Failed to update announcement." });
      }
    } else {
      // Publish New Announcement
      const res = await call({
        op: "publish",
        title: title.trim(),
        content,
        date: currentDateTime.toUTC().toISO(),
      });

      setBusy(false);
      if (res.ok) {
        stickySuccess(`✅ Announcement published! You can modify or delete this for the next ${Math.round(EDIT_DELETE_WINDOW_HOURS / 24)} days.`); // stays until its cross is clicked
        setNotice({ tone: "ok", text: "Announcement published successfully and indexed for AI search!" });
        setTitle("");
        setContent("");
        loadRecent();
        loadHistory();
      } else {
        setNotice({ tone: "error", text: res.body?.error || "Failed to publish announcement." });
      }
    }
  };

  const startEdit = (item: AnnouncementItemView) => {
    setEditingId(item.id);
    setEditingVersion(item.version);
    setTitle(item.title);
    setContent(item.content || "");
    setStaleConflict(null);
    setNotice(null);
    setTab("publish");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingVersion(null);
    setTitle("");
    setContent("");
    setStaleConflict(null);
    setNotice(null);
  };

  // ---------------------------------------------------------------------------
  // Deletion (Protected against Race Conditions)
  // ---------------------------------------------------------------------------

  const confirmDelete = async () => {
    if (!deletingAnnouncement || busy) return;
    setBusy(true);
    const res = await call({
      op: "delete",
      id: deletingAnnouncement.id,
      version: deletingAnnouncement.version,
    });
    setBusy(false);
    setDeletingAnnouncement(null);

    if (res.ok) {
      setNotice({ tone: "ok", text: "Announcement deleted successfully." });
      loadRecent();
      loadHistory();
    } else if (res.status === 409 && res.body?.stale) {
      setNotice({
        tone: "warn",
        text: "Could not delete: this announcement was modified by another user in the meantime.",
      });
      loadRecent();
    } else {
      setNotice({ tone: "error", text: res.body?.error || "Failed to delete announcement." });
    }
  };

  // ---------------------------------------------------------------------------
  // Delegation Actions (HOD-only)
  // ---------------------------------------------------------------------------

  const searchPeople = async (q: string) => {
    setWho(q);
    if (!q.trim()) {
      setFoundPeople(null);
      return;
    }
    const res = await call({ op: "find-executive", q: q.trim() });
    if (res.ok && Array.isArray(res.body?.executives)) {
      setFoundPeople(res.body.executives);
    }
  };

  const grantDelegateAuthority = async (ticket: string, confirmNonExecutive = false) => {
    setBusy(true);
    const res = await call({ op: "grant", ticket, confirmNonExecutive });
    setBusy(false);
    setAskingNonExec(null);

    if (res.ok && res.body?.result?.status === "ok") {
      setNotice({ tone: "ok", text: "Authorisation granted successfully." });
      setWho("");
      setFoundPeople(null);
      loadDelegates();
      loadHistory();
    } else if (res.ok && res.body?.result?.status === "needs-confirmation") {
      setAskingNonExec(ticket);
    } else {
      const reason = res.body?.result?.reason || res.body?.error || "Could not authorise.";
      setNotice({ tone: "warn", text: reason });
    }
  };

  const revokeDelegateAuthority = async () => {
    if (!revoking) return;
    setBusy(true);
    const res = await call({ op: "revoke", ticket: revoking.ticket });
    setBusy(false);
    setRevoking(null);

    if (res.ok && res.body?.result?.status === "ok") {
      setNotice({ tone: "ok", text: "Authorisation withdrawn." });
      loadDelegates();
      loadHistory();
    } else {
      setNotice({ tone: "warn", text: res.body?.result?.reason || "Could not withdraw authorisation." });
    }
  };

  return (
    <AnnouncementShell>
      <AnnouncementAdminHeader authority={open.role} name={open.name} />

      <AnnouncementTabs
        tab={tab}
        onTab={setTab}
        tabs={[
          {
            id: "publish",
            label: editingId ? "Edit Announcement" : "Publish Announcement",
            icon: <Megaphone className="h-3.5 w-3.5" />,
          },
          {
            id: "recent",
            label: "Recent Announcements",
            icon: <Clock className="h-3.5 w-3.5" />,
          },
          {
            id: "people",
            label: "Authorise",
            icon: <Users className="h-3.5 w-3.5" />,
            show: isHod,
          },
          {
            id: "history",
            label: "History",
            icon: <History className="h-3.5 w-3.5" />,
          },
        ]}
      />

      {notice && (
        <Notice tone={notice.tone}>
          <p>{notice.text}</p>
        </Notice>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 1: PUBLISH / EDIT ANNOUNCEMENT                                  */}
      {/* ------------------------------------------------------------------- */}
      {tab === "publish" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {editingId && (
            <div className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
              <span className="font-semibold">
                Editing Announcement #{editingId} (HMAC concurrency protected)
              </span>
              <button
                type="button"
                onClick={cancelEdit}
                className="font-bold text-blue-700 underline hover:text-blue-900 cursor-pointer"
              >
                Cancel Edit
              </button>
            </div>
          )}

          {staleConflict && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>Another executive has updated this announcement</span>
              </div>
              <p>
                Latest update by{" "}
                <span className="font-semibold">
                  {staleConflict.last?.actorName || staleConflict.current.authorName} ({staleConflict.last?.actorTicket || staleConflict.current.authorTicketNo})
                </span>
                . The current title in the database is: &ldquo;{staleConflict.current.title}&rdquo;.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    startEdit(staleConflict.current);
                  }}
                  className="rounded-xl bg-amber-600 px-3 py-1.5 font-bold text-white shadow-sm hover:bg-amber-700 cursor-pointer"
                >
                  Load Latest Version
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-800 hover:bg-amber-50 cursor-pointer"
                >
                  Discard Changes
                </button>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="announcement-title" className="mb-1 block text-xs font-bold text-slate-700">
              Title / Headline
            </label>
            <input
              id="announcement-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Annual DSP Family Day Registration"
              className={FIELD}
              disabled={busy}
              required
            />
          </div>

          <div>
            <span className="mb-1 block text-xs font-bold text-slate-700">
              Content (Optional)
            </span>
            <div className="mt-1">
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder="Write the announcement details…"
              />
            </div>
          </div>

          <div>
            <label htmlFor="announcement-datetime" className="mb-1 block text-xs font-bold text-slate-700">
              Date &amp; Time (Read-only)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="announcement-datetime"
                type="date"
                value={currentDateTime.toISODate() ?? ""}
                readOnly
                className="block w-full rounded-2xl border border-slate-200 bg-slate-100 py-3 px-4 text-sm font-mono font-medium text-slate-500 shadow-sm cursor-not-allowed"
              />
              <span className="rounded-2xl border border-slate-200 bg-slate-100 py-3 px-4 text-sm font-mono font-medium text-slate-500 shadow-sm whitespace-nowrap">
                {currentDateTime.setLocale("en-IN").toLocaleString({
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {editingId ? (
              <button
                type="button"
                onClick={cancelEdit}
                disabled={busy}
                className={SECONDARY}
              >
                Cancel
              </button>
            ) : <span />}

            <button
              type="submit"
              disabled={busy || !title.trim()}
              className={PRIMARY}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{editingId ? "Updating…" : "Publishing…"}</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>{editingId ? "Update Announcement" : "Publish Announcement"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 2: RECENT ANNOUNCEMENTS                                         */}
      {/* ------------------------------------------------------------------- */}
      {tab === "recent" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600">
              Recently posted official announcements and notifications (last 5).
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

          {deletingAnnouncement && (
            <ConfirmCard
              title={`Delete Announcement #${deletingAnnouncement.id}?`}
              body={
                <p>
                  Are you sure you want to delete &ldquo;{deletingAnnouncement.title}&rdquo;? This will permanently remove the announcement and its semantic AI search embedding.
                </p>
              }
              confirmLabel="Yes, delete"
              busy={busy}
              onConfirm={confirmDelete}
              onCancel={() => setDeletingAnnouncement(null)}
            />
          )}

          {recentLoading && recentAnnouncements === null ? (
            <p className="text-xs text-slate-500">Loading recent announcements…</p>
          ) : recentAnnouncements && recentAnnouncements.length > 0 ? (
            <div className="space-y-2.5">
              {recentAnnouncements.map((a) => (
                <AnnouncementCard
                  key={a.id}
                  item={a}
                  onEdit={startEdit}
                  onDelete={(item) => setDeletingAnnouncement(item)}
                  busy={busy}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No recent announcements found.</p>
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
              Who may publish and manage announcements
            </p>
            {delegates === null ? (
              <p className="text-sm text-slate-600">Loading…</p>
            ) : delegates.length === 0 ? (
              <p className="text-sm text-slate-600">
                Nobody else has been authorised: only you as HOD can publish announcements.
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
                        onClick={() => setRevoking(d)}
                        disabled={busy}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 cursor-pointer disabled:opacity-50"
                      >
                        Withdraw
                      </button>
                    }
                  >
                    Authorised by {d.grantedByName} on {d.grantedAt || "earlier"}
                  </PersonRow>
                ))}
              </ul>
            )}
          </div>

          {revoking && (
            <ConfirmCard
              title={`Withdraw authority from ${revoking.name}?`}
              body={<p>He will no longer be able to publish or edit plant announcements.</p>}
              confirmLabel="Yes, withdraw"
              busy={busy}
              onConfirm={revokeDelegateAuthority}
              onCancel={() => setRevoking(null)}
            />
          )}

          <div className="space-y-2 border-t border-slate-200/80 pt-4">
            <label htmlFor="auth-search-announcement" className="block text-xs font-bold text-slate-700">
              Authorise an employee
            </label>
            <input
              id="auth-search-announcement"
              type="text"
              value={who}
              onChange={(e) => searchPeople(e.target.value)}
              placeholder="Type a 6-digit ticket number or a name…"
              className={FIELD}
              disabled={busy}
            />

            {foundPeople && foundPeople.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                <ul className="space-y-1">
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
            Audit history of announcement publications, edits, deletions, and delegation permissions.
          </p>
          {history === null ? (
            <p className="text-xs text-slate-500">Loading audit history…</p>
          ) : (
            <HistoryList history={history} />
          )}
        </div>
      )}
    </AnnouncementShell>
  );
}
