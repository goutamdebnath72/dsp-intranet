// src/components/ChangePasswordModal.tsx
//
// The "Change password" window of a signed-in person. It opens from the account menu in the top bar, and by itself after sign-in when the password has run out (180 days): then it cannot be closed, only filled in or
// left by signing out, and it says in words that the password has expired and for how many days a new one is valid. I make it ask the server first (may this person change it here; has it run out; is a one-time code needed),
// then it takes the current password and the new one twice. Important: none of the three password boxes accepts copy, cut, paste or drop, because a password is typed, twice, by the person. The rules, the last-5 check and the one-time
// code belong to the server (src/app/api/account/password/route.ts, src/lib/security/changePassword.ts); the window only shows what the server answers. Nothing typed here is stored in the browser.
"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, KeyRound, Loader2, ShieldAlert, X } from "lucide-react";

interface Status {
  canChange: boolean;
  reason?: string;
  validDays?: number;
  required?: boolean;
  requiredMessage?: string;
  note?: string;
  otp?: { required: boolean; maskedTo?: string; blocked?: boolean };
}
type Gate = { state: "loading" } | { state: "ok"; s: Status } | { state: "locked"; reason: string } | { state: "error" };

/** A password box takes typing only: I refuse copy, cut, paste, drop and the context menu, and dragging text out of it too. */
export const NO_CLIPBOARD = {
  onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
  onCut: (e: React.ClipboardEvent) => e.preventDefault(),
  onPaste: (e: React.ClipboardEvent) => e.preventDefault(),
  onDrop: (e: React.DragEvent) => e.preventDefault(),
  onDragStart: (e: React.DragEvent) => e.preventDefault(),
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  autoCapitalize: "off",
  spellCheck: false,
  "data-no-clipboard": "true",
} as const;

export function ChangePasswordModal({ isOpen, onClose, required = false, onChanged }: { isOpen: boolean; onClose: () => void; /** When the password has run out, I do not let the window be closed. */ required?: boolean; onChanged?: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [gate, setGate] = useState<Gate>({ state: "loading" });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [wait, setWait] = useState(0);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  // I start each opening clean and ask the server.
  useEffect(() => {
    if (!isOpen) return;
    setCurrent(""); setNext(""); setAgain(""); setCode(""); setShow(false); setBusy(false); setError(""); setDone(false); setSentTo(""); setWait(0); setGate({ state: "loading" });
    let live = true;
    fetch("/api/account/password", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as Status) : null))
      .then((d) => { if (live) setGate(!d ? { state: "error" } : d.canChange ? { state: "ok", s: d } : { state: "locked", reason: d.reason ?? "The password cannot be changed here." }); })
      .catch(() => { if (live) setGate({ state: "error" }); });
    return () => { live = false; };
  }, [isOpen]);

  useEffect(() => { if (isOpen && gate.state === "ok") first.current?.focus(); }, [isOpen, gate.state]);
  useEffect(() => {
    if (!isOpen || required) return; // I do not close on Escape when the window must be filled in
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, required, onClose]);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const s = gate.state === "ok" ? gate.s : null;
  const needsCode = !!s?.otp?.required;

  const sendCode = async () => {
    if (busy || wait > 0) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/account/password/otp", { method: "POST" });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; maskedTo?: string; resendInSec?: number; error?: string } | null;
      if (r.ok && d?.ok) { setSentTo(d.maskedTo ?? s?.otp?.maskedTo ?? ""); setWait(d.resendInSec ?? 60); }
      else setError(d?.error || "The code could not be sent just now. Please try again later.");
    } catch {
      setError("The code could not be sent just now. Please check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (busy) return;
    if (!current) return setError("Enter your current password.");
    if (next.length < 8) return setError("Use at least 8 characters for the new password.");
    if (next !== again) return setError("The new password and its repetition are not the same.");
    if (needsCode && !/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code that was sent to you.");
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next, ...(needsCode ? { otp: code.trim() } : {}) }) });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (r.ok && d?.ok) { setDone(true); setCurrent(""); setNext(""); setAgain(""); setCode(""); }
      else setError(d?.error || "The password could not be changed just now. Please try again.");
    } catch {
      setError("The password could not be changed just now. Please check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const finish = () => { onChanged?.(); onClose(); };

  if (!mounted) return null;
  const input = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200";
  const days = s?.validDays ?? 180;
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div data-change-password data-password-required={required ? "true" : undefined} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={required ? undefined : onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label="Change password" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-neutral-800"><KeyRound size={20} className="text-primary-600" />{required ? "Set a new password" : "Change password"}</h3>
              {!required && <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100"><X size={18} /></button>}
            </div>

            {gate.state === "loading" && <p className="flex items-center gap-2 py-6 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" />One moment…</p>}
            {gate.state === "error" && <p role="alert" className="py-4 text-sm text-red-600">The page could not be reached just now. Please close this window and try again.</p>}
            {gate.state === "locked" && (
              <div role="status" data-password-locked className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <ShieldAlert size={20} className="mt-0.5 shrink-0" /><p>{gate.reason}</p>
              </div>
            )}
            {s && done && (
              <div role="status" data-password-done className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 size={40} className="text-emerald-600" />
                <p className="font-semibold text-neutral-800">Your password is changed.</p>
                <p className="text-sm text-neutral-600">It is valid for {days} days. Use the new password the next time you sign in.</p>
                <button type="button" onClick={finish} className="mt-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">Continue</button>
              </div>
            )}
            {s && !done && (
              <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-3" noValidate>
                {required && s.requiredMessage && (
                  <div role="alert" data-password-expired className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <Clock size={20} className="mt-0.5 shrink-0" /><p>{s.requiredMessage}</p>
                  </div>
                )}
                {s.note && !required && <p data-password-note className="text-xs text-neutral-600">{s.note}</p>}
                <p className="text-xs text-neutral-500">Until you change it, your password is your SAIL Personal No.</p>
                <label className="block text-sm font-medium text-neutral-700">Current password
                  <input ref={first} type={show ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} maxLength={128} className={`${input} mt-1`} {...NO_CLIPBOARD} />
                </label>
                <label className="block text-sm font-medium text-neutral-700">New password
                  <input type={show ? "text" : "password"} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} maxLength={128} className={`${input} mt-1`} {...NO_CLIPBOARD} />
                  <span className="mt-1 block text-xs font-normal text-neutral-500">At least 8 characters. Not your ticket number, SAIL Personal No., or any of your last 5 passwords.</span>
                </label>
                <label className="block text-sm font-medium text-neutral-700">New password again
                  <input type={show ? "text" : "password"} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} maxLength={128} className={`${input} mt-1`} {...NO_CLIPBOARD} />
                  <span className="mt-1 block text-xs font-normal text-neutral-500">Type it again: pasting is not allowed in these boxes.</span>
                </label>
                {needsCode && (
                  <div data-password-otp className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-sm text-neutral-700">For your safety a one-time code is sent to <strong>{sentTo || s.otp?.maskedTo}</strong>.</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => void sendCode()} disabled={busy || wait > 0} className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">{sentTo ? (wait > 0 ? `Send again in ${wait}s` : "Send again") : "Send the code"}</button>
                      <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="6-digit code" aria-label="One-time code" className={`${input} !w-36 tracking-widest`} />
                    </div>
                  </div>
                )}
                {s.otp?.blocked && <p role="alert" className="text-sm text-red-600">No mobile number or e-mail address is recorded for you, so a code cannot be sent. Please ask C&amp;IT to add your mobile number.</p>}
                <label className="flex items-center gap-2 text-xs text-neutral-600"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />Show the passwords</label>
                <p role="alert" className="min-h-[1.25rem] text-sm text-red-600">{error}</p>
                <div className="flex justify-end gap-3">
                  {required
                    ? <button type="button" onClick={() => void signOut()} className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-semibold hover:bg-neutral-200">Sign out</button>
                    : <button type="button" onClick={onClose} className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-semibold hover:bg-neutral-200">Cancel</button>}
                  <button type="submit" disabled={busy || !!s.otp?.blocked} className="flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60">{busy && <Loader2 size={14} className="animate-spin" />}Change password</button>
                </div>
              </form>
            )}
            {required && gate.state === "locked" && <div className="mt-3 flex justify-end"><button type="button" onClick={() => void signOut()} className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-semibold hover:bg-neutral-200">Sign out</button></div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
