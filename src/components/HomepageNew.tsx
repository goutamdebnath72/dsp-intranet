// src/components/HomepageNew.tsx
"use client";

import React, { useState, useRef } from "react";
import type { Link } from "@prisma/client";
import Image from "next/image";
import { PlayCircle, ArrowRight, PauseCircle } from "lucide-react";
import { TopBar } from "./TopBar";
import Header from "@/components/Header";

interface HomepageProps {
  quickLinksData: Link[];
  departmentData: Link[];
  userName: string;
}

// --- MODIFIED: Swapped first and second items for better color contrast ---
const newsItems = [
  {
    id: 2,
    title: "Record Tonnage Shipped from SMS-II",
    summary: "Congratulations to the team for exceeding quarterly targets.",
    imageUrl: "https://placehold.co/80x80/3B82F6/FFFFFF?text=PROD",
  },
  {
    id: 1,
    title: "New PPE Guidelines Effective Nov 1st",
    summary: "All plant personnel must review the updated safety protocols.",
    imageUrl: "https://placehold.co/80x80/E2E8F0/4A5568?text=SAFETY",
  },
  {
    id: 3,
    title: "Annual DSP Family Day Registration",
    summary: "Join us for a day of fun and community. Register by Oct 28th.",
    imageUrl: "https://placehold.co/80x80/10B981/FFFFFF?text=EVENT",
  },
];

export function HomepageNew({
  quickLinksData,
  departmentData,
  userName,
}: HomepageProps) {
  const firstName = userName.split(" ")[0];

  const [isPaused, setIsPaused] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPaused) {
        videoRef.current.play();
        setIsPaused(false);
      } else {
        videoRef.current.pause();
        setIsPaused(true);
      }
    }
  };

  return (
    <>
      <div className="relative z-50 w-full lg-custom:w-[72%] xl-custom:w-[70%] mx-auto">
        <TopBar />
      </div>
      <Header />

      <div
        className="w-full lg-custom:w-[72%] xl-custom:w-[70%] mx-auto bg-cover bg-center relative h-[455px]"
        style={{ backgroundImage: "url('/steel-plant1.png')" }}
      >
        <div className="absolute inset-0 bg-black/30" />

        <div
          className="absolute bottom-0 left-0 right-0 h-4 z-10"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.1), transparent)",
          }}
        />

        <main className="flex-1 relative z-20 px-4 sm:px-6 lg:px-8 pt-28 pb-12 h-full">
          <div className="w-11/12 mx-auto mb-8">
            <div>
              <h1 className="font-black text-5xl tracking-tight text-white">
                Welcome, {firstName}!
              </h1>
            </div>
          </div>

          <div className="w-11/12 mx-auto relative h-full">
            <div
              className="absolute inset-0 rounded-t-2xl"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 1.0) 40%)",
              }}
            />

            <div className="absolute inset-0 p-8 flex gap-8">
              {/* Col 1: Message from DIC */}
              {/* --- MODIFIED: Added pb-3 to nudge content down by 12px --- */}
              <div className="w-[25%] flex flex-col justify-end text-neutral-800 relative">
                <div>
                  <h2 className="text-2xl font-bold mb-3">
                    A Message from the DIC
                  </h2>
                  <p className="text-base text-neutral-600 mb-6 font-serif italic">
                    "We wouldn't be where we are today without each and every
                    one of you. Thank you for making us successful!"
                  </p>
                  <button className="w-fit bg-neutral-800 text-white font-semibold py-2 px-5 rounded-md hover:bg-neutral-700 transition-colors">
                    Learn More
                  </button>
                </div>
              </div>

              {/* Col 2: Video Player */}
              <div className="w-[41.66%] relative">
                {/* --- MODIFIED: Dynamic Video Player --- */}
                <div className="absolute inset-0 top-[-20px] bottom-[-20px] rounded-b-none overflow-hidden shadow-lg">
                  <video
                    ref={videoRef} // <-- ADDED: Ref to control video
                    src="/Steel_Plant_Video.mp4"
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />

                  {/* --- MODIFIED: This is the dynamic icon overlay --- */}
                  <div
                    className="absolute inset-0 bg-black/20 flex items-center justify-center cursor-pointer" // <-- REMOVED: pointer-events-none
                    onClick={handlePlayPause}
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                  >
                    {isPaused ? (
                      // --- Paused State: Always show Play button ---
                      <PlayCircle
                        size={64}
                        className="text-white/80 transition-opacity duration-300 opacity-100"
                        strokeWidth={1}
                      />
                    ) : (
                      // --- Playing State: Only show Pause button on hover ---
                      <PauseCircle
                        size={64}
                        className={`text-white/80 transition-opacity duration-300 ${
                          isHovering ? "opacity-100" : "opacity-0"
                        }`}
                        strokeWidth={1}
                      />
                    )}
                  </div>
                  {/* --- END: Dynamic Video Player --- */}
                </div>
              </div>

              {/* Col 3: News & Updates */}
              <div className="w-[33.33%] relative">
                <div className="absolute inset-0 top-[-25px] bottom-[-20px] flex flex-col justify-between">
                  <div className="flex flex-col space-y-1.5 h-full">
                    {newsItems.map((item, index) => (
                      <a
                        key={item.id}
                        href="#"
                        // --- MODIFIED: Conditionally uplift the first two items ---
                        className="flex items-center gap-4 p-2 rounded-lg hover:bg-white/50 transition-colors group h-[90px]"
                      >
                        <Image
                          src={item.imageUrl}
                          alt={item.title}
                          width={80}
                          height={80}
                          className="rounded-md w-20 h-20 object-cover flex-shrink-0"
                          unoptimized
                        />
                        <div>
                          <h3 className="font-bold text-neutral-800 text-sm leading-tight group-hover:text-primary-700">
                            {item.title}
                          </h3>
                          <p className="text-xs text-neutral-600 mt-1">
                            {item.summary}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                  <div className="text-right absolute -bottom-10 right-0">
                    <button className="text-xs font-semibold text-neutral-700 bg-neutral-200/80 hover:bg-neutral-300 py-1.5 px-3 rounded-md transition-colors flex items-center gap-1 ml-auto">
                      <span>View More</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <div className="w-full lg-custom:w-[72%] xl-custom:w-[70%] mx-auto rounded-b-lg bg-white p-4 sm:p-6 lg:p-8">
        {/* Future content will go here */}
      </div>
    </>
  );
}
