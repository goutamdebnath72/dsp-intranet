// src/components/TopResources.tsx
"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { links } from "@/lib/links";
import Image from "next/image";

// --- Import all possible icons from links.js ---
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
  MonitorSmartphone,
  AppWindow,
  Award,
  Laptop,
  Construction,
  HeartHandshake,
  DraftingCompass,
  Leaf,
  Zap,
  Cog,
  CircuitBoard,
  Landmark,
  Flame,
  Receipt,
  Ruler,
  Gauge,
  HeartPulse,
  Factory,
  Package,
  Lightbulb,
  ClipboardList,
  GanttChartSquare,
  Microscope,
  Shield,
  Map,
  Signal,
  Building,
  Eye,
  Waves,
  Cylinder,
  Train,
  Ship,
  Server,
  Building2,
  Presentation,
  Tractor,
  Settings,
  Briefcase,
} from "lucide-react";

// --- Map string names from links.js to icon components ---
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
  MonitorSmartphone,
  AppWindow,
  Award,
  Laptop,
  Construction,
  HeartHandshake,
  DraftingCompass,
  Leaf,
  Zap,
  Cog,
  CircuitBoard,
  Landmark,
  Flame,
  Receipt,
  Ruler,
  Gauge,
  HeartPulse,
  Factory,
  Package,
  Lightbulb,
  ClipboardList,
  GanttChartSquare,
  Microscope,
  Shield,
  Map,
  Signal,
  Building,
  Eye,
  Waves,
  Cylinder,
  Train,
  Ship,
  Server,
  Building2,
  Presentation,
  Tractor,
  Settings,
  Briefcase,
};

// --- Data for the component ---
const departmentSites = links
  .filter((link) => link.category === "department")
  .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  
const sailSites = links
  .filter((link) => link.category === "sail")
  .sort((a, b) => (a.title || "").localeCompare(b.title || ""));

const tabs = [
  { name: "Department Sites", data: departmentSites },
  { name: "SAIL Sites", data: sailSites },
];

// --- Colors for the grid blocks ---
const bgColors = [
  "bg-green-600",
  "bg-blue-600",
  "bg-indigo-600",
  "bg-purple-600",
  "bg-pink-600",
  "bg-red-600",
  "bg-orange-600",
  "bg-yellow-600",
  "bg-teal-600",
  "bg-cyan-600",
];

// --- The Link Block component ---
const ResourceLink: React.FC<{ link: (typeof links)[0]; color: string }> = ({
  link,
  color,
}) => {
  const isImagePath =
    typeof link.icon === "string" && link.icon.startsWith("/");
  const IconComponent = !isImagePath ? iconMap[link.icon as string] : null;

  return (
    // --- Reverted: Removed ml-1 ---
    <motion.a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-center gap-3 px-2 py-3 rounded-lg text-white font-medium shadow-md transition-shadow duration-300 hover:shadow-lg hover:text-white!important w-[95%] mx-auto ${color}`}
      whileHover={{ scale: 1.05 }} // Framer Motion handles scale and lift
      transition={{ type: "spring", stiffness: 300 }} // Make animation bouncy
    >
      {/* --- MODIFIED: Conditionally size the icon container --- */}
      <div
        className={`flex-shrink-0 ${
          link.icon === "/blast-furnace.png" ? "w-8 h-8" : "w-8 h-6"
        } flex items-center justify-center`}
      >
        {isImagePath ? (
          <Image
            src={link.icon}
            alt={link.title || "Icon"}
            // --- MODIFIED: Conditionally set image dimensions ---
            width={link.icon === "/blast-furnace.png" ? 32 : 24}
            height={link.icon === "/blast-furnace.png" ? 32 : 24}
            className="w-full h-full object-contain"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        ) : IconComponent ? (
          // --- UNCHANGED: Other icons remain w-6 h-6 ---
          <IconComponent className="w-6 h-6 text-white group-hover:text-white!important" />
        ) : (
          // --- UNCHANGED: Fallback remains w-6 h-6 ---
          <Building2 className="w-6 h-6 text-white group-hover:text-white!important" />
        )}
      </div>
      {/* --- Ensured color fix remains --- */}
      <span className="text-sm truncate text-white group-hover:text-white!important">
        {link.title}
      </span>
    </motion.a>
  );
};

// --- The Main Component ---
export function TopResources() {
  const [activeTab, setActiveTab] = useState(tabs[0].name);

  return (
    <div className="flex flex-col h-full">
      {/* 1. Tab Navigation */}
      <div className="flex border-b border-neutral-300 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.name}
            onClick={() => setActiveTab(tab.name)}
            className={`py-2 px-4 text-sm font-semibold transition-colors
              ${
                activeTab === tab.name
                  ? "text-primary-600 border-b-2 border-primary-600"
                  : "text-neutral-500 hover:text-neutral-800"
              }
            `}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {/* 2. Tab Content */}
      {/* --- MODIFIED: Added px-2 for internal padding --- */}
      <div className="flex-1 overflow-y-auto pt-4 px-2 scrollbar-thin scrollbar-thumb-neutral-300 hover:scrollbar-thumb-neutral-400">
        <div className="grid grid-cols-1 gap-3">
          {tabs.map((tab) =>
            activeTab === tab.name ? (
              <motion.div
                key={tab.name}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 gap-3"
              >
                {tab.data.length > 0 ? (
                  tab.data.map((link, index) => (
                    <ResourceLink
                      key={link.title}
                      link={link}
                      color={bgColors[index % bgColors.length]}
                    />
                  ))
                ) : (
                  <p className="text-sm text-neutral-500 p-4 text-center">
                    No links available for this category yet.
                  </p>
                )}
              </motion.div>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}
