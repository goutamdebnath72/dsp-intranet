'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ExternalLink, ChevronDown } from 'lucide-react';
import { circularsByYear } from '@/lib/circulars';
import { DateTime } from 'luxon';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

// --- CONFIGURATION MARKER ---
// Change this value to 5 for the production requirement of 5 recent year pills.
const NUM_RECENT_YEARS = 2;

export function CircularsModal({ isOpen, onClose }: Props) {
  const years = useMemo(() => Object.keys(circularsByYear).sort((a, b) => Number(b) - Number(a)), []);
  const [selectedYear, setSelectedYear] = useState(years[0] || new Date().getFullYear().toString());
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

  // Split years into "recent" and "archive"
  const recentYears = years.slice(0, NUM_RECENT_YEARS);
  const archiveYears = years.slice(NUM_RECENT_YEARS);
  const isArchiveSelected = archiveYears.includes(selectedYear);

  // FIX: Assert the type of selectedYear to be a key of circularsByYear
  const circulars = circularsByYear[selectedYear as keyof typeof circularsByYear] || [];

  const archiveButtonRef = useRef<HTMLDivElement>(null);

  // Effect to close the dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (archiveButtonRef.current && !archiveButtonRef.current.contains(event.target as Node)) {
        setIsArchiveOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [archiveButtonRef]);

  if (!isOpen) {
    return null;
  }

  const handleYearSelect = (year: string) => {
    setSelectedYear(year);
    setIsArchiveOpen(false);
  }

  const listVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { staggerChildren: 0.03, delayChildren: 0.1 },
    },
    exit: {
      opacity: 0,
      y: -20,
      transition: { duration: 0.2 }
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="bg-white/80 backdrop-blur-xl border border-white/30 rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="modal-close-button">
          <X size={28} />
        </button>

        <header className="p-6 border-b border-neutral-200/80 flex-shrink-0">
          <h2 className="text-2xl font-bold text-neutral-800">Circulars Archive</h2>
          <p className="text-neutral-500 mt-1">Browse circulars by year</p>
        </header>

        <nav className="p-4 border-b border-neutral-200/80 flex-shrink-0">
          <div className="flex items-center space-x-2">
            {/* Recent Year Pills */}
            {recentYears.map((year) => (
              <button
                key={year}
                onClick={() => handleYearSelect(year)}
                className={`relative px-4 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 ${selectedYear === year
                    ? 'text-white'
                    : 'text-neutral-600 hover:bg-neutral-200/60'
                  }`}
              >
                {selectedYear === year && (
                  <motion.div
                    layoutId="year-pill"
                    className="absolute inset-0 bg-primary-600 rounded-md"
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  />
                )}
                <span className="relative">{year}</span>
              </button>
            ))}

            {/* Archive Dropdown Button */}
            {archiveYears.length > 0 && (
              <div className="relative" ref={archiveButtonRef}>
                <button
                  onClick={() => setIsArchiveOpen(!isArchiveOpen)}
                  className={`relative flex items-center space-x-1 px-4 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 ${isArchiveSelected
                      ? 'text-white'
                      : 'text-neutral-600 hover:bg-neutral-200/60'
                    }`}
                >
                  {isArchiveSelected && (
                    <motion.div
                      layoutId="year-pill"
                      className="absolute inset-0 bg-primary-600 rounded-md"
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    />
                  )}
                  <span className="relative">{isArchiveSelected ? selectedYear : 'Older...'}</span>
                  <ChevronDown size={16} className={`relative transition-transform duration-200 ${isArchiveOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {isArchiveOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full mt-2 w-32 bg-white/80 backdrop-blur-lg rounded-md shadow-lg border border-white/30 z-10 overflow-hidden"
                    >
                      <ul className="py-1">
                        {archiveYears.map((year) => (
                          <li key={year}>
                            <button
                              onClick={() => handleYearSelect(year)}
                              className="w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-primary-100/50"
                            >
                              {year}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </nav>

        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-neutral-400/50 scrollbar-track-transparent">
          <AnimatePresence mode="wait">
            <motion.ul
              key={selectedYear}
              variants={listVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-3"
            >
              {circulars.map((circular) => (
                <motion.li key={circular.id} variants={itemVariants}>
                  <a
                    href={circular.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 bg-white/50 rounded-lg border border-transparent hover:border-primary-300 hover:bg-white transition-all group"
                  >
                    <div className="flex justify-between items-start">
                      {/* FIX: Use "headline" property from data */}
                      <p className="font-semibold text-neutral-800 group-hover:text-primary-700 transition-colors">
                        {circular.headline}
                      </p>
                      <ExternalLink className="h-4 w-4 text-neutral-400 group-hover:text-primary-600 transition-all ml-4 flex-shrink-0 transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                    </div>
                    {/* FIX: Use Luxon to parse and format the date */}
                    <p className="text-sm text-neutral-500 mt-1">
                      {DateTime.fromISO(circular.date).toFormat('LLL dd, yyyy')}
                    </p>
                  </a>
                </motion.li>
              ))}
            </motion.ul>
          </AnimatePresence>
        </main>
      </motion.div>
    </div>
  );
}