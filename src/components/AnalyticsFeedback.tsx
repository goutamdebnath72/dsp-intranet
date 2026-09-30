"use client";

// src/components/AnalyticsFeedback.tsx
//
// Two small pieces rendered inside the employee-analytics answer card in
// OmnibarModal.tsx (29 Sep 2026):
//
//  * InterpretationNote -- one line stating how an LLM-derived query was
//    understood. The server's verifier proves the listed rows match the
//    interpreted condition; only the person can judge whether the condition
//    is what they MEANT, and this makes a misreading visible at a glance.
//
//  * PatternFeedbackBar -- the tick/cross for a fresh, not-yet-trusted
//    LLM-derived pattern (payload carries `pendingPatternId`). Only an
//    explicit click counts. Nothing is inferred from behaviour such as how
//    long the answer stayed on screen -- that was removed permanently,
//    because reading a confidently wrong answer looks the same as reading a
//    right one.

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

const FEEDBACK_URL = "/api/employees/pattern-feedback";

function sendVerdict(patternId: number, verdict: "confirm" | "reject") {
  // Best-effort: never surface an error to the person.
  try {
    void fetch(FEEDBACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patternId, verdict }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function InterpretationNote({ text }: { text: string }) {
  return (
    <p className="mt-1.5 text-xs leading-snug text-slate-500">
      <span className="font-semibold text-slate-600">Understood as:</span> {text}
    </p>
  );
}

export function PatternFeedbackBar({ patternId }: { patternId: number }) {
  const [verdict, setVerdict] = useState<"confirm" | "reject" | null>(null);

  // A new answer (different pattern) starts unanswered.
  useEffect(() => {
    setVerdict(null);
  }, [patternId]);

  const decide = (v: "confirm" | "reject") => {
    if (verdict) return;
    setVerdict(v);
    sendVerdict(patternId, v);
  };

  if (verdict === "confirm") {
    return <p className="mt-2 text-xs font-medium text-emerald-700">Thanks — noted as correct.</p>;
  }
  if (verdict === "reject") {
    return (
      <p className="mt-2 text-xs font-medium text-amber-700">
        Thanks — noted. This reading won&apos;t be reused. Rephrasing the question may help.
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">Is this what you meant?</span>
      <button
        type="button"
        onClick={() => decide("confirm")}
        aria-label="Yes, this is what I meant"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-200 bg-white text-emerald-600 transition-colors hover:bg-emerald-50"
      >
        <Check size={14} />
      </button>
      <button
        type="button"
        onClick={() => decide("reject")}
        aria-label="No, this is not what I meant"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-white text-red-500 transition-colors hover:bg-red-50"
      >
        <X size={14} />
      </button>
    </div>
  );
}
