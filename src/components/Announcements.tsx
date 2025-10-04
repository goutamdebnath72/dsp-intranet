'use client';

import React, { useState } from 'react';
import { Announcement } from '@prisma/client';
import AnnouncementModal from './AnnouncementModal';
import { MessageSquareText, Loader } from 'lucide-react';
import { DateTime } from 'luxon';
import useSWR, { mutate } from 'swr'; // 1. Import the global 'mutate' function

type AnnouncementWithReadStatus = Announcement & { isRead: boolean };

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function Announcements() {
  // 2. We no longer need the local 'mutate' from here
  const { data: announcementsData, error, isLoading } = useSWR<AnnouncementWithReadStatus[]>('/api/announcements', fetcher);

  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const handleAnnouncementClick = async (item: AnnouncementWithReadStatus) => {
    setSelectedAnnouncement(item);

    if (!item.isRead) {
      try {
        await fetch(`/api/announcements/${item.id}/read`, { method: 'POST' });

        // 3. Use the global 'mutate' with the specific API key to force a refetch
        mutate('/api/announcements');

      } catch (err) {
        console.error("Failed to mark announcement as read", err);
      }
    }
  };

  return (
    <>
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Announcements & Happenings
        </h2>
        <div className="space-y-4">
          {isLoading && <div className="flex justify-center items-center p-4"><Loader className="animate-spin" /></div>}
          {error && <div className="text-red-500">Failed to load announcements.</div>}
          {announcementsData && announcementsData.map((item) => {
            const hasContent = !!item.content;
            const itemDate = DateTime.fromISO(item.date as unknown as string);
            const isTimeNew = itemDate > DateTime.now().minus({ days: 3 });
            const showNewChip = isTimeNew && !item.isRead;

            return (
              <div key={item.id} className="border-b last:border-b-0 pb-4 last:pb-0">
                <div className="flex items-center justify-between">
                  {hasContent ? (
                    <button
                      onClick={() => handleAnnouncementClick(item)}
                      className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-2"
                    >
                      <MessageSquareText size={16} className="opacity-70" />
                      {item.title}
                    </button>
                  ) : (
                    <h3 className="font-medium text-gray-800">{item.title}</h3>
                  )}
                  {showNewChip && <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">New</span>}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {itemDate.toFormat('dd LLL yyyy')}
                </p>
              </div>
            );
          })}
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