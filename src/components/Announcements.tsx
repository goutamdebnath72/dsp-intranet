// src/components/Announcements.tsx
"use client";

import React, { useState } from "react";
import AnnouncementModal from "./AnnouncementModal";
import { MessageSquareText, Loader } from "lucide-react";
import { DateTime } from "luxon";
import useSWR, { mutate } from "swr";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";

// --- 2. ADDED NEW ANNOUNCEMENT TYPE (same as in AnnouncementModal.tsx) ---
type Announcement = {
  id: number;
  createdAt: string;
  title: string;
  content: string | null;
  date: string;
  isRead?: boolean;
};
// ----------------------------------------------------

type AnnouncementWithReadStatus = Announcement & { isRead: boolean };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Announcements() {
  const { data: session } = useSession();
  const {
    data: announcementsData,
    error,
    isLoading,
  } = useSWR<AnnouncementWithReadStatus[]>("/api/announcements", fetcher);
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<Announcement | null>(null);
  const [isHovering, setIsHovering] = useState(false);

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

  return (
    <>
      <motion.div
        className="relative group h-[370px] rounded-lg shadow-lg p-6 flex flex-col
                   before:absolute before:inset-0 before:bg-white/30 before:backdrop-blur-lg before:rounded-lg before:border before:border-white/20"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="relative z-10 flex flex-col h-full">
          <h2 className="text-xl font-bold font-heading text-neutral-800 mb-4 flex-shrink-0">
            Announcements & Happenings
          </h2>

          <div
            className="space-y-4 flex-grow overflow-y-auto"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: isHovering
                ? "rgba(71, 85, 105, 0.5) transparent"
                : "transparent transparent",
            }}
          >
            {isLoading && (
              <div className="h-full flex items-center justify-center">
                <Loader className="animate-spin text-primary-700" size={32} />
              </div>
            )}

            {error && (
              <div className="text-red-500">Failed to load announcements.</div>
            )}

            {announcementsData &&
              announcementsData
                .slice()
                .sort(
                  (a, b) =>
                    DateTime.fromISO(b.date as any).toMillis() -
                    DateTime.fromISO(a.date as any).toMillis()
                )
                .map((item) => {
                  const hasContent = !!item.content;
                  const itemDate = DateTime.fromISO(item.date as any);
                  const isRecent =
                    DateTime.now().diff(itemDate, "hours").hours <= 24;
                  const showNewChip = session
                    ? isRecent && !item.isRead
                    : isRecent;

                  return (
                    <div
                      key={item.id}
                      className="border-b border-neutral-200/50 last:border-b-0 pb-4 last:pb-0"
                    >
                      <div className="flex items-center justify-between">
                        {(() => {
                          const isClickableToMarkRead =
                            !hasContent && showNewChip && session;

                          if (hasContent) {
                            return (
                              <button
                                onClick={() => handleAnnouncementClick(item)}
                                className="text-left font-medium text-primary-600 hover:text-primary-800 hover:underline flex items-center gap-2"
                              >
                                <MessageSquareText
                                  size={16}
                                  className="opacity-70 flex-shrink-0"
                                />
                                <span>{item.title}</span>
                              </button>
                            );
                          } else if (isClickableToMarkRead) {
                            return (
                              <button
                                onClick={() => handleReadClick(item)}
                                className="text-left font-medium text-neutral-700 hover:text-primary-600 transition-colors"
                              >
                                {item.title}
                              </button>
                            );
                          } else {
                            return (
                              <h3 className="font-medium text-neutral-700">
                                {item.title}
                              </h3>
                            );
                          }
                        })()}

                        {showNewChip && (
                          <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-neutral-600 mt-1">
                        {itemDate.toFormat("dd LLL yyyy")}
                      </p>
                    </div>
                  );
                })}
          </div>
        </div>
      </motion.div>

      {selectedAnnouncement && (
        <AnnouncementModal
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
        />
      )}
    </>
  );
}
