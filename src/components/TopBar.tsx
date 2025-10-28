// src/components/TopBar.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useModal } from "@/context/ModalContext";
import {
  Settings,
  HelpCircle,
  Search,
  LogIn,
  LogOut,
  Shield,
  Undo2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LogoModal } from "./LogoModal"; // Assuming LogoModal is in the same directory

// --- MODIFIED: DspLogoVibrant ---
const DspLogoVibrant: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  return (
    // --- MODIFIED: Added 'group', removed hover:scale ---
    <button
      onClick={onClick}
      className="group flex items-center gap-3 text-left" // <-- Added 'group', removed scaling
    >
      <Image
        src="/sail-logo-bw.png"
        alt="SAIL Logo"
        width={878}
        height={861}
        // --- MODIFIED: Added transition and group-hover:scale ---
        className="h-12 w-auto transition-transform duration-200 group-hover:scale-110" // <-- Added effect here
        priority
      />
      <div>
        <h1 className="text-lg font-bold font-heading text-neutral-100">
          Durgapur Steel Plant
        </h1>
        <p className="text-sm text-neutral-300">
          स्टील अथॉरिटी ऑफ इंडिया लिमिटेड
        </p>
      </div>
    </button>
  );
};

// --- TopBarSearch remains the same ---
const TopBarSearch: React.FC = () => {
  return (
    <div className="relative flex-grow">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
      <input
        type="text"
        placeholder="Search for links, circulars, or people..."
        className="w-full pl-14 pr-4 py-1.5 rounded-full border border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-gray-600 transition-colors duration-300"
      />
    </div>
  );
};

// --- TopBar component ---
export function TopBar() {
  const { data: session, status } = useSession();
  const { openModal } = useModal();
  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // State for Logo Modal
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const openLogoModal = () => setIsLogoModalOpen(true);
  const closeLogoModal = () => setIsLogoModalOpen(false);

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

  return (
    <>
      <div className="bg-[#1a1a1a] text-white px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left Side: The vibrant DSP Logo */}
        <div className="flex-shrink-0">
          <DspLogoVibrant onClick={openLogoModal} />
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
            <Settings size={22} />
          </button>
          <button
            className="p-1 hover:bg-gray-700 rounded-full"
            aria-label="Help"
          >
            <HelpCircle size={22} />
          </button>

          {/* Auth Logic Block */}
          {status === "authenticated" ? (
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="relative w-10 h-10 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500"
              >
                {session.user.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name || "User Avatar"}
                    fill
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-blue-600 flex items-center justify-center">
                    <span className="font-medium text-white text-base">
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
            </div>
          ) : (
            <button
              onClick={() => openModal()}
              className="flex items-center gap-1.5 text-base font-medium hover:text-gray-300"
            >
              <LogIn size={18} />
              Login
            </button>
          )}
        </div>
      </div>

      {/* Render the LogoModal */}
      <LogoModal isOpen={isLogoModalOpen} onClose={closeLogoModal} />
    </>
  );
}