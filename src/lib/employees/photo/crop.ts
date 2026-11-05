// src/lib/employees/photo/crop.ts
//
// THE SQUARE AROUND A FACE (pure arithmetic, used by the browser; step 70). Given the box a face finder returned and the size of the picture, it says which square to cut so that the head, the hair and a margin are INSIDE,
// or, in words, why it cannot be done. Nothing is ever stretched or squeezed (a square is cut out); nothing is ever cut off the head (if the head does not fit with room around it, the photo is refused).

export interface Box { x: number; y: number; width: number; height: number }
export interface Square { left: number; top: number; size: number }

export const PHOTO = {
  maxBytes: 8 * 1024 * 1024,   // what the person may choose (the browser makes the square, so what is sent is far smaller)
  serverMaxBytes: 4 * 1024 * 1024, // what the server accepts (a request over 4.5 MB is refused by the host)
  minSide: 400,                // the chosen picture is at least this on its short side
  minCrop: 320,                // the square cut out is at least this (a smaller one would be blurred)
  cutMax: 1200,                // the square sent is made no larger than this
  master: 1000,                // the large copy kept
  thumb: 160,                  // the small copy kept
} as const;

export type CropResult = { ok: true; square: Square } | { ok: false; reason: string };

export function squareAround(face: Box, imgW: number, imgH: number): CropResult {
  // a face box reaches from the brow to the chin: the hair adds about 0.4 of its height above, the neck 0.15 below, and 0.25 of its width at each side
  const head = { left: face.x - 0.25 * face.width, right: face.x + 1.25 * face.width, top: face.y - 0.4 * face.height, bottom: face.y + 1.15 * face.height };
  const headH = head.bottom - head.top, headW = head.right - head.left;
  // the head fills about half of the height (like an ID photo)
  let size = Math.round(Math.max(headH / 0.55, headW / 0.7));
  size = Math.min(size, Math.floor(imgW), Math.floor(imgH));
  if (size < PHOTO.minCrop) return { ok: false, reason: "The face is too small in this photo. Use a closer, higher-resolution photo." };
  // headroom above the hair is 18% of the square; the face is centred sideways
  let top = Math.round(head.top - 0.18 * size);
  let left = Math.round((head.left + head.right) / 2 - size / 2);
  top = Math.min(Math.max(0, top), Math.floor(imgH) - size);
  left = Math.min(Math.max(0, left), Math.floor(imgW) - size);
  // the head must be wholly inside, or there is no room around the face
  if (head.left < left || head.right > left + size || head.top < top || head.bottom > top + size) {
    return { ok: false, reason: "The head is too close to the edge of this photo. Use a photo with more space around the head." };
  }
  return { ok: true, square: { left, top, size } };
}
