// src/lib/ui/lazyLoad.tsx
//
// LOAD A PIECE OF THE PAGE ONLY WHEN IT IS NEEDED: one place for the two small tools every lazy piece uses, so that no file writes them again.
//  - lazyComponent(loader, "Name"): a component whose code is fetched the first time it is drawn (never on the server: these are windows that open after a click). The loader is the file's own `() => import("...")`,
//    kept by the caller so that it can ALSO be called ahead of time to warm the browser's cache (the same call returns the same, already fetched, file).
//  - whenIdle(fn): runs fn once the browser has nothing better to do (or after a short wait where it has no idle callback), and returns the function that cancels it.
// Used by src/components/TopBar.tsx (the search window and the guide), src/components/managementPanels.ts (the management pages) and src/components/PeopleAndEvents.tsx (the calendar, the confetti). When each is fetched is chosen in src/lib/perf/switches.js.
import dynamic from "next/dynamic";
import type { ComponentProps, ComponentType } from "react";

/** when a lazy piece is fetched besides "when it is first drawn": "pointer" = no earlier than that (the caller warms it itself, e.g. when the pointer reaches a button), "idle" = once the browser is idle, "now" = as soon as this file is loaded */
export type PreloadWhen = "pointer" | "idle" | "now";

/** a component of a file, loaded on first use (the file is named by its loader, the component by its export name; "default" for a default export) and, if asked, fetched ahead (`preload`; the values come from src/lib/perf/switches.js) */
export function lazyComponent<M extends Record<string, unknown>, K extends keyof M & string>(load: () => Promise<M>, name: K, preload: PreloadWhen = "pointer") {
  type P = M[K] extends ComponentType<infer Props> ? Props : ComponentProps<never>;
  if (typeof window !== "undefined") {
    if (preload === "now") void load().catch(() => undefined);
    else if (preload === "idle") whenIdle(() => void load().catch(() => undefined));
  }
  return dynamic<P>(() => load().then((m) => m[name] as ComponentType<P>), { ssr: false });
}

/** run fn when the browser is idle (at the latest after `maxWaitMs`); the returned function cancels it */
export function whenIdle(fn: () => void, maxWaitMs = 4000): () => void {
  if (typeof window === "undefined") return () => undefined;
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: maxWaitMs });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, Math.min(1500, maxWaitMs));
  return () => window.clearTimeout(id);
}
