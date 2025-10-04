'use client';

import React, { useRef, useEffect } from 'react'; // 1. Import useRef and useEffect
import { X } from 'lucide-react';
import { useTypewriter } from '@/hooks/useTypewriter';
import { Announcement } from '@prisma/client';
import { DateTime } from 'luxon';

type Props = {
  announcement: Announcement;
  onClose: () => void;
};

export default function AnnouncementModal({ announcement, onClose }: Props) {
  const typedContent = useTypewriter(announcement.content || '', 20);
  const announcementDate = DateTime.fromISO(announcement.date as unknown as string);

  // 2. Create a ref to hold a reference to the scrolling div
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 3. This effect runs every time the 'typedContent' changes
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      // 4. This line keeps the container scrolled to the bottom
      container.scrollTop = container.scrollHeight;
    }
  }, [typedContent]); // The dependency array ensures this runs on every text update

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-2xl relative animate-fade-in-up max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 transition-colors z-10"
        >
          <X size={24} />
        </button>

        <div className="p-6 border-b flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-800">{announcement.title}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {announcementDate.toFormat('dd LLL yyyy')}
          </p>
        </div>

        {/* 5. Attach the ref to the scrolling div */}
        <div ref={scrollContainerRef} className="p-6 overflow-y-auto">
          <p className="text-base text-gray-700 whitespace-pre-wrap">
            {typedContent}
          </p>
        </div>
      </div>
    </div>
  );
}