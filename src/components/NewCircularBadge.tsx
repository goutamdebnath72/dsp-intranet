// src/components/NewCircularBadge.tsx
"use client";
//
// The red circle on the Circulars thumbnail: the number of new circulars (1..9, or "9+").
//
// The number is centred by its VISIBLE INK (horizontally by the centre of its weight), not by the box the font reserves for it. A font reserves the same kind of box for every digit, but the ink
// sits differently in it (a "1" has more empty space on its right than an "8") and vertically the box has room for letters that digits do not use. So
// a number centred as text looks a little off, and by a different amount for each digit and each font. (A fixed nudge of -1px, tried before, could
// only suit one digit in one font.) Here the ink of the actual number is MEASURED in the actual font of the actual screen and moved to the exact
// centre of the circle, snapped to device pixels (to quarter pixels sideways on a 1x screen) so it stays sharp. Works with whatever font the computer provides.

import { useLayoutEffect, useRef } from "react";
import { inkShift } from "@/lib/ui/inkShift";

export const NEW_BADGE_COLOR = "#FF3B30";
const BADGE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "Segoe UI", Roboto, sans-serif';

/**
 * The visible ink of a text, in CSS px, found by DRAWING it on a hidden canvas at 16x resolution and reading which pixels are painted. (The canvas's own
 * "actualBoundingBox" numbers are not reliable for this: in some browsers they are the font's reserved box rounded to whole pixels, not the ink.)
 * The text is drawn at its REAL font size and only MAGNIFIED by a transform: a system font such as SF Pro changes its design with the size (a "Text" cut
 * for small sizes, a "Display" cut for large ones), so drawing it 16 times bigger would measure a different design from the one on screen.
 * Returned in the same terms as actualBoundingBox*: left/right are distances from the text's origin (left is positive when the ink reaches LEFT of the
 * origin), ascent/descent are distances above/below the baseline; weightX is the distance from the origin to the ink's centre of weight (the average
 * position of the painted pixels, each counted by how much of it is painted). null when nothing is drawn.
 */
export function measureInk(
  text: string,
  font: { style: string; weight: string; sizePx: number; family: string },
): { left: number; right: number; ascent: number; descent: number; weightX: number } | null {
  const K = 16;
  const fontString = `${font.style} ${font.weight} ${font.sizePx}px ${font.family}`;
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  probe.font = fontString;
  const advance = probe.measureText(text).width; // CSS px, at the real size
  if (!Number.isFinite(advance)) return null;
  const pad = Math.ceil(font.sizePx * 0.6); // CSS px of room around the text on every side
  const baseline = Math.ceil(font.sizePx * 1.5);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((advance + 2 * pad) * K);
  canvas.height = Math.ceil(font.sizePx * 2.5 * K);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.scale(K, K); // magnify the drawing; the font stays at its real size
  ctx.font = fontString;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#000";
  ctx.fillText(text, pad, baseline);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let sumAlpha = 0;
  let sumAlphaX = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha === 0) continue;
      sumAlpha += alpha;
      sumAlphaX += alpha * (x + 0.5);
      if (alpha >= 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || sumAlpha === 0) return null;
  return {
    left: (pad * K - minX) / K,
    right: (maxX + 1 - pad * K) / K,
    ascent: (baseline * K - minY) / K,
    descent: (maxY + 1 - baseline * K) / K,
    weightX: sumAlphaX / sumAlpha / K - pad,
  };
}

function CenteredText({ text }: { text: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const baselineRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = textRef.current;
    const probe = baselineRef.current;
    const circle = el?.parentElement;
    if (!el || !probe || !circle) return;

    const place = () => {
      el.style.transform = "none"; // measure where the browser laid it out
      const cs = getComputedStyle(el);
      const ink = measureInk(text, { style: cs.fontStyle, weight: cs.fontWeight, sizePx: parseFloat(cs.fontSize), family: cs.fontFamily });
      if (!ink) return; // nothing to centre (or an old browser): leave the number as laid out
      const box = el.getBoundingClientRect();
      const circleBox = circle.getBoundingClientRect();
      const { dx, dy } = inkShift({
        originX: box.left,
        baselineY: probe.getBoundingClientRect().bottom, // an empty inline-block sits ON the baseline: its bottom edge IS the baseline
        ink,
        targetX: circleBox.left + circleBox.width / 2,
        targetY: circleBox.top + circleBox.height / 2,
        dpr: window.devicePixelRatio || 1,
      });
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    place();
    // the font may arrive after the first paint, and the screen scale changes with the browser zoom: measure again then
    const cs0 = getComputedStyle(el);
    void document.fonts?.load(`${cs0.fontStyle} ${cs0.fontWeight} ${cs0.fontSize} ${cs0.fontFamily}`, text).then(place).catch(() => {});
    void document.fonts?.ready.then(place);
    document.fonts?.addEventListener?.("loadingdone", place);
    window.addEventListener("resize", place);
    return () => {
      document.fonts?.removeEventListener?.("loadingdone", place);
      window.removeEventListener("resize", place);
    };
  }, [text]);

  return (
    <span ref={textRef} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
      {text}
      <span ref={baselineRef} aria-hidden style={{ display: "inline-block", width: 0, height: 0 }} />
    </span>
  );
}

export function NewCircularBadge({ count, fontFamily = BADGE_FONT }: { count: number; fontFamily?: string }) {
  const label = count > 9 ? "9+" : count > 0 ? String(count) : "";
  const isWide = label.length > 1;
  // ~25% inside / ~75% outside the top-right corner.
  return (
    <span className="absolute -top-2 -right-2 flex items-center justify-center">
      {/* soft ping halo */}
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: NEW_BADGE_COLOR }} />
      {/* badge body: a circle (a pill for two characters); the number inside is centred by its ink */}
      <span
        data-testid="new-circular-badge"
        className="relative flex items-center justify-center rounded-full text-white"
        style={{
          backgroundColor: NEW_BADGE_COLOR,
          height: "20px",
          width: isWide ? "auto" : "20px",
          minWidth: "20px",
          padding: isWide ? "0 6px" : "0",
          fontFamily,
          fontSize: "12px",
          fontWeight: 500,
          lineHeight: "20px",
          textAlign: "center",
        }}
      >
        <CenteredText text={label} />
      </span>
    </span>
  );
}
