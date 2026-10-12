// src/lib/ui/inkShift.ts
// The centring maths of the red badge (NewCircularBadge), kept apart so it can be tested without a browser.

/**
 * How far to move a laid-out text so that its INK is optically centred on (targetX, targetY).
 *   originX    x where the text starts (its left edge as laid out)
 *   baselineY  y of its baseline as laid out
 *   ink        the ink as measured: left/right are distances from the origin (left is positive when the ink reaches LEFT of the origin),
 *              ascent/descent are distances above/below the baseline, weightX (optional) is the distance from the origin to the ink's
 *              CENTRE OF WEIGHT (positive = right of the origin)
 *   dpr        device pixels per CSS pixel
 *
 * Horizontally the centre of WEIGHT is used when given, not the middle of the outer edges: a "1" is a heavy stem with a light flag on its left, and the eye
 * takes the stem's side as its centre, so centring its edges leaves it looking too far right. Vertically the middle of the digit's height is used (every
 * digit is equally tall, so its top and bottom margins should match).
 *
 * Snapping: on a 2x or finer screen every move is snapped to a whole device pixel (crisp, and at most half a device pixel off). On a 1x screen a whole-pixel
 * move is too coarse for the horizontal centre (a "1" may need 0.4px), so it is snapped to a quarter pixel instead, which is what text positioning can use;
 * vertically it stays a whole pixel so the digit's top and bottom edges stay sharp.
 */
export function inkShift(args: {
  originX: number;
  baselineY: number;
  ink: { left: number; right: number; ascent: number; descent: number; weightX?: number };
  targetX: number;
  targetY: number;
  dpr: number;
}): { dx: number; dy: number } {
  const inkCenterX = args.originX + (args.ink.weightX !== undefined ? args.ink.weightX : (args.ink.right - args.ink.left) / 2);
  const inkCenterY = args.baselineY + (args.ink.descent - args.ink.ascent) / 2;
  const fine = args.dpr >= 2;
  const stepX = fine ? 1 / args.dpr : 0.25;
  const stepY = 1 / args.dpr;
  const snap = (v: number, step: number) => Math.round(v / step) * step;
  return { dx: snap(args.targetX - inkCenterX, stepX), dy: snap(args.targetY - inkCenterY, stepY) };
}
