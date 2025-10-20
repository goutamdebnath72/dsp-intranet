// src/components/Header.tsx

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react'; // 1. IMPORTED THE ICON

// 2. MENU FIXED: Using "THE HUB" menu items
const MainMenu: React.FC = () => {
  const menuItems = [
    'People',
    'Policies',
    'Publications',
    'Downloads',
    "Letters from Hon'ble PM",
    'Licensing',
    'About Us',
  ];

  return (
    <nav className="flex items-center gap-6">
      {menuItems.map((item) => {
        if (item === 'Home') {
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
        // 3. ARROWS ADDED: All other items get the arrow
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
  return (
    // 4. BORDER REMOVED: Outer wrapper is full-width, no border-b
    <header className="w-full bg-neutral-50 text-neutral-800">
      {/* This inner wrapper is "BOXED" to align the content */}
      <div className="w-full lg-custom:w-[72%] xl-custom:w-[70%] mx-auto flex items-center justify-start px-4 sm:px-8 py-3">
        {/* 5. SPACING FIXED: Grouped logo and menu with a gap-8 */}
        <div className="flex items-center gap-8">
          {/* Left Side: Vibrant Logo and "DSP Intranet" text */}
          <div className="flex items-center gap-4">
            <Image
              src="/vibrant-logo.png"
              alt="DSP Intranet Logo"
              width={1024}
              height={1024}
              className="h-10 w-auto"
            />
            {/* 6. TEXT COLOR FIXED: Changed to neutral-800 */}
            <span className="font-semibold text-base font-heading text-primary-700">
              DSP Intranet
            </span>
          </div>

          {/* Right Side: The new menu */}
          <MainMenu />
        </div>
      </div>
    </header>
  );
}