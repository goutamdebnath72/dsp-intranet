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
// This type matches the data my API now sends
type Announcement = {
  id: number;
  createdAt: string; // Dates arrive as strings after JSON serialization
  title: string;
  content: string | null;
  date: string; // Dates arrive as strings after JSON serialization
  isRead?: boolean;
  /** The announcement's PDF (name and size). A caller that does not know it (a search result) leaves it out, and the window then asks for it by itself. null = none. */
  file?: AnnouncementFileInfo | null;
};
// ---------------------------------

type Props = {
  announcement: Announcement;
  onClose: () => void;
  // Set when opened from a search result: the query I highlight in the body.
  highlightQuery?: string;
  /** Set when opened from a search result that was found inside the PDF: the page of the PDF with the words. I show the PDF at that page in the window. */
  pdfPage?: number | null;
};

export default function AnnouncementModal({
  announcement,
  onClose,
  highlightQuery,
  pdfPage,
}: Props) {
  // I can use fromISO here because the date is a string from the API.
  const announcementDate = DateTime.fromISO(announcement.date);

  // The PDF is either given by the list or asked for here, because a search result does not carry it.
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

  // I open the PDF full screen over the page from the card's button and from words of the body that are linked to the PDF.
  const [pdfOpen, setPdfOpen] = useState(false);
  const openPdf = () => { if (file) setPdfOpen(true); };

  // The body is stored as sanitized rich-text HTML. I render it as formatted
  // markup (not escaped text), and I sanitize again on the client as defense in
  // depth: safe content stays identical; anything unexpected is stripped.
  const safeHtml = useMemo(() => {
    const sanitized = sanitizeAnnouncementHtml(announcement.content || "");
    // I make words linked to the PDF links only where there is a PDF: once it is known there is none (file === null) they are plain words.
    const clean = file === null ? stripPdfLinks(sanitized) : sanitized;
    // I highlight the search terms (if opened from a search result). This is safe: it marks
    // only text between tags, never inside a tag or attribute.
    return highlightQuery
      ? highlightAnnouncementHtml(clean, highlightQuery)
      : clean;
  }, [announcement.content, highlightQuery, file]);

  // A click, or Enter or Space, on words linked to the PDF opens it. The link carries no address, only the marker.
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

  // I lock background page scroll while this modal is mounted so mouse-wheel
  // scrolling inside it (including over the fixed header) never bleeds through
  // to the page behind. The page scroller in this app is <html>
  // (globals.css sets `html { overflow-y: auto }`), so I lock the documentElement.
  useEffect(() => {
    const lock = lockPageScroll(); // I use one shared lock (src/lib/ui/scrollLock.ts)
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
          {/* I always show this as plain text: the PDF opens full screen by the card's own button (or by words of the body linked to it), never by the title. */}
          <h2 className="text-xl font-semibold text-gray-800">{announcement.title}</h2>
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
              <AnnouncementFile id={announcement.id} file={file} startOpen={!safeHtml} onOpenFull={openPdf} page={pdfPage} />
            </div>
          )}
        </div>
      </div>
      {file && <AnnouncementPdfViewer open={pdfOpen} id={announcement.id} title={announcement.title} fileName={file.name} onClose={() => setPdfOpen(false)} page={pdfPage} />}
    </div>
  );
}
