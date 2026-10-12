// src/components/SourceBar.tsx
//
// The "Source" bar ABOVE a health check-up answer: which circular the answer was read from (the number and year the archive shows, and its title)
// with a plain "Open circular" button. A click opens the circular in the SAME viewer the archive and the search use, at the page where the people in
// the answer are listed, with a marker on that page: one click to check the answer against the original. It sits above the table, not under it, so it
// is seen without scrolling and nobody has to find it by chance. When someone listed is not in the HR directory it says so, here, and only then.
import { AlertTriangle, ExternalLink, FileText } from "lucide-react";
import type { CircularSource } from "@/lib/nl2sql/clientTypes";

/** "page 5" / "pages 5, 6, 8" (nothing when the page is not known). */
export function pagesText(pages: number[]): string {
  if (pages.length === 0) return "";
  return pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.join(", ")}`;
}

export function SourceBar({ sources, note, onOpen }: { sources: CircularSource[]; note?: string | null; onOpen: (circularId: number, pages: number[]) => void }) {
  if (sources.length === 0) return null;
  return (
    <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2" role="group" aria-label="Source of this answer">
      <ul className="space-y-1.5">
        {sources.map((s) => {
          const where = pagesText(s.pages);
          return (
            <li key={s.circularId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 flex-1 items-start gap-2 text-xs text-slate-600">
                <FileText size={14} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="font-semibold text-slate-500">Source: </span>
                  <span className="font-semibold text-slate-800">{s.label}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="break-words">{s.title}</span>
                  {where ? <span className="text-slate-400"> — {where}</span> : null}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onOpen(s.circularId, s.pages)}
                title={`Open ${s.label}${where ? ` at ${where}` : ""} to check this answer against the original`}
                aria-label={`Open ${s.label}, ${s.title}${where ? `, ${where}` : ""}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary-200 bg-white px-2.5 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
              >
                Open circular <ExternalLink size={12} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {note ? (
        <p className="mt-2 flex items-start gap-1.5 border-t border-slate-200 pt-1.5 text-xs text-amber-700">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{note}</span>
        </p>
      ) : null}
    </div>
  );
}
