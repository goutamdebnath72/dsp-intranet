// src/components/TopResources.tsx
"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { links } from "@/lib/links";
import Image from "next/image"; // Import Next.js Image

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
// It now reads from your centralized links.js
const departmentSites = links.filter((link) => link.category === "department");
const sailSites = links
  .filter((link) => link.category === "sail")
  // --- FIX 1: Provide fallback for sort ---
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
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-3 p-3 rounded-lg text-white font-medium shadow-md transition-all duration-300 transform hover:scale-105 hover:shadow-lg ${color}`}
    >
      <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
        {isImagePath ? (
          <Image
            src={link.icon}
            // --- FIX 2: Provide fallback for alt text ---
            alt={link.title || "Icon"}
            width={24}
            height={24}
            className="w-full h-full object-contain"
            // This filter makes your PNGs white to match the design
            style={{ filter: "brightness(0) invert(1)" }}
          />
        ) : IconComponent ? (
          <IconComponent className="w-6 h-6" />
        ) : (
          <Building2 className="w-6 h-6" /> // Default fallback icon
        )}
      </div>
      <span className="text-sm truncate">{link.title}</span>
    </a>
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
      <div className="flex-1 overflow-y-auto pt-4 pr-2 -mr-2 scrollbar-thin scrollbar-thumb-neutral-300 hover:scrollbar-thumb-neutral-400">
        <div className="grid grid-cols-1 gap-3">
          {tabs.map((tab) =>
            activeTab === tab.name ? (
              <motion.div
                key={tab.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
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
