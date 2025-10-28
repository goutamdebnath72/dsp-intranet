// src/app/admin/page.tsx

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import AnnouncementForm from "@/components/AnnouncementForm";
import { CircularUploadModal } from "@/components/CircularUploadModal";
import { Loader2 } from "lucide-react";
import { ACTIVE_UI_DESIGN } from "@/lib/config";
import { TopBar } from "@/components/TopBar";
import Header from "@/components/Header";
import OldHeader from "@/components/OldHeader";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [isCircularModalOpen, setIsCircularModalOpen] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") {
      redirect("/");
    }
    if (status === "unauthenticated") {
      redirect("/");
    }
  }, [session, status]);

  const handleUploadSuccess = (newCircular: any) => {
    console.log("New circular added:", newCircular);
    // Future: Add logic for a success toast notification.
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    );
  }

  return (
    <>
      {ACTIVE_UI_DESIGN === "new" ? (
        <>
          <div className="w-full lg-custom:w-[75%] xl-custom:w-[70%] mx-auto">
            <TopBar />
          </div>
          <Header />
        </>
      ) : (
        <OldHeader />
      )}

      <div className="w-full lg-custom:w-[75%] xl-custom:w-[70%] mx-auto shadow-lg">
        <div className="min-h-screen bg-gray-200 w-full">
          <div className="container mx-auto p-8">
            <h1 className="text-3xl font-bold font-heading mb-8 text-center text-neutral-800">
              Admin Dashboard
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {/* --- 👇 MODIFIED: Upgraded hover shadow animation --- */}
              <div className="rounded-lg p-6 bg-white/50 shadow-lg hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] transition-all duration-300">
                <h2 className="text-2xl font-bold font-heading mb-2 text-center">
                  Announcements
                </h2>
                <p className="mb-8 text-neutral-600 text-center">
                  Create a new announcement
                </p>
                <div className="flex justify-center">
                  <AnnouncementForm />
                </div>
              </div>

              {/* --- 👇 MODIFIED: Upgraded hover shadow animation --- */}
              <div className="rounded-lg p-6 bg-white/50 shadow-lg hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] transition-all duration-300 flex flex-col justify-center items-center">
                <h2 className="text-2xl font-bold font-heading mb-2 text-center">
                  Circulars
                </h2>
                <p className="mb-8 text-neutral-600 text-center">
                  Upload a new circular
                </p>
                <button
                  onClick={() => setIsCircularModalOpen(true)}
                  className="rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-bold text-white tracking-wide shadow-lg transform transition-all duration-300 ease-in-out hover:scale-105 hover:-translate-y-px hover:shadow-xl hover:shadow-blue-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-95 disabled:scale-100 disabled:-translate-y-0 disabled:shadow-lg disabled:bg-gradient-to-r disabled:from-blue-400 disabled:to-blue-500"
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
      </div>
    </>
  );
}
