// src/components/OmnibarModal.tsx
"use client";

import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Loader2,
  FileText,
  Megaphone,
  Sparkles,
  X,
  Lock,
} from "lucide-react";
import { DateTime } from "luxon";
import { useOmniSearch } from "@/hooks/useOmniSearch";
import { AiOverview } from "@/components/AiOverview";
import { CircularViewerLightbox } from "@/components/CircularViewerLightbox";
import Link from "next/link";
import { generateSmartSnippet } from "@/lib/utils/searchUtils";

interface OmnibarModalProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  isExecutive?: boolean;
  ticketNo?: string;
}

const BASE_MODAL_WIDTH_REM = 52;
const EXECUTIVE_SCALE = 1.08;

export function OmnibarModal({
  isOpen,
  setIsOpen,
  isExecutive = false,
  ticketNo,
}: OmnibarModalProps) {
  const {
    query,
    setQuery,
    mode,
    triggerSearch,
    results,
    synthesis,
    isLoading,
    error,
  } = useOmniSearch(isOpen, ticketNo);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [loadingStep, setLoadingStep] = useState(0);
  const [selectedCircularId, setSelectedCircularId] = useState<number | null>(
    null,
  );

  const currentMaxWidthRem =
    mode === "intellectual"
      ? (BASE_MODAL_WIDTH_REM * EXECUTIVE_SCALE).toFixed(2)
      : BASE_MODAL_WIDTH_REM.toFixed(2);

  const handleCloseAll = () => {
    setSelectedCircularId(null);
    setIsOpen(false);
  };

  const handleCloseLightbox = () => {
    setSelectedCircularId(null);
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading && mode === "intellectual") {
      setLoadingStep(0);
      timer = setInterval(() => {
        setLoadingStep((prev) => (prev < 2 ? prev + 1 : prev));
      }, 900);
    }
    return () => clearInterval(timer);
  }, [isLoading, mode]);

  useEffect(() => {
    if (isOpen && !selectedCircularId) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen, selectedCircularId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If lightbox is open, let lightbox handle its own Escape key
      if (selectedCircularId) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleCloseAll();
      }
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        handleCloseAll();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedCircularId]);

  const loadingMessages = [
    "Consulting executive knowledge base...",
    "Synthesizing cross-departmental circulars...",
    "Preparing deep strategic insights, this may take a brief moment...",
  ];

  const handleResultClick = (
    e: React.MouseEvent,
    result: (typeof results)[0],
  ) => {
    if (result.type === "circular") {
      e.preventDefault();
      setSelectedCircularId(result.id);
    }
  };

  const activeMatchedCircular = selectedCircularId
    ? results.find((r) => r.id === selectedCircularId)
    : null;

  return (
    <>
      <AnimatePresence>
        {isOpen && !selectedCircularId && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center pt-16 sm:pt-24 px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseAll}
              className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm"
            />

            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
                maxWidth: `min(${currentMaxWidthRem}rem, 92vw)`,
              }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{
                layout: { type: "spring", stiffness: 380, damping: 26 },
                duration: 0.25,
              }}
              className="relative w-full bg-white rounded-xl shadow-2xl overflow-hidden border border-neutral-200 flex flex-col max-h-[82vh]"
            >
              {/* Multiline Search Input Header */}
              <div className="flex items-start px-4 py-3.5 border-b border-neutral-200 gap-3">
                <Search className="h-5 w-5 text-neutral-400 mt-2 shrink-0" />
                <textarea
                  ref={textareaRef}
                  rows={3}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      handleCloseAll();
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (query.trim().length >= 2) {
                        triggerSearch(mode || "semantic");
                      }
                    }
                  }}
                  placeholder="Type your circular search query (3 lines visible, Shift+Enter for newline)..."
                  className="flex-1 bg-transparent text-sm sm:text-base text-neutral-900 placeholder-neutral-400 focus:outline-none resize-none leading-relaxed overflow-y-auto max-h-24 py-1"
                />
                {isLoading && mode !== "intellectual" && (
                  <Loader2 className="h-5 w-5 animate-spin text-primary-600 mt-2 shrink-0" />
                )}
                <div className="flex items-center gap-2 border-l border-neutral-200 pl-3 ml-1 mt-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleCloseAll}
                    className="hidden sm:inline-block focus:outline-none group"
                  >
                    <kbd className="px-2 py-1 text-xs font-semibold text-neutral-500 bg-neutral-100 rounded border border-neutral-300 group-hover:bg-neutral-200 group-hover:text-neutral-700 transition-colors cursor-pointer">
                      ESC
                    </kbd>
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseAll}
                    className="p-1 hover:bg-neutral-100 rounded-md transition-colors"
                  >
                    <X className="h-5 w-5 text-neutral-500" />
                  </button>
                </div>
              </div>

              {/* Centered Mode Selector Toolbar */}
              <div className="relative border-b border-slate-200/80 bg-gradient-to-b from-white via-slate-50/90 to-slate-100/70 px-4 py-3">
                <motion.div
                  layout
                  transition={{ type: "spring", stiffness: 380, damping: 26 }}
                  className={`flex items-center justify-center ${
                    mode === "intellectual" ? "gap-3.5" : "gap-2.5"
                  }`}
                >
                  <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 shrink-0">
                    Search Mode
                  </span>

                  {/* Headline Match */}
                  <button
                    type="button"
                    onClick={() => triggerSearch("title")}
                    className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-xl border px-3.5 py-1.5 sm:px-4 sm:py-2 text-sm font-semibold tracking-[-0.01em] outline-none transition-all duration-200 shrink-0 focus-visible:ring-2 focus-visible:ring-slate-400/60 ${
                      mode === "title"
                        ? "border-slate-800 bg-slate-900 text-white shadow-[0_6px_18px_rgba(15,23,42,0.24)]"
                        : "border-slate-200 bg-white/90 text-slate-600 shadow-sm hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:text-slate-900 hover:shadow-md"
                    }`}
                  >
                    {mode === "title" && (
                      <span className="absolute inset-0 bg-gradient-to-r from-white/10 via-white/0 to-white/10" />
                    )}
                    <span
                      className={`relative flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black ${
                        mode === "title"
                          ? "bg-white/15 text-white"
                          : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700"
                      }`}
                    >
                      Aa
                    </span>
                    <span className="relative whitespace-nowrap">
                      Headline Match
                    </span>
                  </button>

                  {/* Smart Semantic */}
                  <button
                    type="button"
                    onClick={() => triggerSearch("semantic")}
                    className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-xl border px-3.5 py-1.5 sm:px-4 sm:py-2 text-sm font-semibold tracking-[-0.01em] outline-none transition-all duration-200 shrink-0 focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
                      mode === "semantic"
                        ? "border-cyan-500 bg-gradient-to-r from-sky-600 to-cyan-500 !text-white shadow-[0_7px_22px_rgba(6,182,212,0.32)] hover:-translate-y-0.5 hover:border-cyan-400 hover:brightness-110 hover:shadow-[0_10px_28px_rgba(6,182,212,0.42)]"
                        : "border-slate-200 bg-white/90 text-slate-600 shadow-sm hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 hover:shadow-md"
                    }`}
                  >
                    <span
                      className={`relative flex h-5 w-5 items-center justify-center rounded-md transition-colors ${
                        mode === "semantic"
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-sky-500 group-hover:bg-sky-100 group-hover:text-sky-600"
                      }`}
                    >
                      <Sparkles
                        size={13}
                        strokeWidth={2.5}
                        className={
                          mode === "semantic"
                            ? "text-white"
                            : "text-sky-500 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110"
                        }
                      />
                    </span>
                    <span
                      className={`relative whitespace-nowrap transition-colors ${
                        mode === "semantic"
                          ? "!text-white"
                          : "text-slate-600 group-hover:text-sky-700"
                      }`}
                    >
                      Smart Semantic
                    </span>
                    {mode === "semantic" && (
                      <span className="relative h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                    )}
                  </button>

                  {/* Executive Deep Synthesis */}
                  <button
                    type="button"
                    onClick={() => isExecutive && triggerSearch("intellectual")}
                    disabled={!isExecutive}
                    title={
                      isExecutive
                        ? "Intellectual Executive Deep Synthesis"
                        : "Executive clearance required (Ticket # starting with 4)"
                    }
                    className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-xl border px-3.5 py-1.5 sm:px-4 sm:py-2 text-sm font-semibold tracking-[-0.01em] outline-none transition-all duration-200 shrink-0 ${
                      !isExecutive
                        ? "cursor-not-allowed border-slate-200 bg-slate-100/90 !text-slate-400 opacity-70 hover:!border-slate-200 hover:!bg-slate-100/90 hover:!text-slate-400"
                        : mode === "intellectual"
                          ? "border-amber-500 bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 text-white shadow-[0_7px_24px_rgba(245,158,11,0.34)] focus-visible:ring-2 focus-visible:ring-amber-400/60"
                          : "border-amber-300 bg-gradient-to-b from-amber-50 to-orange-50/70 text-amber-800 shadow-sm hover:-translate-y-0.5 hover:border-amber-400 hover:from-amber-100 hover:to-orange-50 hover:shadow-[0_6px_20px_rgba(245,158,11,0.2)] focus-visible:ring-2 focus-visible:ring-amber-400/60"
                    }`}
                  >
                    {isExecutive && mode === "intellectual" && (
                      <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 animate-pulse" />
                    )}
                    <span
                      className={`relative flex h-5 w-5 items-center justify-center rounded-md ${
                        !isExecutive
                          ? "bg-slate-200/80 text-slate-400 group-hover:!text-slate-400"
                          : mode === "intellectual"
                            ? "bg-white/15"
                            : "bg-white text-amber-600 shadow-sm"
                      }`}
                    >
                      {!isExecutive ? (
                        <Lock size={12} strokeWidth={2.5} />
                      ) : (
                        <Sparkles
                          size={13}
                          strokeWidth={2.5}
                          className={
                            mode === "intellectual"
                              ? "text-white"
                              : "text-amber-500 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110"
                          }
                        />
                      )}
                    </span>
                    <span
                      className={`relative whitespace-nowrap ${
                        !isExecutive
                          ? "!text-slate-400 group-hover:!text-slate-400"
                          : ""
                      }`}
                    >
                      Executive Deep Synthesis
                    </span>
                    {isExecutive && mode === "intellectual" && (
                      <motion.span
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 20,
                        }}
                        className="relative rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white"
                      >
                        Deep
                      </motion.span>
                    )}
                  </button>
                </motion.div>
              </div>

              <div className="overflow-y-auto p-2 flex-1">
                {isLoading && mode === "intellectual" ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-600 mb-4" />
                    <div className="flex flex-col gap-2.5 max-w-md w-full">
                      {loadingMessages.map((msg, idx) => (
                        <motion.div
                          key={msg}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{
                            opacity: idx <= loadingStep ? 1 : 0.3,
                            y: idx <= loadingStep ? 0 : 4,
                          }}
                          transition={{ duration: 0.3 }}
                          className={`text-sm font-medium flex items-center justify-center gap-2 ${
                            idx === loadingStep
                              ? "text-amber-800 font-semibold"
                              : "text-neutral-400"
                          }`}
                        >
                          <span>{msg}</span>
                          {idx === loadingStep && (
                            <span className="flex gap-1">
                              <span className="animate-bounce">•</span>
                              <span className="animate-bounce [animation-delay:0.2s]">
                                •
                              </span>
                              <span className="animate-bounce [animation-delay:0.4s]">
                                •
                              </span>
                            </span>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {error && (
                      <div className="p-4 text-center text-red-600 text-sm font-medium">
                        Failed to perform search. Please try again.
                      </div>
                    )}

                    {!isLoading &&
                      mode !== null &&
                      query.trim().length >= 3 &&
                      results.length === 0 &&
                      !error && (
                        <div className="p-8 text-center text-neutral-500">
                          No results found for &quot;{query}&quot;
                        </div>
                      )}

                    {!isLoading && results.length > 0 && (
                      <div className="flex flex-col gap-4 p-1">
                        {mode === "intellectual" && synthesis && (
                          <AiOverview content={synthesis} />
                        )}

                        <div className="flex flex-col gap-1">
                          {mode === "intellectual" && (
                            <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2">
                              Primary Sources
                            </h4>
                          )}
                          {results.map((result) => (
                            <div
                              key={`${result.type}-${result.id}`}
                              onClick={(e) => handleResultClick(e, result)}
                              className={`cursor-pointer flex flex-col gap-2 p-3 rounded-lg border transition-all duration-200 group ${
                                result.isPerfectMatch
                                  ? "bg-amber-50/50 border-amber-300 shadow-sm"
                                  : "border-transparent hover:bg-neutral-100"
                              }`}
                            >
                              {result.type === "circular" ? (
                                <>
                                  <div className="flex items-start gap-4">
                                    <div
                                      className={`p-2 rounded-md ${
                                        result.isPerfectMatch
                                          ? "bg-amber-100 text-amber-700"
                                          : "bg-blue-100 text-blue-700"
                                      }`}
                                    >
                                      <FileText size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span
                                          className={`font-semibold truncate transition-colors ${
                                            result.isPerfectMatch
                                              ? "text-amber-900 group-hover:text-amber-700"
                                              : "text-neutral-900 group-hover:text-primary-700"
                                          }`}
                                        >
                                          {result.headline}
                                        </span>
                                        {/* Clean Match Percentage Badge */}
                                        {typeof (result as any)
                                          .matchPercentage === "number" ? (
                                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">
                                            {(result as any).matchPercentage}%
                                            Match
                                          </span>
                                        ) : result.similarity ? (
                                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">
                                            {Math.round(
                                              result.similarity * 100,
                                            )}
                                            % Match
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="flex items-center gap-3 text-xs text-neutral-500 font-medium">
                                        <span className="uppercase tracking-wider">
                                          {result.type}
                                        </span>
                                        <span>&bull;</span>
                                        <span>
                                          {result.publishedAt
                                            ? DateTime.fromISO(
                                                result.publishedAt,
                                              ).toLocaleString(
                                                DateTime.DATE_MED,
                                              )
                                            : "No date"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {result.isPerfectMatch &&
                                    result.chunkText &&
                                    mode === "semantic" && (
                                      <div className="ml-12 mt-2 text-xs text-neutral-800 bg-yellow-50 p-3 rounded-md border border-yellow-200 leading-relaxed shadow-sm">
                                        <div className="font-bold text-yellow-800 uppercase tracking-wider text-[10px] flex items-center gap-1 mb-1.5">
                                          <Sparkles
                                            size={12}
                                            className="text-yellow-600"
                                          />
                                          Exact Match Context:
                                        </div>
                                        <div className="font-medium font-serif italic text-neutral-700">
                                          &quot;
                                          {generateSmartSnippet(
                                            result.chunkText,
                                            query,
                                          )}
                                          &quot;
                                        </div>
                                      </div>
                                    )}
                                </>
                              ) : (
                                <Link
                                  href={result.url ?? "#"}
                                  className="flex flex-col gap-2"
                                >
                                  <div className="flex items-start gap-4">
                                    <div
                                      className={`p-2 rounded-md ${
                                        result.isPerfectMatch
                                          ? "bg-amber-100 text-amber-700"
                                          : "bg-orange-100 text-orange-700"
                                      }`}
                                    >
                                      <Megaphone size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span
                                          className={`font-semibold truncate transition-colors ${
                                            result.isPerfectMatch
                                              ? "text-amber-900 group-hover:text-amber-700"
                                              : "text-neutral-900 group-hover:text-primary-700"
                                          }`}
                                        >
                                          {result.headline}
                                        </span>
                                        {/* Clean Match Percentage Badge */}
                                        {typeof (result as any)
                                          .matchPercentage === "number" ? (
                                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">
                                            {(result as any).matchPercentage}%
                                            Match
                                          </span>
                                        ) : result.similarity ? (
                                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">
                                            {Math.round(
                                              result.similarity * 100,
                                            )}
                                            % Match
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="flex items-center gap-3 text-xs text-neutral-500 font-medium">
                                        <span className="uppercase tracking-wider">
                                          {result.type}
                                        </span>
                                        <span>&bull;</span>
                                        <span>
                                          {result.publishedAt
                                            ? DateTime.fromISO(
                                                result.publishedAt,
                                              ).toLocaleString(
                                                DateTime.DATE_MED,
                                              )
                                            : "No date"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {result.isPerfectMatch &&
                                    result.chunkText &&
                                    mode === "semantic" && (
                                      <div className="ml-12 mt-2 text-xs text-neutral-800 bg-yellow-50 p-3 rounded-md border border-yellow-200 leading-relaxed shadow-sm">
                                        <div className="font-bold text-yellow-800 uppercase tracking-wider text-[10px] flex items-center gap-1 mb-1.5">
                                          <Sparkles
                                            size={12}
                                            className="text-yellow-600"
                                          />
                                          Exact Match Context:
                                        </div>
                                        <div className="font-medium font-serif italic text-neutral-700">
                                          &quot;
                                          {generateSmartSnippet(
                                            result.chunkText,
                                            query,
                                          )}
                                          &quot;
                                        </div>
                                      </div>
                                    )}
                                </Link>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Context Banner cleanly wrapped inside AnimatePresence */}
      <AnimatePresence>
        {selectedCircularId &&
          activeMatchedCircular?.isPerfectMatch &&
          activeMatchedCircular?.chunkText &&
          mode === "semantic" && (
            <motion.div
              key="floating-banner"
              initial={{ opacity: 0, y: -20, scale: 0.95, x: "-50%" }}
              animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
              exit={{ opacity: 0, y: -20, scale: 0.95, x: "-50%" }}
              transition={{ duration: 0.2 }}
              className="fixed top-20 left-1/2 z-[160] w-[90%] max-w-2xl bg-amber-50/95 backdrop-blur-md border-2 border-amber-400 p-3.5 rounded-xl shadow-2xl pointer-events-none"
            >
              <div className="font-bold text-amber-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-1.5">
                <Sparkles size={13} className="text-amber-600 shrink-0" />
                Target Clause Reference:
              </div>
              <div className="font-medium text-neutral-800 text-xs sm:text-sm leading-relaxed">
                {generateSmartSnippet(activeMatchedCircular.chunkText, query)}
              </div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Lightbox Viewer */}
      <CircularViewerLightbox
        circularId={selectedCircularId}
        onClose={handleCloseLightbox}
      />
    </>
  );
}
