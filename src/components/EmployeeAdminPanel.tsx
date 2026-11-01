"use client";

// src/components/EmployeeAdminPanel.tsx
//
// THE EMPLOYEE MANAGER (step 66a; owner, 1 Nov 2026). It opens in the answer area of the search bar when the HOD of C&IT (or an executive he has authorised) types that he wants to add, change or delete an
// employee, or to authorise or withdraw an executive. Nothing is protected by what this panel hides: the SERVER decides who may do what (src/lib/employees/admin/api.ts) and checks every rule again.
// The panel only tells the person early: the same validation function runs here as the person types (so a mistake is shown at once and the button stays off until the record is right) and again on the server.
//   THIS FILE holds the state and the requests. The rules of the form (what is open when, what changed) are in employeeFormModel.ts; THE LOOK (progress rail, step cards, ID card, action bar) is in EmployeeAdminUi.tsx.
//   Four sections that open FROM TOP TO BOTTOM (step 66e): Identity -> Posting (opens when the Identity is complete) -> Service dates (when Posting is complete; the HOD ONLY: an authorised executive sees a locked
//   card) -> Contact (when the dates are complete, by cohort, see contact.ts). The button stays off until the whole record is right.
//   Adding and changing have SEPARATE forms: what was typed or loaded in one is never in the other.
//   Mobile numbers and e-mails are shown as the search cards show them (masked); typing replaces, empty keeps.
// Plain text only (React escapes it). No <form> tag: the search modal already holds a text area, and forms must not nest; Enter in a field is left alone (the buttons act).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { Search, Trash2 } from "lucide-react";
import { IST } from "@/lib/dates";
import { useSessionName } from "@/hooks/useSessionName";
import { maskEmail, maskMobile, normalizeMobile } from "@/lib/employees/admin/contact";
import { cohortOfTicket, isTicket, validateEmployee } from "@/lib/employees/admin/validate";
import type { AuditView, Authority, DelegateView, EmployeeConflict, EmployeeRecord, EmployeeAdminOpen, FieldErrors, LastChange, Lookups } from "@/lib/employees/admin/types";
import { EMPTY_FORM, FIELD_LABELS, changesOf, formFromRecord, rawOf, reasonFor, rebaseForm, resolveDepartment, theirChanges, unlockedSections, type FormValues } from "./employeeFormModel";
import { Avatar, Banner, DANGER, EmployeeAdminHeader, EmployeeForm, EmployeeHistory, EmployeeList, FIELD, PRIMARY, PanelShell, ReviewView, SECONDARY, StaleCard, TabBar, type Tab } from "./EmployeeAdminUi";

// what the tests and the rest of the app have always imported from this file
export * from "./employeeFormModel";
export { DROPDOWN_STYLE, EmployeeAdminHeader, EmployeeForm, EmployeeHistory, EmployeeList, EmployeePreviewCard, ReviewView, TabBar } from "./EmployeeAdminUi";

// ---------------------------------------------------------------------------------------------------------------------------------
type Reply = { ok: boolean; status: number; body: Record<string, unknown> };
const TIMEOUT_MS = 20000;

/** One form's state: its values, the fields the person has been in, the server's errors, the review step and the same-name question. Adding and changing each get their own. */
function useFormBlock(initial: FormValues) {
  const [values, setValues] = useState<FormValues>(initial);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [review, setReview] = useState(false);
  const [conflicts, setConflicts] = useState<EmployeeConflict[]>([]);
  const reset = (v: FormValues = EMPTY_FORM) => { setValues(v); setTouched(new Set()); setServerErrors({}); setReview(false); setConflicts([]); };
  return { values, setValues, touched, setTouched, serverErrors, setServerErrors, review, setReview, conflicts, setConflicts, reset };
}

export function EmployeeAdminPanel({ open }: { open: EmployeeAdminOpen }) {
  const role: Authority = open.role;
  const isHod = role === "hod";
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []); // StrictMode mounts, unmounts and mounts again: switch on at EVERY mount

  const initialTab: Tab = open.op === "modify" ? "modify" : open.op === "delete" && isHod ? "delete" : open.op === "delegate" && isHod ? "people" : "add";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  // the name is already known (step 67b): it travelled with the answer that opened the panel (the people directory's name, the one the history records), or else it is in the login cookie's session. The header has it on the
  // first paint and NO request is made for it. Only when neither has it is it asked for (below). It is only shown: nothing is decided on it.
  const sessionName = useSessionName();
  const initialName = (typeof open.name === "string" && open.name.trim()) || sessionName || null;
  const [me, setMe] = useState<string | null>(initialName);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [datesVisible, setDatesVisible] = useState(isHod);
  const today = useMemo(() => DateTime.now().setZone(IST).startOf("day"), []);

  const call = useCallback(async (body: Record<string, unknown>): Promise<Reply> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("/api/employees/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: res.ok, status: res.status, body: json };
    } catch {
      return { ok: false, status: 0, body: { error: "The server did not answer in time. Please try again." } };
    } finally {
      clearTimeout(timer);
    }
  }, []);
  const fail = (r: Reply) => setMessage({ tone: "error", text: typeof r.body.error === "string" ? r.body.error : "That did not work. Please try again." });

  useEffect(() => {
    // without a name in the answer that opened the panel (an older answer, or the name could not be read) the name is asked for, and SHOWN AS SOON AS IT ARRIVES: it never waits for the lookups
    if (!initialName) void call({ op: "me" }).then((m) => { if (alive.current && m.ok && typeof m.body.name === "string" && m.body.name.trim()) setMe(m.body.name.trim()); }).catch(() => undefined);
    void (async () => {
      const l = await call({ op: "lookups" });
      if (!alive.current) return;
      if (l.ok && l.body.lookups) { setLookups(l.body.lookups as Lookups); setDatesVisible(l.body.datesVisible === true); }
      else if (!l.ok) fail(l);
    })();
  }, [call, initialName]);

  // ---- the forms: ADDING and CHANGING each have their own state (step 66b): what is typed or loaded in one is never in the other ----
  const addB = useFormBlock({ ...EMPTY_FORM, name: open.op === "add" ? (open.prefill?.name ?? "") : "", ticketNo: open.op === "add" ? (open.prefill?.ticket ?? "") : "" });
  const modB = useFormBlock(EMPTY_FORM);
  const [original, setOriginal] = useState<EmployeeRecord | null>(null);
  // TWO PEOPLE AT ONCE (step 67b): set when a save is refused because somebody else changed the record first (the record as it is now, and who changed it last); the card lets the person choose
  const [stale, setStale] = useState<{ current: EmployeeRecord; last: LastChange | null } | null>(null);
  const lk: Lookups = lookups ?? { grades: [], departments: [] };
  const mode: "add" | "modify" = tab === "modify" && original ? "modify" : "add";
  const B = mode === "modify" ? modB : addB;
  const values = B.values;

  const validation = useMemo(
    () => (lookups ? validateEmployee(rawOf(values, lk, mode === "modify" ? original : null), lk, {
      today, canEditDates: datesVisible, fixedTicket: mode === "modify" ? original?.ticketNo : undefined,
      requirePno: mode === "add" || (original?.sailPno ?? "") !== "", hasMobile: mode === "modify" && !!original?.mobileMasked,
    }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, lookups, original, mode, datesVisible, today],
  );
  const liveErrors: FieldErrors = validation && !validation.ok ? validation.errors : {};
  const warnings = validation && validation.ok ? validation.warnings : [];
  const shownErrors: FieldErrors = useMemo(() => {
    const out: FieldErrors = {};
    for (const [k, msg] of Object.entries(liveErrors)) {
      const field = k === "departmentId" ? "departmentCode" : k;
      if (B.touched.has(field) || B.touched.has(k)) (out as Record<string, string>)[k] = msg as string;
    }
    return { ...out, ...B.serverErrors };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validation, B.touched, B.serverErrors]);

  // the sections open FROM TOP TO BOTTOM (employeeFormModel.ts): Posting when the Identity is complete, the dates when Posting is complete, Contact when the dates are complete
  const unlocked = unlockedSections(values, lk, liveErrors, { mode, datesVisible, loaded: !!lookups });

  const changeList = mode === "modify" && original ? changesOf(original, values, lk, datesVisible) : [];
  const valid = !!validation && validation.ok;
  const complete = valid && unlocked.contact;
  const submitDisabled = !lookups || !valid || !unlocked.contact || (mode === "modify" && changeList.length === 0) || (mode === "modify" && !!stale);
  // the reason the button is off: the first thing missing, in the order of the form (employeeFormModel.ts)
  const submitHint = mode === "modify" && stale ? "Somebody else changed this record: choose one of the two buttons above first." : reasonFor(liveErrors, unlocked, { loaded: !!lookups, valid, mode, changes: changeList.length });

  const onFormChange = (next: FormValues, field: string) => { B.setValues(next); B.setTouched((t) => new Set(t).add(field)); B.setServerErrors({}); B.setConflicts([]); setMessage(null); };

  const save = async (acknowledge: boolean) => {
    setBusy(true); setMessage(null);
    const fields = rawOf(values, lk, mode === "modify" ? original : null);
    const r = mode === "modify" && original
      ? await call({ op: "modify", id: original.id, fields, acknowledge: acknowledge ? ["same-name"] : [], version: original.version })
      : await call({ op: "add", fields, acknowledge: acknowledge ? ["same-name"] : [] });
    if (!alive.current) return;
    setBusy(false);
    if (!r.ok) return fail(r);
    const res = r.body.result as { status: string; employee?: EmployeeRecord; errors?: FieldErrors; conflicts?: EmployeeConflict[]; current?: EmployeeRecord; last?: LastChange | null };
    if (res.status === "ok" && res.employee) {
      setMessage({ tone: "ok", text: mode === "modify" ? `Saved: ${res.employee.name} (${res.employee.ticketNo}) has been changed.` : `Saved: ${res.employee.name} (${res.employee.ticketNo}) is on the roll.` });
      if (mode === "modify") { setOriginal(res.employee); modB.reset(formFromRecord(res.employee, lk)); } else addB.reset();
    } else if (res.status === "conflict") { B.setConflicts(res.conflicts ?? []); B.setReview(true); }
    else if (res.status === "invalid") { B.setServerErrors(res.errors ?? {}); B.setReview(false); setMessage({ tone: "error", text: "Please correct what is marked." }); }
    else if (res.status === "stale" && res.current) { setStale({ current: res.current, last: res.last ?? null }); B.setReview(false); B.setConflicts([]); }
    else if (res.status === "unchanged") { setMessage({ tone: "ok", text: "Nothing was changed." }); B.setReview(false); }
    else if (res.status === "missing") { setMessage({ tone: "error", text: "This employee is not on the roll any more." }); B.setReview(false); }
    else setMessage({ tone: "error", text: "You are not allowed to do that." });
  };

  // the two ways on after "somebody else changed this record": take their version, or keep my edits on top of it (a three-way merge: only the fields I changed are mine)
  const takeTheirs = () => {
    if (!stale) return;
    setOriginal(stale.current); modB.reset(formFromRecord(stale.current, lk)); setStale(null);
    setMessage({ tone: "ok", text: "Their version is loaded. Your edits were dropped." });
  };
  const keepMine = () => {
    if (!stale || !original) return;
    const r = rebaseForm(formFromRecord(original, lk), modB.values, formFromRecord(stale.current, lk));
    setOriginal(stale.current); modB.setValues(r.values); modB.setTouched(new Set()); modB.setServerErrors({}); modB.setConflicts([]); modB.setReview(false); setStale(null);
    setMessage(r.overlaps.length
      ? { tone: "warn", text: `Your edits are now on top of their version. You both changed ${r.overlaps.map((k) => FIELD_LABELS[k]).join(", ")}: your value is kept; please check it.` }
      : { tone: "ok", text: "Your edits are now on top of their version. Check the review, then save." });
  };

  // ---- the search (Change and Delete) ----
  const [query, setQuery] = useState(open.prefill?.query ?? open.prefill?.ticket ?? "");
  const [results, setResults] = useState<EmployeeRecord[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (tab !== "modify" && tab !== "delete") return;
    if (tab === "modify" && original) return;
    const text = query.trim();
    if (text.length < 2) { setResults(null); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      const r = await call({ op: "search", q: text });
      if (!alive.current) return;
      setSearching(false);
      if (r.ok) setResults((r.body.employees as EmployeeRecord[]) ?? []); else fail(r);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, tab, original, call]);
  const startChange = (e: EmployeeRecord) => { setOriginal(e); setStale(null); modB.reset(formFromRecord(e, lk)); setMessage(null); setTab("modify"); };

  // ---- delete ----
  const [target, setTarget] = useState<EmployeeRecord | null>(null);
  const [confirmTicket, setConfirmTicket] = useState("");
  const [removeLogin, setRemoveLogin] = useState(true);
  const doDelete = async () => {
    if (!target || confirmTicket.trim() !== target.ticketNo) return;
    setBusy(true); setMessage(null);
    const r = await call({ op: "delete", id: target.id, confirmTicket: confirmTicket.trim(), removeLogin, version: target.version });
    if (!alive.current) return;
    setBusy(false);
    if (!r.ok) return fail(r);
    const res = r.body.result as { status: string; name?: string; ticketNo?: string; loginRemoved?: boolean; reason?: string; current?: EmployeeRecord; last?: LastChange | null };
    if (res.status === "ok") { setMessage({ tone: "ok", text: `Deleted: ${res.name} (${res.ticketNo})${res.loginRemoved ? " and his login account" : ""}. The history keeps the record.` }); setTarget(null); setConfirmTicket(""); setResults(null); setQuery(""); }
    else if (res.status === "stale" && res.current) { setTarget(res.current); setConfirmTicket(""); setMessage({ tone: "warn", text: `${res.current.name} was changed${res.last ? ` by ${res.last.actorName} (${res.last.actorTicket})` : ""} after you opened him. He is shown below as he is now: look again, then type his ticket number to confirm.` }); }
    else if (res.status === "protected") setMessage({ tone: "error", text: "The HOD of C&IT, and your own record, cannot be deleted." });
    else if (res.status === "invalid") setMessage({ tone: "error", text: res.reason ?? "The ticket number typed does not match." });
    else if (res.status === "missing") setMessage({ tone: "error", text: "This employee is not on the roll any more." });
    else setMessage({ tone: "error", text: "You are not allowed to do that." });
  };

  // ---- people and history ----
  const [delegates, setDelegates] = useState<DelegateView[] | null>(null);
  const [find, setFind] = useState("");
  const [found, setFound] = useState<Array<{ ticket: string; name: string; designation: string; department: string }> | null>(null);
  const [history, setHistory] = useState<AuditView[] | null>(null);
  const loadDelegates = useCallback(async () => { const r = await call({ op: "delegates" }); if (alive.current) { if (r.ok) setDelegates((r.body.delegates as DelegateView[]) ?? []); else setMessage({ tone: "error", text: typeof r.body.error === "string" ? r.body.error : "That did not work." }); } }, [call]);
  const loadHistory = useCallback(async () => { const r = await call({ op: "audit" }); if (alive.current) { if (r.ok) setHistory((r.body.history as AuditView[]) ?? []); else setMessage({ tone: "error", text: typeof r.body.error === "string" ? r.body.error : "That did not work." }); } }, [call]);
  useEffect(() => { if (tab === "people" && isHod) void loadDelegates(); if (tab === "history") void loadHistory(); }, [tab, isHod, loadDelegates, loadHistory]);
  const doFind = async () => { setBusy(true); const r = await call({ op: "find-executive", q: find }); if (!alive.current) return; setBusy(false); if (r.ok) setFound((r.body.executives as typeof found) ?? []); else fail(r); };
  const grant = async (ticket: string) => { setBusy(true); const r = await call({ op: "grant", ticket }); if (!alive.current) return; setBusy(false); if (!r.ok) return fail(r); const res = r.body.result as { status: string; reason?: string }; if (res.status === "ok") { setMessage({ tone: "ok", text: "Authorised. From now on this executive can add and change employees (not the dates, and not delete)." }); setFound(null); setFind(""); void loadDelegates(); } else setMessage({ tone: "error", text: res.status === "already" ? "He is already authorised." : res.reason ?? "That did not work." }); };
  const revoke = async (ticket: string) => { setBusy(true); const r = await call({ op: "revoke", ticket }); if (!alive.current) return; setBusy(false); if (!r.ok) return fail(r); setMessage({ tone: "ok", text: "The authority is withdrawn." }); void loadDelegates(); };

  const onTab = (t: Tab) => { setTab(t); setMessage(null); };
  const grade = lk.grades.find((g) => String(g.id) === values.gradeId);
  const dept = resolveDepartment(values.departmentCode, lk, values.ticketNo);
  const summary: Array<[string, string]> = [
    ["Ticket number", values.ticketNo], ["Name", values.name.trim().replace(/\s+/g, " ").toUpperCase()], ["SAIL P.No.", values.sailPno.trim().toUpperCase()], ["Designation", grade?.title ?? ""], ["Department", dept?.name ?? ""],
    ["Position in grade", "last in the grade"], ...(isTicket(values.ticketNo) && cohortOfTicket(values.ticketNo) === "executive" ? ([["NIC mail", maskEmail(values.emailNic.trim().toLowerCase())], ["Web-mail", maskEmail(values.webmail.trim().toLowerCase())]] as Array<[string, string]>) : ([["E-mail", maskEmail(values.email.trim().toLowerCase())]] as Array<[string, string]>)),
    ["Mobile", maskMobile(normalizeMobile(values.mobile))], ["Address", values.address.trim()],
    ...(datesVisible ? ([["Date of birth", values.dateOfBirth], ["Date of joining", values.dateOfJoining]] as Array<[string, string]>) : []),
  ];

  return (
    <PanelShell>
      <EmployeeAdminHeader authority={role} name={me} />
      <TabBar tab={tab} authority={role} onTab={onTab} />
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      {tab === "modify" && original && stale && (
        <StaleCard who={stale.last ? { name: stale.last.actorName, ticket: stale.last.actorTicket, at: stale.last.at } : null} changes={theirChanges(original, stale.current, datesVisible)} busy={busy} onTheirs={takeTheirs} onMine={keepMine} />
      )}

      {(tab === "add" || (tab === "modify" && original)) && (
        B.review && valid ? (
          <ReviewView mode={mode} title={mode === "modify" ? `Review the changes to ${original?.name} (${original?.ticketNo})` : "Review the new employee"} changes={changeList} summary={summary} warnings={warnings} conflicts={B.conflicts} busy={busy} onConfirm={(ack) => void save(ack)} onBack={() => { B.setReview(false); B.setConflicts([]); }} />
        ) : (
          <>
            {tab === "modify" && original && <div className="flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-indigo-100"><Avatar name={original.name} /><p className="text-sm text-slate-600">Changing <span className="font-bold text-slate-900">{original.name}</span> <span className="font-mono text-xs">({original.ticketNo})</span></p></div>}
            <EmployeeForm mode={mode} idPrefix={`emp-${mode}`} values={values} lookups={lk} errors={shownErrors} warnings={warnings} datesVisible={datesVisible} unlocked={unlocked} allErrors={liveErrors} complete={complete} original={mode === "modify" ? original : null} today={today} busy={busy}
              submitLabel={mode === "modify" ? "Review the changes" : "Review and save"} submitDisabled={submitDisabled} submitHint={submitHint}
              onChange={onFormChange} onSubmit={() => B.setReview(true)} onCancel={mode === "modify" ? () => { setOriginal(null); setStale(null); modB.reset(); setResults(null); } : undefined} />
          </>
        )
      )}

      {((tab === "modify" && !original) || (tab === "delete" && !target)) && (
        <div className="space-y-3 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-sm backdrop-blur" data-emp-search="true">
          <label htmlFor="emp-search" className="block text-xs font-semibold text-slate-700">{tab === "delete" ? "Find the employee to delete" : "Find the employee to change"}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input id="emp-search" data-emp-field="search" className={FIELD} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, ticket number or SAIL P.No." autoComplete="off" />
          </div>
          {searching && <p className="text-xs text-slate-500">Searching…</p>}
          {results && <EmployeeList employees={results} canDelete={isHod && tab === "delete"} onEdit={startChange} onDelete={(e) => { setTarget(e); setConfirmTicket(""); setMessage(null); }} />}
        </div>
      )}

      {tab === "delete" && target && (
        <div className="space-y-3 rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-5 shadow-[0_18px_44px_-22px_rgba(225,29,72,0.45)]" data-emp-delete-confirm="true">
          <p className="flex items-center gap-2 text-sm font-bold text-rose-950"><Trash2 className="h-4 w-4" aria-hidden="true" />Delete {target.name} ({target.ticketNo})?</p>
          <p className="text-sm text-rose-900">{target.gradeTitle}, {target.departmentName}. He leaves the roll at once. The history keeps the whole record and who deleted it.</p>
          {target.hasLogin && (
            <label className="flex items-center gap-2 text-sm text-red-950">
              <input type="checkbox" data-emp-remove-login="true" checked={removeLogin} onChange={(e) => setRemoveLogin(e.target.checked)} /> Also delete his login account (and what hangs on it: sessions, read marks)
            </label>
          )}
          <div>
            <label htmlFor="emp-confirm" className="mb-1.5 block text-xs font-semibold text-rose-900">{`Type his ticket number, ${target.ticketNo}, to confirm`}</label>
            <input id="emp-confirm" data-emp-field="confirm" className={`${FIELD} pl-3`} value={confirmTicket} onChange={(e) => setConfirmTicket(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="off" />
          </div>
          <div className="flex gap-2">
            <button type="button" data-emp-delete-go="true" className={DANGER} disabled={busy || confirmTicket.trim() !== target.ticketNo} onClick={() => void doDelete()}>Yes, delete him</button>
            <button type="button" className={SECONDARY} disabled={busy} onClick={() => { setTarget(null); setConfirmTicket(""); }}>No, keep him</button>
          </div>
        </div>
      )}

      {tab === "people" && isHod && (
        <div className="space-y-3" data-emp-people="true">
          <p className="text-sm font-bold text-neutral-900">Executives who may add and change employees</p>
          {delegates === null ? <p className="text-sm text-neutral-600">Loading…</p> : delegates.length === 0 ? <p className="text-sm text-neutral-600">Nobody else has been authorised: only you can change the employee records.</p> : (
            <ul className="space-y-1">{delegates.map((d) => (
              <li key={d.ticket} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                <span><span className="font-semibold">{d.name}</span> <span className="text-neutral-500">({d.ticket}) · authorised by {d.grantedByName} on {DateTime.fromISO(d.grantedAt).setZone(IST).setLocale("en-IN").toLocaleString({ dateStyle: "medium" })}</span></span>
                <button type="button" className={SECONDARY} disabled={busy} onClick={() => void revoke(d.ticket)}>Withdraw</button>
              </li>))}</ul>
          )}
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <label htmlFor="emp-find" className="block text-xs font-semibold text-neutral-700">Authorise an executive (name or ticket number)</label>
            <div className="flex gap-2">
              <input id="emp-find" className={FIELD} value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (find.trim()) void doFind(); } }} placeholder="For example Rakesh Ojha or 412345" autoComplete="off" />
              <button type="button" className={SECONDARY} disabled={busy || !find.trim()} onClick={() => void doFind()}>Find</button>
            </div>
            <p className="text-xs text-neutral-500">Only an executive (a ticket that starts with 4) can be authorised. He can add and change employees; he cannot see or set the dates, delete anybody, or authorise others.</p>
            {found && (found.length === 0 ? <p className="text-sm text-neutral-600">No executive matches.</p> : (
              <ul className="space-y-1">{found.map((f) => (
                <li key={f.ticket} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                  <span><span className="font-semibold">{f.name}</span> <span className="text-neutral-500">({f.ticket}) · {f.designation}{f.department ? `, ${f.department}` : ""}</span></span>
                  <button type="button" className={PRIMARY} disabled={busy} onClick={() => void grant(f.ticket)}>Authorise</button>
                </li>))}</ul>
            ))}
          </div>
        </div>
      )}

      {tab === "history" && (history === null ? <p className="text-sm text-neutral-600">Loading…</p> : <EmployeeHistory history={history} />)}
    </PanelShell>
  );
}
