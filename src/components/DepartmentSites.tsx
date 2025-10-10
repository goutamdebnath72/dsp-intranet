'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from "next/image";
import {
  ChevronLeft, ChevronRight, Laptop, Signal, HeartPulse, Landmark, Shield,
  Flame, Wrench, Building, Factory, Settings, School, DraftingCompass,
  CircuitBoard, Users, Gauge, Cable, Tractor, Microscope,
  Languages, Cylinder, Train, Disc3, Waves, Building2, Cog, Presentation, GanttChartSquare, UserCog, Eye
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { Tooltip } from './Tooltip';

const iconMap: { [key: string]: React.ElementType } = {
  Laptop, Signal, HeartPulse, Landmark, Shield, Flame, Wrench, Building,
  Factory, Settings, School, DraftingCompass, CircuitBoard, Users,
  Gauge, Cable, Tractor, Microscope, Languages, Cylinder,
  Train, Disc3, Waves, Building2, Cog, Presentation, GanttChartSquare, UserCog, Eye
};

type DepartmentSitesProps = {
  departmentData: {
    id: number;
    href: string;
    name: string;
    icon: string | null;
  }[];
};

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
  const isXlScreen = useBreakpoint(1800);

  const checkScrollability = () => {
    const el = scrollContainerRef.current;
    if (el) {
      const isScrollable = el.scrollWidth > el.clientWidth;
      setCanScrollLeft(el.scrollLeft > 5);
      setCanScrollRight(isScrollable && el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
    }
  };

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (el) {
      const cardWidth = 128;
      const gapWidth = 16;
      const columnWidth = cardWidth + gapWidth;

      const columnsToScroll = isXlScreen ? 5 : 4;
      const scrollAmount = columnWidth * columnsToScroll;

      if (direction === 'right') {
        const newScrollLeft = el.scrollLeft + scrollAmount;
        const maxScrollLeft = el.scrollWidth - el.clientWidth;
        el.scrollTo({ left: Math.min(newScrollLeft, maxScrollLeft), behavior: 'smooth' });
      } else {
        const newScrollLeft = el.scrollLeft - scrollAmount;
        el.scrollTo({ left: Math.max(0, newScrollLeft), behavior: 'smooth' });
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => checkScrollability(), 100);
    window.addEventListener('resize', checkScrollability);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkScrollability);
    };
  }, [departmentData, isXlScreen]);

  const departmentColumns = createColumns(departmentData);

  const largeIcons = [
    '/blast-furnace.webp',
    '/cem.png',
    '/conveyorbelt.webp',
    '/joist-icon.jpg',
    '/wheel-axle-icon.jpg',
    '/hindi.svg',
    '/wagon-icon.jpg',
    '/tmt-bar.webp'
  ];

  return (
    <motion.div
      className="bg-white/30 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20 h-[40vh] flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <h2 className="text-xl font-bold font-heading text-neutral-800 mb-4 flex-shrink-0">
        Department & Utility Sites
      </h2>

      <div className="relative flex-grow flex items-center min-h-0">
        {canScrollLeft && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 -ml-4">
            <Tooltip content="Departments are sorted alphabetically">
              <button
                onClick={() => handleScroll('left')}
                className="bg-white/50 hover:bg-white/80 backdrop-blur-sm rounded-full p-2 shadow-md transition-all"
              >
                <ChevronLeft className="h-6 w-6 text-neutral-700" />
              </button>
            </Tooltip>
          </div>
        )}

        <div
          ref={scrollContainerRef}
          onScroll={checkScrollability}
          className="flex space-x-4 overflow-x-auto scroll-smooth py-2 px-1 scrollbar-hide"
        >
          {departmentColumns.map((column, colIndex) => (
            <div key={colIndex} className="flex flex-col space-y-4">
              {column.map((dept) => {
                const isImagePath = typeof dept.icon === 'string' && dept.icon.startsWith('/');
                const IconComponent = !isImagePath && dept.icon ? iconMap[dept.icon] : null;

                const isLargeIcon = largeIcons.includes(dept.icon || '');
                const size = isLargeIcon ? 64 : 32;

                return (
                  <motion.a
                    key={dept.id}
                    href={dept.href}
                    className="flex flex-col items-center justify-center p-4 w-32 h-32 border border-transparent rounded-lg text-center text-neutral-700 font-medium transition-colors duration-200 hover:bg-primary-100/50"
                    whileHover={{ scale: 1.05, y: -5, boxShadow: "0px 10px 20px rgba(0,0,0,0.1)" }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <div className="h-16 w-16 mb-2 flex items-center justify-center">
                      {isImagePath ? (
                        <Image
                          src={dept.icon!}
                          alt={dept.name}
                          width={size}
                          height={size}
                          className={`object-contain ${dept.icon === '/wheel-axle-icon.jpg' ? 'grayscale' : ''}`}
                        />
                      ) : IconComponent ? (
                        <IconComponent size={32} />
                      ) : (
                        <Building2 size={32} className="text-neutral-400" />
                      )}
                    </div>
                    <span className="text-sm text-wrap">{dept.name}</span>
                  </motion.a>
                );
              })}
            </div>
          ))}
        </div>

        {canScrollRight && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 -mr-4">
            <Tooltip content="Departments are sorted alphabetically">
              <button
                onClick={() => handleScroll('right')}
                className="bg-white/50 hover:bg-white/80 backdrop-blur-sm rounded-full p-2 shadow-md transition-all"
              >
                <ChevronRight className="h-6 w-6 text-neutral-700" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default DepartmentSites;