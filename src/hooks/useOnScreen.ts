// src/hooks/useOnScreen.ts
//
// Is this element on the screen right now? I return a ref, not state, so reading it never draws the page again; it is true while any part of the element is in the window. The three auto-scrolling lists of the home page read it
// in their frame loop and stand still while they are below the fold (nobody sees them move, and every frame of theirs was layout work). With `pauseOffscreenScrollers: false` in src/lib/perf/switches.js it is always true: the previous way.
import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { PERF } from "@/lib/perf/switches";

export function useOnScreen(target: RefObject<Element | null>): MutableRefObject<boolean> {
  const on = useRef(true);
  useEffect(() => {
    const el = target.current;
    if (!PERF.pauseOffscreenScrollers || !el || typeof IntersectionObserver === "undefined") { on.current = true; return; }
    const watch = new IntersectionObserver((entries) => { on.current = entries[entries.length - 1].isIntersecting; });
    watch.observe(el);
    return () => watch.disconnect();
  }, [target]);
  return on;
}
