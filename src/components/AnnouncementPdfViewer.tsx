// src/components/AnnouncementPdfViewer.tsx
//
// THE PDF OF AN ANNOUNCEMENT, FULL SCREEN OVER THE HOME PAGE, NOT IN A NEW TAB: the layer of the circular viewer (src/components/ViewerShell.tsx, shared with src/components/CircularViewerLightbox.tsx) with its cross and the
// announcement's title, and the PDF filling the room below. It closes with the cross and with Escape (as the circular viewer does) and leaves the announcement's window exactly as it was.
//   * It is drawn in a portal on <body> (the announcement's window has its own stacking and is itself closed by a click on its backdrop; a click here must not reach it).
//   * Escape closes THIS viewer only: the key is taken in the capture phase (the same way ImageLightbox does it) and the layer carries data-escape-own, so neither TopBar's handler nor the search window's (when the
//     announcement was opened from a search result) closes what is behind it.
//   * The page's scrolling is locked while it is open (the shared lock, src/lib/ui/scrollLock.ts).
//   * The PDF is the one our own route serves (src/app/api/announcements/[id]/file/route.ts).
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import { PdfBarMask } from "@/components/PdfBarMask";
import { ViewerShell } from "@/components/ViewerShell";
import { onEscape } from "@/components/ImageLightbox";
import { lockPageScroll } from "@/lib/ui/scrollLock";
import { fileRoute } from "@/lib/announcements/attachment";

/** how the PDF is opened in the full-screen viewer: thumbnail panel closed, and a fixed 150% zoom. Not "fit to width": that stretched a page to the whole width of a wide screen. 150% is the same size on every screen (the reader can still zoom from the browser's own PDF toolbar). */
export const FULL_SCREEN_VIEW = "#navpanes=0&zoom=150";

/** the layer itself, without the portal and the effects (so that it can be drawn and tested on the server) */
/** the same, opened on a page (the page the search found the words on) */
export const fullScreenView = (page?: number | null): string => (page && page > 0 ? `#page=${Math.trunc(page)}&navpanes=0&zoom=150` : FULL_SCREEN_VIEW);

export function PdfViewerView({ id, title, fileName, onClose, page }: { id: number; title: string; fileName: string; onClose: () => void; page?: number | null }) {
  return (
    <ViewerShell title={title} onClose={onClose} closeLabel="Close the PDF" zClass="z-[400]" escapeOwn>
      {/* the PDF takes ALL the room below the header: no margin, no width limit, no rounded frame; the browser's own thumbnail panel is closed (navpanes=0) and the page opens at 150% (zoom=150), the same size on every screen, and is read by scrolling */}
      <div role="presentation" data-pdf-viewer-canvas className="group relative min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
        <iframe title={fileName} src={`${fileRoute(id)}${fullScreenView(page)}`} data-pdf-viewer-frame className="absolute inset-0 h-full w-full border-0 bg-white" />
        <PdfBarMask />
      </div>
    </ViewerShell>
  );
}

export function AnnouncementPdfViewer({ open, id, title, fileName, onClose, page }: { open: boolean; id: number; title: string; fileName: string; onClose: () => void; page?: number | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const lock = lockPageScroll();
    const letGo = onEscape(window, onClose);
    return () => {
      lock.release();
      letGo();
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    // a click anywhere in the layer must not reach the announcement's window behind it (its backdrop closes it)
    <div onClick={(e) => e.stopPropagation()} data-pdf-viewer-root>
      <AnimatePresence>{open && <PdfViewerView id={id} title={title} fileName={fileName} onClose={onClose} page={page} />}</AnimatePresence>
    </div>,
    document.body,
  );
}
