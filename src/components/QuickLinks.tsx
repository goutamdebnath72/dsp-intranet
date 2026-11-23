"use client";

import React from "react";
// --- All the relevant icons are imported here ---
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
  Handshake,
  Users2,
  MonitorSmartphone,
} from "lucide-react";
import { motion } from "framer-motion";
// --- Removed: I no longer import from links.js ---
// import { links } from "@/lib/links";

// --- I define the LinkType from the error message (Prisma type) ---
type LinkType = {
  id: number;
  createdAt: Date; // Keep or remove this depending on whether you actually use it
  title: string;
  subtitle: string | null; // Allow null
  href: string;
  icon: string | null; // Allow null
  category: string;
};

// --- I update iconMap ---
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
  Handshake,
  Users2,
  MonitorSmartphone,
};

type QuickLinksProps = {
  // I use the explicitly defined LinkType
  quickLinksData: LinkType[];
  onCircularsClick: () => void; // The function that opens the modal
};

const QuickLinks: React.FC<QuickLinksProps> = ({
  quickLinksData,
  onCircularsClick,
}) => {
  // I filter for quick links directly here in case the parent has not pre-filtered them
  const filteredLinks = quickLinksData.filter(
    (link) => link.category === "quicklink"
  );

  return (
    <motion.div
      className="bg-white/30 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20 h-[370px] flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <h2 className="text-xl font-bold font-heading text-neutral-800 mb-4 flex-shrink-0">
        Quick Links
      </h2>

      <nav className="flex-1 overflow-y-auto group scrollbar-thin scrollbar-track-transparent scrollbar-thumb-transparent hover:scrollbar-thumb-neutral-400/50 scroll-smooth pr-2">
        {" "}
        {/* I added pr-2 */}
        <ul className="space-y-2 pb-2">
          {filteredLinks.map((link) => {
            // --- I handle an icon that may be null ---
            const IconComponent = link.icon
              ? iconMap[link.icon as keyof typeof iconMap]
              : null;

            // I handle the "Circular" button as a special case
            if (link.title === "Circular") {
              return (
                // I use the title as the key because the ID might not be unique if the data source changes
                <li key={link.title}>
                  <button
                    onClick={onCircularsClick}
                    className="w-full flex items-center gap-3 p-2 rounded-md text-neutral-700 font-medium transition-colors duration-200 hover:bg-primary-100/50 text-left group"
                  >
                    {IconComponent ? (
                      <IconComponent className="h-5 w-5 text-neutral-500 group-hover:text-primary-600" />
                    ) : (
                      <div className="w-5 h-5 italic text-xs text-neutral-400">
                        ?
                      </div> // Icon placeholder
                    )}
                    <span>
                      {link.title}
                      {/* I check that the subtitle is not null before rendering */}
                      {link.subtitle && (
                        <span className="text-xs text-neutral-500 ml-1">
                          {link.subtitle}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            }

            // All other links I render as standard anchor tags
            return (
              <li key={link.title}>
                {" "}
                {/* I use the title as the key */}
                <a
                  href={link.href}
                  target={link.href.startsWith("http") ? "_blank" : "_self"}
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2 rounded-md text-neutral-700 font-medium transition-colors duration-200 hover:bg-primary-100/50 group"
                >
                  {IconComponent ? (
                    <IconComponent className="h-5 w-5 text-neutral-500 group-hover:text-primary-600" />
                  ) : (
                    <div className="w-5 h-5 italic text-xs text-neutral-400">
                      ?
                    </div> // Icon placeholder
                  )}
                  <span>
                    {link.title}
                    {/* I check that the subtitle is not null before rendering */}
                    {link.subtitle && (
                      <span className="text-xs text-neutral-500 ml-1">
                        {link.subtitle}
                      </span>
                    )}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </motion.div>
  );
};

export default QuickLinks;
