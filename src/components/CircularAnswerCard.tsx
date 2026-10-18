"use client";

// src/components/CircularAnswerCard.tsx
//
// ANSWER FIRST. The answer as clear FACTS: a heading, then a small table (or one large key figure when there is a single fact), a note
// when the document states a condition, and ONE source line (the document, its date and page, with the only "Open circular" link on
// the screen for it). The exact words that prove each fact sit underneath, folded away. While the answer is being prepared a quiet
// placeholder keeps the place; if the documents do not prove an answer nothing is shown at all.

import React from "react";
import { DateTime } from "luxon";
import { ExternalLink, FileText, Info, Sparkles } from "lucide-react";
import { formatCircularTitle } from "@/lib/circularTitle";
import type { AnswerState } from "@/hooks/useCircularAnswer";

const KIND_LABEL: Record<string, string> = { circular: "Circular", announcement: "Announcement", holiday: "Holiday policy note" };

function dateLabel(iso: string | null): string {
  if (!iso) return "";
  const d = DateTime.fromISO(iso);
  return d.isValid ? d.toFormat("d LLL yyyy") : "";
}

/** True when the column adds nothing to the label ("Casual Leave" over "Casual Leave"; "Gift Card Amount" and "Amount"). */
function repeatsLabel(label: string, column: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const l = norm(label), c = norm(column);
  return !c || l.includes(c) || c.includes(l);
}

export function CircularAnswerCard({ state, onOpenSource }: { state: AnswerState; onOpenSource: (circularId: number) => void }) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <section aria-label="Preparing the answer" aria-busy="true" className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="flex items-center gap-2 bg-gradient-to-r from-blue-600/90 to-indigo-600/90 px-4 py-2 text-white">
          <Sparkles size={14} aria-hidden />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em]">Reading the documents for your answer...</span>
        </div>
        <div className="space-y-2 px-4 py-4" aria-hidden>
          <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-100" />
          <div className="h-9 w-full animate-pulse rounded-lg bg-neutral-100" />
          <div className="h-9 w-full animate-pulse rounded-lg bg-neutral-100" />
        </div>
      </section>
    );
  }

  const a = state.answer;
  if (!a) return null;

  const single = a.rows.length === 1;
  const sharedColumn = !single && a.rows[0].column && a.rows.every((r) => r.column === a.rows[0].column) ? a.rows[0].column : "";
  // the exact words, once per distinct quote, with the labels it proves
  const evidence: { quote: string; labels: string[] }[] = [];
  for (const r of a.rows) {
    const found = evidence.find((e) => e.quote === r.quote);
    if (found) found.labels.push(r.label);
    else evidence.push({ quote: r.quote, labels: [r.label] });
  }

  return (
    <section aria-label="Answer" className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_12px_28px_-16px_rgba(37,99,235,0.35)]">
      <div className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-white">
        <Sparkles size={14} aria-hidden />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em]">Answer</span>
      </div>

      <h3 className="px-4 pt-3.5 text-[17px] font-semibold leading-snug text-neutral-900">{a.title}</h3>

      {single ? (
        <div className="mx-4 mt-3 rounded-xl bg-blue-50/70 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">
            {a.rows[0].label}
            {a.rows[0].column && !repeatsLabel(a.rows[0].label, a.rows[0].column) ? ` \u00B7 ${a.rows[0].column}` : ""}
          </div>
          <div className="mt-0.5 break-words text-[28px] font-bold leading-tight tabular-nums text-neutral-900">{a.rows[0].value}</div>
        </div>
      ) : (
        <div className="mx-4 mt-3 overflow-hidden rounded-xl border border-neutral-200">
          <table className="w-full border-collapse text-sm">
            {sharedColumn && (
              <thead>
                <tr className="bg-neutral-50 text-[11px] uppercase tracking-wider text-neutral-500">
                  <th scope="col" className="px-3 py-2 text-left font-semibold" />
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    {sharedColumn}
                  </th>
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-neutral-100">
              {a.rows.map((r, i) => (
                <tr key={i} className="transition-colors hover:bg-blue-50/40">
                  <th scope="row" className="px-3 py-2.5 text-left align-top font-medium text-neutral-800">
                    {r.label}
                    {!sharedColumn && r.column && !repeatsLabel(r.label, r.column) ? <span className="block text-xs font-normal text-neutral-500">{r.column}</span> : null}
                    {a.sources.length > 1 ? (
                      <span className="block text-xs font-normal text-neutral-500">
                        {(() => {
                          const src = a.sources.find((s) => s.n === r.source);
                          if (!src) return null;
                          const title = formatCircularTitle(src.headline); // the same display tidy-up as the Sources list below
                          const head = title.length > 64 ? `${title.slice(0, 63).trimEnd()}\u2026` : title;
                          const when = dateLabel(src.publishedAt);
                          return `${head}${when ? ` \u00B7 ${when}` : ""}`;
                        })()}
                      </span>
                    ) : null}
                  </th>
                  <td className="px-3 py-2.5 text-right align-top font-semibold tabular-nums text-neutral-900">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {a.note ? (
        <p className="mx-4 mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-neutral-600">
          <Info size={14} className="mt-0.5 flex-shrink-0 text-blue-500" aria-hidden />
          <span>{a.note}</span>
        </p>
      ) : null}

      {a.rows.some((r) => r.linked === false) ? (
        <p className="mx-4 mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-amber-700">
          <Info size={14} className="mt-0.5 flex-shrink-0 text-amber-500" aria-hidden />
          <span>The row names are the assistant&apos;s own wording. The exact words below are the document&apos;s: please check them.</span>
        </p>
      ) : null}

      <div className="mt-3.5 border-t border-neutral-100 bg-neutral-50/70 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{a.sources.length > 1 ? "Sources" : "Source"}</div>
        <ul className="mt-1.5 space-y-1">
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

        <details className="mt-1.5 px-2 text-xs text-neutral-600">
          <summary className="cursor-pointer select-none font-semibold text-neutral-500 hover:text-neutral-700">
            Exact words from the document{evidence.length > 1 ? ` (${evidence.length})` : ""}
          </summary>
          <ul className="mt-1.5 space-y-2">
            {evidence.map((e, i) => (
              <li key={i} className="border-l-2 border-blue-200 pl-3 leading-relaxed">
                <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">{e.labels.join(", ")}</span>
                <span className="break-words italic">&ldquo;{e.quote}&rdquo;</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
