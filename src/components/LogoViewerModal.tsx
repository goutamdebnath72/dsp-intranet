// src/components/LogoViewerModal.tsx
"use client";

import React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface LogoViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LogoViewerModal({ isOpen, onClose }: LogoViewerModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()} // Prevents modal from closing when clicking inside it
            className="relative bg-transparent rounded-lg p-2"
          >
            <button
              onClick={onClose}
              className="absolute -top-3 -right-3 z-10 p-1 bg-white rounded-full text-black hover:bg-gray-200 transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <div className="w-[400px] h-[400px] relative">
              <Image
                src="/vibrant-logo.png"
                alt="DSP Intranet Logo - Large"
                fill
                className="object-contain"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
