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
import { LogoModal } from "./LogoModal";
import { OmnibarModal } from "./OmnibarModal";
import { getFriendlyFirstName, getInitials } from "@/lib/utils/nameHelper";

// --- DspLogoVibrant ---
const DspLogoVibrant: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 text-left"
    >
      <Image
        src="/sail-logo-bw.png"
        alt="SAIL Logo"
        width={878}
        height={861}
        className="h-12 w-auto transition-transform duration-200 group-hover:scale-110"
        priority
      />
      <div>
        <h1 className="text-lg font-bold font-heading text-neutral-100">
          Durgapur Steel Plant
        </h1>
        <p className="text-sm text-neutral-300">
          स्टील अथॉरिटी ऑफ India लिमिटेड
        </p>
      </div>
    </button>
  );
};

// --- TopBarSearch ---
const searchCategories = [
  "circulars",
  "announcements",
  "departments",
  "happenings",
  "people",
  "links",
];

const TopBarSearch: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // 1. Capture dynamic window dimensions
  useEffect(() => {
    setViewportWidth(window.innerWidth);
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 2. Slot machine timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % searchCategories.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // --- PURE MATHEMATICS LOGIC ---
  const isMounted = viewportWidth > 0;

  const baseWidth = isMounted ? Math.min(384, viewportWidth * 0.8) : 384;
  const expandedWidth = isMounted
    ? Math.min(Math.max(viewportWidth * 0.4, 420), 650)
    : 500;

  const currentWidth = isHovered ? expandedWidth : baseWidth;
  const canAccommodateHelperText = expandedWidth >= 480;

  return (
    <div
      className="relative mx-auto transition-[width] duration-500 ease-out"
      style={{ width: `${currentWidth}px` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Search
        className={`absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors z-10 ${
          isHovered ? "text-primary-400" : "text-neutral-400"
        }`}
      />
      <button
        onClick={onClick}
        className={`w-full flex items-center justify-between gap-3 pl-12 pr-3 py-1.5 rounded-full border text-left focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all duration-300 overflow-hidden ${
          isHovered
            ? "bg-neutral-600 border-neutral-500"
            : "bg-neutral-700 border-neutral-600"
        }`}
      >
        <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-sm h-6">
          <span className="text-neutral-400 font-medium leading-none mt-[2px]">
            Search for
          </span>
          <div className="relative h-full flex-1 min-w-[150px]">
            <AnimatePresence mode="popLayout">
              <motion.span
                key={searchCategories[currentIndex]}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.4, ease: "circOut" }}
                className="absolute inset-y-0 left-0 flex items-center text-white font-medium tracking-wide mt-[2.1px]"
              >
                {searchCategories[currentIndex]}...
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* ✅ Completely removed from DOM unless hovered AND wide enough. Contrast boosted. */}
          <AnimatePresence>
            {isHovered && canAccommodateHelperText && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                // text-sm, font-medium, leading-none, and mt-[2px] match the left text exactly
                className="text-sm font-medium leading-none text-neutral-300 whitespace-nowrap overflow-hidden mt-[2px]"
              >
                Powered by AI Search
              </motion.span>
            )}
          </AnimatePresence>
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-semibold tracking-wider text-neutral-400 bg-neutral-800 rounded border border-neutral-600 shrink-0">
            Ctrl + K
          </kbd>
        </div>
      </button>
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

  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const openLogoModal = () => setIsLogoModalOpen(true);
  const closeLogoModal = () => setIsLogoModalOpen(false);

  const [isOmnibarOpen, setIsOmnibarOpen] = useState(false);

  // ✅ Single, clean keyboard listener with capture mode for robust global interception
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle modal on Cmd+K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyK") {
        e.preventDefault();
        e.stopPropagation();
        setIsOmnibarOpen((prev) => !prev);
      }
      // Close modal on Escape
      if (e.key === "Escape" || e.code === "Escape") {
        setIsOmnibarOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

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

  const ticketNo = (session?.user as any)?.ticketNo || "";
  const isExecutive = ticketNo.toLowerCase().startsWith("4");
  const showAdminDashboard = session?.user?.role === "admin" && isExecutive;

  return (
    <>
      <div className="bg-[#1a1a1a] text-white px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex-shrink-0">
          <DspLogoVibrant onClick={openLogoModal} />
        </div>

        {/* ✅ Middle: Restrictive wrappers removed. TopBarSearch now expands smoothly! */}
        <div className="flex-1 flex justify-center px-4 lg:px-8">
          <TopBarSearch onClick={() => setIsOmnibarOpen(true)} />
        </div>

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

          {status === "authenticated" && session?.user ? (
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
                      {getInitials(session.user.name)}
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
                        Welcome, {getFriendlyFirstName(session.user.name)}
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
                      {showAdminDashboard && pathname !== "/admin" && (
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

      <LogoModal isOpen={isLogoModalOpen} onClose={closeLogoModal} />
      <OmnibarModal isOpen={isOmnibarOpen} setIsOpen={setIsOmnibarOpen} />
    </>
  );
}
