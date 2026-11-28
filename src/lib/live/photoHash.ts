// src/lib/live/photoHash.ts
//
// THE SAME PHOTOGRAPH UNDER TWO ADDRESSES. One press photo (a meeting at a steel plant) reaches the cards from two papers, each with its own copy of the picture, so the addresses differ and rss.ts's samePictureStory cannot see that it is one picture.
// For the few pairs of stories whose headlines share three words or more and whose picture addresses differ, I make a small fingerprint of each picture (a "difference hash": the picture shrunk to 9 x 8 grey squares, one bit for whether each square is
// brighter than its right neighbour; 64 bits) and call the two the same photograph when at most MAX_DIFFERENT bits differ. A copy that was resized or recompressed differs in a few bits; a different photograph of the same plant in many. Both conditions must hold
// (words and photograph), so two different stories that share a stock picture, or two photographs of one company, are not joined. Only pictures on the allowed hosts are fetched, with a time limit and a size ceiling, as the thumbnail route does.
import sharp from "sharp";
import { BROWSER_UA } from "./http";
import { isAllowedImage, MAX_SOURCE_BYTES, rejectPicture, smallerAddress, usableImage } from "./thumb";
import { pictureKey, wordsOf, type FeedItem } from "./rss";

export const MAX_DIFFERENT = 8;
/** A picture that is at least this much near-white (every colour 235 or more of 255) is a logo or a flat graphic, not a photograph of the story: measured 28 Nov 2026, Dainik Bhaskar's logo 93%; real photographs of the Steel tab, even with white margins, 17% to 67%. */
export const LOGO_WHITE = 0.8;
const KEPT = new Map<string, { hash: bigint; logo: boolean } | null>();
const KEPT_MAX = 500;

/** What is in a picture, read once: its fingerprint and whether it is a logo (null when it cannot be fetched or read). Kept by the picture's identity. */
export async function inspect(image: string, timeoutMs = 3500): Promise<{ hash: bigint; logo: boolean } | null> {
  const key = pictureKey(image);
  if (KEPT.has(key)) return KEPT.get(key) ?? null;
  if (!isAllowedImage(image)) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // the picture as the thumbnail route will fetch it (the paper's small version where there is one): what is judged here is what the card will show
    const r = await fetch(smallerAddress(image), { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": BROWSER_UA, Accept: "image/avif,image/webp,image/*;q=0.8" } });
    if (!r.ok || !isAllowedImage(r.url)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_SOURCE_BYTES) return null;
    const seen = { hash: await hashOf(buf), logo: await looksLikeLogo(buf) };
    if (KEPT.size >= KEPT_MAX) KEPT.delete(KEPT.keys().next().value as string);
    KEPT.set(key, seen);
    return seen;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Has this picture been looked at (and read) already? Only such a picture may be shown: the owner's rule is no logo, ever, so a picture that could not be looked at in time is not shown until it has been. */
export const isInspected = (image: string | undefined): boolean => !!image && !!KEPT.get(pictureKey(image));

/** The fingerprint of a picture (null when it cannot be read). */
export const photoHash = async (image: string, timeoutMs = 3500): Promise<bigint | null> => (await inspect(image, timeoutMs))?.hash ?? null;

/** Is this a logo or a flat graphic: LOGO_WHITE or more of its (transparent parts counted white) squares near-white. */
export async function looksLikeLogo(bytes: Buffer): Promise<boolean> {
  const px = await sharp(bytes, { failOn: "none", limitInputPixels: 50_000_000 }).rotate().flatten({ background: "#ffffff" }).resize(48, 48, { fit: "fill" }).removeAlpha().raw().toBuffer();
  let white = 0;
  for (let i = 0; i + 2 < px.length; i += 3) if (px[i] >= 235 && px[i + 1] >= 235 && px[i + 2] >= 235) white++;
  return white / (px.length / 3) >= LOGO_WHITE;
}

/**
 * THE OWNER'S RULE, NO RELEVANT PICTURE, NO STORY: looks at the pictures of a list and rejects the ones that are logos (rejectPicture, so that usableImage says no from now on and the next build drops those stories). A paper's logo is what an image search gives for a
 * story it has no picture of (Dainik Bhaskar's, on a Steel story). Within `ms`; a picture that cannot be read is left as it is. Returns how many were newly rejected.
 */
export async function rejectLogos(images: Array<string | undefined>, ms = 2500): Promise<number> {
  const distinct = [...new Map(images.filter((x): x is string => !!x).map((x) => [pictureKey(x), x])).values()];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let n = 0;
  await Promise.race([
    Promise.all(distinct.map(async (img) => { const seen = await inspect(img, ms); if (seen?.logo && usableImage(img)) { rejectPicture(img); n++; } })),
    new Promise((resolve) => { timer = setTimeout(resolve, ms); }),
  ]);
  clearTimeout(timer);
  return n;
}

/** The difference hash of a picture's bytes. */
export async function hashOf(bytes: Buffer): Promise<bigint> {
  const px = await sharp(bytes, { failOn: "none", limitInputPixels: 50_000_000 }).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let h = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) h = (h << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
  return h;
}

/** How many of the 64 bits differ. */
export function different(a: bigint, b: bigint): number {
  let x = a ^ b, n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

const sharedWords = (a: string, b: string): number => { const inB = wordsOf(b).set; return wordsOf(a).list.filter((w) => inB.has(w)).length; };

/**
 * Leaves each photograph once: of two stories whose headlines share three words or more and whose pictures are the same photograph (a fingerprint within MAX_DIFFERENT bits), the first in the list stays and names the other paper.
 * At most `maxPairs` pairs are looked at, within `ms` milliseconds; a picture that cannot be read counts as different (the story stays).
 */
export async function dropSamePhoto<T extends FeedItem>(items: T[], ms = 2500, maxPairs = 8, hashOfAddress: (u: string) => Promise<bigint | null> = photoHash): Promise<T[]> {
  const pairs: Array<[number, number]> = [];
  for (let j = 1; j < items.length && pairs.length < maxPairs; j++) {
    for (let i = 0; i < j && pairs.length < maxPairs; i++) {
      const a = items[i], b = items[j];
      if (!a.image || !b.image || pictureKey(a.image) === pictureKey(b.image)) continue;
      if (sharedWords(a.title, b.title) >= 3) pairs.push([i, j]);
    }
  }
  if (!pairs.length) return items;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  const hashes = new Map<number, bigint | null>();
  const need = [...new Set(pairs.flat())];
  await Promise.race([Promise.all(need.map(async (k) => { hashes.set(k, await hashOfAddress(items[k].image as string)); })), limit]);
  clearTimeout(timer);
  const drop = new Map<number, number>();
  for (const [i, j] of pairs) {
    const ha = hashes.get(i), hb = hashes.get(j);
    if (ha == null || hb == null || drop.has(i) || drop.has(j)) continue;
    if (different(ha, hb) <= MAX_DIFFERENT) drop.set(j, i);
  }
  if (!drop.size) return items;
  const out = items.map((it) => ({ ...it }));
  for (const [j, i] of drop) {
    const k = out[i];
    if (out[j].source !== k.source && !(k.also ?? []).includes(out[j].source)) k.also = [...(k.also ?? []), out[j].source];
  }
  return out.filter((_, idx) => !drop.has(idx));
}
