"use client";

// src/components/CircularAnswerCard.tsx
//
// ANSWER FIRST (step 29a): the answer, then where it comes from. While the answer is being prepared a quiet placeholder keeps the
// place; if the documents do not prove an answer, nothing is shown at all (the documents below speak for themselves).

import React from "react";
import { DateTime } from "luxon";
import { ExternalLink, FileText, Sparkles } from "lucide-react";
import { formatCircularTitle } from "@/lib/circularTitle";
import type { AnswerState } from "@/hooks/useCircularAnswer";

const KIND_LABEL: Record<string, string> = { circular: "Circular", announcement: "Announcement", holiday: "Holiday policy note" };

function dateLabel(iso: string | null): string {
  if (!iso) return "";
  const d = DateTime.fromISO(iso);
  return d.isValid ? d.toFormat("d LLL yyyy") : "";
}

export function CircularAnswerCard({ state, onOpenSource }: { state: AnswerState; onOpenSource: (circularId: number) => void }) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <section aria-label="Preparing the answer" aria-busy="true" className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-blue-700">
          <Sparkles size={14} aria-hidden /> Reading the documents for your answer...
        </div>
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="h-3 w-5/6 animate-pulse rounded bg-blue-100" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-blue-100" />
        </div>
      </section>
    );
  }

  const a = state.answer;
  if (!a) return null;

  return (
    <section aria-label="Answer" className="rounded-xl border border-blue-200 bg-gradient-to-b from-blue-50/80 to-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-blue-700">
        <Sparkles size={14} aria-hidden /> Answer
      </div>
      <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-neutral-900">{a.text}</p>

      <div className="mt-3 border-t border-blue-100 pt-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{a.sources.length > 1 ? "Sources" : "Source"}</div>
        <ul className="mt-1.5 space-y-1.5">
          {a.sources.map((s) => {
            const openable = s.type === "circular";
            const body = (
              <>
                <FileText size={16} className="mt-0.5 flex-shrink-0 text-blue-600" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-800">{formatCircularTitle(s.headline)}</span>
                  <span className="text-xs text-neutral-500">
                    {KIND_LABEL[s.type] ?? s.type}
                    {dateLabel(s.publishedAt) ? ` \u2022 ${dateLabel(s.publishedAt)}` : ""}
                    {s.page ? ` \u2022 Page ${s.page}` : ""}
                  </span>
                </span>
                {openable && (
                  <span className="mt-0.5 flex flex-shrink-0 items-center gap-1 text-xs font-semibold text-blue-700">
                    Open circular <ExternalLink size={12} aria-hidden />
                  </span>
                )}
              </>
            );
            return (
              <li key={`${s.type}-${s.id}`}>
                {openable ? (
                  <button type="button" onClick={() => onOpenSource(s.id)} className="flex w-full items-start gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-blue-200 hover:bg-white">
                    {body}
                  </button>
                ) : (
                  <div className="flex w-full items-start gap-2 px-2 py-1.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>

        {a.evidence.length > 0 && (
          <details className="mt-2 px-2 text-xs text-neutral-600">
            <summary className="cursor-pointer select-none font-semibold text-neutral-500 hover:text-neutral-700">
              Exact words from the document{a.evidence.length > 1 ? ` (${a.evidence.length})` : ""}
            </summary>
            <ul className="mt-1.5 space-y-1.5">
              {a.evidence.map((e, i) => (
                <li key={i} className="border-l-2 border-blue-200 pl-3 italic leading-relaxed">
                  &ldquo;{e.quote}&rdquo;
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
