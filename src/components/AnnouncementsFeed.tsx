// src/components/AnnouncementsFeed.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import AnnouncementModal from "./AnnouncementModal";
import {
  MessageSquareText,
  Loader2,
  AlertCircle,
  Megaphone,
} from "lucide-react";
import { DateTime } from "luxon";
import useSWR, { mutate } from "swr";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { Tooltip } from "./Tooltip";
import { SCROLL_CONFIG } from "@/lib/SCROLL_CONFIG";

// --- 2. ADDED NEW ANNOUNCEMENT TYPE ---
// This type matches the data our API now sends
type Announcement = {
  id: number;
  createdAt: string; // Dates are strings after JSON serialization
  title: string;
  content: string | null;
  date: string; // Dates are strings after JSON serialization
  isRead?: boolean;
};
// ------------------------------------

type AnnouncementWithReadStatus = Announcement & { isRead: boolean };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function AnnouncementsFeed() {
  const { data: session } = useSession();
  const {
    data: announcementsData,
    error,
    isLoading,
  } = useSWR<AnnouncementWithReadStatus[]>("/api/announcements", fetcher, {
    keepPreviousData: true,
  });
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<Announcement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isHoveringRef = useRef(false);
  const listHeightRef = useRef(0);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const direction = SCROLL_CONFIG.announcementsDirection;
  const speedPxPerSec = SCROLL_CONFIG.speedPxPerSec;

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const listEl = listRef.current;

    if (scrollEl && listEl && announcementsData) {
      if (isOverflowing) {
        const singleListHeight = listEl.scrollHeight / 2;
        if (singleListHeight <= scrollEl.clientHeight) {
          setIsOverflowing(false); // Stop duplicating
        }
      } else {
        if (listEl.scrollHeight > scrollEl.clientHeight) {
          setIsOverflowing(true); // Start duplicating
        }
      }
    } else if (!announcementsData && isOverflowing) {
      setIsOverflowing(false); // Reset on error or no data
    }
  }, [announcementsData, isOverflowing]);

  useEffect(() => {
    if (!isOverflowing) {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      return;
    }

    const scrollEl = scrollRef.current;
    const listEl = listRef.current;
    if (!scrollEl || !listEl) return;

    listHeightRef.current = listEl.scrollHeight / 2;
    let rafId: number | null = null;
    let lastTs = performance.now();
    let accumulated = scrollEl.scrollTop;

    const tick = (ts: number) => {
      if (!scrollEl) return;
      const dt = Math.min(40, ts - lastTs);
      lastTs = ts;

      if (!isHoveringRef.current && !isLoading && announcementsData) {
        const h = listHeightRef.current;
        if (h > 0 && scrollEl.scrollHeight > scrollEl.clientHeight) {
          accumulated += (speedPxPerSec * dt * direction) / 1000;
          if (accumulated >= h && direction === 1) accumulated -= h;
          else if (accumulated <= 0 && direction === -1) accumulated += h;

          scrollEl.scrollTop = accumulated;
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
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isLoading, announcementsData, direction, speedPxPerSec, isOverflowing]);

  const handleAnnouncementClick = async (item: AnnouncementWithReadStatus) => {
    setSelectedAnnouncement(item);
    if (!item.isRead && session) {
      try {
        await fetch(`/api/announcements/${item.id}/read`, { method: "POST" });
        mutate("/api/announcements");
      } catch (err) {
        console.error("Failed to mark announcement as read", err);
      }
    }
  };

  const handleReadClick = async (item: AnnouncementWithReadStatus) => {
    if (!item.isRead && session) {
      try {
        await fetch(`/api/announcements/${item.id}/read`, { method: "POST" });
        mutate("/api/announcements");
      } catch (err) {
        console.error("Failed to mark announcement as read", err);
      }
    }
  };

  const renderContent = () => {
    if (isLoading && !announcementsData)
      return (
        <div className="flex items-center justify-center h-full text-neutral-500">
          <Loader2 className="animate-spin" size={24} />
        </div>
      );
    if (error)
      return (
        <div className="flex flex-col items-center justify-center h-full text-red-500">
          <AlertCircle size={24} />
          <p className="text-sm mt-2">Failed to load announcements.</p>
        </div>
      );
    if (!announcementsData || announcementsData.length === 0)
      return (
        <div className="flex items-center justify-center h-full text-neutral-500">
          <p className="text-sm">No announcements right now.</p>
        </div>
      );
    const sortedData = announcementsData
      .slice()
      .sort(
        (a, b) =>
          DateTime.fromISO(b.date as any).toMillis() -
          DateTime.fromISO(a.date as any).toMillis()
      );
    const dataToRender = isOverflowing
      ? [...sortedData, ...sortedData]
      : sortedData;
    const renderItem = (item: AnnouncementWithReadStatus, index: number) => {
      const hasContent = !!item.content;
      const itemDate = DateTime.fromISO(item.date as any);
      const isRecent = DateTime.now().diff(itemDate, "hours").hours <= 24;
      const showNewChip = session ? isRecent && !item.isRead : isRecent;
      const isClickableToMarkRead = !hasContent && showNewChip && session;
      const WrapperComponent: React.ElementType = hasContent
        ? "button"
        : isClickableToMarkRead
        ? "button"
        : "div";
      const wrapperProps = {
        onClick: hasContent
          ? () => handleAnnouncementClick(item)
          : isClickableToMarkRead
          ? () => handleReadClick(item)
          : undefined,
        className: `relative w-full bg-white rounded-lg border border-neutral-200/80 shadow-sm text-left ${
          hasContent || isClickableToMarkRead
            ? "transition-all duration-300 hover:shadow-md hover:border-neutral-300 hover:bg-neutral-50"
            : ""
        }`,
      };
      const uniqueKey = `${item.id}-${index}`;

      return (
        <React.Fragment key={uniqueKey}>
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              willChange: "transform, opacity",
              backfaceVisibility: "hidden",
            }}
          >
            <WrapperComponent {...wrapperProps}>
              <div className="flex gap-3 p-4 pr-12">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                  {hasContent ? (
                    <MessageSquareText size={16} />
                  ) : (
                    <Megaphone size={16} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="overflow-hidden [&>*]:block">
                    <Tooltip content={item.title}>
                      <p className="text-sm font-medium text-neutral-800 truncate cursor-default pr-2">
                        {item.title}
                      </p>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {itemDate.toFormat("dd LLL yyyy")}
                  </p>
                </div>
              </div>
              {showNewChip && (
                <span className="absolute bottom-3 right-3 bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  New
                </span>
              )}
            </WrapperComponent>
          </motion.div>

          {/* spacer for visible consistent gap */}
          <div
            style={{ height: SCROLL_CONFIG.gapHeight }}
            aria-hidden="true"
          />
        </React.Fragment>
      );
    };

    return (
      <div ref={listRef} className="flex flex-col">
        {dataToRender.map((item, index) => renderItem(item, index))}
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 bg-gray-100 rounded-lg border">
        <div
          ref={scrollRef}
          onMouseEnter={() => (isHoveringRef.current = true)}
          onMouseLeave={() => (isHoveringRef.current = false)}
          className="flex-1 overflow-y-auto px-3 scrollbar-thin scrollbar-thumb-neutral-300 hover:scrollbar-thumb-neutral-400"
          style={{ overflowAnchor: "none" }}
        >
          {renderContent()}
        </div>
      </div>

      {selectedAnnouncement && (
        <AnnouncementModal
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
        />
      )}
    </>
  );
}