"use client";

import React from "react";
// --- MODIFIED: Ensure all relevant icons are imported ---
import {
  BookUser,
  Fingerprint,
  Mail,
  ShieldAlert,
  Users,
  Search,
  Siren, // Keep Siren
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
  Handshake, // Add Handshake
  Users2, // Add Users2
  MonitorSmartphone, // Ensure MonitorSmartphone is present
} from "lucide-react";
import { motion } from "framer-motion";
// --- MODIFIED: Import the data array, not a type ---
import { links } from "@/lib/links";

// --- MODIFIED: Infer the type from the imported data ---
type LinkType = (typeof links)[number];

// --- MODIFIED: Update iconMap ---
const iconMap: { [key: string]: React.ElementType } = {
  BookUser,
  Fingerprint,
  Mail,
  ShieldAlert,
  Users,
  Search,
  Siren, // Keep Siren
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
  Handshake, // Add Handshake
  Users2, // Add Users2
  MonitorSmartphone, // Ensure MonitorSmartphone is mapped
};

type QuickLinksProps = {
  // Use the inferred LinkType
  quickLinksData: LinkType[];
  onCircularsClick: () => void; // Function to open the modal
};

const QuickLinks: React.FC<QuickLinksProps> = ({
  quickLinksData,
  onCircularsClick,
}) => {
  // Filter for quick links directly here if not pre-filtered by parent
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
        {/* Added pr-2 */}
        <ul className="space-y-2 pb-2">
          {filteredLinks.map((link) => {
            // Ensure link.icon is treated as a key of iconMap
            const IconComponent = link.icon
              ? iconMap[link.icon as keyof typeof iconMap]
              : null;

            // Special handling for the "Circular" button
            if (link.title === "Circular") {
              return (
                <li key={link.title}>
                  {" "}
                  {/* Use title as key */}
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

            // Render all other links as standard anchor tags
            return (
              <li key={link.title}>
                {" "}
                {/* Use title as key */}
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
