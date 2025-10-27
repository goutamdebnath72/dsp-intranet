// src/components/ProductionDashboard.tsx
"use client";

import React from "react";
import { ProductionGauge } from "./ProductionGauge";
import { motion } from "framer-motion";

// Mock data (Stable version without ticks)
const productionDataStable = [
  { label: "Hot Metal Production", value: 8497, max: 12000, unit: "MT" },
  { label: "Crude Steel Production", value: 8084, max: 12000, unit: "MT" },
  { label: "WRM Production", value: 12357, max: 22000, unit: "MT" },
  { label: "Bar Mill Production", value: 21008, max: 32000, unit: "MT" },
  { label: "USM Production", value: 12754, max: 24000, unit: "MT" },
  { label: "Saleable Steel Production", value: 65088, max: 110000, unit: "MT" },
];

// Animation variants for the container (used by the wrapper in HomepageNew)
export const dashboardContainerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { delay: 0.1, when: "beforeChildren", staggerChildren: 0.05 },
  },
};

// Renamed to avoid confusion, this component is now simpler
export function ProductionDashboard() {
  return (
    // ✅ REMOVED the outer motion.div wrapper with conflicting styles
    // The wrapper is now handled in HomepageNew.tsx
    // Added internal padding with px-*
    <div className="w-full px-4 sm:px-6 lg:px-8">
      <h2 className="text-xl sm:text-2xl font-bold font-heading text-neutral-800 mb-6 text-center">
        Production at a Glance
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 sm:gap-6">
        {productionDataStable.map((gauge) => (
          <ProductionGauge
            key={gauge.label}
            value={gauge.value}
            max={gauge.max}
            label={gauge.label}
            unit={gauge.unit}
            // NO TICK PROPS PASSED
          />
        ))}
      </div>
    </div>
  );
}