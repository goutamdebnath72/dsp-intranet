// src/components/ImageGuard.tsx
//
// THE BROWSER SIDE OF "PHOTOGRAPHS CANNOT BE SAVED" (rules and limits: src/lib/ui/imageGuard.ts; the CSS side, no dragging and nothing printed, is in globals.css). It is mounted once in the root layout. Anywhere in the app it refuses,
// the right-click menu and the drag of a picture (an <img>, a <canvas>, a <video>, or anything inside a picture's frame). I listen in the capture phase on the document, so a picture added later is covered too, and I
// never touch the page's own clicks (a picture still opens full size when it is clicked).
"use client";

import { useEffect } from "react";
import { isGuardedElement } from "@/lib/ui/imageGuard";

export default function ImageGuard() {
  useEffect(() => {
    const refuse = (e: Event) => { if (isGuardedElement(e.target as Element | null)) e.preventDefault(); };
    document.addEventListener("contextmenu", refuse, true);
    document.addEventListener("dragstart", refuse, true);
    return () => {
      document.removeEventListener("contextmenu", refuse, true);
      document.removeEventListener("dragstart", refuse, true);
    };
  }, []);
  return null;
}
