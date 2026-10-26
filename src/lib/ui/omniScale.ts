// src/lib/ui/omniScale.ts
//
// How much the TEXT of the query modal grows with its width (step 56b).
// The modal used to be a fixed 52rem (832 px at the usual 16 px). Step 54i made it a share of the screen so that the doctors' unit tables do not break, but the text stayed the same size, so on
// a wide screen it looked small next to the width. The text now grows with the width, so that it keeps the proportion it had at 52rem (omniScale.css does the sizing; wide tables opt out with
// the class omni-noscale and keep their size and the room they need).

/** The old width of the modal in px at a 16 px root: the width at which the text proportion was right. */
export const OMNI_BASE_PX = 52 * 16;
/** The text never grows by more than this, however wide the screen (a 1600 px modal would otherwise get 1.9 times the text). */
export const OMNI_MAX_SCALE = 1.5;

/** The factor for a modal that is `widthPx` wide: 1 at the old width or narrower, in proportion to the width above it, at most OMNI_MAX_SCALE; two decimals. */
export function omniScaleFor(widthPx: number, basePx: number = OMNI_BASE_PX, max: number = OMNI_MAX_SCALE): number {
  if (!Number.isFinite(widthPx) || !Number.isFinite(basePx) || basePx <= 0 || widthPx <= basePx) return 1;
  return Math.min(max, Math.round((widthPx / basePx) * 100) / 100);
}
