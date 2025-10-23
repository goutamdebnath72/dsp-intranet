// src/components/Tooltip.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

type TooltipProps = {
  children: React.ReactNode;
  content: string;
  className?: string;
};

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  className,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const childRef = useRef<HTMLDivElement>(null);

  // --- 1. REMOVED: Mouse position state ---

  useEffect(() => {
    if (isHovered && childRef.current) {
      const rect = childRef.current.getBoundingClientRect();
      // --- 2. MODIFY: Use rect for both TOP and LEFT ---
      setPosition({
        top: rect.top + window.scrollY - 40, // Your desired 40px offset
        left: rect.left + window.scrollX + rect.width / 2, // Center of the column
      });
    }
  }, [isHovered]); // --- 3. MODIFY: Only re-run when hover state changes ---

  // --- 4. REMOVED: handleMouseMove function ---

  const tooltipContent = (
    <AnimatePresence>
      {isHovered && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{
            position: "absolute",
            top: position.top,
            left: position.left,
            // This transform now centers the tooltip on the column's center line
            transform: "translate(-50%, -100%)",
            zIndex: 9999,
          }}
          className="whitespace-nowrap rounded-md bg-black/50 backdrop-blur-sm px-3 py-1.5 text-base font-bold text-white shadow-lg pointer-events-none"
        >
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      ref={childRef}
      className={`relative ${className || "inline-block"}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      // --- 5. REMOVED: onMouseMove listener ---
    >
      {children}
      {typeof window !== "undefined" &&
        createPortal(tooltipContent, document.body)}
    </div>
  );
};
