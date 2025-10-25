// src/components/PeopleAndEvents.tsx
"use client";

import React, { useState } from "react";
// <-- Added useState back
import { motion, AnimatePresence } from "framer-motion";
// --- ADDED: Define TABS ---
const TABS = ["Birthdays", "Calendar", "Retirements"];
// --- REMOVED: Props interface (no longer needed) ---

// --- MODIFIED: Component no longer takes props ---
export function PeopleAndEvents() {
  // --- ADDED: Internal activeTab state ---
  const [activeTab, setActiveTab] = useState(TABS[0]);
  // Default to Birthdays

  return (
    // MODIFIED: Replaced h-full with flex-1 min-h-0
    <div className="flex flex-col flex-1 min-h-0 bg-gray-100 rounded-lg border">
      {/* --- ADDED: Tab Navigation (Sticky inside grey area) --- */}
      <div className="flex border-b border-neutral-300 flex-shrink-0 sticky top-0 bg-gray-100 z-10 px-1 pt-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative py-2 px-3 text-sm font-semibold transition-colors rounded-t-md
              ${
                activeTab === tab
                  ? "text-primary-600" // Active tab text color
                  : "text-neutral-500 hover:text-neutral-800 hover:bg-gray-200/50" // Inactive tab styles
              }
            `}
          >
            {/* Animated underline for active tab */}
            {activeTab === tab && (
              <motion.div
                className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary-600"
                layoutId="people-events-underline-internal" // Unique ID
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              />
            )}
            {tab}
          </button>
        ))}
      </div>

      {/* Content area handles scrolling */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-neutral-300 hover:scrollbar-thumb-neutral-400">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab} // Use internal state for key
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            // No padding needed here now, handled by parent div
          >
            {/* Placeholder content */}
            {activeTab === "Birthdays" && <div>Birthday Content Here</div>}
            {activeTab === "Calendar" && <div>Calendar Content Here</div>}
            {activeTab === "Retirements" && <div>Retirement Content Here</div>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
