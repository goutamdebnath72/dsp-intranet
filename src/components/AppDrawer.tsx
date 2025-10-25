// src/components/AppDrawer.tsx
"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { links } from "@/lib/links";

// --- Import all possible icons needed for the DRAWER ---
// (Includes Siren for RACE, excludes Handshake/Users2 if not used by other drawer items)
import {
  BookUser, Fingerprint, Mail, ShieldAlert, Users, Search, Siren, // Keep Siren
  Truck, PackageSearch, Globe, UserCheck, BarChart3, Banknote, Network,
  Wallet, FileText, ShieldCheck, Smartphone, UserCog, FilePlus2, File,
  ClipboardCheck, Database, Library, Warehouse, Boxes, Mails, ScrollText,
  MonitorSmartphone, AppWindow, Users2, // Keep Users2 imported just in case
  // Handshake likely removed if SRM is the only item using it and SRM is not in drawer
} from "lucide-react";

// --- Map string names from links.js to icon components needed for the DRAWER ---
const iconMap: { [key: string]: React.ElementType } = {
  BookUser, Fingerprint, Mail, ShieldAlert, Users, Search, Siren, // Keep Siren
  Truck, PackageSearch, Globe, UserCheck, BarChart3, Banknote, Network,
  Wallet, FileText, ShieldCheck, Smartphone, UserCog, FilePlus2, File,
  ClipboardCheck, Database, Library, Warehouse, Boxes, Mails, ScrollText,
  MonitorSmartphone, AppWindow, Users2 // Keep Users2 mapped
  // Handshake likely removed
};

// --- MODIFIED: List of links to EXCLUDE (they are on the main bar) ---
const priorityLinkTitles = [
  "BAMS",
  "Circular",
  "DSP Online",
  "ERP Portal",
  "ESS",
  "IMS",
  "SRM", // SRM is now excluded
  "SAIL Mail",
  "More Apps", // Exclude the button itself
];

// Filter links to get only "quicklink" category
const allQuickLinks = links.filter((link) => link.category === "quicklink");

// Filter again to get *only* the links for the drawer (excluding those on the bar)
const drawerLinks = allQuickLinks.filter(
  (link) => !priorityLinkTitles.includes(link.title)
);

interface AppDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppDrawer({ isOpen, onClose }: AppDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 1. The Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* 2. The Slide-Over Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-[70] shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-drawer-title"
          >
            {/* 2a. Drawer Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-200 flex-shrink-0">
              <h2
                id="app-drawer-title"
                className="text-xl font-bold font-heading text-neutral-800"
              >
                All Quick Links
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full text-neutral-500 bg-transparent transition-all hover:bg-neutral-100 hover:text-neutral-800"
                aria-label="Close"
              >
                <X size={24} />
              </button>
            </div>

            {/* 2b. Drawer Content (Scrollable List) */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-2">
              {drawerLinks.map((link) => {
                // Ensure link.icon is treated as a key of iconMap
                const IconComponent = iconMap[link.icon as keyof typeof iconMap];
                return (
                  <a
                    key={link.title} // Title is unique within the drawer list
                    href={link.href}
                    target={link.href.startsWith("http") ? "_blank" : "_self"}
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg text-neutral-700 font-medium transition-colors duration-200 hover:bg-primary-50 hover:text-primary-600 group"
                  >
                    {IconComponent ? (
                      <IconComponent className="h-5 w-5 text-neutral-500 group-hover:text-primary-600" />
                    ) : (
                      <div className="w-5 h-5 italic text-xs text-neutral-400">?</div> // Placeholder if icon is missing
                    )}
                    {/* Display title and subtitle if present */}
                    <span>
                      {link.title}
                      {link.subtitle && <span className="text-xs text-neutral-500 ml-1">{link.subtitle}</span>}
                     </span>
                  </a>
                );
              })}
            </nav>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
