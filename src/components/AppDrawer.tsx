// src/components/AppDrawer.tsx
"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { links } from "@/lib/links";

// --- ADDED: Import all icons from links.js ---
import {
  BookUser,
  Fingerprint,
  Mail,
  ShieldAlert,
  Users,
  Search,
  Siren,
  Truck,
  PackageSearch,
  Globe,
  UserCheck,
  BarChart3,
  Banknote,
  Network,
  Wallet,
  FileText,
  ShieldCheck,
  Smartphone,
  UserCog,
  FilePlus2,
  File,
  ClipboardCheck,
  Database,
  Library,
  Warehouse,
  Boxes,
  Mails,
  ScrollText,
} from "lucide-react";

// --- ADDED: Map string names from links.js to icon components ---
const iconMap: { [key: string]: React.ElementType } = {
  BookUser,
  Fingerprint,
  Mail,
  ShieldAlert,
  Users,
  Search,
  Siren,
  Truck,
  PackageSearch,
  Globe,
  UserCheck,
  BarChart3,
  Banknote,
  Network,
  Wallet,
  FileText,
  ShieldCheck,
  Smartphone,
  UserCog,
  FilePlus2,
  File,
  ClipboardCheck,
  Database,
  Library,
  Warehouse,
  Boxes,
  Mails,
  ScrollText,
};

// --- ADDED: List of links to EXCLUDE (they are already on the bar) ---
const priorityLinkNames = [
  "BAMS (Attendance)",
  "Circulars (Personnel)",
  "DSP Online",
  "ERP Portal",
  "ESS (Employee Self Service)",
  "IMS (Incident Management System)",
  "RACE",
  "SAIL Mail (mail.sail.in)",
  "More Apps",
];

// --- ADDED: Filter links to get only "quicklink" category ---
const allQuickLinks = links.filter((link) => link.category === "quicklink");

// --- ADDED: Filter again to get *only* the links for the drawer ---
const drawerLinks = allQuickLinks.filter(
  (link) => !priorityLinkNames.includes(link.name)
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
          />

          {/* 2. The Slide-Over Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-[70] shadow-2xl flex flex-col"
          >
            {/* 2a. Drawer Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-200 flex-shrink-0">
              <h2 className="text-xl font-bold font-heading text-neutral-800">
                All Quick Links
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full text-neutral-500 bg-transparent transition-all hover:bg-neutral-100 hover:text-neutral-800"
              >
                <X size={24} />
              </button>
            </div>

            {/* 2b. Drawer Content (Scrollable List) */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-2">
              {drawerLinks.map((link) => {
                const IconComponent = iconMap[link.icon as string];
                return (
                  <a
                    key={link.name}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg text-neutral-700 font-medium transition-colors duration-200 hover:bg-primary-50 hover:text-primary-600 group"
                  >
                    {IconComponent && (
                      <IconComponent className="h-5 w-5 text-neutral-500 group-hover:text-primary-600" />
                    )}
                    <span>{link.name}</span>
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
