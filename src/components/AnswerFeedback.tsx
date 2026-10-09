"use client";

// src/components/AnswerFeedback.tsx
//
// The omnibar's universal "Was this what you were looking for?" with a thumbs-up / thumbs-down, shown under EVERY answer: a
// model-written answer, a verified answer, a holiday answer, an old-engine answer, circular results, or "no
// results". It is the entry point of the learning loop:
//   Yes -> recorded; for model answers the question + SQL becomes a worked example, and enough different
//          people saying Yes makes it a verified answer (no model call next time).
//   No  -> asks ONE question, "what was wrong?", records the reason, and tries again in a DIFFERENT way chosen
//          from that reason (documents instead of an employee answer, an employee reading instead of
//          documents, or a different reading by the model told what was rejected and why). After 3 attempts it
//          stops and keeps the case for review.
// Only an explicit click counts; nothing is inferred from behaviour.
//
// Robustness (the page only shows this to SIGNED-IN people; the server enforces it too):
//   * Undo      -- after a Yes or a "Just send feedback" the person can take the vote back.
//   * Report    -- a VERIFIED answer (source "cache") shows "Report this answer as wrong" instead of Yes/No,
//                  so a wrong confirmation can always be challenged; a report makes the answer disputed.
//   * One person counts once and the latest vote wins (server side, lib/nl2sql/votes.ts).

import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

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

interface PostResult {
  ok?: boolean;
  id?: number | null;
  error?: string;
  status: number;
}

async function post(body: Record<string, unknown>): Promise<PostResult | null> {
  try {
    const res = await fetch("/api/omnibar/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let j: any = null;
    try {
      j = await res.json();
    } catch {
      /* no body */
    }
    return { ...(j || {}), status: res.status };
  } catch {
    return null; // best effort: a network hiccup is never shown to the person
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
  /** A verified answer: no Yes/No, only a way to report it wrong. */
  reportOnly?: boolean;
}

export function AnswerFeedback({ query, source, nl2sqlLogId, userKey, attempt, onRetry, reportOnly = false }: Props) {
  const [phase, setPhase] = useState<"ask" | "reason" | "yes" | "sent" | "error">("ask");
  const [voteId, setVoteId] = useState<number | null>(null);
  const [errorText, setErrorText] = useState("");
  const [reason, setReason] = useState<ReasonCode | null>(null);
  const [note, setNote] = useState("");
  const canRetry = attempt < MAX_ATTEMPTS;
  const base = { query, source, nl2sqlLogId, userKey, attempt };

  // a new answer starts unanswered
  useEffect(() => {
    setPhase("ask");
    setReason(null);
    setNote("");
    setVoteId(null);
    setErrorText("");
  }, [query, source, nl2sqlLogId, attempt]);

  // Sends a vote. The server may refuse it (not signed in, or too many votes this hour): say so plainly.
  const sendVote = (body: Record<string, unknown>) => {
    void post(body).then((r) => {
      if (r && (r.status === 401 || r.status === 429)) {
        setErrorText(r.error || "Your feedback could not be saved.");
        setPhase("error");
        return;
      }
      setVoteId(typeof r?.id === "number" ? r.id : null);
    });
  };

  const yes = () => {
    setPhase("yes");
    sendVote({ ...base, verdict: "yes" });
  };
  const submit = (retry: boolean) => {
    if (!reason) return;
    sendVote({ ...base, verdict: "no", reasonCode: reason, note: note.trim() });
    if (retry && canRetry && !reportOnly) onRetry({ reason, note: note.trim(), logId: nl2sqlLogId });
    else setPhase("sent");
  };
  // Takes back the person's own vote (the server removes it, and it stops counting).
  const undo = () => {
    const id = voteId;
    setPhase("ask");
    setReason(null);
    setNote("");
    setVoteId(null);
    void post({ verdict: "undo", id, nl2sqlLogId, source, query });
  };
  const undoButton =
    voteId !== null ? (
      <button type="button" onClick={undo} className="ml-2 font-normal underline text-slate-500 hover:text-slate-700">
        Undo
      </button>
    ) : null;

  if (phase === "error") return <p className="px-4 py-1.5 text-center text-xs font-medium text-red-600">{errorText}</p>;
  if (phase === "yes")
    return (
      <p className="px-4 py-1.5 text-center text-xs font-medium text-emerald-700">
        Thanks — noted. Your confirmation helps the search learn.
        {undoButton}
      </p>
    );
  if (phase === "sent")
    return (
      <p className="px-4 py-1.5 text-center text-xs font-medium text-amber-700">
        {reportOnly ? "Thanks — reported. This answer will be checked again." : "Thanks — saved for the team to review."}
        {undoButton}
      </p>
    );

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
          {canRetry && !reportOnly && (
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
            {reportOnly ? "Send report" : canRetry ? "Just send feedback" : "Send feedback"}
          </button>
          {reportOnly && (
            <button
              type="button"
              onClick={() => {
                setPhase("ask");
                setReason(null);
                setNote("");
              }}
              className="text-xs text-slate-500 underline hover:text-slate-700"
            >
              Cancel
            </button>
          )}
          {!canRetry && !reportOnly && <span className="text-xs text-slate-500">No more automatic tries — this will be reviewed.</span>}
        </div>
      </div>
    );
  }

  if (reportOnly) {
    return (
      <div className="flex items-center justify-center px-4 py-1.5">
        <button type="button" onClick={() => setPhase("reason")} className="text-xs text-slate-500 underline hover:text-slate-700">
          Report this answer as wrong
        </button>
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
        title="Yes, this is what I was looking for"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
      >
        <ThumbsUp size={14} />
      </button>
      <button
        type="button"
        onClick={() => setPhase("reason")}
        aria-label="No, this is not what I was looking for"
        title="No, this is not what I was looking for"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
      >
        <ThumbsDown size={14} />
      </button>
    </div>
  );
}
