// src/components/CircularViewerLightbox.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Loader2, AlertCircle, Sparkles } from "lucide-react";
import {
  estimateProcessingSeconds,
  estimateProgressPercent,
  isTakingLonger,
  formatDuration,
} from "@/lib/processingEstimate";
import { useNowTick } from "@/hooks/useNowTick";

type Circular = {
  id: number;
  headline: string;
  publishedAt: string;
  uploadedAt: string;
  fileUrls: string[];
  status?: "processing" | "ready" | "failed";
  processingError?: string | null;
  pageCount?: number | null;
};

type Props = {
  circularId: number | null;
  onClose: () => void;
  /** 1-based page to scroll to once the pages render (e.g. a search match). */
  scrollToPage?: number | null;
  /** All 1-based pages that contain a match — each gets a margin marker. */
  matchPages?: number[];
};

export function CircularViewerLightbox({
  circularId,
  onClose,
  scrollToPage,
  matchPages = [],
}: Props) {
  const [circular, setCircular] = useState<Circular | null>(null);
  const now = useNowTick(1000);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const didScrollRef = useRef(false);

  useEffect(() => {
    if (circularId) {
      setIsLoading(true);
      setError(null);
      didScrollRef.current = false;
      fetch(`/api/circulars/${circularId}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch circular data.");
          return res.json();
        })
        .then((data) => setCircular(data))
        .catch(() => setError("Could not load the circular."))
        .finally(() => setIsLoading(false));
    } else {
      setCircular(null);
    }
  }, [circularId]);

  // While still processing, poll quietly every 4s so this view flips to the
  // finished pages on its own once the background job completes, instead
  // of requiring the user to close and reopen the viewer to see it.
  useEffect(() => {
    if (!circularId || circular?.status !== "processing") return;
    const interval = setInterval(() => {
      fetch(`/api/circulars/${circularId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setCircular(data))
        .catch(() => {
          // Non-fatal: just try again on the next tick.
        });
    }, 4000);
    return () => clearInterval(interval);
  }, [circularId, circular?.status]);


  // Scroll to the matched page once the circular is loaded. Waits for the
  // target page image to finish loading so the scroll offset is accurate.
  useEffect(() => {
    if (!circular || didScrollRef.current) return;
    const page = scrollToPage ?? 0;
    if (!page || page < 1) return; // no target -> stay at top (page 1)
    const idx = page - 1;
    const wrapper = pageRefs.current[idx];
    if (!wrapper) return;
    const img = wrapper.querySelector("img");

    const doScroll = () => {
      if (didScrollRef.current) return;
      didScrollRef.current = true;
      wrapper.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    if (!img || img.complete) {
      requestAnimationFrame(doScroll); // cached / no img -> scroll next frame
    } else {
      img.addEventListener("load", doScroll, { once: true });
      return () => img.removeEventListener("load", doScroll);
    }
  }, [circular, scrollToPage]);

  const matchPageSet = new Set(
    (matchPages || []).filter((n) => Number.isFinite(n) && n > 0),
  );

  return (
    <AnimatePresence>
      {circularId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[150] flex flex-col"
          role="dialog"
          aria-modal="true"
          tabIndex={0}
          onClick={onClose}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        >
          {/* Top Bar Header */}
          <header className="flex-shrink-0 bg-black/50 text-white flex items-center p-4 space-x-4 border-b border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-white/70 bg-transparent transition-all duration-200 ease-in-out transform hover:scale-110 hover:bg-red-100 hover:text-red-600"
              aria-label="Close viewer"
            >
              <X size={28} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold truncate">
                {isLoading && !circular
                  ? "Loading circular..."
                  : circular?.headline || "Circular"}
              </h1>
            </div>
          </header>

          {/* Main Scrollable Canvas */}
          <div
            role="presentation"
            className="relative flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Absolute Centered Loader */}
            {isLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm text-white gap-3">
                <Loader2 className="animate-spin text-primary-400" size={54} />
                <span className="text-sm font-medium tracking-wide text-neutral-200">
                  Rendering circular pages...
                </span>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex flex-col items-center justify-center h-full text-red-400">
                <AlertCircle size={48} className="mb-4" />
                <p>{error}</p>
              </div>
            )}

            {/* Still processing: fileUrls only holds the raw uploaded file
                at this point (not per-page images yet), so attempting to
                render it as an image gallery would show a broken image --
                this is exactly what was happening before this guard existed. */}
            {circular && circular.status === "processing" && (() => {
              const elapsedSeconds = Math.max(
                0,
                (now - new Date(circular.uploadedAt).getTime()) / 1000,
              );
              const estimatedSeconds = estimateProcessingSeconds(
                circular.pageCount,
              );
              const progressPercent = estimateProgressPercent(
                elapsedSeconds,
                estimatedSeconds,
              );
              const longer = isTakingLonger(elapsedSeconds, estimatedSeconds);
              return (
                <div className="flex flex-col items-center justify-center h-full text-neutral-300 gap-4 w-full max-w-sm px-6">
                  <Loader2 className="animate-spin text-primary-400" size={48} />
                  <div className="w-full">
                    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-primary-400"
                        initial={false}
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ ease: "easeOut" }}
                      />
                    </div>
                    <p className="text-sm font-medium text-center mt-3">
                      {longer
                        ? `Taking longer than usual — ${formatDuration(elapsedSeconds)} so far`
                        : `${formatDuration(elapsedSeconds)} elapsed · usually ready in ~${formatDuration(estimatedSeconds)}${circular.pageCount ? ` for a ${circular.pageCount}-page document` : ""}`}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Permanent processing failure. */}
            {circular && circular.status === "failed" && (
              <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2 text-center px-6">
                <AlertCircle size={48} />
                <p>This circular failed to process.</p>
                {circular.processingError && (
                  <p className="text-xs text-red-300/80 max-w-md break-words">
                    {circular.processingError}
                  </p>
                )}
              </div>
            )}

            {/* Complete Pages in Sequence -- only once processing is done
                (status "ready", or missing entirely for any pre-existing
                row from before this field existed). */}
            {circular &&
              circular.status !== "processing" &&
              circular.status !== "failed" && (
              <div className="w-full max-w-4xl space-y-6">
                {circular.fileUrls.map((url, index) => {
                  const pageNo = index + 1;
                  const isMatch = matchPageSet.has(pageNo);
                  return (
                    <div
                      key={index}
                      ref={(el) => {
                        pageRefs.current[index] = el;
                      }}
                      className="relative w-full scroll-mt-4"
                    >
                      <img
                        src={url}
                        alt={`Page ${pageNo} of ${circular.headline}`}
                        className={`w-full rounded-md bg-white ${
                          isMatch
                            ? "shadow-[0_0_0_2px_rgba(250,204,21,0.9)] shadow-2xl"
                            : "shadow-2xl"
                        }`}
                      />
                      {isMatch && (
                        <>
                          {/* Left-edge accent bar — a margin highlight that
                              flags this as a match page without covering text. */}
                          <span className="pointer-events-none absolute left-0 top-0 h-full w-1.5 rounded-l-md bg-yellow-400" />
                          {/* "Match" tab pinned to the page's top-left corner. */}
                          <span className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-yellow-400 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-yellow-950 shadow-lg">
                            <Sparkles size={12} strokeWidth={2.5} />
                            Match
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
