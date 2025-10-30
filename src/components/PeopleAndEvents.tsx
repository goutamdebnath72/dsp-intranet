// src/components/PeopleAndEvents.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { DateTime } from "luxon";
import ReactConfetti from "react-confetti";

// Import child components
import { BirthdayScrollList, mockBirthdays } from "./BirthdayScrollList"; // --- 1. IMPORTED mockBirthdays ---
import { RetirementScrollList } from "./RetirementScrollList";
import { EventCalendar } from "./EventCalendar";

const TABS = ["Birthdays", "Calendar", "Retirements"];
export function PeopleAndEvents() {
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);
  const currentMonthShort = DateTime.local().toFormat("LLL");

  // --- Confetti Logic ---
  const cardRef = useRef(null);
  const isInView = useInView(cardRef, { once: true, amount: 0.3 });
  const [hasPlayedConfetti, setHasPlayedConfetti] = useState(false);

  useEffect(() => {
    // --- 2. ADDED CHECK FOR mockBirthdays.length ---
    if (
      isInView &&
      activeTab === "Birthdays" &&
      !hasPlayedConfetti &&
      mockBirthdays.length > 0 // <-- This stops it from running if the list is empty
    ) {
      setHasPlayedConfetti(true);
    }
  }, [isInView, activeTab, hasPlayedConfetti]);
  // --- END OF CHANGE ---

  return (
    <div
      ref={cardRef}
      className="relative flex flex-col flex-1 min-h-0 bg-gray-100 rounded-lg border border-neutral-300 overflow-hidden"
    >
      {/* --- RENDER CONFETTI --- */}
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
            className={`relative px-3 text-sm font-semibold transition-colors rounded-t-md h-10 flex items-center ${activeTab === tab
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

            {/* === Calendar Tab === */}
            {activeTab === "Calendar" && (
              <div className="p-4">
                <EventCalendar />
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