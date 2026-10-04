"use client";

// src/components/AnswerFeedback.tsx
//
// The omnibar's universal "Was this what you were looking for?  Yes / No", shown under EVERY answer: a
// model-written answer, a verified answer, a holiday answer, an old-engine answer, circular results, or "no
// results". It is the entry point of the learning loop:
//   Yes -> recorded; for model answers the question + SQL becomes a worked example, and enough different
//          people saying Yes makes it a verified answer (no model call next time).
//   No  -> asks ONE question, "what was wrong?", records the reason, and tries again in a DIFFERENT way chosen
//          from that reason (documents instead of an employee answer, an employee reading instead of
//          documents, or a different reading by the model told what was rejected and why). After 3 attempts it
//          stops and keeps the case for review.
// Only an explicit click counts; nothing is inferred from behaviour.

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

export type AnswerSource = "nl2sql" | "cache" | "holiday" | "legacy" | "circular" | "none";
export type ReasonCode = "wrong_result" | "wrong_department" | "wrong_name" | "wanted_documents" | "wanted_employees" | "other";

const REASONS: Record<"model" | "structured" | "documents", { code: ReasonCode; label: string }[]> = {
  model: [
    { code: "wrong_result", label: "The result is wrong" },
    { code: "wrong_department", label: "Wrong department(s)" },
    { code: "wrong_name", label: "A name was matched wrongly" },
    { code: "wanted_documents", label: "I wanted documents, not people" },
    { code: "other", label: "Something else" },
  ],
  structured: [
    { code: "wrong_result", label: "The result is wrong" },
    { code: "wanted_documents", label: "I wanted documents" },
    { code: "wanted_employees", label: "I wanted people / employee data" },
    { code: "other", label: "Something else" },
  ],
  documents: [
    { code: "wanted_employees", label: "I wanted people / employee data, not documents" },
    { code: "other", label: "These are not what I was looking for" },
  ],
};

const reasonsFor = (s: AnswerSource) => (s === "nl2sql" || s === "cache" ? REASONS.model : s === "holiday" || s === "legacy" ? REASONS.structured : REASONS.documents);

export const MAX_ATTEMPTS = 3;

function post(body: Record<string, unknown>) {
  try {
    void fetch("/api/omnibar/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    /* best effort: never surface an error to the person */
  }
}

interface Props {
  query: string;
  source: AnswerSource;
  nl2sqlLogId: number | null;
  userKey: string | null;
  /** 1 for the first answer, 2 for the second attempt ... */
  attempt: number;
  onRetry: (r: { reason: ReasonCode; note: string; logId: number | null }) => void;
}

export function AnswerFeedback({ query, source, nl2sqlLogId, userKey, attempt, onRetry }: Props) {
  const [phase, setPhase] = useState<"ask" | "reason" | "yes" | "sent">("ask");
  const [reason, setReason] = useState<ReasonCode | null>(null);
  const [note, setNote] = useState("");
  const canRetry = attempt < MAX_ATTEMPTS;
  const base = { query, source, nl2sqlLogId, userKey, attempt };

  // a new answer starts unanswered
  useEffect(() => {
    setPhase("ask");
    setReason(null);
    setNote("");
  }, [query, source, nl2sqlLogId, attempt]);

  const yes = () => {
    post({ ...base, verdict: "yes" });
    setPhase("yes");
  };
  const submit = (retry: boolean) => {
    if (!reason) return;
    post({ ...base, verdict: "no", reasonCode: reason, note: note.trim() });
    if (retry && canRetry) onRetry({ reason, note: note.trim(), logId: nl2sqlLogId });
    else setPhase("sent");
  };

  if (phase === "yes") return <p className="px-4 py-1.5 text-center text-xs font-medium text-emerald-700">Thanks — noted. Your confirmation helps the search learn.</p>;
  if (phase === "sent") return <p className="px-4 py-1.5 text-center text-xs font-medium text-amber-700">Thanks — saved for the team to review.</p>;

  if (phase === "reason") {
    const options = reasonsFor(source);
    return (
      <div className="px-4 py-2">
        <p className="mb-1.5 text-xs font-semibold text-slate-600">What was wrong?</p>
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button
              key={o.code}
              type="button"
              onClick={() => setReason(o.code)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                reason === o.code ? "border-blue-500 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          placeholder="What did you expect? (optional)"
          className="mt-2 w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-400"
        />
        <div className="mt-2 flex items-center gap-2">
          {canRetry && (
            <button
              type="button"
              disabled={!reason}
              onClick={() => submit(true)}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              Try again
            </button>
          )}
          <button
            type="button"
            disabled={!reason}
            onClick={() => submit(false)}
            className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 disabled:opacity-40"
          >
            {canRetry ? "Just send feedback" : "Send feedback"}
          </button>
          {!canRetry && <span className="text-xs text-slate-500">No more automatic tries — this will be reviewed.</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-1.5">
      <span className="text-xs text-slate-500">
        Was this what you were looking for?{attempt > 1 ? ` (attempt ${attempt})` : ""}
      </span>
      <button
        type="button"
        onClick={yes}
        aria-label="Yes, this is what I was looking for"
        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-xs text-emerald-700 transition-colors hover:bg-emerald-50"
      >
        <Check size={13} /> Yes
      </button>
      <button
        type="button"
        onClick={() => setPhase("reason")}
        aria-label="No, this is not what I was looking for"
        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-0.5 text-xs text-red-600 transition-colors hover:bg-red-50"
      >
        <X size={13} /> No
      </button>
    </div>
  );
}
