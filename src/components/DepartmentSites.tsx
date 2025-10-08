// src/components/DepartmentSites.tsx
"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  Laptop, Signal, HeartPulse, Landmark, Shield, Flame, Wrench, Building,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";

const iconMap: { [key: string]: React.ElementType } = {
  Laptop, Signal, HeartPulse, Landmark, Shield, Flame, Wrench, Building,
};

type DepartmentSitesProps = {
  departmentData: {
    id: number; href: string; name: string; icon: string | null;
  }[];
};

// Helper function to create pairs of departments
const createColumns = (items: DepartmentSitesProps['departmentData']) => {
  const columns = [];
  for (let i = 0; i < items.length; i += 2) {
    columns.push(items.slice(i, i + 2));
  }
  return columns;
};

const DepartmentSites: React.FC<DepartmentSitesProps> = ({ departmentData }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollability = () => {
    const el = scrollContainerRef.current;
    if (el) {
      const isScrollable = el.scrollWidth > el.clientWidth + 2;
      if (!isScrollable) {
        setCanScrollLeft(false);
        setCanScrollRight(false);
        return;
      }
      setCanScrollLeft(el.scrollLeft > 0);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    }
  };
  
  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (el) {
      // Scroll by the width of a column plus its gap
      const scrollAmount = direction === 'left' ? -128 : 128;
      el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => checkScrollability(), 100);
    window.addEventListener('resize', checkScrollability);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkScrollability);
    };
  }, [departmentData]);

  const departmentColumns = createColumns(departmentData);

  return (
    <motion.div
      className="bg-white/30 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <h2 className="text-xl font-bold font-heading text-neutral-800 mb-4">
        Department & Utility Sites
      </h2>

      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => handleScroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/50 hover:bg-white/80 backdrop-blur-sm rounded-full p-2 shadow-md transition-all duration-300 -ml-3"
          >
            <ChevronLeft className="h-6 w-6 text-neutral-700" />
          </button>
        )}

        <div
          ref={scrollContainerRef}
          onScroll={checkScrollability}
          // The container is now a simple flex row
          className="flex space-x-4 overflow-x-auto scroll-smooth py-2 px-1 scrollbar-hide"
        >
          {/* We map over the columns, not the individual items */}
          {departmentColumns.map((column, colIndex) => (
            // Each column is a vertical flex container
            <div key={colIndex} className="flex flex-col space-y-4">
              {column.map((dept) => {
                const IconComponent = dept.icon ? iconMap[dept.icon] : null;
                return (
                  <motion.a
                    key={dept.id}
                    href={dept.href}
                    className="flex flex-col items-center justify-center p-4 w-28 h-28 border border-transparent rounded-lg text-center text-neutral-700 font-medium transition-colors duration-200 hover:bg-primary-100/50"
                    whileHover={{ scale: 1.05, y: -5, boxShadow: "0px 10px 20px rgba(0,0,0,0.1)" }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    {IconComponent && <IconComponent className="h-8 w-8 mb-2" />}
                    <span className="text-sm">{dept.name}</span>
                  </motion.a>
                );
              })}
            </div>
          ))}
        </div>

        {canScrollRight && (
          <button
            onClick={() => handleScroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/50 hover:bg-white/80 backdrop-blur-sm rounded-full p-2 shadow-md transition-all duration-300 -mr-3"
          >
            <ChevronRight className="h-6 w-6 text-neutral-700" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default DepartmentSites;