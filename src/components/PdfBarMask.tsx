// src/components/PdfBarMask.tsx
//
// THE SCROLLBARS INSIDE A PDF FRAME, SHOWN ONLY ON HOVER. The browser's own PDF viewer (inside an <iframe>) draws its own vertical and horizontal scrollbars, always visible, and a page cannot style what is inside it
// (the global rule in globals.css reaches only our own scrolling areas). So the bars are hidden the way a modern interface hides them: two strips painted over the places where the bars sit, in the colour of the
// viewer's own background, and they fade away while the pointer is over the frame (the `group` it sits in is hovered; the hover of a frame counts for the element that holds it).
//   * The strips do not catch the pointer (pointer-events-none): the bars under them still scroll and drag as ever; wheel, trackpad and keys are untouched.
//   * The right strip starts below the viewer's toolbar (56 px in Chrome and Edge), so the toolbar (page number, zoom, print, download) is never covered.
//   * The colour is the viewer's dark background (#282828 in the current Chrome and Edge). A browser that paints it differently shows a faint strip at rest: harmless, and the bars still work.
// Use inside an element that is `relative group` and holds the iframe.
import React from "react";

/** the viewer's own background, behind the page */
export const PDF_VIEWER_BG = "#282828";

export function PdfBarMask() {
  const strip = "pointer-events-none absolute bg-[#282828] opacity-100 transition-opacity duration-200 group-hover:opacity-0";
  return (
    <>
      <span aria-hidden="true" data-pdf-bar-mask="vertical" className={`${strip} right-0 top-14 bottom-0 w-4`} />
      <span aria-hidden="true" data-pdf-bar-mask="horizontal" className={`${strip} bottom-0 left-0 right-0 h-4`} />
    </>
  );
}
