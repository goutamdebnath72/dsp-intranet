// src/components/TopBar.tsx
"use client";

// --- ADDED: Imports for state, refs, effects, and navigation ---
import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link"; // --- ADDED ---
import { usePathname } from "next/navigation"; // --- ADDED ---

// --- MODIFIED: Added signOut and new icons ---
import { useSession, signOut } from "next-auth/react";
import { useModal } from "@/context/ModalContext";
import {
  Settings,
  HelpCircle,
  Search,
  LogIn,
  LogOut, // --- ADDED ---
  Shield, // --- ADDED ---
  Undo2, // --- ADDED ---
} from "lucide-react";

// --- ADDED: Framer Motion for animations ---
import { motion, AnimatePresence } from "framer-motion";

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

  // --- ADDED: State and hooks for dropdown menu from OldHeader.tsx ---
  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  // --- END: Added state and hooks ---

  return (
    <div className="bg-[#1a1a1a] text-white px-4 sm:px-8 h-14 flex items-center justify-between gap-4">
      {/* Left Side: The vibrant DSP Logo */}
      <div className="flex-shrink-0">
        <DspLogoVibrant />
      </div>

      {/* Middle: Centered Search Bar */}
      <div className="flex-1 flex justify-center px-4">
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

        {/* --- MODIFIED: Auth Logic Block --- */}
        {status === "authenticated" ? (
          // --- ADDED: Ref div for click-outside-to-close ---
          <div ref={dropdownRef} className="relative">
            {/* --- ADDED: Button wrapper to toggle dropdown --- */}
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="relative w-8 h-8 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500"
            >
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name || "User Avatar"}
                  fill
                  className="rounded-full object-cover"
                />
              ) : (
                // --- MODIFIED: Replaced generic icon with user initials ---
                <div className="w-full h-full rounded-full bg-blue-600 flex items-center justify-center">
                  <span className="font-medium text-white text-xs">
                    {session.user.name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("")
                      .substring(0, 2)
                      .toUpperCase() || "U"}
                  </span>
                </div>
              )}
            </button>

            {/* --- ADDED: Dropdown Menu from OldHeader.tsx --- */}
            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-2xl border border-neutral-200/50 p-2 z-20"
                >
                  <div className="p-2 border-b border-neutral-200">
                    <p className="font-bold text-neutral-800">
                      {session.user.name}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {session.user.email}
                    </p>
                  </div>
                  <nav className="mt-2 flex flex-col space-y-1">
                    {pathname !== "/" && (
                      <Link
                        href="/"
                        className="flex items-center gap-3 p-2 rounded-md text-neutral-600 font-medium hover:bg-neutral-100 transition-colors"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <Undo2 size={18} />
                        <span className="text-sm">Home</span>
                      </Link>
                    )}

                    {session.user.role === "admin" && pathname !== "/admin" && (
                      <Link
                        href="/admin"
                        className="flex items-center gap-3 p-2 rounded-md font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <Shield size={18} />
                        <span className="text-sm">Admin Dashboard</span>
                      </Link>
                    )}
                    <button
                      onClick={() => signOut()}
                      className="w-full flex items-center gap-3 p-2 rounded-md text-neutral-600 font-medium hover:bg-neutral-100 transition-colors"
                    >
                      <LogOut size={18} />
                      <span className="text-sm">Logout</span>
                    </button>
                  </nav>
                </motion.div>
              )}
            </AnimatePresence>
            {/* --- END: Dropdown Menu --- */}
          </div>
        ) : (
          // --- UNCHANGED: This login button is perfect ---
          <button
            onClick={() => openModal()}
            className="flex items-center gap-1.5 text-sm font-medium hover:text-gray-300"
          >
            <LogIn size={16} />
            Login
          </button>
        )}
        {/* --- END: Auth Logic Block --- */}
      </div>
    </div>
  );
}
