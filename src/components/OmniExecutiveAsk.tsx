// src/components/OmniExecutiveAsk.tsx
//
// "ARE YOU AN EXECUTIVE?": shown above the results when a signed-out visitor asks a question of the EDS kind (the rule and the two answers are in src/lib/search/loginHints.ts). Yes: he is told to sign in and
// the sign-in window opens at once (Yes IS the click on Sign in: there is no second card and no second click; the caller opens the window). No: the simple answer is shown at once. I search nothing until he has answered.
"use client";

import React from "react";
import { UserCheck } from "lucide-react";
import type { ExecutiveAsk } from "@/lib/search/loginHints";

export function OmniExecutiveAsk({ ask, onYes, onNo }: { ask: ExecutiveAsk; onYes: () => void; onNo: () => void }) {
  // the Executive Deep Search BUTTON was pressed by a visitor who is not signed in: there is no question yet (an empty one), so I let the card say what EDS is and where "No" leads
  const chosen = ask.query === "";
  return (
    <div role="group" aria-label="Are you an executive?" data-executive-ask className="mx-2 mb-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs text-violet-950">
      <p className="flex items-start gap-2 leading-snug">
        <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
        <span>
          {chosen
            ? "Executive Deep Search (EDS) builds one written summary from several circulars read together, with its sources. It is for executives."
            : "This is a deep question: the answer has to be built from several circulars into one written summary, with sources (Executive Deep Search, EDS)."}
          <strong className="mt-1 block text-[13px]">Are you an executive?</strong>
        </span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
        <button type="button" onClick={onYes} aria-pressed={ask.said === "yes"} data-ask-yes className={`rounded-md border px-3 py-1 text-[11px] font-semibold shadow-sm transition ${ask.said === "yes" ? "border-violet-600 bg-violet-600 text-white" : "border-violet-300 bg-white text-violet-900 hover:bg-violet-100"}`}>
          Yes, I am an executive
        </button>
        <button type="button" onClick={onNo} data-ask-no className="rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100">
          No
        </button>
        <span className="text-[11px] text-violet-800/80">{chosen ? "No: you go back to the ordinary search." : "No: you get the simple answer."}</span>
      </div>
    </div>
  );
}
