// src/components/LogoModal.tsx
"use client";

import React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface LogoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LogoModal({ isOpen, onClose }: LogoModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={onClose} // Close modal if background is clicked
          role="dialog"
          aria-modal="true"
          aria-labelledby="logo-modal-title"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="modal-close-button z-[70]" // Ensure button is above image
            aria-label="Close logo view"
          >
            <X size={24} />
          </button>

          {/* Modal Content (Image) */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="relative"
            onClick={(e) => e.stopPropagation()} // Prevent closing modal when clicking image
          >
            <h2 id="logo-modal-title" className="sr-only">SAIL Logo Enlarged</h2>
            <Image
              src="/sail-logo-bw.png"
              alt="SAIL Logo Enlarged"
              width={390} // Respecting 13:14 ratio (390x420)
              height={420}
              className="max-w-full max-h-[80vh] object-contain rounded-md" // Constrain size
              priority
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}