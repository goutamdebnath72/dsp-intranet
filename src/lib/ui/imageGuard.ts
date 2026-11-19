// src/lib/ui/imageGuard.ts
//
// PHOTOGRAPHS CANNOT BE SAVED FROM THIS APP (the owner's rule: strictly not; pure helpers, no React). What a web page can and cannot do:
//   * CAN: refuse the browser's own ways of saving a picture: the right-click menu (Save image as, Copy image, Open image in new tab), dragging it out, the long-press menu on a phone, "Print / Save as PDF" (the pictures are not printed), and
//     opening the picture's own address on its own (the server answers only a request that comes from a page showing the picture: `Sec-Fetch-Dest: image`).
//   * CANNOT: stop a screenshot, a photograph of the screen, or someone who reads the network traffic with the browser's developer tools. No website can; this keeps the casual routes shut, not those.
// The browser side is src/components/ImageGuard.tsx and the rules in globals.css; the server side is src/middleware.ts (the public pictures) and the employee photo route.

/** the elements that show a picture: a right-click, a drag or a long press on them is refused */
export const GUARDED_TAGS: ReadonlySet<string> = new Set(["IMG", "CANVAS", "PICTURE", "VIDEO"]);

/** is this the element of a picture (the element itself, or one inside a picture's frame marked `data-photo`)? */
export function isGuardedElement(el: { tagName?: string; closest?: (selector: string) => unknown } | null | undefined): boolean {
  if (!el || typeof el.tagName !== "string") return false;
  if (GUARDED_TAGS.has(el.tagName.toUpperCase())) return true;
  return typeof el.closest === "function" && !!el.closest("[data-photo], [data-photo-open], [data-doc-page-view]");
}

/**
 * May this request for a picture be answered? A browser that loads a picture into a page says so (`Sec-Fetch-Dest: image`); one that was asked to OPEN the picture on its own (the address typed, "Open image in new tab",
 * "Save link as", a download) says `document` or `empty` and is refused. A request that says nothing (an old browser, a program) is not refused here: the browser side still applies, and nothing can be done against a program.
 */
export function imageFetchAllowed(headers: { get(name: string): string | null }): boolean {
  const dest = (headers.get("sec-fetch-dest") ?? "").toLowerCase();
  return dest === "" || dest === "image";
}
