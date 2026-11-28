// src/app/api/live/thumb/route.ts
//
// The small picture of a news card (src/lib/live/thumb.ts says why and how): GET /api/live/thumb?u=<the picture's https address on a paper's image server (or Bing's)>: the picture, 360 x 240 (3:2), WebP, with a long cache.
// The address of a story's picture is found when the list is built (in the feed, on the story's own page, or at Bing; src/lib/live/pagePictures.ts), so this route never reads a story page. I read nothing else from the caller, and fetch only from the
// listed hosts, over https, with a time limit and a size ceiling. A refusal or a failure is a small 404 (kept for ten minutes, so that a broken address is not asked again at once): the <img> then fails and the card shows its tile.
import sharp from "sharp";
import { BROWSER_UA } from "@/lib/live/http";
import { isAllowedImage, MAX_SOURCE_BYTES, smallerAddress, THUMB_H, THUMB_W } from "@/lib/live/thumb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const LONG = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400, immutable";
/** The pictures made recently, so that a server that has no shared cache in front of it (this one on a desk) does not make the same one twice. */
const made = new Map<string, Uint8Array>();
const MAX_MADE = 300;

const gone = (why: string) => new Response(why, { status: 404, headers: { "Cache-Control": "public, max-age=600", "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") ?? "";
  if (!isAllowedImage(u)) return gone("not a picture this route fetches");
  const hit = made.get(u);
  if (hit) return new Response(hit as BodyInit, { headers: { "Content-Type": "image/webp", "Cache-Control": LONG } });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(smallerAddress(u), { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": BROWSER_UA, Accept: "image/avif,image/webp,image/*;q=0.8" } });
    // a redirect must not lead off the list; some image servers (Hindustan Times) label their JPEGs application/octet-stream: what decodes as a picture is a picture (sharp refuses the rest below)
    if (!r.ok || !isAllowedImage(r.url) || !/^(image\/|application\/octet-stream)/i.test(r.headers.get("content-type") ?? "")) return gone("no picture there");
    if (Number(r.headers.get("content-length") ?? 0) > MAX_SOURCE_BYTES) return gone("picture too large");
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_SOURCE_BYTES) return gone("picture too large");
    // cover: the picture fills the box and the edges are cut; `attention` keeps what the eye goes to (a face) rather than the centre
    const out = new Uint8Array(await sharp(buf, { failOn: "none", limitInputPixels: 50_000_000 }).rotate().resize(THUMB_W, THUMB_H, { fit: "cover", position: sharp.strategy.attention }).webp({ quality: 64, effort: 4 }).toBuffer());
    if (made.size >= MAX_MADE) made.delete(made.keys().next().value as string);
    made.set(u, out);
    return new Response(out as BodyInit, { headers: { "Content-Type": "image/webp", "Cache-Control": LONG } });
  } catch {
    return gone("could not make the picture");
  } finally {
    clearTimeout(timer);
  }
}
