// src/lib/ingestion/pageImage.ts
//
// THE PAGE IMAGE AS SENT TO THE SECOND READER (step 39f). A rendered page is a 300 dpi PNG of 2 to 3 MB (3.3 MB once encoded for sending) and the reader
// answers with a few hundred words. Measured on 19 Oct 2026 on one page (probe, same request twice): as stored, 2,506,817 bytes; as a JPEG with a long
// side of 2400 px at quality 85, 272,588 bytes (9 times fewer), the same 637 characters and the same 8 important numbers. The service shrinks large
// images itself (the page cost 1,359 input tokens either way), so the extra bytes buy nothing, and every byte is exposure to a slow or stalling connection.
//
// Never fails: any image that cannot be shrunk (or would not get smaller) is sent as it is.

import sharp from "sharp";

export const SHRINK_EDGE = 2400;
export const SHRINK_QUALITY = 85;

export interface ShrinkOptions {
  /** The longest side, in pixels (default 2400). */
  edge?: number;
  /** JPEG quality 1 to 100 (default 85). */
  quality?: number;
}

/** The page as a JPEG whose longest side is at most `edge` pixels; transparency becomes white. Returns the original when that fails or is not smaller. */
export async function shrinkForReading(image: Buffer, o: ShrinkOptions = {}): Promise<Buffer> {
  try {
    const edge = o.edge ?? SHRINK_EDGE;
    const out = await sharp(image)
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: o.quality ?? SHRINK_QUALITY })
      .toBuffer();
    return out.length > 0 && out.length < image.length ? out : image;
  } catch {
    return image;
  }
}
