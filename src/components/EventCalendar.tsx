// src/components/EventCalendar.tsx
"use client";

import React, { useState, useMemo } from "react";
// --- 1. Import Day and DayProps ---
import { DayPicker, Day, DayProps } from "react-day-picker";
import type { CaptionLabelProps as BaseCaptionLabelProps } from "react-day-picker";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { YearCalendarModal } from "./YearCalendarModal";
import { Tooltip } from "./Tooltip"; // --- 2. Import Tooltip ---

// Define a local fixed type with displayMonth restored
interface FixedCaptionLabelProps extends BaseCaptionLabelProps {
  displayMonth: Date;
}

// type: "Closed" = Public Holiday (Red)
// type: "Festival" = Festival Holiday (Blue)
// type: "Restricted" = Restricted Holiday (Gray)
const holidaysData = [
  // --- Closed/Public Holidays (for All) ---
  { date: DateTime.local(2025, 1, 24), title: "SAIL Foundation Day", type: "Closed" },
  { date: DateTime.local(2025, 1, 26), title: "Republic Day", type: "Closed" },
  { date: DateTime.local(2025, 5, 1), title: "May Day", type: "Closed" },
  { date: DateTime.local(2025, 8, 15), title: "Independence Day", type: "Closed" },
  { date: DateTime.local(2025, 10, 2), title: "Mahatma Gandhi's Birthday", type: "Closed" },

  // --- Festival Holidays (Cat A & B) ---
  { date: DateTime.local(2025, 2, 26), title: "Maha Shivaratri", type: "Festival" },
  { date: DateTime.local(2025, 3, 14), title: "Doljatra / Holi", type: "Festival" },
  { date: DateTime.local(2025, 3, 31), title: "Id-ul-Fitr", type: "Festival" },
  { date: DateTime.local(2025, 4, 18), title: "Good Friday", type: "Festival" },
  { date: DateTime.local(2025, 5, 12), title: "Buddha Purnima", type: "Festival" },
  { date: DateTime.local(2025, 6, 7), title: "Id-Ud-Zoha (Bakrid)", type: "Festival" },
  { date: DateTime.local(2025, 8, 16), title: "Janmasthami", type: "Festival" },
  { date: DateTime.local(2025, 9, 30), title: "Durgapuja - Maha Ashtami", type: "Festival" },
  { date: DateTime.local(2025, 10, 1), title: "Durgapuja - Maha Navami", type: "Festival" },
  { date: DateTime.local(2025, 10, 6), title: "Lakshmi Puja", type: "Festival" },
  { date: DateTime.local(2025, 10, 20), title: "Diwali (Deepavali) / Kali Puja", type: "Festival" },
  { date: DateTime.local(2025, 11, 5), title: "Birth Day of Guru Nanak", type: "Festival" },
  { date: DateTime.local(2025, 12, 25), title: "Christmas Day", type: "Festival" },
  // Additional Festival Holiday for Cat B
  { date: DateTime.local(2025, 10, 23), title: "Bhatridwitiya (Addl. FH for Cat B)", type: "Festival" },

  // --- Restricted Holidays (RH) List ---
  { date: DateTime.local(2025, 1, 1), title: "New Year's Day", type: "Restricted" },
  { date: DateTime.local(2025, 1, 6), title: "Guru Govind Singh's Birthday", type: "Restricted" },
  { date: DateTime.local(2025, 1, 14), title: "Makar Sankranti / Magha Bihu / Pongol", type: "Restricted" },
  { date: DateTime.local(2025, 1, 23), title: "Netaji's Birth Day", type: "Restricted" },
  { date: DateTime.local(2025, 2, 2), title: "Basanta Panchami / Sri Panchami", type: "Restricted" },
  { date: DateTime.local(2025, 3, 28), title: "Jamat- UI-Vida", type: "Restricted" },
  { date: DateTime.local(2025, 4, 6), title: "Ram Navami", type: "Restricted" },
  { date: DateTime.local(2025, 4, 10), title: "Mahavir Jayanti", type: "Restricted" },
  { date: DateTime.local(2025, 4, 15), title: "Bengali New Year's day", type: "Restricted" },
  { date: DateTime.local(2025, 5, 9), title: "Birthday of Rabindranath Tagore", type: "Restricted" },
  { date: DateTime.local(2025, 6, 27), title: "Rath Yatra", type: "Restricted" },
  { date: DateTime.local(2025, 7, 6), title: "Muharram", type: "Restricted" },
  { date: DateTime.local(2025, 8, 9), title: "Raksha Bandhan", type: "Restricted" },
  { date: DateTime.local(2025, 9, 5), title: "Milad-Un-Nabi / Id-E-Milad", type: "Restricted" },
  { date: DateTime.local(2025, 9, 21), title: "Mahalaya", type: "Restricted" },
  { date: DateTime.local(2025, 9, 29), title: "Durgapuja - Maha Saptami", type: "Restricted" },
  { date: DateTime.local(2025, 10, 27), title: "Chhat Puja", type: "Restricted" },
  { date: DateTime.local(2025, 11, 24), title: "Guru Teg Bahadur's Martyrdom Day", type: "Restricted" },
  { date: DateTime.local(2025, 12, 24), title: "Christmas Eve", type: "Restricted" },
].map((h) => ({ ...h, dateObj: h.date.toJSDate() }));

const holidayColorMap: { [key: string]: { dot: string; text: string } } = {
  Closed: { dot: "holiday-dot-closed", text: "text-red-600" },
  Festival: { dot: "holiday-dot-festival", text: "text-blue-600" },
  Restricted: { dot: "holiday-dot-restricted", text: "text-amber-600" },
};

// --- 3. Add map for tooltip content ---
const holidayTypeMap: { [key: string]: string } = {
  Closed: "CH",
  Festival: "FH",
  Restricted: "RH",
};

// --- Component ---
export function EventCalendar() {
  const [currentMonth, setCurrentMonth] = useState<DateTime>(DateTime.local());
  const [isYearModalOpen, setIsYearModalOpen] = useState(false);

  const selectedMonthHolidays = useMemo(() => {
    return holidaysData
      .filter((h) => h.date.hasSame(currentMonth, "month"))
      .sort((a, b) => a.date.day - b.date.day);
  }, [currentMonth]);

  const modifiers = {
    isClosed: holidaysData
      .filter((h) => h.type === "Closed")
      .map((h) => h.dateObj),
    isFestival: holidaysData
      .filter((h) => h.type === "Festival")
      .map((h) => h.dateObj),
    isRestricted: holidaysData
      .filter((h) => h.type === "Restricted")
      .map((h) => h.dateObj),
    today: new Date(),
  };

  const modifiersClassNames = {
    isClosed: "relative holiday-dot-closed",
    isFestival: "relative holiday-dot-festival",
    isRestricted: "relative holiday-dot-restricted",
    today: "bg-primary-500 text-white rounded-full font-bold",
  };

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

  const classNames: React.ComponentProps<typeof DayPicker>["classNames"] = {
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
    .rdp-day_today.holiday-dot-closed,
    .rdp-day_today.holiday-dot-festival,
    .rdp-day_today.holiday-dot-restricted {
      color: white !important;
      position: relative;
    }
    .holiday-dot-closed:not(.rdp-day_outside)::after {
      content: ''; position: absolute; bottom: 4px; left: 50%;
      transform: translateX(-50%); width: 5px; height: 5px;
      border-radius: 50%; background-color: #ef4444; /* Red */
    }
    .holiday-dot-festival:not(.rdp-day_outside)::after {
      content: ''; position: absolute; bottom: 4px; left: 50%;
      transform: translateX(-50%); width: 5px; height: 5px;
      border-radius: 50%; background-color: #3b82f6; /* Blue */
    }
    .holiday-dot-restricted:not(.rdp-day_outside)::after {
      content: ''; position: absolute; bottom: 4px; left: 50%;
      transform: translateX(-50%); width: 5px; height: 5px;
      border-radius: 50%; background-color: #f59e0b; /* Gray */
    }
    
    /* White dot for today */
    .rdp-day_today.holiday-dot-closed::after,
    .rdp-day_today.holiday-dot-festival::after,
    .rdp-day_today.holiday-dot-restricted::after {
      background-color: white;
    }
  `;

  // --- 4. Custom Day Component with Tooltip ---
  function CustomDay(props: DayProps & { modifiers?: { outside?: boolean } }) {
    // Find the holiday for this specific day
    const holiday = holidaysData.find(
      (h) => h.date.toJSDate().toDateString() === props.date.toDateString()
    );

    // Don't show tooltips for days outside the current month
    if (holiday && !props.modifiers?.outside) {
      const shortType = holidayTypeMap[holiday.type] || "??";
      return (
        <Tooltip content={shortType}>
          <Day {...props} />
        </Tooltip>
      );
    }

    // Render a normal day
    return <Day {...props} />;
  }

  // --- 5. Components object to pass to DayPicker ---
  const components: any = {
    CaptionLabel: CustomCaptionLabel,
    IconLeft: () => <ChevronLeft className="h-5 w-5" />,
    IconRight: () => <ChevronRight className="h-5 w-5" />,
    Day: CustomDay, // <-- Add this line
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
          components={components} // <-- Pass the components prop
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
                  <span
                    className={`font-semibold w-8 text-center flex-shrink-0 ${holidayColorMap[holiday.type]?.text || "text-neutral-500"
                      }`}
                  >
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