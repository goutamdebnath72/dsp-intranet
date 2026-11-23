// src/components/AnnouncementFile.tsx
//
// This is the PDF of an announcement as the reader sees it inside the announcement's window: a card with the file's name and size, a full-screen button (an icon: the PDF then opens over the page in the same kind of viewer as a circular, with a cross) and a Download button, and the PDF itself
// shown right there (a frame). An announcement that is ONLY a title and a PDF shows the PDF at once; one that also has body text offers "View here". I always fetch the PDF from our own route
// (src/app/api/announcements/[id]/file/route.ts); the browser never knows the address of the file in storage.
"use client";

import { PdfBarMask } from "@/components/PdfBarMask";
import React, { useState } from "react";
import { Download, Eye, EyeOff, FileText, Maximize2 } from "lucide-react";
import { fileRoute, formatBytes, type AnnouncementFileInfo } from "@/lib/announcements/attachment";

export function AnnouncementFile({ id, file, startOpen, onOpenFull, page }: { id: number; file: AnnouncementFileInfo; /** the page of the PDF where the search found its words; I open the preview there */ page?: number | null; /** I show the PDF at once when the announcement has no body text */ startOpen: boolean; /** opens the PDF full screen over the page. I let the announcement's window own the viewer, so that the card's button, the linked words and the title all open the same one. */ onOpenFull: () => void }) {
  const [open, setOpen] = useState(startOpen || !!page);
  const at = page && page > 0 ? Math.trunc(page) : null;
  const src = fileRoute(id);
  return (
    <div data-announcement-file className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-100 text-red-600"><FileText size={20} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-800" title={file.name}>{file.name}</span>
          <span className="block text-xs text-slate-500">PDF · {formatBytes(file.bytes)}{at ? ` · found on page ${at}` : ""}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {!startOpen && !at && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-pdf-toggle className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              {open ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />} {open ? "Hide here" : "View here"}
            </button>
          )}
          <button type="button" onClick={onOpenFull} aria-label="View the PDF full screen" title="View full screen" data-pdf-fullscreen className="inline-flex items-center rounded-md border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-100">
            <Maximize2 size={15} aria-hidden="true" />
          </button>
          <a href={`${src}?download=1`} data-pdf-download className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
            <Download size={14} aria-hidden="true" /> Download
          </a>
        </span>
      </div>
      {open && (
        // I put the frame in a clipped, rounded box and hide the viewer's own scrollbars until the pointer is over it (PdfBarMask).
        <div className="group relative h-[68vh] overflow-hidden rounded-md border border-slate-200 bg-slate-100">
          <iframe title={file.name} src={`${src}#${at ? `page=${at}&` : ""}view=FitH`} data-pdf-frame className="h-full w-full border-0" />
          <PdfBarMask />
        </div>
      )}

    </div>
  );
}
