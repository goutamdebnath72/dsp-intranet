"use client";

import { lockPageScroll } from "@/lib/ui/scrollLock";
import React, { useRef, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { DateTime } from "luxon";
import { sanitizeAnnouncementHtml } from "@/lib/announcements/contentProcessing";
import { highlightAnnouncementHtml } from "@/lib/announcements/highlightHtml";
import { fileRoute, type AnnouncementFileInfo } from "@/lib/announcements/attachment";
import { AnnouncementFile } from "@/components/AnnouncementFile";
import { AnnouncementPdfViewer } from "@/components/AnnouncementPdfViewer";
import { PDF_LINK_ATTR, stripPdfLinks } from "@/lib/announcements/pdfLink";

// --- 2. ADDED NEW ANNOUNCEMENT TYPE ---
// This type matches the data our API now sends
type Announcement = {
  id: number;
  createdAt: string; // Dates are strings after JSON serialization
  title: string;
  content: string | null;
  date: string; // Dates are strings after JSON serialization
  isRead?: boolean;
  /** the announcement's PDF (name and size). Left out by a caller that does not know (a search result): the window then asks for it by itself. null = none. */
  file?: AnnouncementFileInfo | null;
};
// ---------------------------------

type Props = {
  announcement: Announcement;
  onClose: () => void;
  // When opened from a search result, the query to highlight in the body.
  highlightQuery?: string;
};

export default function AnnouncementModal({
  announcement,
  onClose,
  highlightQuery,
}: Props) {
  // This line is correct because the date is a string from the API
  const announcementDate = DateTime.fromISO(announcement.date);

  // The PDF: given by the list, or asked for here (a search result does not carry it).
  const [file, setFile] = useState<AnnouncementFileInfo | null | undefined>(announcement.file);
  useEffect(() => {
    setFile(announcement.file);
    if (announcement.file !== undefined) return;
    let alive = true;
    fetch(`${fileRoute(announcement.id)}?info=1`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setFile(j && typeof j.name === "string" ? { name: j.name, bytes: Number(j.bytes) } : null); })
      .catch(() => { if (alive) setFile(null); });
    return () => { alive = false; };
  }, [announcement.id, announcement.file]);

  // The PDF full screen over the page: opened by the card's button, by words of the body that are linked to the PDF, and by the title of an announcement that is only a title and a PDF.
  const [pdfOpen, setPdfOpen] = useState(false);
  const openPdf = () => { if (file) setPdfOpen(true); };

  // The body is stored as sanitized rich-text HTML. Render it as formatted
  // markup (not escaped text). Sanitize again on the client as defense in
  // depth — safe content stays identical; anything unexpected is stripped.
  const safeHtml = useMemo(() => {
    const sanitized = sanitizeAnnouncementHtml(announcement.content || "");
    // Words linked to the PDF are links only where there is a PDF: once it is known there is none (file === null) they are plain words.
    const clean = file === null ? stripPdfLinks(sanitized) : sanitized;
    // Highlight the search terms (if opened from a search result). Safe: marks
    // only text between tags, never inside a tag or attribute.
    return highlightQuery
      ? highlightAnnouncementHtml(clean, highlightQuery)
      : clean;
  }, [announcement.content, highlightQuery, file]);

  // A click, or Enter or Space, on words linked to the PDF opens it (the link carries no address: the marker only).
  const onBodyClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest?.(`[${PDF_LINK_ATTR}]`)) openPdf();
  };
  const onBodyKey = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && (e.target as HTMLElement).closest?.(`[${PDF_LINK_ATTR}]`)) {
      e.preventDefault();
      openPdf();
    }
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Lock background page scroll while this modal is mounted so mouse-wheel
  // scrolling inside it (including over the fixed header) never bleeds through
  // to the page behind. The page scroller in this app is <html>
  // (globals.css sets `html { overflow-y: auto }`), so lock the documentElement.
  useEffect(() => {
    const lock = lockPageScroll(); // one shared lock (src/lib/ui/scrollLock.ts)
    return () => lock.release();
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-lg shadow-2xl w-full relative animate-fade-in-up max-h-[90vh] flex flex-col ${file && !safeHtml ? "max-w-4xl" : "max-w-2xl"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="modal-close-button">
          <X size={24} />
        </button>

        <div className="p-6 pr-14 border-b flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-800">
            {file && !safeHtml ? (
              // an announcement that is only a title and a PDF: the title IS the link to the PDF
              <button type="button" onClick={openPdf} data-title-pdf-link title="Opens the PDF full screen" className="text-left text-xl font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 hover:decoration-blue-600">
                {announcement.title}
              </button>
            ) : (
              announcement.title
            )}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {announcementDate.toFormat("dd LLL yyyy")}
          </p>
        </div>

        <div
          ref={scrollContainerRef}
          className="p-6 overflow-y-auto overflow-x-hidden overscroll-contain"
        >
          {safeHtml ? (
            <div
              className="announcement-content text-base text-gray-700 leading-relaxed"
              onClick={onBodyClick}
              onKeyDown={onBodyKey}
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          ) : !file && file !== undefined ? (
            <p className="text-base text-gray-400 italic">
              No additional details.
            </p>
          ) : null}
          {file && (
            <div className={safeHtml ? "mt-5" : ""}>
              <AnnouncementFile id={announcement.id} file={file} startOpen={!safeHtml} onOpenFull={openPdf} />
            </div>
          )}
        </div>
      </div>
      {file && <AnnouncementPdfViewer open={pdfOpen} id={announcement.id} title={announcement.title} fileName={file.name} onClose={() => setPdfOpen(false)} />}
    </div>
  );
}
