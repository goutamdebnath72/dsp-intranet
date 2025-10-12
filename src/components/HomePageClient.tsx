'use client';

import { useState } from 'react';
import HeroBanner from '@/components/HeroBanner';
import QuickLinks from '@/components/QuickLinks';
import Announcements from '@/components/Announcements';
import DepartmentSites from '@/components/DepartmentSites';
import { CircularsModal } from '@/components/CircularsModal';
import type { Link } from '@prisma/client'; // Import the type from Prisma

// Define the props to accept the data from the Server Component
type HomePageClientProps = {
  quickLinksData: Link[];
  departmentData: Link[];
};

export default function HomePageClient({ quickLinksData, departmentData }: HomePageClientProps) {
  // State to control the visibility of the Circulars modal
  const [isCircularsModalOpen, setCircularsModalOpen] = useState(false);

  // Functions to open and close the modal
  const openCircularsModal = () => setCircularsModalOpen(true);
  const closeCircularsModal = () => setCircularsModalOpen(false);

  return (
    <>
      {/* This is your stable layout structure, preserved exactly */}
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
              onCircularsClick={openCircularsModal} // Pass the click handler
            />
          </aside>
        </div>
      </div>

      {/* The modal is rendered here, outside the main layout */}
      <CircularsModal 
        isOpen={isCircularsModalOpen}
        onClose={closeCircularsModal}
      />
    </>
  );
}
