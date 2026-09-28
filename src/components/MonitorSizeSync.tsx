"use client";

import { useEffect } from "react";

/**
 * Classifies the CURRENT physical display as "small" (roughly under 24")
 * or not, and reflects that as a data-attribute on <html>, which
 * globals.css uses to swap --content-width between 80vw (24"+) and 90vw
 * (smaller).
 *
 * Deliberately uses window.screen.width/height, never window.innerWidth:
 *   - screen.width/height describe the physical display's resolution (in
 *     CSS reference pixels), and do NOT change when the user zooms the
 *     page in or out -- innerWidth does, which would make the layout
 *     silently reshuffle just because someone pressed Ctrl/Cmd "+".
 *   - CSS reference pixels are nominally 1/96 inch by spec, which is what
 *     lets sqrt(w^2 + h^2) / 96 approximate the panel's diagonal in real
 *     inches WITHOUT caring whether the underlying panel is 1080p, 1440p or
 *     4K -- OS display scaling already folds that resolution difference
 *     into screen.width/height before JS ever sees it, for any monitor
 *     using its OS-recommended scaling. It is still only an approximation
 *     (browsers do not expose true physical screen size at all), so a
 *     manually overridden, non-standard OS scaling can throw it off.
 *
 * The inline bootstrap script in layout.tsx (<head>, `beforeInteractive`)
 * applies this same classification before the very first paint so there is
 * no flash of the wrong width on load. This component just keeps it correct
 * afterwards -- e.g. if the browser window is dragged from a laptop panel to
 * an external monitor (or back) without a full page reload.
 */
function applyMonitorSizeClass() {
  try {
    const w = window.screen.width;
    const h = window.screen.height;
    const diagonalInches = Math.sqrt(w * w + h * h) / 96;

    if (diagonalInches < 24) {
      document.documentElement.setAttribute("data-monitor-size", "small");
    } else {
      document.documentElement.removeAttribute("data-monitor-size");
    }
  } catch {
    // If anything here fails, fall back to the default (large-monitor,
    // 80vw) sizing rather than risk an inconsistent state.
  }
}

export function MonitorSizeSync() {
  useEffect(() => {
    applyMonitorSizeClass();
    window.addEventListener("resize", applyMonitorSizeClass);
    return () => window.removeEventListener("resize", applyMonitorSizeClass);
  }, []);

  return null;
}
