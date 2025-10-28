// src/components/RetirementScrollList.tsx
"use client";

import React, { useRef, useEffect, useState } from "react";
import { SCROLL_CONFIG, DIRECTION } from "@/lib/SCROLL_CONFIG";
import { DateTime } from "luxon";

// --- Mock Retirement Data with Designation ---
export const mockRetirements = [
  {
    id: 1,
    name: "Matthias Schmidt",
    designation: "Executive Director",
    department: "Quality Control",
    retirementDate: "2025-10-31",
    imageUrl: "/Matthias_Schmidt.jpeg",
  },
  {
    id: 2,
    name: "Antoine Leclerc",
    designation: "Dy. General Manager",
    department: "Logistics",
    retirementDate: "2025-10-31",
    imageUrl: "/Antoine_Leclerc.jpeg",
  },
  {
    id: 3,
    name: "Ingrid Bergman",
    designation: "Director(M-HS)",
    department: "Safety & Health",
    retirementDate: "2025-10-31",
    imageUrl: "/Ingrid_Bergman.jpeg",
  },
  {
    id: 4,
    name: "Natalia Petrova",
    designation: "Manager",
    department: "Security",
    retirementDate: "2025-10-31",
    imageUrl: "/Natalia_Petrova.jpeg",
  },
  {
    id: 5,
    name: "Sofia Karlsson",
    designation: "Asst. General Manager",
    department: "Public Relations",
    retirementDate: "2025-10-31",
    imageUrl: "/Sofia_Karlsson.jpeg",
  },
];

export function RetirementScrollList() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isHoveringRef = useRef(false);
  const listHeightRef = useRef(0);

  const direction = DIRECTION.DOWN;
  const speedPxPerSec = SCROLL_CONFIG.speedPxPerSec;
  const gapHeight = SCROLL_CONFIG.gapHeight;
  // === Effect to measure height on resize (robust method) ===
  useEffect(() => {
    const onResize = () => {
      setTimeout(() => {
        const listEl = listRef.current;
        if (listEl) {
          listHeightRef.current = listEl.scrollHeight / 2;
        }
      }, 50);
    };
    let resizeTimeout: NodeJS.Timeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(onResize, 100);
    };

    window.addEventListener("resize", debouncedResize);
    onResize(); // Initial measure
    return () => window.removeEventListener("resize", debouncedResize);
  }, []);
  // === Auto-scroll logic (robust method) ===
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    // Initial height measure
    setTimeout(() => {
      const listEl = listRef.current;
      if (listEl) {
        listHeightRef.current = listEl.scrollHeight / 2;
      }
      // For DOWN, start at the bottom of the first set
      scrollEl.scrollTop = 0;
    }, 50);

    let rafId: number | null = null;
    let lastTs = performance.now();
    let accumulatedScroll = 0; // Start at 0, logic will handle jump

    const tick = (ts: number) => {
      if (!scrollEl || !listRef.current) return;

      const dt = Math.min(40, ts - lastTs);
      lastTs = ts;

      if (!isHoveringRef.current) {
        const h = listHeightRef.current;
        if (h > 0 && scrollEl.scrollHeight > scrollEl.clientHeight) {
          accumulatedScroll += (speedPxPerSec * dt * direction) / 1000;

          // Loop logic for DOWN (from AnnouncementsFeed)
          if (accumulatedScroll <= 0 && direction === DIRECTION.DOWN) {
            accumulatedScroll += h;
          }

          scrollEl.scrollTop = accumulatedScroll;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    const startup = setTimeout(() => {
      lastTs = performance.now();
      rafId = requestAnimationFrame(tick);
    }, 700);
    return () => {
      clearTimeout(startup);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [direction, speedPxPerSec]);

  const duplicatedRetirements = [...mockRetirements, ...mockRetirements];

  return (
    <div
      ref={scrollContainerRef}
      onMouseEnter={() => (isHoveringRef.current = true)}
      onMouseLeave={() => (isHoveringRef.current = false)}
      // --- ✅ CHANGED THIS LINE ---
      className="h-full overflow-y-auto px-2 pt-3 scrollbar-thin scrollbar-thumb-neutral-300 hover:scrollbar-thumb-neutral-400"
      style={{
        // height: "280px", // ❌ REMOVED
        overflowAnchor: "none",
      }}
    >
      <div ref={listRef} className="flex flex-col">
        {duplicatedRetirements.map((person, index) => (
          <React.Fragment key={`${person.id}-${index}`}>
            <div
              className="flex items-center gap-3 p-2 bg-white rounded-md border border-neutral-200/80 shadow-sm"
            // ✅ No margin needed, spacer div handles it
            >
              <img
                src={person.imageUrl}
                alt={person.name}
                style={{
                  width: "64px",
                  height: "80px",
                  objectFit: "cover",
                  borderRadius: "0.125rem",
                }}
                className="flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-800 truncate">
                  {person.name}
                </p>
                <p className="text-xs text-neutral-600 truncate">
                  {person.designation}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  {person.department}
                </p>
                <p className="text-xs text-red-500 font-medium">
                  Retiring:{" "}
                  {DateTime.fromISO(person.retirementDate).toFormat(
                    "LLL dd, yyyy"
                  )}
                </p>
              </div>
            </div>
            {/* ✅ Spacer div for seamless scrolling */}
            <div style={{ height: `${gapHeight}px` }} aria-hidden="true" />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}