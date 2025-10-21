// src/components/Header.tsx

"use client"; // --- ADDED: This is the one-line fix ---

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { LogoViewerModal } from "./LogoViewerModal";

const MainMenu: React.FC = () => {
  const menuItems = [
    "People",
    "Policies",
    "Publications",
    "Downloads",
    "Letters from Hon'ble PM",
    "Licensing",
    "About Us",
  ];

  return (
    <nav className="flex items-center gap-6">
      {menuItems.map((item) => {
        if (item === "Home") {
          return (
            <Link
              key={item}
              href="#"
              className="text-xc font-semibold text-neutral-800 hover:text-primary-700 transition-colors"
            >
              {item}
            </Link>
          );
        }
        return (
          <button
            key={item}
            className="flex items-center gap-1 text-sm font-semibold text-neutral-800 hover:text-primary-700 transition-colors"
          >
            <span>{item}</span>
            <ChevronDown size={16} />
          </button>
        );
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
        <div className="w-full lg-custom:w-[72%] xl-custom:w-[70%] mx-auto flex items-center justify-start px-4 sm:px-8 py-3">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
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
                  className="h-10 w-auto"
                />
              </button>
              <span className="font-semibold text-base font-heading text-primary-700">
                DSP Intranet
              </span>
            </div>
            <MainMenu />
          </div>
        </div>
      </header>

      <LogoViewerModal
        isOpen={isLogoModalOpen}
        onClose={() => setIsLogoModalOpen(false)}
      />
    </>
  );
}
