// src/components/MegaMenuItem.tsx

"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { MenuItemData } from "@/lib/menu-data";
import Link from "next/link";

interface MegaMenuItemProps {
    menuItem: MenuItemData;
}

export function MegaMenuItem({ menuItem }: MegaMenuItemProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Click-to-open (was hover). Opening on hover made the mega-menu panel
    // appear on top of / behind the search omnibar while searching. Click
    // control removes that interference entirely: the panel only opens when the
    // user explicitly clicks the item, never while typing in the omnibar.

    // Close on outside click.
    useEffect(() => {
        if (!isOpen) return;
        const handlePointerDown = (e: PointerEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener("pointerdown", handlePointerDown);
        return () =>
            document.removeEventListener("pointerdown", handlePointerDown);
    }, [isOpen]);

    // Close on Escape.
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [isOpen]);

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
        // Positioning handled by the parent in Header.tsx
        <motion.div ref={containerRef}>
            {/* The top-level button (e.g., "People") — now a click toggle */}
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-expanded={isOpen}
                aria-haspopup="true"
                className={`flex items-center gap-1 text-sm lg-custom:text-base font-semibold transition-colors
          ${isOpen ? "text-orange-500" : "text-neutral-800"}
          hover:!text-orange-500
        `}
            >
                <span>{menuItem.title}</span>
                <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                    }`}
                />
            </button>

            {/* The Mega Menu Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        variants={panelVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        // Full-width panel spanning the 'relative' parent in Header.tsx
                        className="absolute left-0 right-0 top-full w-full max-w-none z-50"
                    >
                        {/* Frosted Glass Effect */}
                        <div className="bg-black/60 backdrop-blur-md rounded-b-lg shadow-xl border-x border-b border-white/20 p-6">
                            {/* This is the grid for the columns */}
                            <div className="flex flex-wrap gap-x-8 gap-y-6">
                                {menuItem.columns.map((column) => (
                                    <div key={column.heading} className="flex-shrink-0 w-56">
                                        {/* Column Heading */}
                                        <h3 className="text-sm font-bold text-white mb-3 border-b border-white/50 pb-2">
                                            {column.heading}
                                        </h3>
                                        {/* Column Links */}
                                        <ul className="flex flex-col gap-2 list-none">
                                            {column.links.map((link) => (
                                                <li key={link.label}>
                                                    <Link
                                                        href={link.href}
                                                        onClick={() => setIsOpen(false)}
                                                        className="block text-sm text-white hover:!text-orange-500 hover:pl-1 transition-all duration-150"
                                                    >
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
