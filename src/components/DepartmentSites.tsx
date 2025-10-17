'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from "next/image";
import {
  ChevronLeft, ChevronRight, Laptop, Signal, HeartPulse, Landmark, Shield,
  Flame, Wrench, Building, Factory, Settings, School, DraftingCompass,
  CircuitBoard, Users, Gauge, Cable, Tractor, Microscope,
  Languages, Cylinder, Train, Disc3, Waves, Building2, Cog, Presentation,
  GanttChartSquare, UserCog, Eye, Globe, Network, Briefcase, Ship, Server,
  Library, Link as LinkIcon, Award, Construction, HeartHandshake, Leaf,
  Zap, Receipt, Ruler, Package, Lightbulb, ClipboardList, Map
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { Tooltip } from './Tooltip';

const iconMap: { [key: string]: React.ElementType } = {
  Laptop, Signal, HeartPulse, Landmark, Shield, Flame, Wrench, Building,
  Factory, Settings, School, DraftingCompass, CircuitBoard, Users,
  Gauge, Cable, Tractor, Microscope, Languages, Cylinder,
  Train, Disc3, Waves, Building2, Cog, Presentation, GanttChartSquare,
  UserCog, Eye, Globe, Network, Briefcase, Ship, Server, Library, LinkIcon,
  Award, Construction, HeartHandshake, Leaf, Zap, Receipt, Ruler, Package,
  Lightbulb, ClipboardList, Map
};

const iconSizeConfig = {
  large: [
    '/blast-furnace.png',
    '/conveyorbelt.png',
  ],
  small: [
    '/hindi.svg',
    '/train.png',
    '/dumper-icon.png',
  ],
};

const sailSitesData = [
  { name: 'ASP', href: '#', icon: 'Factory' },
  { name: 'BSP CHRD', href: '#', icon: 'Users' },
  { name: 'BSL', href: '#', icon: 'Building' },
  { name: 'CET', href: '#', icon: 'School' },
  { name: 'CMO UCS', href: '#', icon: 'Ship' },
  { name: "CMMG", href: "#", icon: "GanttChartSquare" },
  { name: 'Corporate Office', href: '#', icon: 'Briefcase' },
  { name: 'ISP', href: '#', icon: 'Cog' },
  { name: 'Kolkata Ispat Bhavan', href: '#', icon: 'Landmark' },
  { name: 'MTI', href: '#', icon: 'Library' },
  { name: 'RDCIS', href: '#', icon: 'Microscope' },
  { name: 'RMD', href: '#', icon: 'Tractor' },
  { name: 'RSP', href: '#', icon: 'Settings' },
  { name: 'SDC Hyd', href: '#', icon: 'Server' },
  { name: 'SRM Dgp', href: '#', icon: 'CircuitBoard' },
  { name: 'Utkarsh', href: '#', icon: 'Presentation' },
  { name: 'iConnekt', href: '#', icon: 'Network' },
  { name: 'SSO', href: '#', icon: 'Shield' },
  { name: 'IPSS', href: '#', icon: 'UserCog' },
  { name: 'SAIL SERVICE PORTAL', href: '#', icon: 'Globe' },
  { name: 'INDUSTRY 4.0', href: '#', icon: 'Signal' },
].sort((a, b) => a.name.localeCompare(b.name));

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

// -- ADDED FOR TAB 2 --
// New helper function to create columns for the SAIL Sites tab
const createSailColumns = (items: typeof sailSitesData, itemsPerColumn: number) => {
  const columns = [];
  for (let i = 0; i < items.length; i += itemsPerColumn) {
    columns.push(items.slice(i, i + itemsPerColumn));
  }
  return columns;
};

const DepartmentSites: React.FC<DepartmentSitesProps> = ({ departmentData }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const isXlScreen = useBreakpoint(1800);
  const [activeTab, setActiveTab] = useState('dspSites');

  // -- ADDED FOR TAB 2 --
  // All refs, state, and functions purely for the 'sailSites' tab
  const sailScrollContainerRef = useRef<HTMLDivElement>(null);
  const sailScrollPositionRef = useRef(0);
  const [sailCanScrollLeft, setSailCanScrollLeft] = useState(false);
  const [sailCanScrollRight, setSailCanScrollRight] = useState(false);

  const sailUpdateButtonStates = () => {
    const el = sailScrollContainerRef.current;
    if (el) {
      const isScrollable = el.scrollWidth > el.clientWidth;
      setSailCanScrollLeft(el.scrollLeft > 5);
      setSailCanScrollRight(isScrollable && el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
    }
  };

  const sailHandleOnScroll = () => {
    const el = sailScrollContainerRef.current;
    if (el) {
      sailScrollPositionRef.current = el.scrollLeft;
      sailUpdateButtonStates();
    }
  };

  const sailHandleScrollClick = (direction: 'left' | 'right') => {
    const el = sailScrollContainerRef.current;
    if (el) {
      // Note: This scroll logic is based on Tab 1's card size.
      // We'll adjust it if needed, but it should work fine.
      const cardWidth = 128; // Approx width of a SAIL column
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
  // -- END OF ADDED CODE FOR TAB 2 --

  const updateButtonStates = () => {
    const el = scrollContainerRef.current;
    if (el) {
      const isScrollable = el.scrollWidth > el.clientWidth;
      setCanScrollLeft(el.scrollLeft > 5);
      setCanScrollRight(isScrollable && el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
    }
  };

  const handleOnScroll = () => {
    const el = scrollContainerRef.current;
    if (el) {
      scrollPositionRef.current = el.scrollLeft;
      updateButtonStates();
    }
  };

  const handleScrollClick = (direction: 'left' | 'right') => {
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
    if (activeTab === 'dspSites') {
      const restoreState = () => {
        const container = scrollContainerRef.current;
        if (container) {
          container.scrollLeft = scrollPositionRef.current;
          updateButtonStates();
        }
      };

      const timer = setTimeout(restoreState, 350);

      window.addEventListener('resize', updateButtonStates);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateButtonStates);
      };
    }
  }, [activeTab]);

  // -- ADDED FOR TAB 2 --
  // This effect runs ONLY for the sailSites tab
  useEffect(() => {
    if (activeTab === 'sailSites') {
      const restoreState = () => {
        const container = sailScrollContainerRef.current;
        if (container) {
          container.scrollLeft = sailScrollPositionRef.current;
          sailUpdateButtonStates();
        }
      };

      // Timer to allow layout to settle
      const timer = setTimeout(restoreState, 350);

      window.addEventListener('resize', sailUpdateButtonStates);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', sailUpdateButtonStates);
      };
    }
  }, [activeTab]);

  const departmentColumns = createColumns(departmentData);

  // -- ADDED FOR TAB 2 --
  // Create 3 columns of 7 items each for SAIL Sites (21 total)
  const sailColumns = createSailColumns(sailSitesData, 5);

  const tabContainerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
  };

  const tabItemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <motion.div
      className="bg-white/30 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20 h-[370px] flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <div className="flex-shrink-0">
        <div className="flex border-b border-white/30 mb-4">
          {['dspSites', 'sailSites'].map((tabId) => (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId)}
              className={`relative px-4 py-2 text-sm font-bold transition-colors ${activeTab === tabId ? 'text-primary-700' : 'text-neutral-600 hover:text-primary-700'}`}
            >
              {tabId === 'dspSites' ? 'Department & Utility Sites' : 'SAIL Intranet Sites'}
              {activeTab === tabId && <motion.div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600" layoutId="underline" />}
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex-grow flex items-center min-h-0">
        <AnimatePresence mode="wait">
          {activeTab === 'dspSites' && (
            <motion.div
              key="dspSitesContent"
              className="w-full h-full"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="relative w-full h-full flex items-center">
                {canScrollLeft && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 -ml-4">
                    <Tooltip content="Departments are sorted alphabetically">
                      <button onClick={() => handleScrollClick('left')} className="bg-white/50 hover:bg-white/80 backdrop-blur-sm rounded-full p-2 shadow-md transition-all">
                        <ChevronLeft className="h-6 w-6 text-neutral-700" />
                      </button>
                    </Tooltip>
                  </div>
                )}
                <div
                  ref={scrollContainerRef}
                  onScroll={handleOnScroll}
                  className="flex space-x-4 overflow-x-auto scroll-smooth py-2 px-1 scrollbar-hide"
                >
                  {departmentColumns.map((column, colIndex) => (
                    <div key={colIndex} className="flex flex-col space-y-4">
                      {column.map((dept) => {
                        const isImagePath = typeof dept.icon === 'string' && dept.icon.startsWith('/');
                        const IconComponent = !isImagePath && dept.icon ? iconMap[dept.icon] : null;

                        let iconContainerClass = 'h-14 w-14'; // Default size: 56px
                        if (typeof dept.icon === 'string' && dept.icon.startsWith('/')) {
                          if (iconSizeConfig.large.includes(dept.icon)) {
                            iconContainerClass = 'h-16 w-16'; // Large size: 64px
                          } else if (iconSizeConfig.small.includes(dept.icon)) {
                            iconContainerClass = 'h-10 w-10'; // Small size: 40px
                          }
                        }

                        return (
                          <motion.a
                            key={dept.id}
                            href={dept.href}
                            className="group flex flex-col items-center justify-center p-4 w-32 h-32 border border-transparent rounded-lg text-center text-neutral-700 font-medium transition-colors duration-200 hover:bg-primary-100/50"
                            whileHover={{ scale: 1.05, y: -5, boxShadow: "0px 10px 20px rgba(0,0,0,0.1)" }}
                            transition={{ type: "spring", stiffness: 300 }}
                          >
                            <div className={`relative mb-2 flex items-center justify-center ${iconContainerClass}`}>
                              {isImagePath ? (
                                <>
                                  {/* The B&W image, visible by default */}
                                  <Image
                                    src={dept.icon!}
                                    alt=""
                                    width={64}
                                    height={64}
                                    className="h-full w-full object-contain transition-opacity duration-300 group-hover:opacity-0"
                                    aria-hidden="true"
                                  />
                                  {/* The blue version, hidden by default, visible on hover */}
                                  <div
                                    className="absolute inset-0 h-full w-full bg-primary-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                                    style={{
                                      maskImage: `url(${dept.icon})`,
                                      maskSize: 'contain',
                                      maskPosition: 'center',
                                      maskRepeat: 'no-repeat',
                                      WebkitMaskImage: `url(${dept.icon})`,
                                      WebkitMaskSize: 'contain',
                                      WebkitMaskPosition: 'center',
                                      WebkitMaskRepeat: 'no-repeat',
                                    }}
                                    aria-hidden="true"
                                  />
                                </>
                              ) : IconComponent ? (
                                <IconComponent className="w-8 h-8 text-neutral-700 group-hover:text-primary-600 transition-colors" />
                              ) : (
                                <Building2 className="w-8 h-8 text-neutral-400" />
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
                      <button onClick={() => handleScrollClick('right')} className="bg-white/50 hover:bg-white/80 backdrop-blur-sm rounded-full p-2 shadow-md transition-all">
                        <ChevronRight className="h-6 w-6 text-neutral-700" />
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {activeTab === 'sailSites' && (
            <motion.div
              key="sailSitesContent"
              className="w-full h-full" // Removed overflow-y-auto
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={tabContainerVariants} // Preserved original animation
              transition={{ duration: 0.3 }}
            >
              {/* -- This structure is copied from Tab 1 but uses TAB 2 logic -- */}
              <div className="relative w-full h-full flex items-center">
                {sailCanScrollLeft && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 -ml-4">
                    <button onClick={() => sailHandleScrollClick('left')} className="bg-white/50 hover:bg-white/80 backdrop-blur-sm rounded-full p-2 shadow-md transition-all">
                      <ChevronLeft className="h-6 w-6 text-neutral-700" />
                    </button>
                  </div>
                )}

                <div
                  ref={sailScrollContainerRef} // Using TAB 2 ref
                  onScroll={sailHandleOnScroll} // Using TAB 2 handler
                  className="flex space-x-4 overflow-x-auto scroll-smooth py-2 px-1 scrollbar-hide"
                >
                  {/* Loop over the new 'sailColumns' */}
                  {sailColumns.map((column, colIndex) => (
                    <div key={colIndex} className="flex flex-col space-y-2" style={{ width: '200px' }}> {/* Fixed width column */}
                      {column.map((site) => {
                        const IconComponent = iconMap[site.icon] || LinkIcon;
                        return (
                          <motion.a
                            key={site.name}
                            href={site.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            variants={tabItemVariants} // Preserved original item animation
                            className="flex items-center space-x-3 p-2 rounded-md transition-colors duration-200 hover:bg-primary-100/50 text-neutral-700"
                          >
                            <IconComponent className="h-5 w-5 text-primary-600 flex-shrink-0" />
                            <span className="text-sm font-medium whitespace-nowrap">{site.name}</span>
                          </motion.a>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {sailCanScrollRight && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 -mr-4">
                    <button onClick={() => sailHandleScrollClick('right')} className="bg-white/50 hover:bg-white/80 backdrop-blur-sm rounded-full p-2 shadow-md transition-all">
                      <ChevronRight className="h-6 w-6 text-neutral-700" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default DepartmentSites;