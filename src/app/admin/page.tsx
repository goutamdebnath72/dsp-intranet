"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { redirect, useSearchParams } from "next/navigation";
import Link from "next/link";
import AnnouncementForm from "@/components/AnnouncementForm";
import { CircularUploadModal } from "@/components/CircularUploadModal";
import { Loader2 } from "lucide-react";
import { ACTIVE_UI_DESIGN } from "@/lib/config";
import { TopBar } from "@/components/TopBar";
import Header from "@/components/Header";
import OldHeader from "@/components/OldHeader";
import { HolidayDashboard } from "@/components/admin/HolidayDashboard";
import { ADMIN_CARD_HEIGHT } from "@/lib/constants";
import { Toaster } from "react-hot-toast";

function AdminContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");
  const [isCircularModalOpen, setIsCircularModalOpen] = useState(false);

  const isSuper = (session?.user as any)?.isSuperAdmin === true;

  // Mount animation (super-admin only): Circulars starts tall, then compresses
  // as the Access Log card expands in beneath it. Plays once on load.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!isSuper) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      setExpanded(true);
      return;
    }
    const t = setTimeout(() => setExpanded(true), 300);
    return () => clearTimeout(t);
  }, [isSuper]);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin")
      redirect("/");
    if (status === "unauthenticated") redirect("/");
  }, [session, status]);

  const handleUploadSuccess = (newCircular: any) => {
    // The modal itself already shows an accurate "queued for processing"
    // message for the full 5s it stays open before auto-closing -- a
    // second toast here duplicated that feedback and, worse, said
    // "uploaded successfully" which is no longer true the moment the
    // upload completes under the async flow (the circular is only
    // QUEUED at this point, not yet rendered/OCR'd/embedded).
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
        <div className="container mx-auto pt-4 px-8 pb-4">
          <h1 className="text-2xl font-bold font-heading mb-3 text-center text-neutral-800">
            Admin Dashboard
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
            {/* Column 1 — Announcements */}
            <div
              className="rounded-lg p-5 bg-white/50 shadow-lg"
              style={{ minHeight: ADMIN_CARD_HEIGHT }}
            >
              <h2 className="text-2xl font-bold font-heading mb-2 text-center">
                Announcements
              </h2>
              <div className="flex justify-center">
                <AnnouncementForm editId={editId} /> {/* ✅ Pass editId */}
              </div>
            </div>

            {/* Column 2 — middle */}
            {isSuper ? (
              // Super-admin: Circulars (top) compresses + Access Log (bottom) expands in.
              <div
                className="flex flex-col gap-6 h-full"
                style={{ minHeight: ADMIN_CARD_HEIGHT }}
              >
                <div
                  className="rounded-lg p-5 bg-white/50 shadow-lg flex flex-col justify-center items-center overflow-hidden"
                  style={{
                    flexBasis: 0,
                    minHeight: 0,
                    flexGrow: expanded ? 1 : 2.4,
                    transition: "flex-grow 1400ms cubic-bezier(0.22,1,0.36,1)",
                  }}
                >
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

                <div
                  className="rounded-lg p-5 bg-white/50 shadow-lg flex flex-col justify-center items-center overflow-hidden"
                  style={{
                    flexBasis: 0,
                    minHeight: 0,
                    flexGrow: expanded ? 1 : 0,
                    opacity: expanded ? 1 : 0,
                    transform: expanded ? "translateY(0)" : "translateY(-8px)",
                    transition:
                      "flex-grow 1400ms cubic-bezier(0.22,1,0.36,1), opacity 1000ms ease 300ms, transform 1000ms ease 300ms",
                  }}
                >
                  <h2 className="text-2xl font-bold font-heading mb-2 text-center">
                    Contact Access Log
                  </h2>
                  <p className="text-sm text-neutral-500 mb-4 text-center">
                    Audit trail of who viewed or copied employee contacts.
                  </p>
                  <Link
                    href="/admin/access-log"
                    className="rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-white font-bold"
                  >
                    View Access Log
                  </Link>
                </div>
              </div>
            ) : (
              // Everyone else: the original full-height Circulars card, untouched.
              <div
                className="rounded-lg p-5 bg-white/50 shadow-lg flex flex-col justify-center items-center"
                style={{ minHeight: ADMIN_CARD_HEIGHT }}
              >
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
            )}

            {/* Column 3 — Holiday */}
            <div
              className="rounded-lg p-5 bg-white/50 shadow-lg"
              style={{ minHeight: ADMIN_CARD_HEIGHT }}
            >
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
