// src/lib/ui/scrollWhenSettled.ts
//
// Opening a circular at a given page (the "Source" bar of a health check-up answer, a search match). On a FIRST visit the page images all load at the
// same time and each one has no height until it arrives, so every page ABOVE the target pushes the target further down as it loads. Scrolling when only
// the target's own image has loaded therefore lands on the wrong place; on a second visit the images are cached, nothing shifts, and it works. So: the
// scroll waits until every image at and above the target has loaded (or failed), which is the moment the target's position is final. The images below
// the target cannot move it and are not waited for.
//
// Pure (the images and the timers are passed in) so that it can be tested without a browser.

export interface ImgLike {
  complete: boolean;
  addEventListener(type: "load" | "error", cb: () => void): void;
  removeEventListener(type: "load" | "error", cb: () => void): void;
}

export interface Timers {
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const realTimers: Timers = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/**
 * Calls `go` (once, always asynchronously) when every image has finished loading or failed, or after `timeoutMs` if one never does.
 * Returns a function that cancels: `go` is then never called and every listener is removed.
 */
export function whenImagesSettled(imgs: ImgLike[], go: () => void, opts: { timeoutMs?: number; timers?: Timers } = {}): () => void {
  const timers = opts.timers ?? realTimers;
  let finished = false;
  let cancelled = false;
  let timeoutId: unknown;
  const handlers = new Map<ImgLike, () => void>();
  const pending = new Set<ImgLike>(imgs.filter((i) => !i.complete));

  const detach = () => {
    for (const [img, h] of handlers) {
      img.removeEventListener("load", h);
      img.removeEventListener("error", h);
    }
    handlers.clear();
    timers.clearTimeout(timeoutId);
  };
  const finish = () => {
    if (finished || cancelled) return;
    finished = true;
    detach();
    go();
  };
  const cancel = () => {
    cancelled = true;
    detach();
  };

  if (pending.size === 0) {
    timeoutId = timers.setTimeout(finish, 0); // nothing to wait for (cached): still asynchronous, after the page has been laid out
    return cancel;
  }
  for (const img of pending) {
    const h = () => {
      pending.delete(img);
      if (pending.size === 0) finish();
    };
    handlers.set(img, h);
    img.addEventListener("load", h);
    img.addEventListener("error", h); // a page that fails to load must not block the scroll for ever
  }
  timeoutId = timers.setTimeout(finish, opts.timeoutMs ?? 10_000);
  return cancel;
}

/** After the scroll: is the target where it was meant to be (its top at the scroll margin of the viewport's top, give or take `tolerance` pixels)? */
export function isAligned(targetTop: number, viewTop: number, scrollMargin: number, tolerance = 24): boolean {
  return Math.abs(targetTop - viewTop - scrollMargin) <= tolerance;
}
