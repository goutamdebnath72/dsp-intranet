// src/components/YearCalendarModal.tsx
"use client";

import React, { useMemo } from "react";
import { DayPicker, Day, DayProps } from "react-day-picker";
import { DateTime } from "luxon";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Tooltip } from "./Tooltip";

// This is the formatted type this component expects
type Holiday = {
  date: DateTime;
  title: string;
  dateObj: Date;
  type: string;
};

// --- FIX: Updated Color Map to use API types (CH, FH, RH) ---
const holidayColorMap: { [key: string]: string } = {
  CH: "text-red-600", // Was "Closed"
  FH: "text-blue-600", // Was "Festival"
  RH: "text-purple-600", // Was "Restricted"
};

interface YearCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  holidays: Holiday[]; // This prop is already correctly formatted by the parent
}

export function YearCalendarModal({
  isOpen,
  onClose,
  year,
  holidays, // This data is already formatted by EventCalendar
}: YearCalendarModalProps) {
  // Keep startOfYear as a Luxon object for logic
  const startOfYear = DateTime.local(year, 1, 1);

  // This logic is correct, as it uses the .dateObj prop for the picker
  const modifiers = useMemo(
    () => ({
      // --- FIX: Use API types (CH, FH, RH) ---
      isClosed: holidays
        .filter((h) => h.type === "CH") // Was "Closed"
        .map((h) => h.dateObj),
      isFestival: holidays
        .filter((h) => h.type === "FH") // Was "Festival"
        .map((h) => h.dateObj),
      isRestricted: holidays
        .filter((h) => h.type === "RH") // Was "Restricted"
        .map((h) => h.dateObj),
      // --- END FIX ---
    }),
    [holidays]
  );
  
  const modalModifiersClassNames = {
    isClosed: "relative modal-holiday-dot-closed",
    isFestival: "relative modal-holiday-dot-festival",
    isRestricted: "relative modal-holiday-dot-restricted",
  };
  
  const modalClassNames: React.ComponentProps<typeof DayPicker>["classNames"] =
    {
      root: "bg-transparent w-full",
      caption: "flex items-center justify-center mb-2 pt-1 relative",
      caption_label: "text-base font-semibold text-neutral-700",
      nav_button: "hidden",
      table: "w-full border-collapse",
      head_row: "flex mb-1",
      head_cell:
        "text-neutral-500 rounded-md w-8 h-8 mx-auto font-medium text-[0.7rem] uppercase flex items-center justify-center",
      tbody: "space-y-0.5",
      row: "flex w-full mt-0.5",
      cell: "text-center text-xs p-0 relative w-8 h-8 mx-auto flex items-center justify-center",
      day: "w-8 h-8 flex items-center justify-center rounded-full hover:bg-primary-100 transition-colors cursor-default",
      day_today: "bg-primary-500 text-white rounded-full font-bold",
      day_outside: "invisible",
      day_disabled: "text-neutral-300 opacity-50",
      day_hidden: "invisible",
      months: "flex flex-wrap gap-4 justify-center",
      month:
        "space-y-2 border border-neutral-200 rounded-md px-11 py-3 bg-white shadow-sm",
    };
    
  const modalHolidayDotStyle = `
    .modal-holiday-dot-closed:not(.rdp-day_outside)::after {
      content: ''; position: absolute;
      bottom: 2px; left: 50%;
      transform: translateX(-50%);
      width: 4px; height: 4px;
      border-radius: 50%;
      background-color: #ef4444; /* Red */
    }
    .modal-holiday-dot-festival:not(.rdp-day_outside)::after {
      content: ''; position: absolute;
      bottom: 2px; left: 50%;
      transform: translateX(-50%);
      width: 4px; height: 4px;
      border-radius: 50%;
      background-color: #3b82f6; /* Blue */
    }
    .modal-holiday-dot-restricted:not(.rdp-day_outside)::after {
      content: ''; position: absolute;
      bottom: 2px; left: 50%;
      transform: translateX(-50%);
      width: 4px; height: 4px;
      border-radius: 50%;
      background-color: #9333ea; /* Purple */
    }
    .rdp-day_today.modal-holiday-dot-closed::after,
    .rdp-day_today.modal-holiday-dot-festival::after,
    .rdp-day_today.modal-holiday-dot-restricted::after {
      background-color: white;
    }
  `;

  // --- FIX: Use holiday.type directly for Tooltip ---
  function CustomDay(props: DayProps & { modifiers?: { outside?: boolean } }) {
    // Convert picker's JS Date prop back to Luxon
    const dayAsLuxon = DateTime.fromJSDate(props.date);
    // Find the holiday by comparing Luxon objects
    const holiday = holidays.find((h) =>
      h.date.hasSame(dayAsLuxon, "day")
    );
    if (holiday && !props.modifiers?.outside) {
      const shortType = holiday.type; // The type IS the short type (e.g., "CH")
      return (
        <Tooltip content={shortType}>
          <Day {...props} />
        </Tooltip>
      );
    }
    return <Day {...props} />;
  }
  // --- END OF CHANGE ---

  const components = {
    Day: CustomDay,
  };
  
  // This sort is correct, as it uses Luxon's .toMillis()
  const sortedHolidays = [...holidays].sort(
    (a, b) => a.date.toMillis() - b.date.toMillis()
  );
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="fixed inset-0 z-[90] p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                onClose();
              }
            }}
          >
            <div className="bg-gradient-to-br from-white via-neutral-50 to-white rounded-lg p-6 max-w-5xl w-full mx-auto my-8 relative shadow-xl border border-neutral-200/50">
              <style>{modalHolidayDotStyle}</style>
              <button
                onClick={onClose}
                className="modal-close-button top-4 right-4 z-[95]"
                aria-label="Close"
              >
                <X size={24} />
              </button>
              <h2 className="text-2xl font-bold font-heading text-center text-neutral-800 mb-6">
                {year} Calendar Overview
              </h2>

              <DayPicker
                numberOfMonths={12}
                // Convert Luxon object to JS Date at the boundary
                defaultMonth={startOfYear.toJSDate()}
                fromYear={year}
                toYear={year}
                showOutsideDays
                fixedWeeks
                disableNavigation
                mode="multiple"
                modifiers={modifiers}
                classNames={modalClassNames}
                modifiersClassNames={modalModifiersClassNames}
                weekStartsOn={0}
                components={components}
              />

              <div className="mt-8 pt-6 border-t border-neutral-200">
                <h3 className="text-lg font-semibold text-neutral-700 font-heading mb-4 text-center">
                  {year} Holiday List
                </h3>
                {sortedHolidays.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-300 pr-2">
                    <div className="text-sm sm:columns-2 md:columns-3 sm:gap-x-4">
                      {sortedHolidays.map((holiday) => (
                        <div
                          key={holiday.title + holiday.date.toISO()}
                          className="flex justify-between py-1 border-b border-neutral-100 break-inside-avoid"
                        >
                          <span className="text-neutral-800 font-medium">
                            {holiday.title} {/* <-- This now works (reads from h.name) */}
                          </span>
                          <span
                            className={`flex-shrink-0 font-medium ${
                              holidayColorMap[holiday.type] || // <-- This now works (e.g., holidayColorMap["CH"])
                              "text-neutral-500"
                            }`}
                          >
                            {/* This formatting is correct (uses Luxon) */}
                            {holiday.date.toFormat("LLL dd")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400 text-center py-4">
                    No holidays listed for this year.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}