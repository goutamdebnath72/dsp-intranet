// src/components/Tooltip.tsx
"use client";

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

type TooltipAlign = "center" | "left" | "right";

type TooltipProps = {
  children: React.ReactNode;
  content: string;
  className?: string;
  /**
   * How the tooltip bubble aligns to the trigger:
   *  - "center" (default): bubble centre aligned to trigger centre.
   *  - "left": bubble LEFT edge aligned to trigger LEFT edge (extends right).
   *  - "right": bubble RIGHT edge aligned to trigger RIGHT edge (extends left).
   */
  align?: TooltipAlign;
};

// Avoid the SSR warning for useLayoutEffect; behaves as layout effect in browser.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  className,
  align = "center",
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const childRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Measure AFTER the bubble is in the DOM so we know its real width, then
  // compute the final left in pixels for the requested alignment. No CSS
  // transform is used for horizontal placement — the left value is exact.
  useIsoLayoutEffect(() => {
    if (!isHovered || !childRef.current || !bubbleRef.current) return;
    const trigger = childRef.current.getBoundingClientRect();
    const bubbleW = bubbleRef.current.offsetWidth;

    // Trigger edges in document space.
    const tLeft = trigger.left + window.scrollX;
    const tRight = trigger.right + window.scrollX;
    const tCenter = tLeft + trigger.width / 2;

    let left: number;
    if (align === "right") {
      left = tRight - bubbleW; // bubble RIGHT edge == trigger RIGHT edge
    } else if (align === "left") {
      left = tLeft; // bubble LEFT edge == trigger LEFT edge
    } else {
      left = tCenter - bubbleW / 2; // bubble centre == trigger centre
    }

    const top = trigger.top + window.scrollY - 40; // 40px above trigger
    setCoords({ top, left });
  }, [isHovered, align, content]);

  const tooltipContent = (
    <AnimatePresence>
      {isHovered && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          ref={bubbleRef}
          style={{
            position: "absolute",
            top: coords.top,
            left: coords.left,
            // Vertical lift only; NO horizontal transform (left is exact px).
            transform: "translateY(-100%)",
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
    >
      {children}
      {typeof window !== "undefined" &&
        createPortal(tooltipContent, document.body)}
    </div>
  );
};
