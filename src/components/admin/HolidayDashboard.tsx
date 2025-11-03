// src/components/admin/HolidayDashboard.tsx
"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { HolidayUploadModal } from "./HolidayUploadModal";
import { Toaster, toast } from "react-hot-toast";

export function HolidayDashboard() {
  const [selectedYear, setSelectedYear] = useState(
    new Date().getFullYear() + 1
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <Toaster position="top-center" reverseOrder={false} />

      <h2 className="text-2xl font-bold font-heading mb-2 text-center">
        Holiday Management
      </h2>
      <p className="mb-8 text-neutral-600 text-center">
        {/* --- CHANGE --- */}
        Upload the official holiday file (.txt) to seed the database.
        {/* --- END CHANGE --- */}
      </p>

      <div className="mb-8 flex items-center gap-2">
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
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="appearance-none rounded-md border border-neutral-300 bg-white py-1.5 pl-3 pr-8 font-semibold text-neutral-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
          <ChevronDown
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
            size={18}
            aria-hidden="true"
          />
        </div>
      </div>

      <button
        onClick={() => setIsModalOpen(true)}
        className="flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-green-600 to-green-700 px-4 py-2 text-sm font-bold text-white tracking-wide shadow-lg transform transition-all duration-300 ease-in-out hover:scale-105 hover:-translate-y-px hover:shadow-xl hover:shadow-green-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 active:scale-95"
      >
        <CalendarDays size={16} />
        <span>{`Upload & Seed ${selectedYear} Holidays`}</span>
      </button>

      <HolidayUploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        year={selectedYear}
        onSeedSuccess={(data) => {
          toast.success(data.message || "Holidays seeded successfully!");
          setIsModalOpen(false);
        }}
      />
    </div>
  );
}
