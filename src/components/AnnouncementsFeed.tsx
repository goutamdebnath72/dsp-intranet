// src/components/AnnouncementsFeed.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import AnnouncementModal from "./AnnouncementModal";
import { ConfirmModal } from "./ConfirmModal";
import {
  MessageSquareText,
  Loader2,
  AlertCircle,
  Megaphone,
  Pencil,
  Trash2,
} from "lucide-react";
import { DateTime } from "luxon";
import useSWR, { mutate } from "swr";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Tooltip } from "./Tooltip";
import { SCROLL_CONFIG } from "@/lib/SCROLL_CONFIG";
import { EDIT_DELETE_WINDOW_HOURS } from "@/lib/constants";
import { useRouter } from "next/navigation"; // ✅ Added router

type Announcement = {
  id: number;
  createdAt: string;
  title: string;
  content: string | null;
  date: string;
  authorTicketNo: string;
  isRead?: boolean;
};

type AnnouncementWithReadStatus = Announcement & { isRead: boolean };

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((res) => res.json());

export function AnnouncementsFeed() {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { data: session } = useSession();
  const router = useRouter();
  const userTicketNo = (session?.user as any)?.ticketNo || "";
  const userId = (session?.user as any)?.id || "guest";

  const {
    data: announcementsData,
    error,
    isLoading,
    mutate: mutateSelf,
  } = useSWR<AnnouncementWithReadStatus[]>(
    `/api/announcements?u=${userId}`,
    fetcher,
    {
      keepPreviousData: false,
      revalidateOnFocus: true,
      revalidateOnMount: true,
    },
  );

  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<Announcement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isHoveringRef = useRef(false);
  const listHeightRef = useRef(0);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const direction = SCROLL_CONFIG.announcementsDirection;
  const speedPxPerSec = SCROLL_CONFIG.speedPxPerSec;

  const canModify = (item: Announcement) => {
    if (!session || userTicketNo !== item.authorTicketNo) return false;
    const createdAt = DateTime.fromISO(item.createdAt);
    const hoursOld = DateTime.now().diff(createdAt, "hours").hours;
    return hoursOld < EDIT_DELETE_WINDOW_HOURS;
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      mutateSelf();
      toast.success("Announcement deleted successfully."); // ✅ Optional: Add a nice success feedback
    } catch (err) {
      console.error("Delete failed", err);
      toast.error("Failed to delete announcement.");
    }
  };

  // ✅ ADDING THIS HANDLER:
  const confirmDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteId(id);
    setIsConfirmOpen(true);
  };

  // ✅ New navigation handler for edit
  const handleEdit = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/admin?editId=${id}`);
  };

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const listEl = listRef.current;
    if (scrollEl && listEl && announcementsData) {
      if (isOverflowing) {
        const singleListHeight = listEl.scrollHeight / 2;
        if (singleListHeight <= scrollEl.clientHeight) setIsOverflowing(false);
      } else if (listEl.scrollHeight > scrollEl.clientHeight) {
        setIsOverflowing(true);
      }
    } else if (!announcementsData && isOverflowing) {
      setIsOverflowing(false);
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
        mutateSelf();
      } catch (err) {
        console.error("Failed to mark announcement as read", err);
      }
    }
  };

  const handleReadClick = async (item: AnnouncementWithReadStatus) => {
    if (!item.isRead && session) {
      try {
        await fetch(`/api/announcements/${item.id}/read`, { method: "POST" });
        mutateSelf();
      } catch (err) {
        console.error("Failed to mark announcement as read", err);
      }
    }
  };

  const renderContent = () => {
    if (isLoading && !announcementsData)
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="animate-spin" />
        </div>
      );
    if (error) return <div className="text-red-500">Failed to load.</div>;
    if (!announcementsData || announcementsData.length === 0)
      return <div className="text-neutral-500">No announcements.</div>;

    const sortedData = announcementsData
      .slice()
      .sort(
        (a, b) =>
          DateTime.fromISO(b.date as any).toMillis() -
          DateTime.fromISO(a.date as any).toMillis(),
      );
    const dataToRender = isOverflowing
      ? [...sortedData, ...sortedData]
      : sortedData;

    return (
      <div ref={listRef} className="flex flex-col">
        {dataToRender.map((item, index) => {
          const hasContent = !!item.content;
          const itemDate = DateTime.fromISO(item.date as any);
          const showNewChip = !item.isRead;
          const isClickableToMarkRead = !hasContent && showNewChip && session;
          const isOwner = canModify(item);

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
            className: `relative w-full bg-white rounded-lg border border-neutral-200/80 shadow-sm text-left ${hasContent || isClickableToMarkRead ? "transition-all duration-300 hover:shadow-md hover:border-neutral-300 hover:bg-neutral-50" : ""}`,
          };

          return (
            <React.Fragment key={`${item.id}-${index}`}>
              <motion.div
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
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
                      <Tooltip content={item.title}>
                        <p className="text-sm font-medium text-neutral-800 truncate cursor-default pr-2">
                          {item.title}
                        </p>
                      </Tooltip>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {itemDate.toFormat("dd LLL yyyy")}
                      </p>
                    </div>
                  </div>
                  {isOwner && (
                    <div className="absolute top-3 right-1 flex gap-1">
                      <button
                        onClick={(e) => handleEdit(item.id, e)}
                        className="text-neutral-400 hover:text-blue-600 p-1"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={(e) => confirmDelete(item.id, e)}
                        className="text-neutral-400 hover:text-red-600 p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                  {showNewChip && (
                    <span
                      className={`absolute bottom-3 right-3 bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full`}
                    >
                      New
                    </span>
                  )}
                </WrapperComponent>
              </motion.div>
              <div
                style={{ height: SCROLL_CONFIG.gapHeight }}
                aria-hidden="true"
              />
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-100 rounded-lg border">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3">
        {renderContent()}
      </div>
      {selectedAnnouncement && (
        <AnnouncementModal
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
        />
      )}
      {/* ✅ ADDING THIS COMPONENT: */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="Delete Announcement"
        message="Are you sure you want to delete this? This action cannot be undone."
      />
    </div>
  );
}
