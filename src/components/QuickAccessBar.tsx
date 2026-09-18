// src/components/QuickAccessBar.tsx
"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
// --- MODIFIED: Updated icon imports ---
import {
  Fingerprint,
  FileText,
  MonitorSmartphone,
  Network,
  UserCheck,
  Database,
  AppWindow,
  Mail,
  Handshake, // Added Handshake for SRM
  Users2, // Added Users2 as requested
} from "lucide-react";
// --- ADDED: Import the central links data ---
import { links } from "@/lib/links";
// --- ADDED: Map string names from links.js to icon components ---
const iconMap: { [key: string]: React.ElementType } = {
  Fingerprint,
  FileText,
  MonitorSmartphone,
  Network,
  UserCheck,
  Database,
  AppWindow,
  Mail,
  Handshake, // Added Handshake
  Users2, // Added Users2
  // Siren removed
};
// --- "New circular" badge color. Swap this one value to compare:
//   Adobe red  -> "#FA0F00"
//   macOS red  -> "#FF3B30"
const NEW_BADGE_COLOR = "#FF3B30";

// --- MODIFIED: Define the 8 priority links to pull ---
const priorityLinkTitles = [
  "BAMS",
  "Circular",
  "DSP Online",
  "ERP Portal",
  "ESS",
  "IMS",
  "SRM", // Replaced RACE with SRM
  "SAIL Mail",
];
// --- MODIFIED: Build the list of 8 links ---
const priorityLinks = priorityLinkTitles
  .map((title) =>
    links.find((link) => link.title === title && link.category === "quicklink"),
  ) // Ensure category is quicklink
  .filter((link): link is (typeof links)[0] => !!link);
// Filter out any undefined

// --- ADDED: Manually create the "More Apps" button data ---
const moreAppsLink = {
  title: "More Apps",
  href: "#",
  icon: "AppWindow", // This must be a string
  subtitle: undefined, // Ensure it has the same shape
  category: "internal", // Add category for filtering if needed elsewhere, though not strictly necessary here
  id: -1, // Add a dummy id
};
// --- MODIFIED: Combine the 8 dynamic links + 1 manual button ---
const quickLinks = [...priorityLinks, moreAppsLink];
// 2. Define the props for the main component
interface QuickAccessBarProps {
  onCircularsClick: () => void;
  onMoreAppsClick: () => void;
  hasNewCircular?: boolean;
  newCircularCount?: number;
}

// 3. This is the individual button component
const AccessButton: React.FC<{
  link: (typeof quickLinks)[0];
  // Use the new combined type
  onCircularsClick: () => void;
  onMoreAppsClick: () => void;
  hasNewCircular?: boolean;
  newCircularCount?: number;
}> = ({
  link,
  onCircularsClick,
  onMoreAppsClick,
  hasNewCircular,
  newCircularCount,
}) => {
  // --- MODIFIED: Get icon from the map ---
  // Ensure link.icon is treated as a key of iconMap
  const Icon = iconMap[link.icon as keyof typeof iconMap];
  if (!Icon) {
    console.warn(`Icon not found for: ${link.icon}`);
    // Optionally render a default icon or null
    // For now, let's render a placeholder to avoid breaking layout
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 h-24 w-full bg-[#333333] text-neutral-400 rounded-lg shadow-md italic text-xs">
        Icon Missing
      </div>
    );
  }

  // Shared styles for both button and link
  const className =
    "flex flex-col items-center justify-center gap-2 p-4 h-26 w-full bg-[#333333] text-neutral-200 rounded-lg shadow-md group transition-colors duration-300 hover:bg-primary-700 hover:text-white";
  // --- SPECIAL CASE 1: "Circular" button ---
  if (link.title === "Circular") {
    return (
      <motion.button
        onClick={onCircularsClick}
        className={`${className} relative`}
        whileHover={{ y: -5 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        {hasNewCircular &&
          (() => {
            const count = newCircularCount ?? 0;
            const label = count > 9 ? "9+" : count > 0 ? String(count) : "";
            const isWide = label.length > 1;
            // ~25% inside / ~75% outside the top-right corner.
            return (
              <span className="absolute -top-2 -right-2 flex items-center justify-center">
                {/* soft ping halo */}
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                  style={{ backgroundColor: NEW_BADGE_COLOR }}
                />
                {/* badge body — perfect square (or pill for 2 digits) so the
                    numeral optically centers; SF-style thin, sharp numerals. */}
                <span
                  className="relative flex items-center justify-center rounded-full text-white"
                  style={{
                    backgroundColor: NEW_BADGE_COLOR,
                    height: "20px",
                    width: isWide ? "auto" : "20px",
                    minWidth: "20px",
                    padding: isWide ? "0 6px" : "0",
                    fontFamily:
                      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "Segoe UI", Roboto, sans-serif',
                    fontSize: "12px",
                    fontWeight: 500,
                    lineHeight: "20px",
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                    textAlign: "center",
                  }}
                >
                  <span
                    style={{
                      transform: "translateX(-1.0px)",
                      display: "inline-block",
                    }}
                  >
                    {label}
                  </span>
                </span>
              </span>
            );
          })()}
        <Icon
          size={28}
          className="transition-transform duration-300 
group-hover:scale-110"
        />
        <span className="text-xs font-semibold text-center leading-tight">
          {link.title}
          {link.subtitle && (
            <>
              <br />
              {link.subtitle}
            </>
          )}
        </span>
      </motion.button>
    );
  }

  // --- SPECIAL CASE 2: "More Apps" button ---
  if (link.title === "More Apps") {
    return (
      <motion.button
        onClick={onMoreAppsClick}
        className={className}
        whileHover={{ y: -5 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        <Icon
          size={28}
          className="transition-transform duration-300 group-hover:scale-110"
        />
        <span className="text-xs font-semibold text-center leading-tight">
          {link.title}
        </span>
      </motion.button>
    );
  }

  // Default: Render as a link (BAMS, DSP Online, SRM, etc.)
  return (
    <motion.a
      href={link.href}
      // Only open in new tab if it's an external link
      target={link.href.startsWith("http") ? "_blank" : "_self"}
      rel="noopener noreferrer"
      className={className}
      whileHover={{ y: -5 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Icon
        size={28}
        className="transition-transform duration-300 group-hover:scale-110"
      />
      <span className="text-xs font-semibold text-center leading-tight">
        {link.title}
        {link.subtitle && (
          <>
            <br />
            {link.subtitle}
          </>
        )}
      </span>
    </motion.a>
  );
};

// 4. This is the main bar component
export function QuickAccessBar({
  onCircularsClick,
  onMoreAppsClick,
  hasNewCircular,
  newCircularCount,
}: QuickAccessBarProps) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-4">
      {quickLinks.map(
        (link) =>
          // Ensure link is defined before rendering AccessButton
          link ? (
            <AccessButton
              key={link.title} // Use title or id as key
              link={link}
              onCircularsClick={onCircularsClick}
              onMoreAppsClick={onMoreAppsClick}
              hasNewCircular={hasNewCircular}
              newCircularCount={newCircularCount}
            />
          ) : null, // Don't render if link is somehow undefined
      )}
    </div>
  );
}
