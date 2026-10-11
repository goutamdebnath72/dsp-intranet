// src/components/SourceFooter.tsx
//
// The "Source" line under a health check-up answer: the circular(s) the answer was read from, with the number and year the archive shows and the
// circular's title. A click opens the circular in the SAME viewer the archive and the search use, scrolled to the page where the people in the answer
// are listed (with a marker on that page), so a reader can check the answer against the original in one click.
import { ExternalLink, FileText } from "lucide-react";
import type { CircularSource } from "@/lib/nl2sql/clientTypes";

/** "page 5" / "pages 5, 6, 8" (nothing when the page is not known). */
export function pagesText(pages: number[]): string {
  if (pages.length === 0) return "";
  return pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.join(", ")}`;
}

export function SourceFooter({ sources, onOpen }: { sources: CircularSource[]; onOpen: (circularId: number, pages: number[]) => void }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-3 border-t border-slate-100 px-1 pt-2" role="group" aria-label="Source of this answer">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Source</p>
      <ul className="space-y-1">
        {sources.map((s) => {
          const where = pagesText(s.pages);
          return (
            <li key={s.circularId}>
              <button
                type="button"
                onClick={() => onOpen(s.circularId, s.pages)}
                title={`Open ${s.label}: ${s.title}${where ? ` (${where})` : ""}`}
                aria-label={`Open ${s.label}, ${s.title}${where ? `, ${where}` : ""}`}
                className="group inline-flex max-w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-slate-600 transition-colors hover:bg-slate-50 hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
              >
                <FileText size={14} className="mt-0.5 shrink-0 text-slate-400 group-hover:text-primary-600" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="font-semibold text-slate-700">{s.label}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="break-words">{s.title}</span>
                  {where ? <span className="text-slate-400"> — {where}</span> : null}
                </span>
                <ExternalLink size={12} className="mt-0.5 shrink-0 text-slate-300 group-hover:text-primary-600" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
