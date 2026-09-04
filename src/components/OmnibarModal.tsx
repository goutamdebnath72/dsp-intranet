// src/components/OmnibarModal.tsx
"use client";

import React, { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Loader2,
  FileText,
  Megaphone,
  Sparkles,
  X,
} from "lucide-react";
import { DateTime } from "luxon";
import { useOmniSearch } from "@/hooks/useOmniSearch";
import Link from "next/link";

interface OmnibarModalProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
}

export function OmnibarModal({ isOpen, setIsOpen }: OmnibarModalProps) {
  // Hook now automatically manages its own cleanup based on isOpen
  const { query, setQuery, mode, setMode, results, isLoading, error } =
    useOmniSearch(isOpen);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Clean, decoupled keyboard listener
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 sm:pt-32 px-4">
          {/* Blurred Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl overflow-hidden border border-neutral-200 flex flex-col max-h-[75vh]"
          >
            {/* Search Input Area */}
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
                }}
                placeholder="Search for circulars, announcements, or people..."
                className="flex-1 bg-transparent text-lg text-neutral-900 placeholder-neutral-400 focus:outline-none"
              />
              {isLoading && (
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

            {/* Dual-Mode Toggle */}
            <div className="flex items-center gap-2 px-4 py-3 bg-neutral-50 border-b border-neutral-200 text-sm">
              <span className="text-neutral-500 font-medium mr-2">
                Search Mode:
              </span>
              <button
                onClick={() => setMode("title")}
                className={`px-3 py-1.5 rounded-full font-medium transition-colors ${
                  mode === "title"
                    ? "bg-neutral-800 text-white"
                    : "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
                }`}
              >
                Headline Match
              </button>
              <button
                onClick={() => setMode("deep")}
                className={`px-3 py-1.5 rounded-full font-medium transition-colors flex items-center gap-1.5 ${
                  mode === "deep"
                    ? "bg-primary-600 text-white"
                    : "bg-primary-50 text-primary-700 hover:bg-primary-100"
                }`}
              >
                <Sparkles size={14} />
                Deep AI Content Search
              </button>
            </div>

            {/* Results Area */}
            <div className="overflow-y-auto p-2">
              {error && (
                <div className="p-4 text-center text-red-600 text-sm font-medium">
                  Failed to perform search. Please try again.
                </div>
              )}

              {!isLoading &&
                query.length >= 3 &&
                results.length === 0 &&
                !error && (
                  <div className="p-8 text-center text-neutral-500">
                    No results found for &quot;{query}&quot;
                  </div>
                )}

              {results.length > 0 && (
                <div className="flex flex-col gap-1">
                  {results.map((result) => (
                    <Link
                      key={`${result.type}-${result.id}`}
                      href={result.url ?? "#"}
                      target={result.type === "circular" ? "_blank" : undefined}
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
                          {mode === "deep" && result.similarity && (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">
                              {(result.similarity * 100).toFixed(0)}% Match
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
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
