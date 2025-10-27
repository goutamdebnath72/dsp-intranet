// src/components/ProductionDashboard.tsx
"use client";

import React from "react";
import { ProductionGauge } from "./ProductionGauge";
import { motion } from "framer-motion";

// Mock data based on your reference image
const productionData = [
  {
    label: "Hot Metal Production",
    value: 8497,
    max: 12000, // Example max, we can tweak this
    unit: "MT",
  },
  {
    label: "Crude Steel Production",
    value: 8084,
    max: 12000,
    unit: "MT",
  },
  {
    label: "WRM Production",
    value: 12357, // From gauge, not number
    max: 22000,
    unit: "MT",
  },
  {
    label: "Bar Mill Production",
    value: 21008,
    max: 32000,
    unit: "MT",
  },
  {
    label: "USM Production",
    value: 12754,
    max: 24000,
    unit: "MT",
  },
  {
    label: "Saleable Steel Production",
    value: 65088, // From gauge, not number
    max: 110000,
    unit: "MT",
  },
];

// Animation variants for the container
const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.1,
      when: "beforeChildren",
      staggerChildren: 0.05,
    },
  },
};

export function ProductionDashboard() {
  return (
    <motion.div
      className="w-full lg-custom:w-[72%] xl-custom:w-[70%] mx-auto p-4 sm:p-6 lg:p-8 bg-white rounded-lg mt-8" // mt-8 to space from QuickAccessBar
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <h2 className="text-xl sm:text-2xl font-bold font-heading text-neutral-800 mb-6 text-center">
        Production at a Glance
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 sm:gap-6">
        {productionData.map((gauge) => (
          <ProductionGauge
            key={gauge.label}
            value={gauge.value}
            max={gauge.max}
            label={gauge.label}
            unit={gauge.unit}
          />
        ))}
      </div>
    </motion.div>
  );
}