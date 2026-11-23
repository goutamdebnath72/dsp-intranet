// src/components/QuickAccessBar.tsx
"use client";

import { NewCircularBadge } from "./NewCircularBadge";
import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
// --- I updated the icon imports ---
import {
  Fingerprint,
  FileText,
  MonitorSmartphone,
  Network,
  UserCheck,
  Database,
  AppWindow,
  Mail,
  Handshake, // I added Handshake for SRM
  Users2, // Users2 added at my request
} from "lucide-react";
// --- I import the central links data here ---
import { links } from "@/lib/links";
// --- I map the string names from links.js to icon components ---
const iconMap: { [key: string]: React.ElementType } = {
  Fingerprint,
  FileText,
  MonitorSmartphone,
  Network,
  UserCheck,
  Database,
  AppWindow,
  Mail,
  Handshake, // I added Handshake
  Users2, // I added Users2
  // I removed Siren
};
// --- "New circular" badge colour. Change this one value to compare:
//   Adobe red  -> "#FA0F00"
//   macOS red  -> "#FF3B30"

// --- I define the 8 priority links to pull ---
const priorityLinkTitles = [
  "BAMS",
  "Circular",
  "DSP Online",
  "ERP Portal",
  "ESS",
  "IMS",
  "SRM", // I replaced RACE with SRM
  "SAIL Mail",
];
// --- I build the list of 8 links ---
const priorityLinks = priorityLinkTitles
  .map((title) =>
    links.find((link) => link.title === title && link.category === "quicklink"),
  ) // I keep only links whose category is quicklink
  .filter((link): link is (typeof links)[0] => !!link);
// I filter out anything undefined

// --- I create the "More Apps" button data by hand ---
const moreAppsLink = {
  title: "More Apps",
  href: "#",
  icon: "AppWindow", // This has to be a string
  subtitle: undefined, // It must have the same shape as the other links
  category: "internal", // I add a category in case it is needed for filtering elsewhere, though it is not strictly necessary here
  id: -1, // I add a dummy id
};
// --- I combine the 8 dynamic links and the 1 manual button ---
const quickLinks = [...priorityLinks, moreAppsLink];
// Step 2: the props for the main component
interface QuickAccessBarProps {
  onCircularsClick: () => void;
  onMoreAppsClick: () => void;
  hasNewCircular?: boolean;
  newCircularCount?: number;
}

// Step 3: the individual button component
const AccessButton: React.FC<{
  link: (typeof quickLinks)[0];
  // I use the new combined type
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
  // --- I get the icon from the map ---
  // I treat link.icon as a key of iconMap
  const Icon = iconMap[link.icon as keyof typeof iconMap];
  if (!Icon) {
    console.warn(`Icon not found for: ${link.icon}`);
    // A default icon or null could be rendered here.
    // For now I render a placeholder so the layout does not break.
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 h-24 w-full bg-[#333333] text-neutral-400 rounded-lg shadow-md italic text-xs">
        Icon Missing
      </div>
    );
  }

  // Styles shared by the button and the link
  const className =
    "flex flex-col items-center justify-center gap-2 p-4 h-26 w-full bg-[#333333] text-neutral-200 rounded-lg shadow-md group transition-colors duration-300 hover:bg-primary-700 hover:text-white";
  // --- Special case 1: the "Circular" button ---
  if (link.title === "Circular") {
    return (
      <motion.button
        onClick={onCircularsClick}
        className={`${className} relative`}
        whileHover={{ y: -5 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        {hasNewCircular && <NewCircularBadge count={newCircularCount ?? 0} />}
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

  // --- Special case 2: the "More Apps" button ---
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

  // Default: I render it as a link (BAMS, DSP Online, SRM, etc.)
  return (
    <motion.a
      href={link.href}
      // I open a new tab only for an external link
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

// Step 4: the main bar component
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
          // I make sure link is defined before rendering AccessButton
          link ? (
            <AccessButton
              key={link.title} // I use the title or id as the key
              link={link}
              onCircularsClick={onCircularsClick}
              onMoreAppsClick={onMoreAppsClick}
              hasNewCircular={hasNewCircular}
              newCircularCount={newCircularCount}
            />
          ) : null, // I do not render anything if link is somehow undefined
      )}
    </div>
  );
}
