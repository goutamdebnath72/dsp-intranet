// src/components/HomepageNew.tsx

import React from "react";
import type { Link } from "@prisma/client";
import { TopBar } from "./TopBar";
// The "boxed" black bar
import Header from "@/components/Header"; // The "full-width" white bar

interface HomepageProps {
  quickLinksData: Link[];
  departmentData: Link[];
}

export function HomepageNew({ quickLinksData, departmentData }: HomepageProps) {
  return (
    <>
      {/* --- 1. "BOXED" TOP BAR --- */}
      <div className="w-full lg-custom:w-[72%] xl-custom:w-[70%] mx-auto">
        <TopBar />
      </div>

      {/* --- 2. FULL-WIDTH WHITE HEADER --- */}
      <Header />

      {/* --- 3. "BOXED" HERO SECTION --- */}
      <div
        className="w-full 
 
 lg-custom:w-[72%] xl-custom:w-[70%] mx-auto 
                   bg-cover bg-center relative
                   h-[530px] overflow-hidden"
        style={{ backgroundImage: "url('/background-image.png')" }}
      >
        {/* Dark overlay for contrast */}
        <div className="absolute inset-0 bg-black/30" />

        {/* LAYER 2: Content (Welcome text + White Card) */}
        <main className="flex-1 relative z-10 px-4 sm:px-6 lg:px-8 pt-28 pb-12">
          {/* Wrapper for both alignment and spacing */}
          <div className="w-11/12 mx-auto mb-8">
            {/* Welcome Text (no margin-bottom here) */}

            <div>
              <h1 className="font-black text-5xl tracking-tight text-white">
                Welcome, Goutam!
              </h1>
            </div>
          </div>

          {/* 3. The White Content Card */}
          <div
            className="w-11/12 mx-auto rounded-t-2xl 
                       p-8         
                       h-[600px]"
            /* --- 💡 MODIFIED: Gradient now stops at 70% --- */
            style={{
              background:
                "linear-gradient(to bottom, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 1.0) 55%)",
            }}
          >
            {/* --- 💡 REMOVED: "White Content Card Goes Here" ---
              This is where the new components
              (CEO message, video, news) will be added.
            */}
          </div>
        </main>
      </div>

      {/* --- 4. NEW WHITE CONTENT SECTION --- */}
      <div
        className="w-full lg-custom:w-[72%] xl-custom:w-[70%] mx-auto 
             
              shadow-lg rounded-b-lg 
                   bg-white 
                   p-4 sm:p-6 lg:p-8"
      >
        {/*
          --- 💡 REMOVED: "Future content..." ---
          THIS IS WHERE NEW CONTENT (like the black button bar)
          WILL GO.
        */}
      </div>
    </>
  );
}
