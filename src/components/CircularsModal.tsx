'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText } from 'lucide-react';
import { circularsByYear } from '@/lib/circulars';

type CircularsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const years = Object.keys(circularsByYear).sort((a, b) => Number(b) - Number(a));
const currentYear = new Date().getFullYear().toString();

export const CircularsModal: React.FC<CircularsModalProps> = ({ isOpen, onClose }) => {
  const [selectedYear, setSelectedYear] = useState(years.includes(currentYear) ? currentYear : years[0]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.9, y: 50 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 15, stiffness: 200 } },
    exit: { opacity: 0, scale: 0.95, y: -50, transition: { duration: 0.2 } },
  };

  const listVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={backdropVariants}
          onClick={onClose}
        >
          <motion.div
            className="bg-white/80 backdrop-blur-xl border border-white/30 rounded-2xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden"
            variants={modalVariants}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <header className="flex items-center justify-between p-4 border-b border-neutral-200/80 flex-shrink-0">
              <h2 className="text-xl font-bold text-neutral-800">Circulars Archive</h2>
              <button
                onClick={onClose}
                className="modal-close-button"
              >
                <X size={24} />
              </button>
            </header>

            {/* Year Selector */}
            <nav className="flex-shrink-0 p-4 border-b border-neutral-200/80">
              <div className="flex space-x-2 overflow-x-auto scrollbar-hide pb-2">
                {years.map((year) => (
                  <button
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`relative px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${selectedYear === year
                        ? 'text-white'
                        : 'text-neutral-600 hover:bg-neutral-200/50'
                      }`}
                  >
                    {year}
                    {selectedYear === year && (
                      <motion.div
                        className="absolute inset-0 bg-primary-600 rounded-full -z-10"
                        layoutId="year-pill"
                      />
                    )}
                  </button>
                ))}
              </div>
            </nav>

            {/* Circulars List */}
            <main className="flex-grow overflow-y-auto p-6">
              <AnimatePresence mode="wait">
                <motion.ul
                  key={selectedYear}
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  className="space-y-3"
                >
                  {(circularsByYear[selectedYear as keyof typeof circularsByYear] || []).map((circular) => (
                    <motion.li key={circular.id} variants={itemVariants}>
                      <a
                        href={circular.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-start gap-4 p-3 rounded-lg hover:bg-primary-100/50 transition-colors"
                      >
                        <FileText className="h-5 w-5 mt-1 text-primary-500 flex-shrink-0" />
                        <div className="flex flex-col">
                          <p className="font-semibold text-neutral-800 group-hover:text-primary-700 transition-colors">{circular.headline}</p>
                        </div>
                      </a>
                    </motion.li>
                  ))}
                </motion.ul>
              </AnimatePresence>
            </main>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

