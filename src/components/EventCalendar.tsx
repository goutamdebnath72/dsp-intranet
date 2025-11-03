// src/components/EventCalendar.tsx
"use client";

import React, { useState, useMemo } from "react";
import { DayPicker, Day, DayProps } from "react-day-picker";
import type { CaptionLabelProps as BaseCaptionLabelProps } from "react-day-picker";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { YearCalendarModal } from "./YearCalendarModal";
import { Tooltip } from "./Tooltip";
import type { FetchedHoliday } from "./PeopleAndEvents";

// Define a local fixed type with displayMonth restored
interface FixedCaptionLabelProps extends BaseCaptionLabelProps {
  displayMonth: Date;
}

interface EventCalendarProps {
  holidays: FetchedHoliday[];
  isLoading: boolean;
}

// This hook correctly parses API strings into the types we need
function useFormattedHolidays(holidays: FetchedHoliday[]) {
  return useMemo(() => {
    // Cast 'h' to 'any' to handle the 'name' prop from the API
    return holidays.map((h: any) => {
      // h.date is a UTC string like "2025-01-24T00:00:00.000Z"
      const dateString = h.date.split("T")[0];

      // Create a new DateTime object from *only* the date part.
      // This forces it to be at midnight in the user's LOCAL timezone.
      const dt = DateTime.fromISO(dateString);

      return {
        // --- FIX: Map API data to component props ---
        title: h.name, // Map API's 'name' to 'title'
        type: h.type, // Pass through the type (CH, FH, RH)
        // --- END FIX ---
        date: dt, // The local DateTime object
        dateObj: dt.toJSDate(), // The JS Date object (for react-day-picker)
      };
    });
  }, [holidays]);
}

// --- FIX: Updated Color Map to use API types (CH, FH, RH) ---
const holidayColorMap: { [key: string]: { dot: string; text: string } } = {
  CH: { dot: "holiday-dot-closed", text: "text-red-600" }, // Was "Closed"
  FH: { dot: "holiday-dot-festival", text: "text-blue-600" }, // Was "Festival"
  RH: { dot: "holiday-dot-restricted", text: "text-purple-600" }, // Was "Restricted"
};

export function EventCalendar({ holidays, isLoading }: EventCalendarProps) {
  // State is kept as a Luxon object
  const [currentMonth, setCurrentMonth] = useState<DateTime>(DateTime.local());
  const [isYearModalOpen, setIsYearModalOpen] = useState(false);
  const formattedHolidays = useFormattedHolidays(holidays);

  const selectedMonthHolidays = useMemo(() => {
    return formattedHolidays
      .filter((h) => h.date.hasSame(currentMonth, "month"))
      .sort((a, b) => a.date.day - b.date.day);
  }, [currentMonth, formattedHolidays]);

  const modifiers = {
    // --- FIX: Use API types (CH, FH, RH) ---
    isClosed: formattedHolidays
      .filter((h) => h.type === "CH") // Was "Closed"
      .map((h) => h.dateObj),
    isFestival: formattedHolidays
      .filter((h) => h.type === "FH") // Was "Festival"
      .map((h) => h.dateObj),
    isRestricted: formattedHolidays
      .filter((h) => h.type === "RH") // Was "Restricted"
      .map((h) => h.dateObj),
    // --- END FIX ---
    
    today: DateTime.local().toJSDate(),
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
    // Convert picker's JS Date back to Luxon for formatting
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
      border-radius: 50%; 
      background-color: #9333ea; /* Purple */
    }
    
    /* White dot for today */
    .rdp-day_today.holiday-dot-closed::after,
    .rdp-day_today.holiday-dot-festival::after,
    .rdp-day_today.holiday-dot-restricted::after {
      background-color: white;
    }
  `;

  // --- FIX: Use holiday.type directly for Tooltip ---
  function CustomDay(props: DayProps & { modifiers?: { outside?: boolean } }) {
    // Convert picker's JS Date prop back to Luxon
    const dayAsLuxon = DateTime.fromJSDate(props.date);
    // Find the holiday by comparing Luxon objects
    const holiday = formattedHolidays.find((h) =>
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

  const components: any = {
    CaptionLabel: CustomCaptionLabel,
    IconLeft: () => <ChevronLeft className="h-5 w-5" />,
    IconRight: () => <ChevronRight className="h-5 w-5" />,
    Day: CustomDay,
  };
  
  return (
    <>
      <div className="flex flex-col h-full">
        <style>{holidayDotStyle}</style>

        <DayPicker
          showOutsideDays
          fixedWeeks
          mode="single"
          // Convert Luxon state to JS Date at the boundary
          month={currentMonth.toJSDate()}
          // Convert picker's JS Date back to Luxon state at the boundary
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
                  <span
                    className={`font-semibold w-8 text-center flex-shrink-0 ${
                      holidayColorMap[holiday.type]?.text || // <-- This now works (e.g., holidayColorMap["CH"])
                      "text-neutral-500"
                    }`}
                  >
                    {holiday.date.toFormat("dd")}
                  </span>
                  <span className="text-neutral-700 truncate">
                    {holiday.title} {/* <-- This now works (reads from h.name) */}
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
        year={currentMonth.year} // Pass the primitive number
        holidays={formattedHolidays} // Pass the fully formatted data
      />
    </>
  );
}