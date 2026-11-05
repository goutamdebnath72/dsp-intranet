"use client";

// src/lib/employees/photo/browserDeps.ts
//
// THE REAL BROWSER PARTS of the photo check (step 70): decode the file (the browser turns a phone photo upright by itself), find faces with a small model (TinyFaceDetector, 190 KB, kept in /public/models/face; the finder
// itself, @vladmandic/face-api, is loaded only when a photo is chosen), cut the square on a canvas. The picture never leaves the PC until the employee is saved.

import { PHOTO, type Box, type Square } from "./crop";
import type { PhotoDeps } from "./client";

let finder: Promise<typeof import("@vladmandic/face-api")> | null = null;
function loadFinder() {
  if (!finder) {
    finder = (async () => {
      const api = await import("@vladmandic/face-api");
      await api.nets.tinyFaceDetector.loadFromUri("/models/face");
      return api;
    })();
    finder.catch(() => { finder = null; }); // a failed start can be tried again
  }
  return finder;
}

export const browserPhotoDeps: PhotoDeps = {
  async decode(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight, source: img };
    } finally { URL.revokeObjectURL(url); }
  },
  async detect(source, width, height): Promise<Box[]> {
    const api = await loadFinder();
    const scale = Math.min(1, 960 / Math.max(width, height));

    const scan = async (inputSize: 128 | 160 | 224 | 320 | 416 | 512 | 608, threshold: number) => {
      const c = document.createElement("canvas");
      c.width = Math.round(width * scale);
      c.height = Math.round(height * scale);
      c.getContext("2d")!.drawImage(source as CanvasImageSource, 0, 0, c.width, c.height);
      return api.detectAllFaces(c, new api.TinyFaceDetectorOptions({ inputSize, scoreThreshold: threshold }));
    };

    const filterDominant = (hits: Array<{ box: { x: number; y: number; width: number; height: number } }>) => {
      if (hits.length <= 1) return hits;
      // Sort by area descending
      const sorted = [...hits].sort((a, b) => (b.box.width * b.box.height) - (a.box.width * a.box.height));
      const mainArea = sorted[0].box.width * sorted[0].box.height;
      // Only keep detections that are at least 30% the area of the largest face (filters out tiny background artifacts)
      const significant = sorted.filter((h) => (h.box.width * h.box.height) >= 0.3 * mainArea);
      return significant.length === 1 ? [significant[0]] : sorted;
    };

    const toBoxes = (hits: Array<{ box: { x: number; y: number; width: number; height: number } }>) => {
      const filtered = filterDominant(hits);
      return filtered.map((f) => ({
        x: f.box.x / scale,
        y: f.box.y / scale,
        width: f.box.width / scale,
        height: f.box.height / scale,
      }));
    };

    // Stage 1: Standard 416 resolution at 0.35 (optimal for clean / clear glasses)
    let found = await scan(416, 0.35);
    if (found.length > 0) return toBoxes(found);

    // Stage 2: 416 resolution at 0.22 (for tinted glasses / reflection / shadows)
    found = await scan(416, 0.22);
    if (found.length > 0) return toBoxes(found);

    // Stage 3: 320 resolution at 0.22 (for close-up portrait framing)
    found = await scan(320, 0.22);
    if (found.length > 0) return toBoxes(found);

    // Stage 4: 416 resolution at 0.16 (sensitive fallback for harsh glare)
    found = await scan(416, 0.16);
    if (found.length > 0) return toBoxes(found);

    // Stage 5: 320 resolution at 0.16
    found = await scan(320, 0.16);
    if (found.length > 0) return toBoxes(found);

    return [];
  },
  async cut(source, sq: Square) {
    const side = Math.min(sq.size, PHOTO.cutMax);
    const canvas = document.createElement("canvas");
    canvas.width = side; canvas.height = side;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source as CanvasImageSource, sq.left, sq.top, sq.size, sq.size, 0, 0, side, side);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("no picture"))), "image/jpeg", 0.92));
  },
};
