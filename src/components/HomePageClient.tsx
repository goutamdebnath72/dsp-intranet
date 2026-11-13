// src/components/HomePageClient.tsx

"use client";

import { lockPageScroll } from "@/lib/ui/scrollLock";
import { useState, useEffect } from "react";
import OldHeader from "@/components/OldHeader";
import HeroBanner from "@/components/HeroBanner";
import QuickLinks from "@/components/QuickLinks";
import Announcements from "@/components/Announcements";
import DepartmentSites from "@/components/DepartmentSites";
import { CircularsModal } from "@/components/CircularsModal";
import { CircularViewerLightbox } from "./CircularViewerLightbox";
import { useVerifiedSession } from "./SessionGuard";
import { useCircularStatus } from "@/hooks/useCircularStatus";

// --- 2. ADDED NEW LINK TYPE ---
// This type matches the data we cleaned in page.tsx (undefined -> null)
type Link = {
  id: number;
  category: string;
  createdAt: Date;
  title: string;
  subtitle: string | null;
  href: string;
  icon: string | null;
};
// ----------------------------

// --- 3. MODIFIED: Added sailSitesData ---
type HomePageClientProps = {
  quickLinksData: Link[];
  departmentData: Link[];
  sailSitesData: Link[]; // <-- ADDED
  recentCircularIds?: number[] | null; // the circulars uploaded in the last 24 hours (from the server)
  visitorHasNoLoginCookie?: boolean; // certainly logged out: the badge is part of the first HTML
};

export default function HomePageClient({
  quickLinksData,
  departmentData,
  sailSitesData, // <-- 4. ADDED
  recentCircularIds,
  visitorHasNoLoginCookie,
}: HomePageClientProps) {
  const { status } = useVerifiedSession();
  const circularStatus = useCircularStatus(status, recentCircularIds, visitorHasNoLoginCookie);
  const [isCircularsModalOpen, setCircularsModalOpen] = useState(false);
  const [viewingCircularId, setViewingCircularId] = useState<number | null>(
    null
  );

  useEffect(() => {
    // one shared lock (src/lib/ui/scrollLock.ts); this used to blank <html>'s overflow on every change, which also unlocked any window opened over the page
    if (viewingCircularId === null) return;
    const lock = lockPageScroll();
    return () => lock.release();
  }, [viewingCircularId]);

  const openCircularsModal = () => {
    setCircularsModalOpen(true);
    void circularStatus.refresh();
  };
  const closeCircularsModal = () => setCircularsModalOpen(false);
  const handleViewCircular = (id: number) => {
    setViewingCircularId(id);
    return circularStatus.markOpened(id);
  };

  return (
    <>
      <OldHeader />
      <div className="w-full md:w-[var(--content-width)] mx-auto shadow-lg">
        <div className="p-4 sm:p-6 lg:p-8">
          <HeroBanner />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mt-8">
            <main className="lg:col-span-3 space-y-8">
              <Announcements />

              {/* --- 5. MODIFIED: Passed sailSitesData prop --- */}
              <DepartmentSites
                departmentData={departmentData}
                sailSitesData={sailSitesData} // <-- ADDED
              />
            </main>
            <aside className="lg:col-span-2">
              <QuickLinks
                quickLinksData={quickLinksData}
                onCircularsClick={openCircularsModal}
              />
            </aside>
          </div>
        </div>
      </div>

      <CircularsModal
        isOpen={isCircularsModalOpen}
        onClose={closeCircularsModal}
        onCircularClick={handleViewCircular}
        unreadIds={circularStatus.unreadIds}
      />
      <CircularViewerLightbox
        circularId={viewingCircularId}
        onClose={() => setViewingCircularId(null)}
      />
    </>
  );
}
