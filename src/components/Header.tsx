// src/components/Header.tsx

"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { LogoViewerModal } from "./LogoViewerModal";
// --- 1. Import the new data and component ---
import { menuData } from "@/lib/menu-data";
import { MegaMenuItem } from "./MegaMenuItem";

// --- 2. Modify MainMenu to use the new data ---
const MainMenu: React.FC = () => {
  return (
    <nav className="flex flex-grow items-center justify-end gap-6 lg-custom:gap-10">
      {menuData.map((item) => {
        // If a menu item has no columns, render it as a simple button
        if (item.columns.length === 0) {
          return (
            <button
              key={item.title}
              className="flex items-center gap-1 text-sm lg-custom:text-base font-semibold text-neutral-800 hover:text-primary-700 transition-colors"
            >
              <span>{item.title}</span>
              <ChevronDown size={16} />
            </button>
          );
        }

        // Otherwise, render the full MegaMenuItem
        return <MegaMenuItem key={item.title} menuItem={item} />;
      })}
    </nav>
  );
};

// This is the main Header component
export default function Header() {
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);

  return (
    <>
      <header className="w-full bg-neutral-50 text-neutral-800">
        <div className="relative w-full lg-custom:w-[88%] xl-custom:w-[72%] mx-auto flex items-center justify-between px-2 sm:px-6 py-2">
          <div className="flex items-center gap-3 lg-custom:gap-4">
            <button
              onClick={() => setIsLogoModalOpen(true)}
              className="transition-transform duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 rounded-md"
              aria-label="View larger logo"
            >
              <Image
                src="/vibrant-logo.png"
                alt="DSP Intranet Logo"
                width={1024}
                height={1024}
                className="h-10 lg-custom:h-12 w-auto"
              />
            </button>
            <span className="font-semibold text-xl lg-custom:text-2xl font-heading text-primary-700">
              DSP Intranet
            </span>
          </div>

          <MainMenu />
        </div>
      </header>

      <LogoViewerModal
        isOpen={isLogoModalOpen}
        onClose={() => setIsLogoModalOpen(false)}
      />
    </>
  );
}