// src/lib/employees/photo/client.ts
//
// WHAT THE BROWSER DOES BEFORE A PHOTO IS SENT (step 70): checks the file, finds the ONE face, cuts the square around it. The three steps that need a real browser (decode, find the face, cut) are `deps`, so the
// rest can be tested with stand-ins; the real ones are in browserDeps.ts. If anything fails the person gets a sentence, never a crash, and nothing is sent.

import { PHOTO, squareAround, type Box, type Square } from "./crop";

export interface PhotoDeps {
  decode(file: File): Promise<{ width: number; height: number; source: unknown }>;
  detect(source: unknown, width: number, height: number): Promise<Box[]>;
  cut(source: unknown, square: Square): Promise<Blob>;
}

export type Prepared = { ok: true; blob: Blob; previewUrl: string } | { ok: false; reason: string };
const no = (reason: string): Prepared => ({ ok: false, reason });

export async function preparePhoto(file: File, deps: PhotoDeps): Promise<Prepared> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return no("This is not a JPG, PNG or WebP picture. (A photo from an iPhone may be HEIC: save it as JPG, or set the camera to Most Compatible.)");
  if (file.size > PHOTO.maxBytes) return no("This picture is too large: 8 MB at most.");
  let img: { width: number; height: number; source: unknown };
  try { img = await deps.decode(file); } catch { return no("This picture cannot be read."); }
  if (Math.min(img.width, img.height) < PHOTO.minSide) return no(`This picture is too small: its short side must be at least ${PHOTO.minSide} pixels.`);
  let faces: Box[];
  try { faces = await deps.detect(img.source, img.width, img.height); } catch { return no("The photo checker could not start. Reload the page and try again; if it keeps happening, tell the C&IT department."); }
  if (faces.length === 0) return no("No single face was found in this photo. Please use a coloured passport-size photo that shows the face clearly.");
  if (faces.length > 1) return no("More than one face was found. Please use a photo of one person only.");
  const sq = squareAround(faces[0], img.width, img.height);
  if (!sq.ok) return no(sq.reason);
  try {
    const blob = await deps.cut(img.source, sq.square);
    return { ok: true, blob, previewUrl: URL.createObjectURL(blob) };
  } catch { return no("The photo could not be prepared. Try another photo."); }
}

/** The address of a saved photo on the screen (the version in it makes the browser keep it for good and fetch a new one only when it changes). */
export const photoSrc = (id: number, size: "thumb" | "master", version: number): string => `/api/employees/photo?id=${id}&size=${size}&v=${version}`;
