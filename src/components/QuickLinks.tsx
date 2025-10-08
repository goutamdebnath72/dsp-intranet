"use client";

import React from "react";
import {
  BookUser,
  Fingerprint,
  Mail,
  ShieldAlert,
  Users,
  Search,
  Siren,
} from "lucide-react";
import { motion } from "framer-motion";

const iconMap: { [key: string]: React.ElementType } = {
  BookUser,
  Fingerprint,
  Mail,
  ShieldAlert,
  Users,
  Search,
  Siren,
};

type QuickLinksProps = {
  quickLinksData: {
    id: number;
    href: string;
    name: string;
    icon: string | null;
  }[];
};

const QuickLinks: React.FC<QuickLinksProps> = ({ quickLinksData }) => {
  return (
    <motion.div
      className="bg-white/30 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20 h-[55vh] flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <h2 className="text-xl font-bold font-heading text-neutral-800 mb-4">
        Quick Links
      </h2>

      <nav className="flex-1 overflow-y-auto group scrollbar-thin scrollbar-track-transparent scrollbar-thumb-transparent hover:scrollbar-thumb-neutral-400/50 scroll-smooth">
        <ul className="space-y-2 pb-2">
          {quickLinksData.map((link) => {
            const IconComponent = link.icon ? iconMap[link.icon] : null;
            return (
              <li key={link.id}>
                <a
                  href={link.href}
                  target={link.href.startsWith("http") ? "_blank" : "_self"}
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2 rounded-md text-neutral-700 font-medium transition-colors duration-200 hover:bg-primary-100/50"
                >
                  {IconComponent && <IconComponent className="h-5 w-5" />}
                  <span>{link.name}</span>
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
