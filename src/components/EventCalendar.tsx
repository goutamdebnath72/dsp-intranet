// src/components/EventCalendar.tsx
"use client";

import React, { useState, useMemo } from "react";
import { DayPicker } from "react-day-picker";
import type { CaptionLabelProps as BaseCaptionLabelProps } from "react-day-picker";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { YearCalendarModal } from "./YearCalendarModal";

// Define a local fixed type with displayMonth restored
interface FixedCaptionLabelProps extends BaseCaptionLabelProps {
  displayMonth: Date;
}

// Corrected holiday list
const holidaysData = [
  { date: DateTime.local(2025, 1, 1), title: "New Year's Day" },
  { date: DateTime.local(2025, 3, 14), title: "Holi (Estimated)" },
  { date: DateTime.local(2025, 8, 15), title: "Independence Day" },
  { date: DateTime.local(2025, 9, 22), title: "Mahalaya" },
  { date: DateTime.local(2025, 9, 29), title: "Durga Saptami" },
  { date: DateTime.local(2025, 9, 30), title: "Durga Ashtami" },
  { date: DateTime.local(2025, 10, 1), title: "Maha Navami" },
  { date: DateTime.local(2025, 10, 2), title: "Gandhi Jayanti" },
  { date: DateTime.local(2025, 10, 2), title: "Vijayadashami" },
  { date: DateTime.local(2025, 10, 6), title: "Lakshmi Puja" },
  { date: DateTime.local(2025, 10, 20), title: "Kali Puja" },
  { date: DateTime.local(2025, 10, 21), title: "Diwali" },
  { date: DateTime.local(2025, 10, 23), title: "Bhai Phonta" },
  { date: DateTime.local(2025, 10, 27), title: "Chhath Puja" },
  { date: DateTime.local(2025, 11, 5), title: "Guru Nanak Jayanti" },
  { date: DateTime.local(2025, 12, 25), title: "Christmas Day" },
].map((h) => ({ ...h, dateObj: h.date.toJSDate() }));


// --- Component ---
export function EventCalendar() {
  const [currentMonth, setCurrentMonth] = useState<DateTime>(
    // Start on September to show dots immediately
    DateTime.local(2025, 9) 
  );
  const [isYearModalOpen, setIsYearModalOpen] = useState(false);

  const selectedMonthHolidays = useMemo(() => {
    return holidaysData
      .filter((h) => h.date.hasSame(currentMonth, "month"))
      .sort((a, b) => a.date.day - b.date.day);
  }, [currentMonth]);

  const holidayDates = holidaysData.map((h) => h.dateObj);
  const modifiers = { isHoliday: holidayDates, today: new Date() };
  
  // These are the classes for the MODIFIERS
  const modifiersClassNames = {
    isHoliday: "relative holiday-dot",
    today: "bg-primary-500 text-white rounded-full font-bold",
  };

  // --- Safely typed CaptionLabel (with our fixed type) ---
  const CustomCaptionLabel: React.FC<FixedCaptionLabelProps> = ({
    displayMonth,
  }) => {
    const monthLabel = DateTime.fromJSDate(displayMonth).toFormat("LLLL yyyy");
    return (
      <div className="flex items-center justify-center gap-2 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="text-lg font-bold text-neutral-800 font-heading">
          {monthLabel}
        </span>
        <button
          onClick={() => setIsYearModalOpen(true)}
          className="p-1 rounded-md text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
          title="View Year Calendar"
          aria-label="View Year Calendar"
        >
          <CalendarDays size={18} />
        </button>
      </div>
    );
  };

  const classNames: React.ComponentProps<typeof DayPicker>['classNames'] = {
    root: "bg-white p-4 rounded-lg shadow border border-neutral-200 w-full",
    caption: "flex items-center justify-between mb-3 px-1 relative h-10",
    caption_label: "text-lg font-bold text-neutral-800 font-heading",
    nav: "flex items-center space-x-1",
    nav_button:
      "p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500 hover:text-neutral-700 transition-colors",
    nav_button_previous: "absolute left-2 top-1/2 -translate-y-1/2",
    nav_button_next: "absolute right-2 top-1/2 -translate-y-1/2",
    table: "w-full border-collapse",
    head_row: "flex mb-2",
    // ✅ THIS IS THE FIX: Removed 'w-full' which was conflicting with 'flex-1'
    head_cell:
      "text-neutral-500 rounded-md font-medium text-[0.8rem] uppercase flex-1 text-center",
    tbody: "space-y-1",
    row: "flex w-full mt-1.5",
    cell: "text-center text-sm p-0 relative flex-1 mx-0.5",
    day: "w-9 h-9 flex items-center justify-center rounded-full hover:bg-primary-100 transition-colors cursor-pointer",
    day_outside: "text-neutral-300 opacity-50",
    day_disabled: "text-neutral-300 opacity-50",
    day_range_middle: "text-primary-600 bg-primary-50 rounded-none",
    day_hidden: "invisible",
  };

  const holidayDotStyle = `
    .holiday-dot .rdp-day_today.holiday-dot { color: white !important; position: relative; }
    .holiday-dot:not(.rdp-day_outside)::after {
      content: ''; position: absolute; bottom: 4px; left: 50%;
      transform: translateX(-50%); width: 5px; height: 5px;
      border-radius: 50%; background-color: #ef4444;
    }
    .rdp-day_today.holiday-dot::after { background-color: white; }
  `;

  // v8 `components` prop (PascalCase keys)
  const components: any = {
    CaptionLabel: CustomCaptionLabel,
    IconLeft: () => <ChevronLeft className="h-5 w-5" />,
    IconRight: () => <ChevronRight className="h-5 w-5" />,
  };

  return (
    <>
      <div className="flex flex-col h-full">
        <style>{holidayDotStyle}</style>

        <DayPicker
          showOutsideDays
          fixedWeeks
          mode="single"
          month={currentMonth.toJSDate()}
          onMonthChange={(month) => setCurrentMonth(DateTime.fromJSDate(month))}
          modifiers={modifiers}
          classNames={classNames}
          components={components}
          modifiersClassNames={modifiersClassNames}
          weekStartsOn={0}
        />

        {/* Event List Pane */}
        <div className="mt-4 flex-1 min-h-0">
          <h3 className="text-sm font-semibold text-neutral-600 mb-2 px-1">
            Events in {currentMonth.toFormat("LLLL yyyy")}
          </h3>
          <div className="h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-300 hover:scrollbar-thumb-neutral-400 pr-2 space-y-1.5 pb-1">
            {selectedMonthHolidays.length > 0 ? (
              selectedMonthHolidays.map((holiday) => (
                <div
                  key={holiday.date.toISO() + holiday.title}
                  className="flex items-center gap-2 text-xs p-1.5 bg-white rounded border border-neutral-200/60 shadow-sm"
                >
                  <span className="font-semibold text-primary-600 w-8 text-center flex-shrink-0">
                    {holiday.date.toFormat("dd")}
                  </span>
                  <span className="text-neutral-700 truncate">
                    {holiday.title}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-neutral-400 text-center pt-4">
                No specific events listed for this month.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Render the Year Calendar Modal */}
      <YearCalendarModal
        isOpen={isYearModalOpen}
        onClose={() => setIsYearModalOpen(false)}
        year={currentMonth.year}
        holidays={holidaysData}
      />
    </>
  );
}