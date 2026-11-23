// src/lib/ui/scrollLock.ts
//
// One lock on the page's scrolling, shared by every window that covers the page (the search window, the user guide, the circulars list, an announcement, the home page's circular viewer).
// Each of them used to save <html>'s overflow and padding when it opened and put them back when it closed. When two windows were open at once (the guide over the search window, an announcement
// over it) and closed together (one Escape closes both), they restored in whatever order React happened to clean them up, and the LAST to restore put back the state the first one had
// ALREADY locked: the page stayed locked ("overflow: hidden" and a 15 px shift) until it was refreshed.
// My fix: the first window to ask locks the page and remembers how it was; the last to let go restores it, whatever the order; letting go twice does nothing.

export interface LockTarget {
  style: { overflow: string; paddingRight: string };
  clientWidth: number;
}
export interface LockEnv {
  html: LockTarget;
  innerWidth: number;
}

export interface PageLock {
  /** The width of the page's scrollbar as it was before the first lock, so that a window opened over another still knows it. */
  scrollBarWidth: number;
  release: () => void;
}

let holders = 0;
let saved: { overflow: string; paddingRight: string; bar: number } | null = null;

const browserEnv = (): LockEnv => ({ html: document.documentElement, innerWidth: window.innerWidth });

export function lockPageScroll(env: LockEnv = browserEnv()): PageLock {
  const html = env.html;
  if (holders === 0 || !saved) {
    const bar = Math.max(0, env.innerWidth - html.clientWidth);
    saved = { overflow: html.style.overflow, paddingRight: html.style.paddingRight, bar };
    html.style.overflow = "hidden";
    if (bar > 0) html.style.paddingRight = `${bar}px`;
  }
  holders++;
  let released = false;
  return {
    scrollBarWidth: saved.bar,
    release: () => {
      if (released) return;
      released = true;
      holders = Math.max(0, holders - 1);
      if (holders === 0 && saved) {
        html.style.overflow = saved.overflow;
        html.style.paddingRight = saved.paddingRight;
        saved = null;
      }
    },
  };
}

/** Used by the tests only. */
export function lockHolders(): number {
  return holders;
}
