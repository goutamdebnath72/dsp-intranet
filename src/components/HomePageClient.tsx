// src/components/HomePageClient.tsx

"use client";

import { useState, useEffect } from "react";
import OldHeader from "@/components/OldHeader"; // 1. IMPORT
import HeroBanner from "@/components/HeroBanner";
import QuickLinks from "@/components/QuickLinks";
import Announcements from "@/components/Announcements";
import DepartmentSites from "@/components/DepartmentSites";
import { CircularsModal } from "@/components/CircularsModal";
import { CircularViewerLightbox } from "./CircularViewerLightbox";
import type { Link } from "@prisma/client";

type HomePageClientProps = {
  quickLinksData: Link[];
  departmentData: Link[];
};

export default function HomePageClient({
  quickLinksData,
  departmentData,
}: HomePageClientProps) {
  const [isCircularsModalOpen, setCircularsModalOpen] = useState(false);
  const [viewingCircularId, setViewingCircularId] = useState<number | null>(
    null
  );

  // ✅ Prevent background scrolling when lightbox is open
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    if (viewingCircularId !== null) {
      // Prevent background scroll
      const scrollBarWidth = window.innerWidth - html.clientWidth;
      body.style.paddingRight = `${scrollBarWidth}px`; // Prevent layout shift
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
    } else {
      // Restore scroll
      body.style.paddingRight = "";
      html.style.overflow = "";
      body.style.overflow = "";
    }

    // Cleanup if component unmounts
    return () => {
      body.style.paddingRight = "";
      html.style.overflow = "";
      body.style.overflow = "";
    };
  }, [viewingCircularId]);

  const openCircularsModal = () => setCircularsModalOpen(true);
  const closeCircularsModal = () => setCircularsModalOpen(false);
  const handleViewCircular = (id: number) => {
    closeCircularsModal();
    setViewingCircularId(id);
  };

  return (
    <>
      <OldHeader /> {/* 2. ADD HEADER */}
      {/* 3. ADD THIS WRAPPER to re-box your old content */}
      <div className="w-full lg-custom:w-[72%] xl-custom:w-[70%] mx-auto shadow-lg">
        {/* This is your original content div */}
        <div className="p-4 sm:p-6 lg:p-8">
          <HeroBanner />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mt-8">
            <main className="lg:col-span-3 space-y-8">
              <Announcements />
              <DepartmentSites departmentData={departmentData} />
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
      {/* Modals are unaffected as they are full-screen overlays */}
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
