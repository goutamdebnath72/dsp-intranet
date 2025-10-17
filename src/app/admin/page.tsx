'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import AnnouncementForm from '@/components/AnnouncementForm';
import { CircularUploadModal } from '@/components/CircularUploadModal';
import { Loader2 } from 'lucide-react';

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [isCircularModalOpen, setIsCircularModalOpen] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'admin') {
      redirect('/');
    }
    if (status === 'unauthenticated') {
      redirect('/');
    }
  }, [session, status]);

  const handleUploadSuccess = (newCircular: any) => {
    console.log('New circular added:', newCircular);
    // Future: Add logic for a success toast notification.
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200 w-full">
      <div className="container mx-auto p-8">
        <h1 className="text-3xl font-bold font-heading mb-8 text-center text-neutral-800">Admin Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">

          {/* Section 1: Create Announcement */}
          {/* MODIFIED: Added stronger shadow and hover effects */}
          <div className="rounded-lg p-6 bg-white/50 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <h2 className="text-2xl font-bold font-heading mb-2 text-center">Announcements</h2>
            <p className="mb-8 text-neutral-600 text-center">Create a new announcement</p>
            <div className="flex justify-center">
              <AnnouncementForm />
            </div>
          </div>

          {/* Section 2: Post New Circular */}
          {/* MODIFIED: Added stronger shadow and hover effects */}
          <div className="rounded-lg p-6 bg-white/50 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex flex-col justify-center items-center">
            <h2 className="text-2xl font-bold font-heading mb-2 text-center">Circulars</h2>
            <p className="mb-8 text-neutral-600 text-center">Upload a new circular</p>
            <button
              onClick={() => setIsCircularModalOpen(true)}
              className="px-6 py-3 font-semibold text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-all shadow-lg hover:shadow-primary-300 transform hover:-translate-y-0.5"
            >
              Post New Circular
            </button>
          </div>

        </div>

        <CircularUploadModal
          isOpen={isCircularModalOpen}
          onClose={() => setIsCircularModalOpen(false)}
          onUploadSuccess={handleUploadSuccess}
        />
      </div>
    </div>
  );
}