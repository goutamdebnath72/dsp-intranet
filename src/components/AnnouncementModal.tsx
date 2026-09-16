"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { DateTime } from "luxon";
import { sanitizeAnnouncementHtml } from "@/lib/announcements/contentProcessing";

// --- 2. ADDED NEW ANNOUNCEMENT TYPE ---
// This type matches the data our API now sends
type Announcement = {
  id: number;
  createdAt: string; // Dates are strings after JSON serialization
  title: string;
  content: string | null;
  date: string; // Dates are strings after JSON serialization
  isRead?: boolean;
};
// ---------------------------------

type Props = {
  announcement: Announcement;
  onClose: () => void;
};

export default function AnnouncementModal({ announcement, onClose }: Props) {
  // This line is correct because the date is a string from the API
  const announcementDate = DateTime.fromISO(announcement.date);

  // The body is stored as sanitized rich-text HTML. Render it as formatted
  // markup (not escaped text). Sanitize again on the client as defense in
  // depth — safe content stays identical; anything unexpected is stripped.
  const safeHtml = useMemo(
    () => sanitizeAnnouncementHtml(announcement.content || ""),
    [announcement.content],
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Lock background page scroll while this modal is mounted so mouse-wheel
  // scrolling inside it (including over the fixed header) never bleeds through
  // to the page behind. The page scroller in this app is <html>
  // (globals.css sets `html { overflow-y: auto }`), so lock the documentElement.
  useEffect(() => {
    const html = document.documentElement;
    const scrollBarWidth = window.innerWidth - html.clientWidth;
    const prevOverflow = html.style.overflow;
    const prevPaddingRight = html.style.paddingRight;
    html.style.overflow = "hidden";
    if (scrollBarWidth > 0) html.style.paddingRight = `${scrollBarWidth}px`;
    return () => {
      html.style.overflow = prevOverflow;
      html.style.paddingRight = prevPaddingRight;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-2xl relative animate-fade-in-up max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="modal-close-button">
          <X size={24} />
        </button>

        <div className="p-6 pr-14 border-b flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-800">
            {announcement.title}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {announcementDate.toFormat("dd LLL yyyy")}
          </p>
        </div>

        <div
          ref={scrollContainerRef}
          className="p-6 overflow-y-auto overscroll-contain"
        >
          {safeHtml ? (
            <div
              className="announcement-content text-base text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          ) : (
            <p className="text-base text-gray-400 italic">
              No additional details.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
