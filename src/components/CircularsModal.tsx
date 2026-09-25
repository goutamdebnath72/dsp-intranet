// src/components/CircularsModal.tsx
"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import useSWR, { preload } from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  ExternalLink,
  ChevronDown,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { DateTime } from "luxon";
import { useSession } from "next-auth/react";
import { EDIT_DELETE_WINDOW_HOURS } from "@/lib/constants";
import { ConfirmModal } from "./ConfirmModal";
import { Tooltip } from "./Tooltip";
import toast from "react-hot-toast";

type Circular = {
  id: number;
  headline: string;
  publishedAt: string;
  uploadedAt: string;
  fileUrls: string[];
  authorTicketNo: string;
  serialNumber: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCircularClick: (id: number) => void;
};

const NUM_RECENT_YEARS = 2;

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch circulars");
    return res.json();
  });

export function CircularsModal({ isOpen, onClose, onCircularClick }: Props) {
  const { data: session } = useSession();

  // Cheap, rarely-changing: just which years actually have circulars.
  // Drives the year-tab selector without ever pulling a single circular
  // row -- previously this app fetched EVERY circular from EVERY year just
  // to figure out which years to show as tabs.
  const { data: availableYears = [] } = useSWR<string[]>(
    isOpen ? "/api/circulars?meta=years" : null,
    fetcher,
  );

  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const archiveButtonRef = useRef<HTMLDivElement>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [unreadIds, setUnreadIds] = useState<Set<number>>(new Set());

  // Once the years list arrives, default to the latest year that actually
  // has data -- mirrors the old "jump to the most recent year with
  // content" behavior. Only fires the FIRST time (selectedYear starts
  // null), so it never fights the user's own tab clicks afterward.
  useEffect(() => {
    if (isOpen && selectedYear === null && availableYears.length > 0) {
      setSelectedYear(availableYears[0]);
    }
  }, [isOpen, availableYears, selectedYear]);

  // The ONLY circular-row fetch that happens on demand: just the currently
  // selected year, ~500 rows at most instead of every year's archive at
  // once. Switching tabs is a new SWR cache key, not a full refetch.
  const {
    data: circulars = [],
    isLoading,
    mutate: mutateCirculars,
  } = useSWR<Circular[]>(
    isOpen && selectedYear ? `/api/circulars?year=${selectedYear}` : null,
    fetcher,
  );

  // Quietly warm the cache for the immediately-preceding year, so the most
  // likely next click (browsing one year further back) shows instantly
  // from cache instead of a fresh loading spinner. Deliberately only ONE
  // year ahead -- prefetching several years would just recreate the
  // original "load everything up front" problem in a slower, sneakier
  // form instead of actually fixing it.
  useEffect(() => {
    if (!isOpen || !selectedYear) return;
    const prevYear = String(Number(selectedYear) - 1);
    if (availableYears.includes(prevYear)) {
      // Best-effort only -- a failure here (e.g. a transient DB connection
      // hiccup right after a heavy request, which this app's pool is known
      // to occasionally hit) must never surface to the user. Unlike the two
      // useSWR() calls above, preload()'s returned promise isn't consumed
      // by a hook that exposes its own error state, so an unhandled
      // rejection here was crashing the whole page with Next's dev overlay
      // for what should have been an invisible background prefetch -- the
      // selected year will just load normally, un-prefetched, if it fails.
      preload(`/api/circulars?year=${prevYear}`, fetcher).catch(() => {});
    }
  }, [isOpen, selectedYear, availableYears]);

  // Fetch which recent circulars are still unread for this session, so we can
  // bold their titles (Gmail-style). Source of truth is /api/circulars/seen.
  // Independent of which year is selected -- unchanged from before.
  const fetchUnread = () => {
    fetch("/api/circulars/seen", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.unreadIds)) {
          setUnreadIds(new Set<number>(data.unreadIds));
        }
      })
      .catch(() => {
        // Non-fatal: titles just won't be bolded.
      });
  };

  // Lock background page scroll while the modal is open so mouse-wheel
  // scrolling inside it (including over the fixed header) never bleeds through
  // to the home page behind. NOTE: the page scroller in this app is <html>
  // (globals.css sets `html { overflow-y: auto }`), so we must lock the
  // documentElement, not <body>.
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) fetchUnread();
  }, [isOpen]);

  const recentYears = useMemo(
    () => availableYears.slice(0, NUM_RECENT_YEARS),
    [availableYears],
  );
  const archiveYears = useMemo(
    () => availableYears.slice(NUM_RECENT_YEARS),
    [availableYears],
  );
  const isArchiveSelected = selectedYear
    ? archiveYears.includes(selectedYear)
    : false;

  // ✅ Wiring Delete Backend
  const handleDelete = async (id: number) => {
    try {
      // The API should handle the physical deletion of image files
      const response = await fetch(`/api/circulars/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete");

      toast.success("Circular and associated files deleted.");
      mutateCirculars(); // Refresh just this year's list
    } catch (err) {
      toast.error("Failed to delete.");
    }
  };

  const confirmDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteId(id);
    setIsConfirmOpen(true);
  };

  // ✅ Ownership and 24h Window Check
  const canModify = (circular: Circular) => {
    const userTicketNo = (session?.user as any)?.ticketNo || "";
    if (userTicketNo !== circular.authorTicketNo) return false;
    // Window is measured from UPLOAD time, not the circular's (possibly
    // backfilled) issue date.
    const upAt = DateTime.fromISO(circular.uploadedAt);
    const diff = DateTime.now().diff(upAt, "hours").hours;
    return diff <= EDIT_DELETE_WINDOW_HOURS;
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        archiveButtonRef.current &&
        !archiveButtonRef.current.contains(event.target as Node)
      ) {
        setIsArchiveOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [archiveButtonRef]);

  if (!isOpen) return null;

  const handleYearSelect = (year: string) => {
    setSelectedYear(year);
    setIsArchiveOpen(false);
  };

  const listVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.03 } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="bg-white/80 backdrop-blur-xl border border-white/30 rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 z-20 text-neutral-500 hover:text-neutral-800"
        >
          <X size={28} />
        </button>
        <header className="p-6 border-b border-neutral-200/80 flex-shrink-0">
          <h2 className="text-2xl font-bold text-neutral-800">
            Circulars Archive
          </h2>
          <p className="text-neutral-500 mt-1">Browse circulars by year</p>
        </header>
        <nav className="p-4 border-b border-neutral-200/80 flex-shrink-0">
          <div className="flex items-center space-x-2">
            {recentYears.map((year) => (
              <button
                key={year}
                onClick={() => handleYearSelect(year)}
                className={`relative px-4 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 ${selectedYear === year ? "text-white" : "text-neutral-600 hover:bg-neutral-200/60"}`}
              >
                {selectedYear === year && (
                  <motion.div
                    layoutId="year-pill"
                    className="absolute inset-0 bg-primary-600 rounded-md"
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  />
                )}
                <span className="relative">{year}</span>
              </button>
            ))}
            {archiveYears.length > 0 && (
              <div className="relative" ref={archiveButtonRef}>
                <button
                  onClick={() => setIsArchiveOpen(!isArchiveOpen)}
                  className={`relative flex items-center space-x-1 px-4 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 ${isArchiveSelected ? "text-white" : "text-neutral-600 hover:bg-neutral-200/60"}`}
                >
                  {isArchiveSelected && (
                    <motion.div
                      layoutId="year-pill"
                      className="absolute inset-0 bg-primary-600 rounded-md"
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 25,
                      }}
                    />
                  )}
                  <span className="relative">
                    {isArchiveSelected ? selectedYear : "Older..."}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`relative transition-transform duration-200 ${isArchiveOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <AnimatePresence>
                  {isArchiveOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full mt-2 w-32 bg-white/80 backdrop-blur-lg rounded-md shadow-lg border border-white/30 z-10 overflow-hidden"
                    >
                      <ul className="py-1">
                        {archiveYears.map((year) => (
                          <li key={year}>
                            <button
                              onClick={() => handleYearSelect(year)}
                              className="w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-primary-100/50"
                            >
                              {year}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </nav>
        <main className="flex-1 overflow-y-auto overscroll-contain p-6 scrollbar-thin scrollbar-thumb-neutral-400/50 scrollbar-track-transparent">
          <AnimatePresence mode="wait">
            <motion.ul
              key={selectedYear ?? "loading"}
              variants={listVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-3"
            >
              {isLoading || !selectedYear ? (
                <motion.div
                  variants={itemVariants}
                  className="flex items-center justify-center gap-2 text-neutral-700 min-h-[50vh]"
                >
                  <span>Loading circulars</span>
                  <span className="flex items-center gap-1" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-neutral-600"
                        animate={{ opacity: [0.35, 1, 0.35] }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          delay: i * 0.2,
                          ease: "easeInOut",
                        }}
                      />
                    ))}
                  </span>
                  <span className="sr-only">Loading circulars…</span>
                </motion.div>
              ) : circulars.length > 0 ? (
                circulars.map((circular) => (
                  <motion.li key={circular.id} variants={itemVariants}>
                    <div
                      className={`relative w-full text-left flex items-center p-4 rounded-lg border transition-all group overflow-hidden ${
                        unreadIds.has(circular.id)
                          ? "bg-primary-50/60 border-primary-200 hover:bg-primary-50"
                          : "bg-white/50 border-transparent hover:border-primary-300 hover:bg-white"
                      }`}
                    >
                      {/* Unread accent bar (left edge) */}
                      <span
                        aria-hidden
                        className={`absolute left-0 top-0 h-full w-1 rounded-l-lg transition-opacity ${
                          unreadIds.has(circular.id)
                            ? "bg-primary-600 opacity-100"
                            : "opacity-0"
                        }`}
                      />
                      <button
                        onClick={() => {
                          onCircularClick(circular.id);
                          // Optimistically clear the unread mark, then reconcile.
                          setUnreadIds((prev) => {
                            const next = new Set(prev);
                            next.delete(circular.id);
                            return next;
                          });
                          setTimeout(fetchUnread, 800);
                        }}
                        className="flex-1 text-left"
                      >
                        <p
                          className={`flex items-start transition-colors ${
                            unreadIds.has(circular.id)
                              ? "font-bold text-neutral-900"
                              : "font-semibold text-neutral-800"
                          } group-hover:text-primary-700`}
                        >
                          {/* Unread dot (space reserved so nothing shifts) */}
                          <span
                            aria-hidden
                            className={`mr-2 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                              unreadIds.has(circular.id)
                                ? "bg-primary-600"
                                : "bg-transparent"
                            }`}
                          />
                          <span className="text-neutral-400 font-mono mr-2">
                            {String(circular.serialNumber ?? 0).padStart(
                              3,
                              "0",
                            )}
                          </span>
                          {circular.headline}
                        </p>
                        <p className="text-sm text-neutral-500 mt-1 pl-4">
                          {DateTime.fromISO(circular.publishedAt).toFormat(
                            "LLL dd, yy",
                          )}
                        </p>
                      </button>

                      {/* ✅ Edit/Delete Controls */}
                      {canModify(circular) && (
                        <div className="flex gap-2 ml-4 items-center">
                          <Tooltip content="Delete — uploader only, within 24 h of upload">
                            <button
                              onClick={(e) => confirmDelete(circular.id, e)}
                              aria-label="Delete circular"
                              className="text-neutral-400 hover:text-red-600 p-2"
                            >
                              <Trash2 size={18} />
                            </button>
                          </Tooltip>
                        </div>
                      )}

                      <ExternalLink className="h-4 w-4 text-neutral-400 group-hover:text-primary-600 transition-all ml-4 flex-shrink-0" />
                    </div>
                  </motion.li>
                ))
              ) : (
                <motion.div
                  variants={itemVariants}
                  className="text-center text-neutral-500 py-8"
                >
                  No circulars found for the year {selectedYear}.
                </motion.div>
              )}
            </motion.ul>
          </AnimatePresence>
        </main>
      </motion.div>
      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="Delete Circular"
        message="Are you sure? This will delete the circular and all associated files permanently."
      />
    </div>
  );
}
