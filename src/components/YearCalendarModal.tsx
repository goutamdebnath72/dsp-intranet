"use client";

import React from "react";
import { DayPicker } from "react-day-picker";
import { DateTime } from "luxon";
import { X } from "lucide-react"; // Removed unused Chevron imports
import { AnimatePresence, motion } from "framer-motion";

// Type for individual holiday items (assuming structure from EventCalendar)
type Holiday = {
  date: DateTime;
  title: string;
  dateObj: Date; // JS Date object for react-day-picker
};

interface YearCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number; // Pass the year to display
  holidays: Holiday[]; // Pass the full list of holidays
}

export function YearCalendarModal({
  isOpen,
  onClose,
  year,
  holidays,
}: YearCalendarModalProps) {
  const startOfYear = DateTime.local(year, 1, 1).toJSDate();

  const holidayDates = holidays.map((h) => h.dateObj);

  // ✅ FIX: 'today' modifier removed. We only need 'isHoliday'.
  const modifiers = {
    isHoliday: holidayDates,
  };

  // ✅ FIX: 'today' style removed.
  const modalModifiersClassNames = {
    isHoliday: "relative modal-holiday-dot",
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
      
      // ✅ FIX: Using the built-in 'day_today' prop.
      // This will NOT apply to 'day_outside' days.
      day_today: "bg-primary-500 text-white rounded-full font-bold",
      
      day_outside: "invisible",
      day_disabled: "text-neutral-300 opacity-50",
      day_hidden: "invisible",
      
      // ✅ Your layout preferences:
      months: "flex flex-wrap gap-4 justify-center", // Equal gaps
      month:
        "space-y-2 border border-neutral-200 rounded-md px-5 py-3 bg-white shadow-sm", // Wider cards
    };

  // ✅ CSS for the holiday dot
  const modalHolidayDotStyle = `
    .modal-holiday-dot:not(.rdp-day_outside)::after {
      content: '';
      position: absolute;
      bottom: 2px;
      left: 50%;
      transform: translateX(-50%);
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background-color: #ef4444; /* ✅ Red dot color */
    }

    /* Style for dot on 'today' (make it white) */
    .rdp-day_today.modal-holiday-dot::after {
      background-color: white;
    }
  `;

  const sortedHolidays = [...holidays].sort(
    (a, b) => a.date.toMillis() - b.date.toMillis()
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal Container (Scrollable) */}
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
            <div className="bg-gradient-to-br from-white via-neutral-50 to-white rounded-lg p-6 max-w-4xl w-full mx-auto my-8 relative shadow-xl border border-neutral-200/50">
              <style>{modalHolidayDotStyle}</style>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-full text-neutral-500 bg-transparent transition-all hover:bg-neutral-100 hover:text-neutral-800 z-[95]"
                aria-label="Close"
              >
                <X size={24} />
              </button>

              {/* Header */}
              <h2 className="text-2xl font-bold font-heading text-center text-neutral-800 mb-6">
                {year} Calendar Overview
              </h2>

              {/* Year Calendar */}
              <DayPicker
                numberOfMonths={12}
                defaultMonth={startOfYear}
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
              />

              {/* Holiday List */}
              <div className="mt-8 pt-6 border-t border-neutral-200">
                <h3 className="text-lg font-semibold text-neutral-700 font-heading mb-4 text-center">
                  {year} Holiday List
                </h3>

                {sortedHolidays.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-300 pr-2">
                    {/* ✅ Your preferred column layout */}
                    <div className="text-sm sm:columns-2 md:columns-3 sm:gap-x-4">
                      {sortedHolidays.map((holiday) => (
                        <div
                          key={holiday.title + holiday.date.toISO()}
                          className="flex justify-between py-1 border-b border-neutral-100 break-inside-avoid"
                        >
                          <span className="text-neutral-800 font-medium">
                            {holiday.title}
                          </span>
                          <span className="text-neutral-500">
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