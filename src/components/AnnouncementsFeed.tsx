// src/components/AnnouncementsFeed.tsx
"use client";

import React, { useState } from "react";
import { Announcement } from "@prisma/client";
import AnnouncementModal from "./AnnouncementModal";
// --- MODIFIED: Added icons for new card style ---
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

type AnnouncementWithReadStatus = Announcement & { isRead: boolean };
const fetcher = (url: string) => fetch(url).then((res) => res.json());

// --- MODIFIED: Renamed component ---
export function AnnouncementsFeed() {
  const { data: session } = useSession();
  const {
    data: announcementsData,
    error,
    isLoading,
  } = useSWR<AnnouncementWithReadStatus[]>("/api/announcements", fetcher);
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<Announcement | null>(null);
  // --- All this logic is preserved from your original file ---
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

  // --- This is the new render function for the content ---
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full text-neutral-500">
          <Loader2 className="animate-spin" size={24} />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-red-500">
          <AlertCircle size={24} />
          <p className="text-sm mt-2">Failed to load announcements.</p>
        </div>
      );
    }

    if (!announcementsData || announcementsData.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-neutral-500">
          <p className="text-sm">No announcements right now.</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {announcementsData
          .slice()
          .sort(
            (a, b) =>
              DateTime.fromISO(b.date as any).toMillis() -
              DateTime.fromISO(a.date as any).toMillis()
          )
          .map((item) => {
            const hasContent = !!item.content;
            const itemDate = DateTime.fromISO(item.date as any);
            const isRecent = DateTime.now().diff(itemDate, "hours").hours <= 24;
            const showNewChip = session ? isRecent && !item.isRead : isRecent;
            const isClickableToMarkRead = !hasContent && showNewChip && session;

            // This is the "button" or "div" that holds the content
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
              // --- MODIFIED: Added 'relative' ---
              className: `relative w-full p-4 bg-white rounded-lg border border-neutral-200/80 shadow-sm text-left ${
                hasContent || isClickableToMarkRead
                  ? "transition-all duration-300 hover:shadow-md hover:border-neutral-300 hover:bg-neutral-50"
                  : ""
              }`,
            };
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <WrapperComponent {...wrapperProps}>
                  {/* Main content flex container */}
                  <div className="flex gap-3 pr-12">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                      {hasContent ? (
                        <MessageSquareText size={16} />
                      ) : (
                        <Megaphone size={16} />
                      )}
                    </div>
                    {/* --- ADDED min-w-0 HERE --- */}
                    <div className="flex-1 min-w-0">
                      {/* --- ADDED overflow-hidden wrapper --- */}
                      <div className="overflow-hidden [&>*]:block">
                        <Tooltip content={item.title}>
                          <p className="text-sm font-medium text-neutral-800 truncate cursor-default pr-2">
                            {item.title}
                          </p>
                        </Tooltip>
                      </div>
                      {/* --- Date is outside the overflow wrapper --- */}
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {itemDate.toFormat("dd LLL yyyy")}
                      </p>
                    </div>
                  </div>
                  {/* --- MODIFIED: Moved chip outside flex, added absolute positioning --- */}
                  {showNewChip && (
                    <span className="absolute bottom-3 right-3 bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                      New
                    </span>
                  )}
                </WrapperComponent>
              </motion.div>
            );
          })}
      </div>
    );
  };
  return (
    <>
      {/* --- MODIFIED: This is the new container styling --- */}
      <div className="flex flex-col h-full bg-gray-100 rounded-lg border">
        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-neutral-300 hover:scrollbar-thumb-neutral-400">
          {renderContent()}
        </div>
      </div>

      {/* --- This modal logic is preserved perfectly --- */}
      {selectedAnnouncement && (
        <AnnouncementModal
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
        />
      )}
    </>
  );
}
