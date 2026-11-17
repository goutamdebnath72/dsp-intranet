// src/components/ViewerShell.tsx
//
// THE FULL-SCREEN VIEWER LAYER, once: the dark blurred layer over the page with a header that holds the cross (to close) and the title, and room below for whatever is being viewed. It is the layer of the circular viewer
// (src/components/CircularViewerLightbox.tsx, whose pages are pictures) and of the announcement PDF viewer (src/components/AnnouncementPdfViewer.tsx, whose body is the PDF), so that both look and close the same way.
// Nothing here knows what is shown: the caller puts its own canvas in `children`.
"use client";

import React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

export function ViewerShell({
  title,
  onClose,
  closeLabel = "Close viewer",
  zClass = "z-[150]",
  escapeOwn = false,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  closeLabel?: string;
  /** the layer's stacking class (the circular viewer's own is z-[150]) */
  zClass?: string;
  /** marks the layer as taking Escape for itself (TopBar's handler then leaves that key alone; see ImageLightbox) */
  escapeOwn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 bg-black/85 backdrop-blur-md ${zClass} flex flex-col`}
      role="dialog"
      aria-modal="true"
      tabIndex={0}
      data-viewer-shell
      {...(escapeOwn ? { "data-escape-own": "true" } : {})}
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      {/* Top Bar Header */}
      <header className="flex-shrink-0 bg-black/50 text-white flex items-center p-4 space-x-4 border-b border-white/10">
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full text-white/70 bg-transparent transition-all duration-200 ease-in-out transform hover:scale-110 hover:bg-red-100 hover:text-red-600"
          aria-label={closeLabel}
          data-viewer-close
        >
          <X size={28} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{title}</h1>
        </div>
      </header>
      {children}
    </motion.div>
  );
}
