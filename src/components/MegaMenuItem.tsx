// src/components/MegaMenuItem.tsx

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { MenuItemData } from "@/lib/menu-data";
import Link from "next/link";

interface MegaMenuItemProps {
    menuItem: MenuItemData;
}

export function MegaMenuItem({ menuItem }: MegaMenuItemProps) {
    const [isOpen, setIsOpen] = useState(false);
    // Animation variants for the dropdown panel
    const panelVariants = {
        hidden: {
            opacity: 0,
            y: -10,
            transition: { duration: 0.2, ease: "easeOut" },
        },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.3, ease: "easeIn" },
        },
    };
    return (
        // --- FIX 1: Remove 'relative' ---
        // The positioning will be handled by the parent in Header.tsx
        <motion.div
            onHoverStart={() => setIsOpen(true)}
            onHoverEnd={() => setIsOpen(false)}
        >
            {/* The top-level button (e.g., "People") */}
            <button
                className={`flex items-center gap-1 text-sm lg-custom:text-base font-semibold transition-colors
          ${isOpen ? "text-orange-500" : "text-neutral-800"}
          hover:!text-orange-500
        `}
            >
                <span>{menuItem.title}</span>
                <ChevronDown size={16} />
            </button>

            {/* The Mega Menu Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        variants={panelVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        // --- FIX 2: Full-width positioning ---
                        // Makes the panel span the full width of the 'relative' parent in Header.tsx
                        className="absolute left-0 right-0 top-full w-full max-w-none z-50"
                    >
                        {/* --- FIX 3: Styling for the panel ---
             - 'rounded-b-lg' makes it connect to the header.
             - 'border-x border-b' creates the frame.
            */}
                        {/* --- MODIFIED: Frosted Glass Effect --- */}
                        <div className="bg-black/60 backdrop-blur-md rounded-b-lg shadow-xl border-x border-b border-white/20 p-6">
                            {/* This is the grid for the columns */}
                            <div className="flex flex-wrap gap-x-8 gap-y-6">
                                {menuItem.columns.map((column) => (
                                    <div key={column.heading} className="flex-shrink-0 w-56">
                                        {/* --- MODIFIED: Column Heading --- */}
                                        <h3 className="text-sm font-bold text-white mb-3 border-b border-white/50 pb-2">
                                            {column.heading}
                                        </h3>
                                        {/* --- MODIFIED: Column Links --- */}
                                        <ul className="flex flex-col gap-2 list-none">
                                            {column.links.map((link) => (
                                                <li key={link.label}>
                                                    <Link
                                                        href={link.href}
                                                        className="block text-sm text-white hover:!text-orange-500 hover:pl-1 transition-all duration-150"
                                                    >
                                                        {/* The ... typo is now removed */}
                                                        {link.label}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}