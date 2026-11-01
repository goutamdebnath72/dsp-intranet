"use client";

// src/components/PaxAdminPanel.tsx
//
// THE PAX DIRECTORY EDITOR (step 64a; owner, 31 Oct 2026). It opens in the answer area of the search bar when the HOD of C&IT (or an executive he has authorised) types that he wants to add, change or
// delete a PAX number, or to authorise or withdraw an executive. Three inputs: Department, Location, PAX number. Nothing is protected by what this panel hides: the SERVER decides who may do what (src/lib/pax/admin/api.ts)
// and checks every rule again. The panel only tells the person early, and asks the questions the owner wanted when an entry clashes with a saved one:
// "do you want to edit the existing line, or have you made a mistake?".
//
// THIS FILE holds the state and the requests, and every rule of what happens when. THE LOOK (the teal frame, the underline tabs, the three-node rail, the telephone-line plate, the action bar, the dialogs, the lists)
// is in PaxAdminUi.tsx and decides nothing (step 67a; owner, 1 Nov 2026: "implement it, keeping all the logic intact"). It re-exports what it has always exported.
//
// Plain text only (React escapes it). No <form> tag: the search modal already holds a text area, and forms must not nest; Enter in a field does the same as the button.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { IST } from "@/lib/dates";
import { AlertTriangle, History, Pencil, PhoneOff, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import type { Acknowledge, PaxAdminOpen, PaxAuditView, PaxConflict, PaxDelegateView, PaxEntryView } from "@/lib/pax/admin/types";
import { describeLine } from "@/lib/pax/admin/conflicts";
import { cleanInput, validateEntry, type FieldErrors } from "@/lib/pax/admin/validate";
import { AuthoriseCard, ChangingBanner, ConfirmCard, ConflictView, DANGER, EntryFormView, EntryList, FIELD, HistoryList, IconField, Notice, PRIMARY, PaxAdminHeader, PaxShell, PaxTabs, PersonRow, SECONDARY, SearchBar, LineAboutToGo, type FormValues } from "./PaxAdminUi";

// what the tests and the rest of the app have always imported from this file
export { ConflictView, EntryFormView, EntryList, HistoryList, PaxAdminHeader, conflictText } from "./PaxAdminUi";
export type { FormValues } from "./PaxAdminUi";

type Tab = "add" | "modify" | "delete" | "people" | "history";

// ---------------------------------------------------------------------------------------------------------------------------------
// the panel
// ---------------------------------------------------------------------------------------------------------------------------------

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** A request that is not answered in this time ends with a message: a form must never stay greyed (busy) for ever. */
const REQUEST_TIMEOUT_MS = 20_000;

async function call(payload: Json): Promise<{ ok: boolean; status: number; body: Json }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("/api/pax/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin", signal: ctl.signal });
    let body: Json = {};
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

  // who is logged in (the server's answer; the name comes from the people directory)
  const [me, setMe] = useState<string | null>(null);

  // people and history
  const [delegates, setDelegates] = useState<PaxDelegateView[] | null>(null);
  const [who, setWho] = useState("");
  const [found, setFound] = useState<Array<{ ticket: string; name: string; designation: string; department: string }> | null>(null);
  const [revoking, setRevoking] = useState<PaxDelegateView | null>(null);
  const [history, setHistory] = useState<PaxAuditView[] | null>(null);

  const alive = useRef(true);
  // React's StrictMode (npm run dev) mounts, unmounts and mounts again: the flag must be switched ON again at every mount, or every answer would be thrown away and the button would stay greyed for ever
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    void (async () => {
      const r = await call({ op: "me" });
      if (alive.current && r.ok && typeof r.body.name === "string" && r.body.name.trim()) setMe(r.body.name.trim());
    })();
  }, []);
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
  /** The add form saves only when its required inputs are there (the department and a PAX number of exactly 5 digits starting with 4; the location is optional): the button stays off until then (owner, 31 Oct 2026), and says what is missing. */
  const addValid = validateEntry(addForm);
  const addHint = addValid.ok ? undefined : (addValid.errors.department ?? addValid.errors.number ?? addValid.errors.location);

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
  /** The change form saves only when the PAX number has been changed to ANOTHER number that satisfies the whole rule (owner, 31 Oct 2026), and the rest is valid too. */
  const editClean = cleanInput(editForm);
  const editValid = validateEntry(editForm);
  const editNumberChanged = editing !== null && editClean.number !== editing.number;
  const canSaveEdit = editing !== null && editNumberChanged && editValid.ok;
  const editHint = !editing || canSaveEdit
    ? undefined
    : !editNumberChanged
      ? "To save, change the PAX number to a different number: exactly 5 digits, starting with 4."
      : editValid.ok
        ? undefined
        : editValid.errors.number ?? editValid.errors.department ?? editValid.errors.location;

  async function submitEdit(ack: Acknowledge[] = []) {
    if (!editing || !canSaveEdit) return;
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
    { id: "add", label: "Add", icon: <Plus className="h-4 w-4" aria-hidden="true" />, show: true },
    { id: "modify", label: "Change", icon: <Pencil className="h-4 w-4" aria-hidden="true" />, show: true },
    { id: "delete", label: "Delete", icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, show: true },
    { id: "people", label: "Authorised people", icon: <Users className="h-4 w-4" aria-hidden="true" />, show: isHod },
    { id: "history", label: "Recent changes", icon: <History className="h-4 w-4" aria-hidden="true" />, show: true },
  ];

  const searchBox = <SearchBar id="pax-admin-search" label="Find a saved line" value={query} placeholder="Department, location or number" busy={busy} onChange={setQuery} onSearch={() => void loadEntries(query)} />;

  return (
    <PaxShell>
      <PaxAdminHeader authority={open.role} name={me} />

      <PaxTabs tabs={tabs} tab={tab} onTab={(id) => { setTab(id); setNotice(null); }} />

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {tab === "add" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Type the department, the location and the new PAX number. Every entry is checked against what is saved.</p>
          <EntryFormView idPrefix="pax-add" values={addForm} errors={addErrors} busy={busy} submitLabel="Check and save" submitDisabled={!addValid.ok} submitHint={addHint} onChange={(v) => { setAddForm(v); setAddConflict(null); }} onSubmit={() => void submitAdd()}>
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
          </EntryFormView>
        </div>
      )}

      {tab === "modify" && (
        <div className="space-y-4">
          {editing ? (
            <>
              <ChangingBanner line={editing} />
              <EntryFormView idPrefix="pax-edit" values={editForm} errors={editErrors} busy={busy} submitLabel="Check and save the change" submitDisabled={!canSaveEdit} submitHint={editHint} editing onChange={(v) => { setEditForm(v); setEditConflict(null); }} onSubmit={() => void submitEdit()} onCancel={() => { setEditing(null); setEditConflict(null); }}>
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
              </EntryFormView>
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
        <div className="space-y-4">
          {searchBox}
          {listed && <EntryList entries={entries} actionLabel="Delete" actionClass={DANGER} busy={busy} onPick={(e) => { setDeleting(e); setNotice(null); }} />}
          {deleting && (
            <ConfirmCard kind="delete" ariaLabel="Confirm the deletion" icon={<PhoneOff className="h-5 w-5 shrink-0" aria-hidden="true" />} title={`Delete ${describeLine(deleting)}?`}>
              <LineAboutToGo entry={deleting} />
              <p>The line leaves the PAX directory at once. The history keeps a record of what it was and who deleted it.</p>
              <div className="flex gap-2">
                <button type="button" className={DANGER} disabled={busy} onClick={() => void confirmDelete()}>Yes, delete it</button>
                <button type="button" className={SECONDARY} disabled={busy} onClick={() => setDeleting(null)}>No, keep it</button>
              </div>
            </ConfirmCard>
          )}
        </div>
      )}

      {tab === "people" && isHod && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-800"><ShieldCheck className="h-4 w-4 text-teal-600" aria-hidden="true" />Executives who may change PAX numbers</p>
            {delegates === null ? (
              <p className="text-sm text-slate-600">Loading…</p>
            ) : delegates.length === 0 ? (
              <p className="text-sm text-slate-600">Nobody else has been authorised: only you can change the PAX directory.</p>
            ) : (
              <ul className="space-y-2">
                {delegates.map((d) => (
                  <PersonRow key={d.ticket} name={d.name} action={<button type="button" className={SECONDARY} disabled={busy} onClick={() => { setRevoking(d); setNotice(null); }} aria-label={`Withdraw the authority of ${d.name}`}>Withdraw</button>}>
                    ({d.ticket}) · authorised by {d.grantedByName} on {DateTime.fromISO(d.grantedAt).setZone(IST).setLocale("en-IN").toLocaleString({ dateStyle: "medium" })}
                  </PersonRow>
                ))}
              </ul>
            )}
            {revoking && (
              <ConfirmCard kind="revoke" ariaLabel="Confirm the withdrawal" icon={<AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />} title={`Withdraw the authority of ${revoking.name} (${revoking.ticket})?`}>
                <p>He or she can no longer add, change or delete PAX numbers. What was already done stays in the history.</p>
                <div className="flex gap-2">
                  <button type="button" className={DANGER} disabled={busy} onClick={() => void confirmRevoke()}>Yes, withdraw it</button>
                  <button type="button" className={SECONDARY} disabled={busy} onClick={() => setRevoking(null)}>No</button>
                </div>
              </ConfirmCard>
            )}
          </div>
          <AuthoriseCard>
            <p className="text-sm font-bold text-slate-800">Authorise an executive</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1">
                <IconField id="pax-admin-who" label="Name or ticket number" icon={<Users className="h-[18px] w-[18px]" aria-hidden="true" />}>
                  <input id="pax-admin-who" type="text" value={who} onChange={(e) => setWho(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchPeople(); } }} placeholder="For example Rakesh Ojha or 412345" autoComplete="off" className={FIELD} />
                </IconField>
              </div>
              <button type="button" className={SECONDARY} disabled={busy || !who.trim()} onClick={() => void searchPeople()}>Find</button>
            </div>
            <p className="text-xs text-slate-500">Only an executive (a six-digit ticket number that starts with 4) can be authorised.</p>
            {found && (found.length === 0 ? (
              <p className="text-sm text-slate-600">No executive found with this name or ticket number. Type the full name as in the directory.</p>
            ) : (
              <ul className="space-y-2">
                {found.map((p) => (
                  <PersonRow key={p.ticket} name={p.name} action={<button type="button" className={PRIMARY} disabled={busy} onClick={() => void grant(p.ticket)} aria-label={`Authorise ${p.name}`}>Authorise</button>}>
                    ({p.ticket}) · {[p.designation, p.department].filter(Boolean).join(", ")}
                  </PersonRow>
                ))}
              </ul>
            ))}
          </AuthoriseCard>
        </div>
      )}

      {tab === "history" && (history === null ? <p className="text-sm text-slate-600">Loading…</p> : <HistoryList history={history} />)}
    </PaxShell>
  );
}
