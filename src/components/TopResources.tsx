// src/components/TopResources.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { links } from "@/lib/links";
import Image from "next/image";
import { SCROLL_CONFIG, DIRECTION } from "@/lib/SCROLL_CONFIG";
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

const ResourceLink: React.FC<{ link: (typeof links)[0]; color: string }> = ({
  link,
  color,
}) => {
  const isImagePath =
    typeof link.icon === "string" && link.icon.startsWith("/");
  const IconComponent = !isImagePath ? iconMap[link.icon as string] : null;

  return (
    <motion.a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-center gap-3 px-2 py-3 rounded-lg text-white font-medium shadow-md transition-shadow duration-300 hover:shadow-lg w-[95%] mx-auto ${color}`}
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <div
        className={`flex-shrink-0 ${
          link.icon === "/blast-furnace.png" ? "w-8 h-8" : "w-8 h-6"
        } flex items-center justify-center`}
      >
        {isImagePath ? (
          <Image
            src={link.icon}
            alt={link.title || "Icon"}
            width={link.icon === "/blast-furnace.png" ? 32 : 24}
            height={link.icon === "/blast-furnace.png" ? 32 : 24}
            className="w-full h-full object-contain"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        ) : IconComponent ? (
          <IconComponent className="w-6 h-6 text-white" />
        ) : (
          <Building2 className="w-6 h-6 text-white" />
        )}
      </div>
      <span className="text-sm truncate">{link.title}</span>
    </motion.a>
  );
};

export function TopResources() {
  const [activeTab, setActiveTab] = useState(tabs[0].name);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isHoveringRef = useRef(false);
  const listHeightRef = useRef(0);

  const direction = SCROLL_CONFIG.topResourcesDirection;
  const speedPxPerSec = SCROLL_CONFIG.speedPxPerSec;

  useEffect(() => {
    const onResize = () => {
      const listEl = listRef.current;
      if (listEl) listHeightRef.current = listEl.scrollHeight / 2;
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [activeTab]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const listEl = listRef.current;
    if (!scrollEl || !listEl) return;

    listHeightRef.current = listEl.scrollHeight / 2;
    let rafId: number | null = null;
    let lastTs = performance.now();
    let accumulated = scrollEl.scrollTop;

    const tick = (ts: number) => {
      if (!scrollEl) return;
      const dt = Math.min(40, ts - lastTs);
      lastTs = ts;

      if (!isHoveringRef.current) {
        const h = listHeightRef.current;
        if (h > 0 && scrollEl.scrollHeight > scrollEl.clientHeight) {
          accumulated += (speedPxPerSec * dt * direction) / 1000;
          if (accumulated >= h && direction === 1) accumulated -= h;
          else if (accumulated <= 0 && direction === -1) accumulated += h;
          scrollEl.scrollTop = accumulated;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    const startup = setTimeout(() => {
      lastTs = performance.now();
      rafId = requestAnimationFrame(tick);
    }, 700);

    return () => {
      clearTimeout(startup);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [activeTab, direction, speedPxPerSec]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-neutral-300 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.name}
            onClick={() => setActiveTab(tab.name)}
            className={`py-2 px-4 text-sm font-semibold transition-colors ${
              activeTab === tab.name
                ? "text-primary-600 border-b-2 border-primary-600"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        onMouseEnter={() => (isHoveringRef.current = true)}
        onMouseLeave={() => (isHoveringRef.current = false)}
        className="flex-1 overflow-y-auto pt-4 px-2 scrollbar-thin scrollbar-thumb-neutral-300 hover:scrollbar-thumb-neutral-400"
        style={{ overflowAnchor: "none" }}
      >
        <div ref={listRef} className="flex flex-col">
          {[
            ...tabs.find((t) => t.name === activeTab)!.data,
            ...tabs.find((t) => t.name === activeTab)!.data,
          ].map((link, index) => {
            const color = bgColors[index % bgColors.length];
            return (
              <React.Fragment key={`${link.title}-${index}`}>
                <ResourceLink link={link} color={color} />
                <div
                  style={{ height: SCROLL_CONFIG.gapHeight }}
                  aria-hidden="true"
                />
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
