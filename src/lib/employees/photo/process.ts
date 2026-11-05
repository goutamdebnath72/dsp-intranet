// src/lib/employees/photo/process.ts
//
// WHAT THE SERVER DOES WITH THE SQUARE THE BROWSER SENT (step 70): checks it really is a picture (by its first bytes, not its name), square, large enough; makes the large copy (never enlarged) and the small one;
// every copy is a fresh JPEG with no camera or location data in it.

import sharp from "sharp";
import { PHOTO } from "./crop";

export type Normalised = { ok: true; master: Buffer; thumb: Buffer; width: number; height: number } | { ok: false; reason: string };

/** What the first bytes say the file is. */
export function sniff(b: Buffer): "jpeg" | "png" | "webp" | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

const bad = (reason: string): Normalised => ({ ok: false, reason });

export async function normalisePhoto(input: Buffer): Promise<Normalised> {
  if (input.length === 0 || input.length > PHOTO.serverMaxBytes) return bad("The picture is too large (the screen sends a much smaller one: try again).");
  if (!sniff(input)) return bad("This file is not a JPG, PNG or WebP picture.");
  let oriented: { data: Buffer; info: sharp.OutputInfo };
  try { oriented = await sharp(input, { failOn: "error" }).rotate().toBuffer({ resolveWithObject: true }); } catch { return bad("This picture cannot be read."); }
  const { width, height } = oriented.info;
  if (Math.abs(width - height) > 2) return bad("The photo must be a square (the screen makes it so): choose it again.");
  const side = Math.min(width, height);
  if (side < PHOTO.minCrop) return bad(`The photo is too small: its sides must be at least ${PHOTO.minCrop} pixels.`);
  const square = await sharp(oriented.data).extract({ left: 0, top: 0, width: side, height: side }).toBuffer();
  const master = await sharp(square).resize(PHOTO.master, PHOTO.master, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const thumb = await sharp(square).resize(PHOTO.thumb, PHOTO.thumb, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
  const m = await sharp(master).metadata();
  return { ok: true, master, thumb, width: m.width ?? side, height: m.height ?? side };
}
