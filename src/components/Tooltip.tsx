'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type TooltipProps = {
    children: React.ReactNode;
    content: string;
};

export const Tooltip: React.FC<TooltipProps> = ({ children, content }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {children}
            <AnimatePresence>
                {isHovered && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-semibold text-white shadow-lg"
                    >
                        {/* THIS IS THE FIX: Changed classes to position the arrow on the left */}
                        <div className="absolute left-4 top-full -translate-x-1/2 border-x-8 border-x-transparent border-t-8 border-t-neutral-800" />
                        {content}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};