// src/components/OfflineBanner.tsx
//
// THE RED MESSAGE for a computer that is not online: a Wi-Fi symbol with a line struck through it, in red, at the top of the search window, said as soon as the connection is lost and gone as
// soon as it returns. While it shows, the search is not sent (it could not arrive); the calculators and unit converters, which run in the browser, still work.
"use client";

import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { WifiOff } from "lucide-react";
import { offlineAdvice } from "@/lib/net/online";

export function OfflineBanner({ online, browserOnline = true }: { online: boolean; browserOnline?: boolean }) {
  const calm = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {!online && (
        <motion.div
          key="offline"
          role="alert"
          aria-live="assertive"
          initial={calm ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="overflow-hidden"
        >
          <div className="mx-2 mt-2 flex items-start gap-3 rounded-2xl border border-red-300 bg-gradient-to-r from-red-50 via-rose-50 to-red-50 px-4 py-3 text-red-800 shadow-sm shadow-red-500/10">
            <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-md shadow-red-600/30">
              <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30" aria-hidden="true" />
              <WifiOff size={18} strokeWidth={2.4} className="relative" aria-hidden="true" />
            </span>
            <div className="min-w-0 text-sm leading-snug">
              <p className="font-bold">You are offline</p>
              <p className="text-red-700">{offlineAdvice(browserOnline)}</p>
              <p className="mt-1 text-xs text-red-600/90">Searching and live data (exchange rates, markets, news) need the internet. Calculators and unit converters still work. This message goes away by itself when the connection returns.</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
