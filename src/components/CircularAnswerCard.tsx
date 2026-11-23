"use client";

// src/components/CircularAnswerCard.tsx
//
// ANSWER FIRST. I show the answer as clear FACTS: a heading, then a small table (or one large key figure when there is a single fact), a note
// when the document states a condition, and ONE source line (the document, its date and page, with the only "Open circular" link on
// the screen for it). The exact words that prove each fact sit underneath, folded away. While the answer is being prepared a quiet
// placeholder keeps the place; if the documents do not prove an answer, I show nothing at all.

import React from "react";
import { DateTime } from "luxon";
import { ExternalLink, FileText, Info, Megaphone, Sparkles } from "lucide-react";
import { formatCircularTitle } from "@/lib/circularTitle";
import type { AnswerState } from "@/hooks/useCircularAnswer";
import type { CircularAnswer } from "@/lib/search/circularAnswer";

const KIND_LABEL: Record<string, string> = { circular: "Circular", announcement: "Announcement", holiday: "Holiday policy note" };

function dateLabel(iso: string | null): string {
  if (!iso) return "";
  const d = DateTime.fromISO(iso);
  return d.isValid ? d.toFormat("d LLL yyyy") : "";
}

/** Returns true when the column adds nothing to the label ("Casual Leave" over "Casual Leave"; "Gift Card Amount" and "Amount"). */
function repeatsLabel(label: string, column: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const l = norm(label), c = norm(column);
  return !c || l.includes(c) || c.includes(l);
}

/** Decides what "Open circular" on a source opens: the page of the row that cites it and that row's own exact words (the viewer shows them as its banner). */
export function openTargetFor(a: CircularAnswer, s: { n: number; page: number | null }): { page: number | null; quote: string } {
  const row = a.rows.find((r) => r.source === s.n);
  return { page: s.page ?? row?.page ?? null, quote: row?.quote ?? "" };
}

/** This draws "Loading Summary . . .": three dots that light up one after another. */
function LoadingDots() {
  return (
    <span aria-hidden className="ml-1 inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="dot-wave" style={{ animationDelay: `${(i * 0.22).toFixed(2)}s` }}>
          .
        </span>
      ))}
    </span>
  );
}

type OpenSource = (id: number, target?: { page: number | null; quote: string }, type?: "circular" | "announcement" | "holiday") => void;
type SourceOf = CircularAnswer["sources"][number];

/** I draw one source line: what it is, its date and page, and (for a circular or an announcement) the button that opens it. */
function SourceItem({ s, target, onOpenSource }: { s: SourceOf; target: { page: number | null; quote: string }; onOpenSource: OpenSource }) {
  const openable = s.type === "circular" || s.type === "announcement";
  const body = (
    <>
      {s.type === "announcement" ? <Megaphone size={16} className="mt-0.5 flex-shrink-0 text-orange-600" aria-hidden /> : <FileText size={16} className="mt-0.5 flex-shrink-0 text-blue-600" aria-hidden />}
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
          {s.type === "announcement" ? "Open announcement" : "Open circular"} <ExternalLink size={12} aria-hidden />
        </span>
      )}
    </>
  );
  return (
    <li>
      {openable ? (
        <button type="button" onClick={() => onOpenSource(s.id, target, s.type)} className="flex w-full items-start gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-blue-200 hover:bg-white">
          {body}
        </button>
      ) : (
        <div className="flex w-full items-start gap-2 px-2 py-1.5">{body}</div>
      )}
    </li>
  );
}

/**
 * The summary every circular or announcement reply carries when no precise answer could be proved (documentSummary.ts). I make it say what the best match is about, and say so plainly when it does not answer the question,
 * and, when the model could not write one, show the opening of the document in its own words, labelled as that.
 */
export function SummaryCard({ summary, onOpenSource }: { summary: NonNullable<AnswerState["summary"]>; onOpenSource: OpenSource }) {
  return (
    <section aria-label="Summary" data-summary-card={summary.via} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-2 bg-gradient-to-r from-slate-600 to-slate-700 px-4 py-2 text-white">
        <Sparkles size={14} aria-hidden />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em]">{summary.via === "opening" ? "Summary \u00B7 opening of the document" : "Summary"}</span>
      </div>
      <p data-summary-text className="px-4 pt-3.5 text-sm leading-relaxed text-neutral-800">{summary.text}</p>
      {summary.addresses === false ? (
        <p data-summary-note="not-addressed" className="mx-4 mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-amber-700">
          <Info size={14} className="mt-0.5 flex-shrink-0 text-amber-500" aria-hidden />
          <span>This is a summary of the closest match. It does not answer your question directly: check the document before you rely on it.</span>
        </p>
      ) : summary.via === "opening" ? (
        <p data-summary-note="opening" className="mx-4 mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-slate-500">
          <Info size={14} className="mt-0.5 flex-shrink-0 text-slate-400" aria-hidden />
          <span>A written summary was not available just now: this is how the document begins, in its own words.</span>
        </p>
      ) : null}
      <div className="mt-3.5 border-t border-neutral-100 bg-neutral-50/70 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Summarised from</div>
        <ul className="mt-1.5 space-y-1">
          {summary.sources.map((s) => (
            <SourceItem key={`${s.type}-${s.id}`} s={s} target={{ page: s.page, quote: "" }} onOpenSource={onOpenSource} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/** `type` says what the source is: a circular opens in its viewer, an announcement in its own window, and the search window comes back when it is closed. */
export function CircularAnswerCard({ state, onOpenSource }: { state: AnswerState; onOpenSource: OpenSource }) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <section role="status" aria-live="polite" aria-label="Loading summary" aria-busy="true" className="flex items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-blue-700 shadow-sm">
        <Sparkles size={14} aria-hidden />
        <span>
          Loading Summary
          <LoadingDots />
        </span>
      </section>
    );
  }

  const a = state.answer;
  // When no precise answer could be proved, I let the reply carry a summary of the best match instead (never a bare title)
  if (!a) return state.summary ? <SummaryCard summary={state.summary} onOpenSource={onOpenSource} /> : null;

  const single = a.rows.length === 1;
  const sharedColumn = !single && a.rows[0].column && a.rows.every((r) => r.column === a.rows[0].column) ? a.rows[0].column : "";
  // I keep the exact words once per distinct quote, with the labels it proves
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

      {/* I keep the heading as plain text, for circulars and announcements alike: the way into the document is the Source row below ("Open circular" / "Open announcement") */}
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
                          const title = formatCircularTitle(src.headline); // I use the same display tidy-up as the Sources list below
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
        <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-[13px] leading-relaxed text-neutral-700">
          <Info size={16} className="mt-0.5 flex-shrink-0 text-blue-600" aria-hidden />
          <span className="flex-1 font-medium">{a.note}</span>
        </div>
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
          {a.sources.map((s) => (
            <SourceItem key={`${s.type}-${s.id}`} s={s} target={openTargetFor(a, s)} onOpenSource={onOpenSource} />
          ))}
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
