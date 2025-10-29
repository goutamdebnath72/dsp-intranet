// src/components/ProductionGauge.tsx
"use client";

import React, { useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Fira_Code } from "next/font/google";

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["500", "700"],
});
interface ProductionGaugeProps {
  value: number;
  max: number;
  label: string;
  unit: string;
}

/**
 * === Tangent-corrected geometry (pure semicircle) ===
 * W = 200 → perfect bounding box
 * Outer radius = 0.92 × (W/2) = 92
 * Center X = 100
 * Center Y = 100 + (100 - 92) = 108
 * Top touches y=0, sides tangent to x=0, x=200
 */
export function ProductionGauge({ value, max, label, unit }: ProductionGaugeProps) {
  const progress = Math.min(Math.max(value / Math.max(max, 1), 0), 1);
  // === Geometry ===
  const W = 200;
  const cx = W / 2;
  const outerR = 0.92 * (W / 2);
  const cy = W / 2 + (W / 2 - outerR);
  const strokeWidth = outerR * 0.10;
  // const arcLength = Math.PI * outerR; // No longer needed

  const startX = cx - outerR;
  const startY = cy;
  const endX = cx + outerR;
  const endY = cy;
  const arcPath = `M ${startX} ${startY} A ${outerR} ${outerR} 0 0 1 ${endX} ${endY}`;
  // === Motion values ===
  const numberMV = useMotionValue(0);
  const roundedNumber = useTransform(numberMV, Math.round);
  const needleMV = useMotionValue(-90); // Needle range is -90deg to +90deg

  // Corrected useEffect dependency array
  useEffect(() => {
    const nAnim = animate(numberMV, value, {
      type: "spring",
      stiffness: 100,
      damping: 24,
      mass: 0.7,
    });

    const targetNeedle = -90 + progress * 180;
    const needleAnim = animate(needleMV, targetNeedle, {
      type: "spring",
      stiffness: 100,
      damping: 20,
      mass: 0.6,
    });

    return () => {
      nAnim.stop();
      needleAnim.stop();
    };
  }, [value, progress]); // Corrected dependency array

  return (
    <motion.div
      className="flex flex-col items-center"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0, scale: 0.98 },
        visible: { opacity: 1, scale: 1 },
      }}
      style={{ width: "100%" }}
    >
      {/* === Gauge container === */}
      <div
        className="relative"
        style={{
          width: "min(14.5vw, 220px)",
          height: "calc(min(14.5vw, 220px) * 0.55)",
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${W / 2 + 20}`}
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full block"
        >
          <defs>
            {/* Gradient restored to Green -> Yellow -> Red */}
            <linearGradient id="gaugeGradient" x1="0%" x2="100%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="50%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>

          {/* === Foreground progress arc === */}
          <path
            d={arcPath}
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* --- THIS IS THE FIX --- */}
          {/* <foreignObject> renders on top of the <path> */}
          <foreignObject
            x="0"
            y="0"
            width={W}
            height={W / 2 + 20}
          // We remove pointerEvents: "none" because the needle *is* the pointer now
          >
            {/* This div becomes the new relative container for HTML elements */}
            <div
              {...{ xmlns: "http://www.w3.org/1999/xhtml" }}
              className="w-full h-full relative" // Use SVG's aspect ratio
            >
              {/* 1. The Text (z-0) */}
              {/* Positioned lower, at 75% from the top of the *viewBox* */}
              <div
                className={`absolute left-1/2 top-[50%] flex -translate-x-1/2 -translate-y-1/2 ${firaCode.className}`}
                style={{ pointerEvents: "none" }} // Text shouldn't block
              >
                <motion.span className="text-xl sm:text-2xl md:text-3xl font-bold text-neutral-800 tracking-normal">
                  {roundedNumber}
                </motion.span>
              </div>

              {/* 2. The Needle (z-10) */}
              {/* This is the HTML needle from your old file, adapted to the new logic */}
              <motion.div
                className="absolute inset-0 z-10"
                // We use the new 180-degree motion value
                style={{
                  rotate: needleMV,
                  // We must redefine the pivot point for the HTML div
                  // It's not (cx, cy) but the center of the viewBox
                  transformOrigin: `${W / 2}px ${cy}px`,
                }}
              >
                {/* The needle shaft */}
                <div
                  className="absolute left-1/2 w-1 bg-neutral-700 rounded-t-full"
                  style={{
                    // Position relative to the new pivot point
                    top: `${cy}px`,
                    height: `${outerR * 0.85}px`, // 35% was for a different container
                    transform: "translate(-50%, -100%)", // Move up from pivot
                    transformOrigin: "bottom center",
                  }}
                />
                {/* The center hub */}
                <div
                  className="absolute left-1/2 w-3 h-3 bg-neutral-800 rounded-full border-2 border-white shadow-md"
                  style={{
                    top: `${cy}px`, // Place at the pivot
                    transform: "translate(-50%, -50%)", // Center it
                  }}
                />
              </motion.div>
            </div>
          </foreignObject>
          {/* --- END OF FIX --- */}

          {/* The SVG needle <motion.g> is now GONE */}
        </svg>
      </div>

      {/* === Label === */}
      <div className="flex flex-col items-center text-center mt-6 h-12">
        <h3 className="text-xs sm:text-sm font-semibold text-neutral-700 line-clamp-2">
          {label.trim()}
        </h3>
        <span className="text-xs text-neutral-500">({unit})</span>
      </div>
    </motion.div>
  );
}