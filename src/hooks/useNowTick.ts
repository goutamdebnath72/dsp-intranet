// src/hooks/useNowTick.ts
"use client";

import { useEffect, useState } from "react";

/** Returns the current timestamp (ms), updating every `intervalMs`.
 *  Use ONE of these per component that needs to show elapsed/live time,
 *  even if multiple rows/items need to react to it -- a single shared tick
 *  re-renders all of them together, instead of one setInterval per row. */
export function useNowTick(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
