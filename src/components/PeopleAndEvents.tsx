// src/components/PeopleAndEvents.tsx
"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
// import Image from "next/image"; // Removed - No longer directly used here

// Import child components
import { BirthdayScrollList } from "./BirthdayScrollList"; // Adjusted path if necessary
import { RetirementScrollList } from "./RetirementScrollList"; // Adjusted path if necessary
import { EventCalendar } from "./EventCalendar"; // <-- Import EventCalendar

const TABS = ["Birthdays", "Calendar", "Retirements"];

export function PeopleAndEvents() {
  const [activeTab, setActiveTab] = useState<string>(TABS[0]); // Default to Birthdays

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-100 rounded-lg border border-neutral-300">
      {/* === Tab Navigation === */}
      <div className="flex border-b border-neutral-300 flex-shrink-0 sticky top-0 bg-gray-100 z-10 px-1 pt-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative py-2 px-3 text-sm font-semibold transition-colors rounded-t-md ${
              activeTab === tab
                ? "text-primary-600"
                : "text-neutral-500 hover:text-neutral-800 hover:bg-gray-200/50"
            }`}
          >
            {activeTab === tab && (
              <motion.div
                className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary-600"
                layoutId="people-events-underline" // Keep existing layoutId if it works
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              />
            )}
            {tab}
          </button>
        ))}
      </div>

      {/* === Content Area === */}
      {/* Added padding here for the content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-neutral-300 hover:scrollbar-thumb-neutral-400">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full" // Ensure motion div takes full height
          >
            {/* === Birthdays Tab === */}
            {activeTab === "Birthdays" && <BirthdayScrollList />}

            {/* === Calendar Tab === */}
            {/* --- MODIFIED: Replace placeholder with EventCalendar --- */}
            {activeTab === "Calendar" && <EventCalendar />}

            {/* === Retirements Tab === */}
            {/* Removed extra div wrapper */}
            {activeTab === "Retirements" && <RetirementScrollList />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
