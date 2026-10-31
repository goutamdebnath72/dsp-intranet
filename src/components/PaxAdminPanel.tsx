"use client";

// src/components/PaxAdminPanel.tsx
//
// THE PAX DIRECTORY EDITOR (step 64a; owner, 31 Oct 2026). It opens in the answer area of the search bar when the HOD C&IT (or an executive he has authorised) types that he wants to add, change or delete a PAX
// number, or to authorise or withdraw an executive. Three inputs: Department, Location, PAX number. Nothing is protected by what this panel hides: the SERVER decides who may do what (src/lib/pax/admin/api.ts),
// and checks every rule again. The panel only tells the person early, and asks the questions the owner wanted when an entry clashes with a saved one:
// "do you want to edit the existing line, or have you made a mistake?".
//
// Plain text only (React escapes it). No <form> tag: the search modal already holds a text area, and forms must not nest; Enter in a field does the same as the button.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { History, Pencil, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import type { Acknowledge, PaxAdminOpen, PaxAuditView, PaxConflict, PaxDelegateView, PaxEntryView } from "@/lib/pax/admin/types";
import { EMPTY_LOCATION } from "@/lib/pax/answer";
import { describeLine } from "@/lib/pax/admin/conflicts";
import { validateEntry, PAX_NUMBER_RULE, type FieldErrors } from "@/lib/pax/admin/validate";

type Tab = "add" | "modify" | "delete" | "people" | "history";

const FIELD = "w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const PRIMARY = "rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY = "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";
const DANGER = "rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50";

// ---------------------------------------------------------------------------------------------------------------------------------
// display pieces (no state: they are given everything, so they can be drawn and tested alone)
// ---------------------------------------------------------------------------------------------------------------------------------

export interface FormValues { department: string; location: string; number: string }

export function EntryFormView(props: {
  idPrefix: string;
  values: FormValues;
  errors: FieldErrors;
  busy: boolean;
  submitLabel: string;
  onChange: (next: FormValues) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  const { idPrefix, values, errors, busy, submitLabel, onChange, onSubmit, onCancel } = props;
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };
  const field = (key: keyof FormValues, label: string, hint: string, extra: { inputMode?: "numeric"; maxLength?: number; placeholder: string }) => (
    <div className="min-w-0">
      <label htmlFor={`${idPrefix}-${key}`} className="mb-1 block text-xs font-semibold text-neutral-700">
        {label}
      </label>
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
        className={`${FIELD} ${errors[key] ? "border-red-500" : ""}`}
      />
      <p id={`${idPrefix}-${key}-note`} className={`mt-1 text-xs ${errors[key] ? "font-semibold text-red-700" : "text-neutral-500"}`} role={errors[key] ? "alert" : undefined}>
        {errors[key] ?? hint}
      </p>
    </div>
  );
  return (
    <div className="space-y-3" data-pax-form={idPrefix}>
      <div className="grid gap-3 sm:grid-cols-3">
        {field("department", "Department", "For example CISF, Weigh Bridge, Fire Service.", { placeholder: "Department", maxLength: 80 })}
        {field("location", "Location", `Leave empty if there is none: the table then shows ${EMPTY_LOCATION}.`, { placeholder: "Location (optional)", maxLength: 80 })}
        {field("number", "PAX number", PAX_NUMBER_RULE, { placeholder: "4xxxx", inputMode: "numeric", maxLength: 5 })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} disabled={busy} onClick={onSubmit}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={SECONDARY} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/** The sentence for each kind of clash, in the table's own words. */
export function conflictText(c: PaxConflict, entry: FormValues): string {
  const lines = c.existing.map(describeLine).join("; ");
  if (c.kind === "same-number") return `The number ${entry.number} is already assigned to ${lines}. A PAX number belongs to one place only.`;
  if (c.kind === "same-place") return `${lines.split(" · ").slice(0, 2).join(" · ")} is already saved with ${c.existing.map((e) => e.number).join(" / ")}.`;
  return `What you typed reads almost like ${lines}.`;
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
    <div role="alert" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-pax-conflict="true">
      <p className="font-bold">This clashes with what is already saved.</p>
      {conflicts.length === 0 && <p>The table already holds a line with this department, location and number.</p>}
      <ul className="list-disc space-y-1 pl-5">
        {conflicts.map((c, i) => (
          <li key={i} data-conflict={c.kind}>
            {conflictText(c, entry)}
          </li>
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
        <div className="flex flex-wrap items-center gap-2 border-t border-amber-200 pt-2">
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
  );
}

export function EntryList(props: { entries: PaxEntryView[]; actionLabel: string; actionClass: string; busy: boolean; onPick: (e: PaxEntryView) => void; truncatedAt?: number }) {
  const { entries, actionLabel, actionClass, busy, onPick, truncatedAt = 40 } = props;
  const shown = entries.slice(0, truncatedAt);
  if (entries.length === 0) return <p className="text-sm text-neutral-600">No saved line matches.</p>;
  return (
    <div className="space-y-1">
      <div className="max-h-64 overflow-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full text-left text-xs sm:text-sm">
          <thead className="sticky top-0 bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Department</th>
              <th scope="col" className="px-3 py-2 font-semibold">Location</th>
              <th scope="col" className="px-3 py-2 font-semibold">PAX</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id} className="border-t border-neutral-100">
                <td className="px-3 py-1.5 font-medium text-neutral-800">{e.department}</td>
                <td className="px-3 py-1.5 text-neutral-700">{e.location || EMPTY_LOCATION}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-neutral-700">{e.number}</td>
                <td className="px-3 py-1.5 text-right">
                  <button type="button" className={actionClass} disabled={busy} onClick={() => onPick(e)} aria-label={`${actionLabel} ${describeLine(e)}`}>
                    {actionLabel}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length > shown.length && <p className="text-xs text-neutral-500">{entries.length - shown.length} more: type more of the name or the number to narrow the list.</p>}
    </div>
  );
}

export function HistoryList({ history }: { history: PaxAuditView[] }) {
  if (history.length === 0) return <p className="text-sm text-neutral-600">No change has been made from this panel yet.</p>;
  return (
    <ul className="max-h-72 space-y-1 overflow-auto rounded-lg border border-neutral-200 bg-white p-2 text-xs sm:text-sm">
      {history.map((h, i) => (
        <li key={i} className="border-b border-neutral-100 pb-1 last:border-0">
          <span className="font-semibold text-neutral-800">{h.summary}</span>
          <span className="block text-neutral-500">
            {h.actorName} ({h.actorTicket}, {h.actorRole === "hod" ? "HOD C&IT" : "authorised executive"}) · {new Date(h.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the panel
// ---------------------------------------------------------------------------------------------------------------------------------

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(payload: Json): Promise<{ ok: boolean; status: number; body: Json }> {
  try {
    const res = await fetch("/api/pax/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" });
    let body: Json = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: "The network did not answer. Please try again." } };
  }
}

const emptyForm = (p?: PaxAdminOpen["prefill"]): FormValues => ({ department: p?.department ?? "", location: "", number: p?.number ?? "" });
const tabFor = (op: PaxAdminOpen["op"]): Tab => (op === "modify" ? "modify" : op === "delete" ? "delete" : op === "delegate" ? "people" : "add");

export function PaxAdminPanel({ open }: { open: PaxAdminOpen }) {
  const isHod = open.role === "hod";
  const [tab, setTab] = useState<Tab>(tabFor(open.op));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // add
  const [addForm, setAddForm] = useState<FormValues>(emptyForm(open.prefill));
  const [addErrors, setAddErrors] = useState<FieldErrors>({});
  const [addConflict, setAddConflict] = useState<{ conflicts: PaxConflict[]; acknowledgeable: Acknowledge[]; entry: FormValues } | null>(null);

  // modify / delete
  const [query, setQuery] = useState(open.prefill?.query ?? open.prefill?.number ?? "");
  const [entries, setEntries] = useState<PaxEntryView[]>([]);
  const [listed, setListed] = useState(false);
  const [editing, setEditing] = useState<PaxEntryView | null>(null);
  const [editForm, setEditForm] = useState<FormValues>(emptyForm());
  const [editErrors, setEditErrors] = useState<FieldErrors>({});
  const [editConflict, setEditConflict] = useState<{ conflicts: PaxConflict[]; acknowledgeable: Acknowledge[]; entry: FormValues } | null>(null);
  const [deleting, setDeleting] = useState<PaxEntryView | null>(null);

  // people and history
  const [delegates, setDelegates] = useState<PaxDelegateView[] | null>(null);
  const [who, setWho] = useState("");
  const [found, setFound] = useState<Array<{ ticket: string; name: string; designation: string; department: string }> | null>(null);
  const [revoking, setRevoking] = useState<PaxDelegateView | null>(null);
  const [history, setHistory] = useState<PaxAuditView[] | null>(null);

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const guard = useCallback(async <T,>(fn: () => Promise<T>, keepNotice = false): Promise<T | undefined> => {
    setBusy(true);
    if (!keepNotice) setNotice(null); // a reload that follows an action must not wipe the message that action has just set
    try {
      return await fn();
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);
  const fail = (r: { status: number; body: Json }) =>
    setNotice({ tone: "error", text: r.status === 401 ? "Please log in again." : r.status === 403 ? String(r.body.error ?? "You are not allowed to do this.") : String(r.body.error ?? "Something went wrong. Please try again.") });

  // ---- the list (modify and delete) ----
  const loadEntries = useCallback(async (q: string, keepNotice = false) => {
    const r = await guard(() => call({ op: "list", q }), keepNotice);
    if (!r || !alive.current) return;
    if (!r.ok) return fail(r);
    setEntries((r.body.entries as PaxEntryView[]) ?? []);
    setListed(true);
  }, [guard]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ((tab === "modify" || tab === "delete") && !listed) void loadEntries(query);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab === "people" && isHod && delegates === null) void refreshDelegates();
    if (tab === "history" && history === null) void refreshHistory();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshDelegates() {
    const r = await guard(() => call({ op: "delegates" }), true);
    if (r && alive.current) r.ok ? setDelegates((r.body.delegates as PaxDelegateView[]) ?? []) : fail(r);
  }
  async function refreshHistory() {
    const r = await guard(() => call({ op: "audit" }), true);
    if (r && alive.current) r.ok ? setHistory((r.body.history as PaxAuditView[]) ?? []) : fail(r);
  }

  // ---- add ----
  async function submitAdd(ack: Acknowledge[] = []) {
    const v = validateEntry(addForm);
    if (!v.ok) return setAddErrors(v.errors);
    setAddErrors({});
    const r = await guard(() => call({ op: "add", ...v.value, acknowledge: ack }));
    if (!r || !alive.current) return;
    if (!r.ok) return fail(r);
    const res = r.body.result as Json;
    if (res.status === "ok") {
      setAddConflict(null);
      setNotice({ tone: "ok", text: `Saved: ${describeLine(res.entry as PaxEntryView)}. The search shows it from now on.` });
      setAddForm(emptyForm());
      setListed(false);
      setHistory(null);
    } else if (res.status === "conflict") {
      setAddConflict({ conflicts: res.conflicts as PaxConflict[], acknowledgeable: res.acknowledgeable as Acknowledge[], entry: v.value });
    } else if (res.status === "invalid") {
      setAddErrors(res.errors as FieldErrors);
    } else if (res.status === "forbidden") {
      setNotice({ tone: "error", text: "You are not allowed to change the PAX directory." });
    }
  }

  // ---- modify ----
  function startEdit(line: PaxEntryView) {
    setEditing(line);
    setEditForm({ department: line.department, location: line.location, number: line.number });
    setEditErrors({});
    setEditConflict(null);
    setAddConflict(null);
    setDeleting(null);
    setNotice(null);
    setTab("modify");
  }
  async function submitEdit(ack: Acknowledge[] = []) {
    if (!editing) return;
    const v = validateEntry(editForm);
    if (!v.ok) return setEditErrors(v.errors);
    setEditErrors({});
    const r = await guard(() => call({ op: "modify", id: editing.id, ...v.value, acknowledge: ack }));
    if (!r || !alive.current) return;
    if (!r.ok) return fail(r);
    const res = r.body.result as Json;
    if (res.status === "ok") {
      setEditConflict(null);
      setNotice({ tone: "ok", text: `Changed: ${describeLine(res.entry as PaxEntryView)}.` });
      setEditing(null);
      setListed(false);
      setHistory(null);
      void loadEntries(query, true);
    } else if (res.status === "conflict") {
      setEditConflict({ conflicts: res.conflicts as PaxConflict[], acknowledgeable: res.acknowledgeable as Acknowledge[], entry: v.value });
    } else if (res.status === "unchanged") {
      setNotice({ tone: "ok", text: "Nothing was changed: the line is as it was." });
    } else if (res.status === "missing") {
      setNotice({ tone: "error", text: "This line no longer exists (somebody may have deleted it)." });
      setEditing(null);
      void loadEntries(query, true);
    } else if (res.status === "invalid") {
      setEditErrors(res.errors as FieldErrors);
    }
  }

  // ---- delete ----
  async function confirmDelete() {
    if (!deleting) return;
    const r = await guard(() => call({ op: "delete", id: deleting.id }));
    if (!r || !alive.current) return;
    if (!r.ok) return fail(r);
    const res = r.body.result as Json;
    if (res.status === "ok") setNotice({ tone: "ok", text: `Deleted: ${describeLine(res.entry as PaxEntryView)}. The history keeps a record.` });
    else if (res.status === "missing") setNotice({ tone: "error", text: "This line no longer exists." });
    setDeleting(null);
    setHistory(null);
    void loadEntries(query, true);
  }

  // ---- people ----
  async function searchPeople() {
    const r = await guard(() => call({ op: "find-executive", q: who }));
    if (!r || !alive.current) return;
    if (!r.ok) return fail(r);
    setFound((r.body.executives as typeof found) ?? []);
  }
  async function grant(ticket: string) {
    const r = await guard(() => call({ op: "grant", ticket }));
    if (!r || !alive.current) return;
    if (!r.ok) return fail(r);
    const res = r.body.result as Json;
    if (res.status === "ok") {
      setNotice({ tone: "ok", text: "Authorised. From now on this executive can add, change and delete PAX numbers." });
      setFound(null);
      setWho("");
      setHistory(null);
      void refreshDelegates();
    } else if (res.status === "already") setNotice({ tone: "ok", text: "This executive is already authorised." });
    else if (res.status === "invalid") setNotice({ tone: "error", text: String(res.reason ?? "This person cannot be authorised.") });
  }
  async function confirmRevoke() {
    if (!revoking) return;
    const r = await guard(() => call({ op: "revoke", ticket: revoking.ticket }));
    if (!r || !alive.current) return;
    if (!r.ok) return fail(r);
    setNotice({ tone: "ok", text: `The authority of ${revoking.name} is withdrawn.` });
    setRevoking(null);
    setHistory(null);
    void refreshDelegates();
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; show: boolean }> = [
    { id: "add", label: "Add", icon: <Plus className="h-3.5 w-3.5" aria-hidden="true" />, show: true },
    { id: "modify", label: "Change", icon: <Pencil className="h-3.5 w-3.5" aria-hidden="true" />, show: true },
    { id: "delete", label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />, show: true },
    { id: "people", label: "Authorised people", icon: <Users className="h-3.5 w-3.5" aria-hidden="true" />, show: isHod },
    { id: "history", label: "Recent changes", icon: <History className="h-3.5 w-3.5" aria-hidden="true" />, show: true },
  ];

  const searchBox = (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[12rem] flex-1">
        <label htmlFor="pax-admin-search" className="mb-1 block text-xs font-semibold text-neutral-700">Find a saved line</label>
        <input
          id="pax-admin-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void loadEntries(query); } }}
          placeholder="Department, location or number"
          autoComplete="off"
          className={FIELD}
        />
      </div>
      <button type="button" className={SECONDARY} disabled={busy} onClick={() => void loadEntries(query)}>Search</button>
    </div>
  );

  return (
    <div className="space-y-3" data-pax-admin="true">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-blue-700" aria-hidden="true" />
        <p className="text-sm font-bold text-neutral-900">PAX directory editor</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700" data-role={open.role}>
          {isHod ? "HOD C&IT" : "Authorised executive"}
        </span>
      </div>

      <div role="tablist" aria-label="PAX directory editor" className="flex flex-wrap gap-1 border-b border-neutral-200 pb-2">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => { setTab(t.id); setNotice(null); }}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold sm:text-sm ${tab === t.id ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-md border px-2.5 py-1.5 text-sm font-semibold ${notice.tone === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"}`}>
          {notice.text}
        </p>
      )}

      {tab === "add" && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-700">Type the department, the location and the new PAX number. Every entry is checked against what is saved.</p>
          <EntryFormView idPrefix="pax-add" values={addForm} errors={addErrors} busy={busy} submitLabel="Check and save" onChange={(v) => { setAddForm(v); setAddConflict(null); }} onSubmit={() => void submitAdd()} />
          {addConflict && (
            <ConflictView
              conflicts={addConflict.conflicts}
              acknowledgeable={addConflict.acknowledgeable}
              entry={addConflict.entry}
              busy={busy}
              onEdit={startEdit}
              onFix={() => { setAddConflict(null); document.getElementById("pax-add-number")?.focus(); }}
              onAcknowledge={(a) => void submitAdd([a])}
            />
          )}
        </div>
      )}

      {tab === "modify" && (
        <div className="space-y-3">
          {editing ? (
            <>
              <p className="text-sm text-neutral-700">Changing <span className="font-semibold">{describeLine(editing)}</span></p>
              <EntryFormView idPrefix="pax-edit" values={editForm} errors={editErrors} busy={busy} submitLabel="Check and save the change" onChange={(v) => { setEditForm(v); setEditConflict(null); }} onSubmit={() => void submitEdit()} onCancel={() => { setEditing(null); setEditConflict(null); }} />
              {editConflict && (
                <ConflictView
                  conflicts={editConflict.conflicts}
                  acknowledgeable={editConflict.acknowledgeable}
                  entry={editConflict.entry}
                  busy={busy}
                  onEdit={startEdit}
                  onFix={() => { setEditConflict(null); document.getElementById("pax-edit-number")?.focus(); }}
                  onAcknowledge={(a) => void submitEdit([a])}
                />
              )}
            </>
          ) : (
            <>
              {searchBox}
              {listed && <EntryList entries={entries} actionLabel="Change" actionClass={SECONDARY} busy={busy} onPick={startEdit} />}
            </>
          )}
        </div>
      )}

      {tab === "delete" && (
        <div className="space-y-3">
          {searchBox}
          {listed && <EntryList entries={entries} actionLabel="Delete" actionClass={DANGER} busy={busy} onPick={(e) => { setDeleting(e); setNotice(null); }} />}
          {deleting && (
            <div role="alertdialog" aria-label="Confirm the deletion" className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950" data-pax-delete="true">
              <p className="font-bold">Delete {describeLine(deleting)}?</p>
              <p>The line leaves the PAX directory at once. The history keeps a record of what it was and who deleted it.</p>
              <div className="flex gap-2">
                <button type="button" className={DANGER} disabled={busy} onClick={() => void confirmDelete()}>Yes, delete it</button>
                <button type="button" className={SECONDARY} disabled={busy} onClick={() => setDeleting(null)}>No, keep it</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "people" && isHod && (
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-neutral-800">Executives who may change PAX numbers</p>
            {delegates === null ? (
              <p className="text-sm text-neutral-600">Loading…</p>
            ) : delegates.length === 0 ? (
              <p className="text-sm text-neutral-600">Nobody else has been authorised: only you can change the PAX directory.</p>
            ) : (
              <ul className="space-y-1">
                {delegates.map((d) => (
                  <li key={d.ticket} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm">
                    <span>
                      <span className="font-semibold text-neutral-800">{d.name}</span> <span className="text-neutral-500">({d.ticket}) · authorised by {d.grantedByName} on {new Date(d.grantedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
                    </span>
                    <button type="button" className={SECONDARY} disabled={busy} onClick={() => { setRevoking(d); setNotice(null); }} aria-label={`Withdraw the authority of ${d.name}`}>Withdraw</button>
                  </li>
                ))}
              </ul>
            )}
            {revoking && (
              <div role="alertdialog" aria-label="Confirm the withdrawal" className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950" data-pax-revoke="true">
                <p className="font-bold">Withdraw the authority of {revoking.name} ({revoking.ticket})?</p>
                <p>He or she can no longer add, change or delete PAX numbers. What was already done stays in the history.</p>
                <div className="flex gap-2">
                  <button type="button" className={DANGER} disabled={busy} onClick={() => void confirmRevoke()}>Yes, withdraw it</button>
                  <button type="button" className={SECONDARY} disabled={busy} onClick={() => setRevoking(null)}>No</button>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2 border-t border-neutral-200 pt-3">
            <p className="text-sm font-semibold text-neutral-800">Authorise an executive</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1">
                <label htmlFor="pax-admin-who" className="mb-1 block text-xs font-semibold text-neutral-700">Name or ticket number</label>
                <input id="pax-admin-who" type="text" value={who} onChange={(e) => setWho(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchPeople(); } }} placeholder="For example Rakesh Ojha or 412345" autoComplete="off" className={FIELD} />
              </div>
              <button type="button" className={SECONDARY} disabled={busy || !who.trim()} onClick={() => void searchPeople()}>Find</button>
            </div>
            <p className="text-xs text-neutral-500">Only an executive (a six-digit ticket number that starts with 4) can be authorised.</p>
            {found && (found.length === 0 ? (
              <p className="text-sm text-neutral-600">No executive found with this name or ticket number. Type the full name as in the directory.</p>
            ) : (
              <ul className="space-y-1">
                {found.map((p) => (
                  <li key={p.ticket} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm">
                    <span><span className="font-semibold text-neutral-800">{p.name}</span> <span className="text-neutral-500">({p.ticket}) · {[p.designation, p.department].filter(Boolean).join(", ")}</span></span>
                    <button type="button" className={PRIMARY} disabled={busy} onClick={() => void grant(p.ticket)} aria-label={`Authorise ${p.name}`}>Authorise</button>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      )}

      {tab === "history" && (history === null ? <p className="text-sm text-neutral-600">Loading…</p> : <HistoryList history={history} />)}
    </div>
  );
}
