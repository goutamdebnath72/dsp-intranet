// src/components/ProductionGauge.tsx
"use client";

import React, { useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Fira_Code } from "next/font/google"; // A nice monospace font for numbers

// Optional: Monospace font for a "digital" feel
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

// 270 degrees total, starting at -135deg (7 o'clock) and ending at 135deg (5 o'clock)
const START_ANGLE = -135;
const END_ANGLE = 135;
const ANGLE_RANGE = END_ANGLE - START_ANGLE;

export function ProductionGauge({
  value,
  max,
  label,
  unit,
}: ProductionGaugeProps) {
  // 1. Value-to-Angle Mapping
  const angle = useTransform(
    useMotionValue(0), // Start at 0 for animation
    [0, max],
    [START_ANGLE, END_ANGLE]
  );

  // 2. Animated Number Count-up
  const animatedValue = useMotionValue(0);
  const roundedValue = useTransform(animatedValue, (v) => v.toFixed(0));

  // 3. Animation Effect
  useEffect(() => {
    // Animate the needle
    const needleAnimation = animate(angle, value, { // Use raw value for target angle calc? Let's check transform logic. UseTransform handles mapping.
      type: "spring",
      stiffness: 100,
      damping: 20,
      mass: 0.5,
      delay: 0.2,
    });

    // Animate the number count-up
    const numberAnimation = animate(animatedValue, value, {
      type: "spring",
      stiffness: 100,
      damping: 25,
      mass: 0.8,
      delay: 0.2,
    });

    return () => {
      needleAnimation.stop();
      numberAnimation.stop();
    };
  }, [value, max, angle, animatedValue]); // Angle depends on useMotionValue(0), value, max - should be fine.

  return (
    <motion.div
      className="flex flex-col items-center"
      variants={{
        hidden: { opacity: 0, scale: 0.8 },
        visible: { opacity: 1, scale: 1 },
      }}
    >
      {/* --- The Gauge --- */}
      <div className="relative w-full aspect-square max-w-[200px]">
        {/* 1. The Gradient Arc (270 degrees) */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from -135deg, #22c55e 0%, #facc15 50%, #ef4444 100%)",
            maskImage:
              "radial-gradient(transparent 65%, black 66%, black 85%, transparent 86%)",
            WebkitMaskImage:
              "radial-gradient(transparent 65%, black 66%, black 85%, transparent 86%)",
            clipPath: "polygon(0% 0%, 100% 0%, 100% 90%, 50% 90%, 0% 90%)",
          }}
        />

        {/* 2. The Gray Track (The "empty" part of the arc) */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from -135deg, #e5e7eb 0deg, #e5e7eb 270deg)",
            maskImage:
              "radial-gradient(transparent 65%, black 66%, black 85%, transparent 86%)",
            WebkitMaskImage:
              "radial-gradient(transparent 65%, black 66%, black 85%, transparent 86%)",
            clipPath: "polygon(0% 0%, 100% 0%, 100% 90%, 50% 90%, 0% 90%)",
            zIndex: -1,
          }}
        />

        {/* 3. The Needle */}
        <motion.div className="absolute inset-0 z-10" style={{ rotate: angle }}>
          {/* The needle itself, adjusted length */}
          <div
            className="absolute left-1/2 top-1/2 w-1.5 h-[35%] bg-neutral-700 rounded-t-full"
            style={{
              transform: "translate(-50%, -90%)", // Adjusted translation
              transformOrigin: "bottom center",
            }}
          />
          {/* The center hub */}
          <div
            className="absolute left-1/2 top-1/2 w-4 h-4 bg-neutral-800 rounded-full border-2 border-white shadow-md"
            style={{ transform: "translate(-50%, -50%)" }}
          />
        </motion.div>

        {/* 4. The Digital Readout (Figure only, raised) */}
        <div
          className={`absolute left-1/2 top-[40%] flex -translate-x-1/2 -translate-y-1/2 ${firaCode.className}`}
        >
          <motion.span className="text-xl sm:text-2xl md:text-3xl font-bold text-neutral-800">
            {roundedValue}
          </motion.span>
        </div>
      </div>

      {/* --- The Label (Title + Unit) --- */}
      <div className="flex flex-col items-center text-center mt-2 h-12">
        <h3 className="text-xs sm:text-sm font-semibold text-neutral-700 line-clamp-2">
          {label}
        </h3>
        <span className="text-xs text-neutral-500">({unit})</span>
      </div>
    </motion.div>
  );
}