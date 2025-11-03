// src/components/PeopleAndEvents.tsx
"use client";

import React, { useState, useEffect, useRef } from "react"; // Added useRef
import { motion, AnimatePresence, useInView } from "framer-motion"; // Added useInView
import { DateTime } from "luxon";
import { Loader2 } from "lucide-react";
import ReactConfetti from "react-confetti"; // Added ReactConfetti

// Import child components
// --- IMPORTED mockBirthdays ---
import { BirthdayScrollList, mockBirthdays } from "./BirthdayScrollList";
import { RetirementScrollList } from "./RetirementScrollList";
import { EventCalendar } from "./EventCalendar";

export type FetchedHoliday = {
  date: string; // ISO date string from server
  title: string;
  type: string;
};

const TABS = ["Birthdays", "Calendar", "Retirements"];

export function PeopleAndEvents() {
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);
  const currentMonthShort = DateTime.local().toFormat("LLL");
  const [holidays, setHolidays] = useState<FetchedHoliday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Confetti Logic (Copied from your reference file) ---
  const cardRef = useRef(null);
  const isInView = useInView(cardRef, { once: true, amount: 0.3 });
  const [hasPlayedConfetti, setHasPlayedConfetti] = useState(false);

  useEffect(() => {
    // This checks if there are any birthdays in the list before playing
    if (
      isInView &&
      activeTab === "Birthdays" &&
      !hasPlayedConfetti &&
      mockBirthdays.length > 0 // This check is from your reference file [cite: 417]
    ) {
      setHasPlayedConfetti(true);
    }
  }, [isInView, activeTab, hasPlayedConfetti]);
  // --- End Confetti Logic ---

  // --- This is your existing, correct logic for fetching holidays ---
  useEffect(() => {
    const fetchHolidays = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const currentYear = DateTime.local().year;
        const response = await fetch(
          `/api/holidays/get-by-year?year=${currentYear}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch holidays.");
        }

        const responseData: { holidays: FetchedHoliday[] } =
          await response.json();

        setHolidays(responseData.holidays);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchHolidays();
  }, []); // Empty dependency array means this runs once on mount

  return (
    // --- ADDED: ref={cardRef} and overflow-hidden ---
    <div
      ref={cardRef}
      className="relative flex flex-col flex-1 min-h-0 bg-gray-100 rounded-lg border border-neutral-300 overflow-hidden"
    >
      {/* --- ADDED: Render Confetti --- */}
      {hasPlayedConfetti && (
        <ReactConfetti
          recycle={false}
          numberOfPieces={300}
          className="absolute inset-0 w-full h-full"
          style={{ zIndex: 20, pointerEvents: "none" }}
        />
      )}

      {/* === Tab Navigation === */}
      <div className="flex border-b border-neutral-300 flex-shrink-0 sticky top-0 bg-gray-100 z-10 px-1 pt-1 h-11">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative px-3 text-sm font-semibold transition-colors rounded-t-md h-10 flex items-center ${
              activeTab === tab
                ? "text-primary-600"
                : "text-neutral-500 hover:text-neutral-800 hover:bg-gray-200/50"
            }`}
          >
            {activeTab === tab && (
              <motion.div
                className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary-600"
                layoutId="people-events-underline"
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              />
            )}
            <span>
              {tab}
              {tab === "Birthdays" && (
                <span className="font-normal text-neutral-600 ml-1">
                  (Today)
                </span>
              )}
              {tab === "Retirements" && (
                <span className="font-normal text-neutral-600 ml-1">
                  ({currentMonthShort})
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* === Content Area === */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-300 hover:scrollbar-thumb-neutral-400">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {/* === Birthdays Tab === */}
            {activeTab === "Birthdays" && <BirthdayScrollList />}

            {/* === Calendar Tab (This remains correct) === */}
            {activeTab === "Calendar" && (
              <div className="p-4">
                {isLoading && (
                  <div className="flex flex-col items-center justify-center h-full min-h-[200px]">
                    <Loader2 className="animate-spin text-primary-600" />
                    <span className="mt-2 text-sm text-neutral-500">
                      Loading Calendar...
                    </span>
                  </div>
                )}
                {error && (
                  <div className="flex flex-col items-center justify-center h-full min-h-[200px]">
                    <span className="text-sm text-red-600">{error}</span>
                  </div>
                )}
                {!isLoading && !error && (
                  <EventCalendar holidays={holidays} isLoading={isLoading} />
                )}
              </div>
            )}

            {/* === Retirements Tab === */}
            {activeTab === "Retirements" && <RetirementScrollList />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
