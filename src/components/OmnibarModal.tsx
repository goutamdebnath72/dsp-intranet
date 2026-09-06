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
import Link from "next/link";

interface OmnibarModalProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  isExecutive?: boolean;
  ticketNo?: string;
}

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
  const inputRef = useRef<HTMLInputElement>(null);

  const [loadingStep, setLoadingStep] = useState(0);

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
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setIsOpen]);

  const loadingMessages = [
    "Consulting executive knowledge base...",
    "Synthesizing cross-departmental circulars...",
    "Preparing deep strategic insights, this may take a brief moment...",
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 sm:pt-32 px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm"
          />

          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              // Tightly calibrated expansion: 48rem (768px) -> 50.5rem (808px)
              maxWidth: mode === "intellectual" ? "50.5rem" : "48rem",
            }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{
              layout: { type: "spring", stiffness: 380, damping: 26 },
              duration: 0.25,
            }}
            className="relative w-full bg-white rounded-xl shadow-2xl overflow-hidden border border-neutral-200 flex flex-col max-h-[75vh]"
          >
            <div className="flex items-center px-4 py-4 border-b border-neutral-200">
              <Search className="h-6 w-6 text-neutral-400 mr-3" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setIsOpen(false);
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                  }
                }}
                placeholder="Search documents, announcements, policies..."
                className="flex-1 bg-transparent text-lg text-neutral-900 placeholder-neutral-400 focus:outline-none"
              />
              {isLoading && mode !== "intellectual" && (
                <Loader2 className="h-5 w-5 animate-spin text-primary-600 mx-3" />
              )}
              <div className="flex items-center gap-2 border-l border-neutral-200 pl-4 ml-2">
                <button
                  onClick={() => setIsOpen(false)}
                  className="hidden sm:inline-block focus:outline-none group"
                >
                  <kbd className="px-2 py-1 text-xs font-semibold text-neutral-500 bg-neutral-100 rounded border border-neutral-300 group-hover:bg-neutral-200 group-hover:text-neutral-700 transition-colors cursor-pointer">
                    ESC
                  </kbd>
                </button>
                <button
                  onClick={() => setIsOpen(false)}
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
                      {/* Mount dedicated Executive AI Overview */}
                      {mode === "intellectual" && synthesis && (
                        <AiOverview content={synthesis} />
                      )}

                      {/* Document Results List */}
                      <div className="flex flex-col gap-1">
                        {mode === "intellectual" && (
                          <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2">
                            Primary Sources
                          </h4>
                        )}
                        {results.map((result) => (
                          <Link
                            key={`${result.type}-${result.id}`}
                            href={result.url ?? "#"}
                            target={
                              result.type === "circular" ? "_blank" : undefined
                            }
                            rel="noopener noreferrer"
                            className="flex items-start gap-4 p-3 rounded-lg hover:bg-neutral-100 transition-colors group"
                          >
                            <div
                              className={`p-2 rounded-md ${result.type === "circular" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}
                            >
                              {result.type === "circular" ? (
                                <FileText size={20} />
                              ) : (
                                <Megaphone size={20} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-neutral-900 truncate group-hover:text-primary-700 transition-colors">
                                  {result.headline}
                                </span>
                                {result.similarity && (
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">
                                    {(result.similarity * 100).toFixed(0)}%
                                    Match
                                  </span>
                                )}
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
                                      ).toLocaleString(DateTime.DATE_MED)
                                    : "No date"}
                                </span>
                              </div>
                            </div>
                          </Link>
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
  );
}
