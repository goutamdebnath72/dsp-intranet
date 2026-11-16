// src/components/OmniExecutiveAsk.tsx
//
// "ARE YOU AN EXECUTIVE?": shown above the results when a signed-out visitor asks a question of the EDS kind (the rule and the two answers are in src/lib/search/loginHints.ts). Yes: he is told to sign in and offered the
// Sign in button; No: the simple answer is shown at once. Nothing is searched until he has answered.
"use client";

import React from "react";
import { UserCheck } from "lucide-react";
import type { ExecutiveAsk } from "@/lib/search/loginHints";

export function OmniExecutiveAsk({ ask, onYes, onNo, onSignIn }: { ask: ExecutiveAsk; onYes: () => void; onNo: () => void; onSignIn: () => void }) {
  return (
    <div role="group" aria-label="Are you an executive?" data-executive-ask className="mx-2 mb-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs text-violet-950">
      <p className="flex items-start gap-2 leading-snug">
        <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
        <span>
          This is a deep question: the answer has to be built from several circulars into one written summary, with sources (Executive Deep Search, EDS).
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
        <span className="text-[11px] text-violet-800/80">No: you get the simple answer.</span>
      </div>
      {ask.said === "yes" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-white px-3 py-2 pl-3" data-ask-signin>
          <span className="flex-1 leading-snug">Please sign in with your own account to get the reply of this question as EDS. It starts by itself as soon as you have signed in.</span>
          <button type="button" onClick={onSignIn} data-ask-signin-button className="shrink-0 rounded-md border border-violet-300 bg-violet-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-violet-700">
            Sign in
          </button>
        </div>
      )}
    </div>
  );
}
