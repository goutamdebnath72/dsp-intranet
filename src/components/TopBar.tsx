// src/components/TopBar.tsx
"use client";

import React from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useModal } from "@/context/ModalContext";
import { Settings, HelpCircle, User, Search, LogIn } from "lucide-react";

// This is the SAIL/DSP Logo, moved from the old header
// Colors are adjusted to be vibrant on a black background
const DspLogoVibrant: React.FC = () => {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/sail-logo-bw.png"
        alt="SAIL Logo"
        width={878}
        height={861}
        className="h-10 w-auto" // <-- THIS IS THE FIX
        priority
      />
      <div>
        <h1 className="text-base font-bold font-heading text-neutral-100">
          Durgapur Steel Plant
        </h1>
        <p className="text-xs text-neutral-300">
          स्टील अथॉरिटी ऑफ इंडिया लिमिटेड
        </p>
      </div>
    </div>
  );
};

// This is the SearchBar component
const TopBarSearch: React.FC = () => {
  return (
    <div className="relative flex-grow">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
      <input
        type="text"
        placeholder="Search for links, circulars, or people..."
        className="w-full pl-12 pr-4 py-1.5 rounded-full border border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-gray-600 transition-colors duration-300"
      />
    </div>
  );
};

// This is the main TopBar component
export function TopBar() {
  const { data: session, status } = useSession();
  const { openModal } = useModal();

  return (
    <div className="bg-[#1a1a1a] text-white px-4 sm:px-8 h-14 flex items-center justify-between gap-4">
      {/* Left Side: The vibrant DSP Logo */}
      <div className="flex-shrink-0">
        <DspLogoVibrant />
      </div>

      {/* Middle: Centered Search Bar */}
      <div className="flex-1 flex justify-center px-4">
        {/* Using max-w-sm as you requested */}
        <div className="w-full max-w-sm">
          <TopBarSearch />
        </div>
      </div>

      {/* Right Side: Auth & Icons */}
      <div className="flex-shrink-0 flex items-center gap-4">
        <button
          className="p-1 hover:bg-gray-700 rounded-full"
          aria-label="Settings"
        >
          <Settings size={20} />
        </button>
        <button
          className="p-1 hover:bg-gray-700 rounded-full"
          aria-label="Help"
        >
          <HelpCircle size={20} />
        </button>

        {/* Auth Logic */}
        {status === "authenticated" ? (
          <div className="relative w-8 h-8">
            {session.user.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name || "User Avatar"}
                fill
                className="rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                <User size={18} />
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => openModal()}
            className="flex items-center gap-1.5 text-sm font-medium hover:text-gray-300"
          >
            <LogIn size={16} />
            Login
          </button>
        )}
      </div>
    </div>
  );
}
