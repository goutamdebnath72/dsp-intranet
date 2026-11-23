"use client";

// src/components/ManagementHubPanel.tsx
//
// THE MANAGEMENT PAGE, drawn in the answer area of the search bar: I show the titles of the management tools this person may open, each a button that opens the tool (like the list of calculators). The list comes from the server
// (src/lib/facility/hub.ts) and holds only what the login may use. Pressing a title types the tool's own words into the search bar, and the tool checks the person again before it opens.
import React from "react";
import { ArrowRight, CalendarDays, Eye, FileText, LockKeyhole, Megaphone, Phone, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { GATE_TEXT, type ManagementGate, type ManagementHubOpen, type HubTool } from "@/lib/facility/hub";
import type { FacilityKey } from "@/lib/facility/registry";
import { BackButton, ToolShell } from "@/components/tools/toolKit";

const ICON: Record<FacilityKey, React.ReactNode> = {
  employee: <Users size={18} />,
  pax: <Phone size={18} />,
  holiday: <CalendarDays size={18} />,
  circular: <FileText size={18} />,
  announcement: <Megaphone size={18} />,
  access_log: <Eye size={18} />,
};
const TILE: Record<FacilityKey, string> = {
  employee: "bg-gradient-to-br from-blue-600 to-indigo-600",
  pax: "bg-gradient-to-br from-emerald-600 to-teal-600",
  holiday: "bg-gradient-to-br from-amber-500 to-orange-600",
  circular: "bg-gradient-to-br from-sky-600 to-blue-700",
  announcement: "bg-gradient-to-br from-fuchsia-600 to-violet-600",
  access_log: "bg-gradient-to-br from-rose-600 to-red-600",
};

export function ManagementHubPanel({ open, onOpen, onPrefetch, onClose }: { open: ManagementHubOpen; onOpen: (phrase: string) => void; /** called when a title is pointed at, touched or focused: I ask for the page behind it ahead of the press */ onPrefetch?: (phrase: string) => void; onClose: () => void }) {
  const hod = open.role === "hod";
  // I made the page a ToolShell, the frame of the calculators' pages: the same soft gradient and blurred lights (the bluish glow behind the cross), the same header, the same cross
  return (
    <ToolShell
      title="Management"
      subtitle={`Open a page. ${hod ? "As the HOD of C&IT you hold all of them." : "You see only the pages the HOD of C&IT has given you."}`}
      icon={<ShieldCheck size={20} />}
      tone="sky"
      notice={false}
      badge={<span data-hub-role={open.role} className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${hod ? "bg-indigo-100 text-indigo-800" : "bg-emerald-100 text-emerald-800"}`}>{hod ? "HOD of C&IT" : "Authorised delegate"}{open.name ? ` · ${open.name}` : ""}</span>}
      closeLabel="Close the management page"
      onClose={onClose}
    >
      {/* I keep every card the same size: the rows share the height of the tallest card (auto-rows-fr), and each card fills its cell (h-full), so a one-line description never makes a smaller card */}
      <ul data-management-hub data-hub-grid className="grid auto-rows-fr gap-3 sm:grid-cols-2">
        {open.tools.map((t: HubTool) => (
          <li key={t.key} className="flex">
            <button
              type="button"
              data-hub-tool={t.key}
              onClick={() => onOpen(t.phrase)}
              onPointerEnter={() => onPrefetch?.(t.phrase)}
              onPointerDown={() => onPrefetch?.(t.phrase)}
              onFocus={() => onPrefetch?.(t.phrase)}
              className="group flex h-full w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-3.5 py-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-white hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow ${TILE[t.key]}`}>{ICON[t.key]}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-900">{t.label}</span>
                <span className="block text-xs leading-snug text-slate-500">{t.text}</span>
              </span>
              <ArrowRight size={16} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
            </button>
          </li>
        ))}
      </ul>
    </ToolShell>
  );
}

/** The Back button above a management tool's page goes back to the management page. I made it the same button as on the calculators' pages, on the right. */
export function ManagementBack({ onBack }: { onBack: () => void }) {
  return (
    <div data-management-back className="mb-3 flex justify-end">
      <BackButton label="Back to the management page" onClick={onBack} />
    </div>
  );
}

/**
 * WHAT A PERSON WHO MAY NOT HAVE THE PAGE SEES, in the calculators' frame: not signed in, a card asks him to sign in, with a Sign in button that opens the login window (and, once he has signed in, the same question is asked
 * again by itself: he gets the page if he is authorised and the refusal if he is not); signed in and not authorised, the refusal. I use the same words for the refusal whichever way he came to it.
 */
export function ManagementGatePanel({ gate, onSignIn, onClose }: { gate: ManagementGate; onSignIn?: () => void; onClose: () => void }) {
  const login = gate.state === "login";
  return (
    <ToolShell
      title="Management"
      subtitle={login ? "Sign in to continue" : "Access not allowed"}
      icon={login ? <LockKeyhole size={20} /> : <ShieldAlert size={20} />}
      tone={login ? "sky" : "rose"}
      notice={false}
      closeLabel="Close the management page"
      onClose={onClose}
    >
      <div data-management-gate={gate.state} role={login ? undefined : "alert"} className={`flex flex-col items-center gap-3 rounded-2xl border bg-white/70 px-5 py-8 text-center shadow-sm ${login ? "border-sky-100" : "border-rose-100"}`}>
        <span className={`flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-lg ring-8 ${login ? "bg-gradient-to-br from-sky-500 via-cyan-500 to-indigo-500 ring-sky-100/80 shadow-sky-500/30" : "bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-500 ring-rose-100/80 shadow-rose-500/30"}`}>
          {login ? <LockKeyhole size={28} aria-hidden="true" /> : <ShieldAlert size={28} aria-hidden="true" />}
        </span>
        <h4 className="text-lg font-extrabold leading-tight text-slate-900">{login ? GATE_TEXT.loginTitle : GATE_TEXT.deniedTitle}</h4>
        <p className="max-w-md text-sm leading-relaxed text-slate-600">{login ? GATE_TEXT.login : GATE_TEXT.denied}</p>
        {login && onSignIn && (
          <button type="button" onClick={onSignIn} data-gate-signin className="mt-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/30 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 active:scale-[0.98]">
            <LockKeyhole size={15} aria-hidden="true" /> Sign in
          </button>
        )}
        {login && <p className="max-w-md text-xs text-slate-500">If you are not one of them, you will be told so after you sign in.</p>}
        {!login && gate.name && <p className="text-xs text-slate-500">You are signed in as <strong className="text-slate-700">{gate.name}</strong>.</p>}
      </div>
    </ToolShell>
  );
}
