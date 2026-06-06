"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { redirect, useSearchParams } from "next/navigation";
import AnnouncementForm from "@/components/AnnouncementForm";
import { CircularUploadModal } from "@/components/CircularUploadModal";
import { Loader2 } from "lucide-react";
import { ACTIVE_UI_DESIGN } from "@/lib/config";
import { TopBar } from "@/components/TopBar";
import Header from "@/components/Header";
import OldHeader from "@/components/OldHeader";
import { HolidayDashboard } from "@/components/admin/HolidayDashboard";
import { Toaster, toast } from "react-hot-toast";

function AdminContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");
  const [isCircularModalOpen, setIsCircularModalOpen] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin")
      redirect("/");
    if (status === "unauthenticated") redirect("/");
  }, [session, status]);

  const handleUploadSuccess = (newCircular: any) => {
    toast.success("Circular uploaded successfully!");
    setIsCircularModalOpen(false);
  };

  if (status === "loading")
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    );

  return (
    <>
      <Toaster position="top-center" />
      {ACTIVE_UI_DESIGN === "new" ? (
        <>
          <div className="w-full lg-custom:w-[88%] xl-custom:w-[72%] mx-auto">
            <TopBar />
          </div>
          <Header />
        </>
      ) : (
        <OldHeader />
      )}

      <div className="w-full lg-custom:w-[88%] xl-custom:w-[72%] mx-auto shadow-lg bg-gray-200">
        <div className="container mx-auto pt-8 px-8 pb-5">
          <h1 className="text-3xl font-bold font-heading mb-8 text-center text-neutral-800">
            Admin Dashboard
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="rounded-lg p-6 bg-white/50 shadow-lg">
              <h2 className="text-2xl font-bold font-heading mb-2 text-center">
                Announcements
              </h2>
              <div className="flex justify-center">
                <AnnouncementForm editId={editId} /> {/* ✅ Pass editId */}
              </div>
            </div>
            <div className="rounded-lg p-6 bg-white/50 shadow-lg flex flex-col justify-center items-center">
              <h2 className="text-2xl font-bold font-heading mb-2 text-center">
                Circulars
              </h2>
              <button
                onClick={() => setIsCircularModalOpen(true)}
                className="rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-white font-bold"
              >
                Post New Circular
              </button>
            </div>
            <div className="rounded-lg p-6 bg-white/50 shadow-lg">
              <HolidayDashboard />
            </div>
          </div>
          <CircularUploadModal
            isOpen={isCircularModalOpen}
            onClose={() => setIsCircularModalOpen(false)}
            onUploadSuccess={handleUploadSuccess}
          />
        </div>
      </div>
    </>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<Loader2 className="animate-spin" />}>
      <AdminContent />
    </Suspense>
  );
}
