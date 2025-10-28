// src/components/BirthdayScrollList.tsx
"use client";

import React, { useRef, useEffect, useState } from "react";
import { SCROLL_CONFIG, DIRECTION } from "@/lib/SCROLL_CONFIG";
// --- Mock Birthday Data with Designations ---
export const mockBirthdays = [
  {
    id: 1,
    name: "Eleanor Vance",
    designation: "Chief General Manager",
    department: "R&D Lab",
    imageUrl: "/Eleanor_Vance.jpeg",
  },
  {
    id: 2,
    name: "Sophia Clarke",
    designation: "General Manager",
    department: "HR",
    imageUrl: "/Sophia_Clarke.jpeg",
  },
  {
    id: 3,
    name: "Olivia Reed",
    designation: "Dy. General Manager",
    department: "Finance & A/C",
    imageUrl: "/Olivia_Reed.jpeg",
  },
  {
    id: 4,
    name: "Arthur Finch",
    designation: "Sr. Manager",
    department: "Maintenance",
    imageUrl: "/Arthur_Finch.jpeg",
  },
  {
    id: 5,
    name: "Benjamin Hayes",
    designation: "Asst. General Manager",
    department: "IT",
    imageUrl: "/Benjamin_Hayes.jpeg",
  },
];
export function BirthdayScrollList() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isHoveringRef = useRef(false);
  const listHeightRef = useRef(0);

  const direction = DIRECTION.UP;
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
      scrollEl.scrollTop = 0;
    }, 50);

    let rafId: number | null = null;
    let lastTs = performance.now();
    let accumulatedScroll = 0;

    const tick = (ts: number) => {
      if (!scrollEl || !listRef.current) return;

      const dt = Math.min(40, ts - lastTs);
      lastTs = ts;

      if (!isHoveringRef.current) {
        const h = listHeightRef.current;
        if (h > 0 && scrollEl.scrollHeight > scrollEl.clientHeight) {
          accumulatedScroll += (speedPxPerSec * dt * direction) / 1000;

          // Loop logic for UP
          if (accumulatedScroll >= h && direction === DIRECTION.UP) {
            accumulatedScroll -= h;
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

  const duplicatedBirthdays = [...mockBirthdays, ...mockBirthdays];

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
        {duplicatedBirthdays.map((person, index) => (
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