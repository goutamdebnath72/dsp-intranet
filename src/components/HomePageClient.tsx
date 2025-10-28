// src/components/HomePageClient.tsx

"use client";

import { useState, useEffect } from "react";
import OldHeader from "@/components/OldHeader";
import HeroBanner from "@/components/HeroBanner";
import QuickLinks from "@/components/QuickLinks";
import Announcements from "@/components/Announcements";
import DepartmentSites from "@/components/DepartmentSites";
import { CircularsModal } from "@/components/CircularsModal";
import { CircularViewerLightbox } from "./CircularViewerLightbox";
import type { Link } from "@prisma/client"; // <-- 1. IMPORTED LINK

// --- 2. MODIFIED: Added sailSitesData ---
type HomePageClientProps = {
  quickLinksData: Link[];
  departmentData: Link[];
  sailSitesData: Link[]; // <-- ADDED
};

export default function HomePageClient({
  quickLinksData,
  departmentData,
  sailSitesData, // <-- 3. ADDED
}: HomePageClientProps) {
  const [isCircularsModalOpen, setCircularsModalOpen] = useState(false);
  const [viewingCircularId, setViewingCircularId] = useState<number | null>(
    null
  );

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    if (viewingCircularId !== null) {
      const scrollBarWidth = window.innerWidth - html.clientWidth;
      body.style.paddingRight = `${scrollBarWidth}px`;
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
    } else {
      body.style.paddingRight = "";
      html.style.overflow = "";
      body.style.overflow = "";
    }

    return () => {
      body.style.paddingRight = "";
      html.style.overflow = "";
      body.style.overflow = "";
    };
  }, [viewingCircularId]);

  const openCircularsModal = () => setCircularsModalOpen(true);
  const closeCircularsModal = () => setCircularsModalOpen(false);

  const handleViewCircular = (id: number) => {    
    setViewingCircularId(id);
  };

  return (
    <>
      <OldHeader />
      <div className="w-full lg-custom:w-[87%] xl-custom:w-[70%] mx-auto shadow-lg">
        <div className="p-4 sm:p-6 lg:p-8">
          <HeroBanner />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mt-8">
            <main className="lg:col-span-3 space-y-8">
              <Announcements />
              {/* --- 4. MODIFIED: Passed sailSitesData prop --- */}
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
      />
      <CircularViewerLightbox
        circularId={viewingCircularId}
        onClose={() => setViewingCircularId(null)}
      />
    </>
  );
}