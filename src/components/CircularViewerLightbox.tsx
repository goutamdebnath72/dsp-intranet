// src/components/CircularViewerLightbox.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { isAligned, whenImagesSettled } from "@/lib/ui/scrollWhenSettled";

type Circular = {
  id: number;
  headline: string;
  publishedAt: string;
  fileUrls: string[];
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const didScrollRef = useRef(false);
  const tookOverRef = useRef(false); // the person scrolled by themselves: the automatic scroll has stopped
  const pinIdxRef = useRef<number | null>(null); // the page being kept in place while the pages above it load
  // Pages whose image has arrived. Until then a page holds a page-shaped (A4) space, so the pages do not jump around while they load.
  const [loadedPages, setLoadedPages] = useState<Set<number>>(() => new Set());
  const markLoaded = (i: number) => setLoadedPages((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));

  useEffect(() => {
    if (circularId) {
      setIsLoading(true);
      setError(null);
      didScrollRef.current = false;
      setLoadedPages(new Set());
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


  // Scroll to the matched page once the circular is loaded.
  //
  // On a FIRST visit the page images all load at the same time and a page has no height until its image arrives, so every page above the target pushes
  // it down as it loads (a second visit is cached and works). So the page is not scrolled to once and left: it lands at once, using the page-shaped
  // spaces reserved for the pages that have not arrived, and is then KEPT in place (the effect below) as the pages above it load. When every image at and
  // above the target has loaded (or failed) the position is checked a last time. The images below the target cannot move it and are not waited for.
  // If the person scrolls (wheel, touch, mouse, keys) the automatic scroll stops at once and never fights them.
  useEffect(() => {
    if (!circular || didScrollRef.current) return;
    const page = scrollToPage ?? 0;
    if (!page || page <= 1) return; // no target, or page 1 -> stay at the top (page 1 is already in view)
    const idx = Math.min(page, circular.fileUrls.length) - 1;
    const scroller = scrollerRef.current;
    const target = pageRefs.current[idx];
    if (!scroller || !target) return;

    const imgs = pageRefs.current
      .slice(0, idx + 1)
      .map((w) => w?.querySelector("img"))
      .filter((i): i is HTMLImageElement => !!i);
    const cached = imgs.every((i) => i.complete); // everything is already there (a second visit): nothing will shift, so a smooth scroll is fine

    tookOverRef.current = false;
    const takeOver = () => {
      tookOverRef.current = true;
      pinIdxRef.current = null;
    };
    scroller.addEventListener("wheel", takeOver, { passive: true });
    scroller.addEventListener("touchstart", takeOver, { passive: true });
    scroller.addEventListener("mousedown", takeOver);
    window.addEventListener("keydown", takeOver);

    pinIdxRef.current = cached ? null : idx;
    const frame = requestAnimationFrame(() => {
      if (tookOverRef.current) return;
      didScrollRef.current = true;
      target.scrollIntoView({ behavior: cached ? "smooth" : "auto", block: "start" });
    });

    let verifyTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelWait = whenImagesSettled(imgs, () => {
      pinIdxRef.current = null; // every page that can move the target has arrived
      if (tookOverRef.current) return;
      // a last look once the page has been laid out (and, after a smooth scroll, once it has ended)
      verifyTimer = setTimeout(() => {
        if (tookOverRef.current) return;
        const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
        if (!isAligned(target.getBoundingClientRect().top, scroller.getBoundingClientRect().top, margin)) {
          target.scrollIntoView({ behavior: "auto", block: "start" });
        }
      }, cached ? 1000 : 150);
    });

    return () => {
      cancelAnimationFrame(frame);
      cancelWait();
      if (verifyTimer) clearTimeout(verifyTimer);
      pinIdxRef.current = null;
      scroller.removeEventListener("wheel", takeOver);
      scroller.removeEventListener("touchstart", takeOver);
      scroller.removeEventListener("mousedown", takeOver);
      window.removeEventListener("keydown", takeOver);
    };
  }, [circular, scrollToPage]);

  // Keeps the target page in place while the pages above it load: each time a page arrives (its reserved space is replaced by the real page, which may
  // be a little taller or shorter) the target is put back at the top if it moved.
  useEffect(() => {
    const idx = pinIdxRef.current;
    if (idx === null || tookOverRef.current) return;
    const target = pageRefs.current[idx];
    const scroller = scrollerRef.current;
    if (!target || !scroller) return;
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    if (!isAligned(target.getBoundingClientRect().top, scroller.getBoundingClientRect().top, margin, 2)) {
      target.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, [loadedPages]);

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
            ref={scrollerRef}
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

            {/* Complete Pages in Sequence */}
            {circular && (
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
                      className={`relative w-full scroll-mt-4 ${loadedPages.has(index) ? "" : "rounded-md bg-white/10"}`}
                      style={loadedPages.has(index) ? undefined : { aspectRatio: "210 / 297" }}
                    >
                      <img
                        src={url}
                        alt={`Page ${pageNo} of ${circular.headline}`}
                        onLoad={() => markLoaded(index)}
                        onError={() => markLoaded(index)}
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
