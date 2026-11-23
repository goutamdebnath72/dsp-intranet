// src/components/ImageLightbox.tsx
//
// A PICTURE OPENED OVER THE PAGE, NOT IN A NEW TAB: the same kind of layer as the circular viewer (src/components/CircularViewerLightbox.tsx): a dark full-screen layer above everything (above the search window too), the
// picture as large as the screen allows with its caption and credit, a cross (and Escape, and a click outside the picture) to close it and be back exactly where you were. I keep it free of any topic name: any card may open a picture in it.
//   * I draw it in a portal on <body>, so that the search window's own scaling and clipping cannot shrink or cut it, and it sits above the window (z 400).
//   * Escape closes the PICTURE ONLY. The search window behind it closes on Escape in two places: TopBar's own capture handler on window (which lets an Escape pass when it comes from inside an element marked data-escape-own, as the calculators' dropdown is
//     marked data-select-open), and OmnibarModal's handler. The layer carries data-escape-own (so TopBar leaves that Escape alone) and I take the key in the capture phase and stop it (so OmnibarModal never sees it). The next Escape closes the window, as before.
//   * I lock the page's scrolling while it is open (the shared lock, src/lib/ui/scrollLock.ts) and move the focus to the cross, then back to the thumbnail that opened it.
//   * I give the picture NO background colour of its own: a white one showed as a pale fringe where the picture's edge fell on a half pixel. What shows round it is the dark layer.
//   * I show the size of the picture as it is (for example 606 x 438 px) so that nobody mistakes a small original for a poor display. A picture that is smaller than the screen is shown ENLARGED to fill the layer, up to twice its own size
//     (fitSize), and the caption then says so ("shown 1.8 times larger"); a picture larger than the layer is shrunk to fit. It is never cropped.
"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { lockPageScroll } from "@/lib/ui/scrollLock";

export interface LightboxPicture {
  src: string;
  alt: string;
  /** the line above the picture (what it shows) */
  title: string;
  /** a small pill before the title, such as a date */
  tag?: string | null;
  /** the line under the picture (whose photograph it is) */
  credit?: string;
}

/** I show a picture as large as the room allows, never more than `maxScale` times its own size and never cropped. Returns null when the room or the picture has no size yet. */
export function fitSize(natural: { w: number; h: number }, room: { w: number; h: number }, maxScale = 2): { w: number; h: number; scale: number } | null {
  if (!(natural.w > 0 && natural.h > 0 && room.w > 0 && room.h > 0)) return null;
  const scale = Math.min(room.w / natural.w, room.h / natural.h, maxScale);
  return { w: Math.round(natural.w * scale), h: Math.round(natural.h * scale), scale };
}

/** Takes Escape for the picture: I stop the key on its way down, so no other handler of the page (the search window closes on Escape) sees it. Returns the function that lets go. */
export function onEscape(target: EventTarget, close: () => void): () => void {
  const handler = (e: Event) => {
    if ((e as KeyboardEvent).key !== "Escape") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
  };
  target.addEventListener("keydown", handler, { capture: true });
  return () => target.removeEventListener("keydown", handler, { capture: true });
}

/** I keep the layer itself apart from the portal and the effects, so that it can be drawn and tested on the server. */
export function LightboxView({ picture, onClose, closeRef, onSize, size, display, roomRef }: { picture: LightboxPicture; onClose: () => void; closeRef?: React.Ref<HTMLButtonElement>; onSize?: (w: number, h: number) => void; size?: { w: number; h: number } | null; display?: { w: number; h: number; scale: number } | null; roomRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={picture.title} data-image-lightbox data-escape-own="true" className="fixed inset-0 z-[400] flex flex-col bg-black/90 backdrop-blur-md">
      {/* The dark area itself is a button: a click outside the picture closes it. I keep it out of the tab order, since the cross and Escape are the keyboard's way. */}
      <button type="button" tabIndex={-1} aria-label="Close the picture" data-lightbox-backdrop onClick={onClose} className="absolute inset-0 h-full w-full cursor-default" />
      <header className="relative flex shrink-0 items-center gap-3 border-b border-white/10 bg-black/50 p-3 text-white">
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close the picture" data-lightbox-close className="rounded-full p-1.5 text-white/80 transition hover:scale-110 hover:bg-red-100 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
          <X size={26} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          {picture.tag && <span className="mr-2 inline-block rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-extrabold text-white">{picture.tag}</span>}
          <span className="text-sm font-semibold leading-snug">{picture.title}</span>
        </div>
      </header>
      <div ref={roomRef} className="pointer-events-none relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-3 sm:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={picture.src} alt={picture.alt} data-lightbox-image onLoad={(e) => onSize?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} style={display ? { width: display.w, height: display.h } : undefined} className="pointer-events-auto min-h-0 max-h-full max-w-full shrink-0 rounded-lg object-contain shadow-2xl" />
        <p className="pointer-events-auto shrink-0 rounded-full bg-black/40 px-3 py-1 text-center text-xs text-white/80">
          {picture.credit}{size ? <span data-lightbox-size>{picture.credit ? " · " : ""}{size.w} × {size.h} px{display && display.scale > 1.05 ? `, shown ${display.scale.toFixed(1)} times larger` : ""}</span> : null}
        </p>
      </div>
    </div>
  );
}

export function ImageLightbox({ picture, onClose }: { picture: LightboxPicture | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [room, setRoom] = useState<{ w: number; h: number } | null>(null);
  const roomRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => setMounted(true), []);
  const open = !!picture;
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    setSize(null);
    const lock = lockPageScroll();
    const letGo = onEscape(window, onClose);
    const t = setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      letGo();
      lock.release();
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);
  // The room for the picture is the layer's body, less its padding and the line of the credit; I measure it again when the window changes.
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = roomRef.current;
      if (!el) return;
      const pad = window.innerWidth >= 640 ? 24 : 12;
      setRoom({ w: el.clientWidth - 2 * pad, h: el.clientHeight - 2 * pad - 40 });
    };
    measure();
    const t = setTimeout(measure, 50);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [open, mounted]);
  if (!mounted) return null;
  const display = size && room ? fitSize(size, room) : null;
  return createPortal(
    <AnimatePresence>
      {picture && (
        <motion.div key={picture.src} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <LightboxView picture={picture} onClose={onClose} closeRef={closeRef} roomRef={roomRef} onSize={(w, h) => setSize({ w, h })} size={size} display={display} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
