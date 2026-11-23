// src/components/OmniAdminAsk.tsx
//
// "ARE YOU AUTHORISED?": shown when a signed-out visitor presses the Admin button (More tools). The management pages are for the HOD of C&IT and the people he has authorised. Yes: the sign-in window opens at once (I made Yes BE the
// click on Sign in; the caller opens the window), and when the person has signed in the bar asks the server who they are and shows the management page they may open, or says in red that they are not authorised
// (the same card as for the typed word "management": src/components/ManagementHubPanel.tsx). No: back to Everything. I ask nothing of the server until the visitor has said Yes and signed in.
"use client";

import React from "react";
import { ShieldCheck } from "lucide-react";

export function OmniAdminAsk({ said, onYes, onNo }: { said: "yes" | null; onYes: () => void; onNo: () => void }) {
  return (
    <div role="group" aria-label="Are you authorised to access the admin pages?" data-admin-ask className="mx-2 mb-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
      <p className="flex items-start gap-2 leading-snug">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <span>
          The admin pages (Employee, PAX directory, Holiday, Circular and Announcement managers, and the Contact access log) change the plant&rsquo;s data. They are for the HOD of C&amp;IT and the people the HOD has authorised.
          <strong className="mt-1 block text-[13px]">Are you authorised to access them?</strong>
        </span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
        <button type="button" onClick={onYes} aria-pressed={said === "yes"} data-ask-yes className={`rounded-md border px-3 py-1 text-[11px] font-semibold shadow-sm transition ${said === "yes" ? "border-amber-600 bg-amber-600 text-white" : "border-amber-300 bg-white text-amber-900 hover:bg-amber-100"}`}>
          Yes, I am authorised
        </button>
        <button type="button" onClick={onNo} data-ask-no className="rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100">
          No
        </button>
        <span className="text-[11px] text-amber-900/80">Yes: you sign in, and your authority is checked. No: you go back to the ordinary search.</span>
      </div>
    </div>
  );
}
