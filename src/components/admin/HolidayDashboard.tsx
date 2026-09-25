// src/components/admin/HolidayDashboard.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronDown, AlertTriangle } from "lucide-react";
import { HolidayUploadModal } from "./HolidayUploadModal";
import { toast } from "react-hot-toast";
import { HOLIDAY_REVIEW_YEAR_MIN, HOLIDAY_REVIEW_YEAR_MAX } from "@/lib/constants";

interface StagedHolidayEntry {
  name: string;
  matchedMasterId: number | null;
  isNewMaster: boolean;
  newAlias: string | null;
  date: string;
  type: "CH" | "FH" | "RH";
  categories: string | null;
  note: string | null;
}

interface PendingExtraction {
  id: number;
  circularId: number;
  year: number;
  status: string;
  payload: {
    holidays: StagedHolidayEntry[];
    rhQuota: { category: string; quota: number }[];
    warnings: string[];
  };
  createdAt: string;
}

export function HolidayDashboard() {
  const { data: session } = useSession();
  const reviewerTicket = (session?.user as any)?.ticketNo ?? null;

  const [selectedYear, setSelectedYear] = useState<number | "">("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [pending, setPending] = useState<PendingExtraction[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [actingOnId, setActingOnId] = useState<number | null>(null);
  const [confirmYearToClear, setConfirmYearToClear] = useState<number | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const loadPending = () => {
    fetch("/api/holidays/extraction-staging?status=pending")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setPending(Array.isArray(data) ? data : []))
      .catch(() => setPending([]));
  };

  useEffect(() => {
    loadPending();
  }, []);

  const handleConfirm = async (id: number) => {
    setActingOnId(id);
    try {
      const res = await fetch(`/api/holidays/extraction-staging/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewedBy: reviewerTicket }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Confirm failed");
      toast.success(`✅ Confirmed — ${data.holidayCount} holidays written for ${data.year}.`);
      loadPending();
    } catch (e: any) {
      toast.error(e.message || "Failed to confirm");
    } finally {
      setActingOnId(null);
    }
  };

  const handleReject = async (id: number) => {
    setActingOnId(id);
    try {
      const res = await fetch(`/api/holidays/extraction-staging/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewedBy: reviewerTicket }),
      });
      if (!res.ok) throw new Error("Reject failed");
      toast.success("✅ Rejected — nothing was written to the holiday calendar.");
      loadPending();
    } catch (e: any) {
      toast.error(e.message || "Failed to reject");
    } finally {
      setActingOnId(null);
    }
  };

  const handleUnseedYear = () => {
    if (!selectedYear) return; // button is disabled in this state anyway
    setConfirmYearToClear(selectedYear);
  };

  const confirmUnseed = async () => {
    if (!confirmYearToClear) return;
    setIsClearing(true);
    try {
      const res = await fetch(`/api/holidays/unseed?year=${confirmYearToClear}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to unseed year");
      // Explicit, reassuring confirmation naming the year and exactly what
      // was removed -- deleting something should never leave the person
      // wondering whether it actually worked.
      toast.success(
        `✅ ${confirmYearToClear} data has been cleared completely` +
          (typeof data.holidaysRemoved === "number"
            ? ` (${data.holidaysRemoved} holiday${data.holidaysRemoved === 1 ? "" : "s"} removed).`
            : "."),
      );
      setConfirmYearToClear(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to unseed year");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="flex flex-col items-center h-full pt-10">
      <h2 className="text-2xl font-bold font-heading mb-32 text-center">
        Holiday Management
      </h2>
      <p className="mb-24 text-neutral-600 text-center">
        {/* --- CHANGE --- */}
        Upload the official holiday file (.txt or .json) to seed the database.
        {/* --- END CHANGE --- */}
      </p>

      {pending.length > 0 && (
        <div className="mb-24 w-full max-w-md mx-auto rounded-md border border-amber-300 bg-amber-50 p-3 text-left">
          <p className="mb-2 text-sm font-semibold text-amber-800">
            {pending.length} pending holiday extraction{pending.length > 1 ? "s" : ""} awaiting review
          </p>
          {pending.map((p) => {
            const newCount = p.payload.holidays.filter((h) => h.isNewMaster).length;
            const noteCount = p.payload.holidays.filter((h) => h.note).length;
            const nearMissEntries = p.payload.holidays.filter((h) => h.newAlias);
            const isExpanded = expandedId === p.id;
            const isActing = actingOnId === p.id;
            return (
              <div key={p.id} className="mb-2 rounded border border-amber-200 bg-white p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-800">
                    Year {p.year} — {p.payload.holidays.length} holidays ({newCount} new)
                    {noteCount > 0 && `, ${noteCount} reclassification note${noteCount > 1 ? "s" : ""}`}
                    {nearMissEntries.length > 0 &&
                      `, ${nearMissEntries.length} near-miss alias${nearMissEntries.length > 1 ? "es" : ""}`}
                  </span>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    className="text-xs text-primary-700 underline"
                  >
                    {isExpanded ? "Hide" : "View"}
                  </button>
                </div>
                {nearMissEntries.length > 0 && (
                  <div className="mt-2 rounded border border-blue-300 bg-blue-50 p-2 text-xs text-blue-900">
                    <p className="font-semibold mb-1">
                      Near-miss spelling{nearMissEntries.length > 1 ? "s" : ""} detected — will be
                      added as alias{nearMissEntries.length > 1 ? "es" : ""} on confirm, not a new
                      holiday:
                    </p>
                    {nearMissEntries.map((h, i) => (
                      <p key={i}>
                        "{h.newAlias}" → matched to existing "{h.name}" ({h.type})
                      </p>
                    ))}
                  </div>
                )}
                {p.payload.warnings && p.payload.warnings.length > 0 && (
                  <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
                    {p.payload.warnings.map((w, i) => (
                      <p key={i} className={i > 0 ? "mt-1" : ""}>
                        ⚠ {w}
                      </p>
                    ))}
                  </div>
                )}
                {isExpanded && (
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-neutral-50 p-2 text-xs">
                    {JSON.stringify(p.payload, null, 2)}
                  </pre>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    disabled={isActing}
                    onClick={() => handleConfirm(p.id)}
                    className="rounded bg-green-600 px-3 py-1 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Confirm & Write to Calendar
                  </button>
                  <button
                    disabled={isActing}
                    onClick={() => handleReject(p.id)}
                    className="rounded bg-neutral-300 px-3 py-1 text-xs font-bold text-neutral-700 hover:bg-neutral-400 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-32 flex items-center justify-center gap-2">
        <label
          htmlFor="holiday-year"
          className="font-semibold text-neutral-700"
        >
          Review Year:
        </label>
        <div className="relative">
          <select
            id="holiday-year"
            value={selectedYear}
            onChange={(e) =>
              setSelectedYear(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="appearance-none rounded-md border border-neutral-300 bg-white py-1.5 pl-3 pr-8 font-semibold text-neutral-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="" disabled>
              Select a year…
            </option>
            {Array.from(
              { length: HOLIDAY_REVIEW_YEAR_MAX - HOLIDAY_REVIEW_YEAR_MIN + 1 },
              (_, i) => HOLIDAY_REVIEW_YEAR_MIN + i,
            ).map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
          <ChevronDown
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
            size={18}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Content is anchored near the top with modest, consistent gaps
          rather than stretched across the full card height -- with only
          4-5 sparse rows, distributing them across a tall card (via
          justify-between) just produced the same "giant empty gaps"
          problem already fixed on the other admin cards earlier. Any
          leftover space simply sits quietly below, unused, same as those
          cards. These two buttons act on whatever year was just selected
          above. Both stay disabled (and their label stays year-less) until
          a real selection is made, so there's no default year someone
          could act on by mistake. */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={!selectedYear}
          className="flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-green-600 to-green-700 px-4 py-2 text-sm font-bold text-white tracking-wide shadow-lg transform transition-all duration-300 ease-in-out hover:scale-105 hover:-translate-y-px hover:shadow-xl hover:shadow-green-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:hover:scale-100 disabled:hover:translate-y-0 disabled:shadow-lg"
        >
          <CalendarDays size={16} />
          <span>{selectedYear ? `Upload & Seed ${selectedYear}` : "Upload & Seed Holidays"}</span>
        </button>
        <button
          onClick={handleUnseedYear}
          disabled={!selectedYear}
          title={selectedYear ? `Clear all holiday data for ${selectedYear}` : "Select a year first"}
          className="flex items-center justify-center gap-2 rounded-md bg-red-50 border border-red-300 px-3 py-2 text-sm font-bold text-red-700 tracking-wide transition-colors hover:bg-red-100 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
        >
          {selectedYear ? `Clear ${selectedYear}` : "Clear Year"}
        </button>
      </div>

      <HolidayUploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        year={selectedYear || 0}
        onSeedSuccess={(data) => {
          toast.success(data.message || "Holidays seeded successfully!");
          setIsModalOpen(false);
        }}
      />

      {/* Custom confirmation modal for the destructive "Clear" action --
          matches the app's own frosted-glass modal style (see
          CircularUploadModal) instead of the browser's plain native
          window.confirm() dialog, which looked out of place next to the
          rest of this app's design. */}
      <AnimatePresence>
        {confirmYearToClear !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => !isClearing && setConfirmYearToClear(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white/90 backdrop-blur-xl border border-white/30 rounded-xl shadow-2xl w-full max-w-sm p-6 text-center"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="text-red-600" size={24} />
              </div>
              <h3 className="text-lg font-bold text-neutral-800 mb-2">
                Clear {confirmYearToClear} holiday data?
              </h3>
              <p className="text-sm text-neutral-600 mb-6">
                This permanently removes all holidays and the RH quota for{" "}
                <strong>{confirmYearToClear}</strong>. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmYearToClear(null)}
                  disabled={isClearing}
                  className="flex-1 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-bold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmUnseed}
                  disabled={isClearing}
                  className="flex-1 rounded-md bg-gradient-to-r from-red-600 to-red-700 px-4 py-2 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isClearing ? "Clearing..." : `Yes, Clear ${confirmYearToClear}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
