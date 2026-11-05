// Run (from the project root):  npx tsx --tsconfig tsconfig.json src/lib/employees/photo/photo.selftest.ts
// Step 70: the square around a face (arithmetic, 800 random cases), what the server does with the square it receives (real generated pictures: JPEG, PNG, WebP, phone rotation, camera data, sizes, rubbish),
// and what the browser side says to the person (with stand-ins for the three parts that need a real browser).

import sharp from "sharp";
import { PHOTO, squareAround, type Box } from "./crop";
import { normalisePhoto, sniff } from "./process";
import { preparePhoto, photoSrc, type PhotoDeps } from "./client";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };

async function main() {
  // ---- the square around a face ----
  const headOf = (f: Box) => ({ left: f.x - 0.25 * f.width, right: f.x + 1.25 * f.width, top: f.y - 0.4 * f.height, bottom: f.y + 1.15 * f.height });
  const good = squareAround({ x: 450, y: 500, width: 300, height: 330 }, 1200, 1600);
  ok("a passport-shaped photo (1200 x 1600, the face in the upper middle): a square is found, inside the picture", good.ok && good.square.left >= 0 && good.square.top >= 0 && good.square.left + good.square.size <= 1200 && good.square.top + good.square.size <= 1600);
  if (good.ok) {
    const h = headOf({ x: 450, y: 500, width: 300, height: 330 }), s = good.square;
    ok("...the head, the hair and the neck are wholly INSIDE it, with room above the hair", h.left >= s.left && h.right <= s.left + s.size && h.top >= s.top && h.bottom <= s.top + s.size && h.top - s.top >= 0.1 * s.size);
    ok("...and the head fills about half of the square (an ID photo, not a distant figure and not a tight crop)", (h.bottom - h.top) / s.size > 0.45 && (h.bottom - h.top) / s.size < 0.62);
  }
  ok("a face so high that the hair would be cut off the top is REFUSED in words (nothing is cut)", (() => { const r = squareAround({ x: 450, y: 20, width: 300, height: 330 }, 1200, 1600); return !r.ok && /too close to the edge/.test(r.reason); })());
  ok("a face at the side edge is refused in the same words", (() => { const r = squareAround({ x: 10, y: 600, width: 300, height: 330 }, 1200, 1600); return !r.ok && /too close to the edge/.test(r.reason); })());
  ok("a tiny face in a big picture is refused ('too small'): the square would be blurred", (() => { const r = squareAround({ x: 1900, y: 1400, width: 80, height: 90 }, 4000, 3000); return !r.ok && /too small/.test(r.reason); })());
  ok("a landscape picture is cut to a square as well (the face is the centre), never wider than the picture is high", (() => { const r = squareAround({ x: 1000, y: 400, width: 260, height: 290 }, 2400, 1600); return r.ok && r.square.size <= 1600 && r.square.left + r.square.size <= 2400; })());
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let okCount = 0, bad = 0;
  for (let i = 0; i < 800; i++) {
    const W = 400 + Math.floor(rnd() * 3600), H = 400 + Math.floor(rnd() * 3600);
    const fw = 60 + rnd() * Math.min(W, H) * 0.6, fh = fw * (0.9 + rnd() * 0.4);
    const f = { x: rnd() * (W - fw), y: rnd() * (H - fh), width: fw, height: fh };
    const r = squareAround(f, W, H);
    if (r.ok) {
      okCount++; const h = headOf(f), s = r.square;
      const inside = s.left >= 0 && s.top >= 0 && s.left + s.size <= W && s.top + s.size <= H && s.size >= PHOTO.minCrop;
      const headIn = h.left >= s.left - 1e-6 && h.right <= s.left + s.size + 1e-6 && h.top >= s.top - 1e-6 && h.bottom <= s.top + s.size + 1e-6;
      if (!inside || !headIn) bad++;
    } else if (typeof r.reason !== "string" || r.reason.length < 10) bad++;
  }
  ok("800 random faces and pictures: whenever a square is given it is inside the picture, at least 320 px, and holds the WHOLE head (never once cut); whenever it is refused there is a sentence", bad === 0 && okCount > 50, `ok=${okCount} bad=${bad}`);

  // ---- what the server does with the square it receives ----
  const pic = async (w: number, h: number, fmt: "jpeg" | "png" | "webp" = "jpeg", orientation?: number) => {
    let s = sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 170, b: 150 } } });
    s = fmt === "jpeg" ? s.jpeg({ quality: 90 }) : fmt === "png" ? s.png() : s.webp();
    if (orientation) s = s.withMetadata({ orientation });
    return s.toBuffer();
  };
  const n800 = await normalisePhoto(await pic(800, 800));
  ok("an 800 x 800 JPEG is accepted: the large copy stays 800 (NEVER enlarged), the small copy is 160 x 160, both are JPEG", n800.ok && n800.width === 800 && (await sharp(n800.master).metadata()).width === 800 && (await sharp(n800.thumb).metadata()).width === 160 && (await sharp(n800.thumb).metadata()).height === 160 && sniff(n800.master) === "jpeg" && sniff(n800.thumb) === "jpeg");
  const n1500 = await normalisePhoto(await pic(1500, 1500));
  ok("a 1500 x 1500 picture is brought down to 1000 for the large copy", n1500.ok && (await sharp(n1500.master).metadata()).width === 1000);
  ok("PNG and WebP are accepted too", (await normalisePhoto(await pic(600, 600, "png"))).ok && (await normalisePhoto(await pic(600, 600, "webp"))).ok);
  const nr = await normalisePhoto(await pic(800, 600));
  ok("a picture that is not square is refused in words (the screen always sends a square)", !nr.ok && /square/.test(nr.reason));
  const nsmall = await normalisePhoto(await pic(300, 300));
  ok("a square smaller than 320 px is refused ('too small')", !nsmall.ok && /too small/.test(nsmall.reason));
  ok("rubbish, an empty file and a HEIC file are refused as 'not a JPG, PNG or WebP' (the first bytes decide, not the name)", await (async () => { const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(40)]); const a = await normalisePhoto(Buffer.from("not a picture at all, just words")), b = await normalisePhoto(Buffer.alloc(0)), c = await normalisePhoto(heic); return !a.ok && /not a JPG/.test(a.reason) && !b.ok && !c.ok && /not a JPG/.test(c.reason); })());
  ok("a file with a picture's first bytes that is not a picture is refused as unreadable", await (async () => { const r = await normalisePhoto(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)])); return !r.ok && /cannot be read/.test(r.reason); })());
  ok("a file over 4 MB is refused before anything is decoded", await (async () => { const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(PHOTO.serverMaxBytes + 10)]); const r = await normalisePhoto(big); return !r.ok && /too large/.test(r.reason); })());
  const rot = await normalisePhoto(await pic(700, 700, "jpeg", 6));
  ok("a phone picture marked 'rotate' is turned upright first and the marking is gone", rot.ok && (await sharp(rot.master).metadata()).orientation === undefined);
  // a square picture whose LEFT half is red and RIGHT half blue, marked 'rotate 90 degrees clockwise' (what a phone held sideways writes): upright, its TOP is red and its BOTTOM blue
  const raw = Buffer.alloc(700 * 700 * 3);
  for (let y = 0; y < 700; y++) for (let x = 0; x < 700; x++) { const o = (y * 700 + x) * 3; if (x < 350) { raw[o] = 230; raw[o + 1] = 20; raw[o + 2] = 20; } else { raw[o] = 20; raw[o + 1] = 20; raw[o + 2] = 230; } }
  const marked = await sharp(raw, { raw: { width: 700, height: 700, channels: 3 } }).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toBuffer();
  const upright = await normalisePhoto(marked);
  if (upright.ok) {
    const px = async (x: number, y: number) => { const r = await sharp(upright.master).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer(); return { r: r[0], b: r[2] }; };
    const topRight = await px(525, 100), bottomRight = await px(525, 600);
    ok("a sideways phone picture is really TURNED upright (its pixels, not only a flag): the top-right is red (it would be blue if left as it was) and the bottom-right is blue", topRight.r > 180 && topRight.b < 80 && bottomRight.b > 180 && bottomRight.r < 80, JSON.stringify([topRight, bottomRight]));
  } else ok("a sideways phone picture is accepted", false, upright.reason);
  const rot2 = await normalisePhoto(await pic(900, 600, "jpeg", 6));
  ok("...so a 900 x 600 picture marked 'rotate' is judged as the 600 x 900 it really is (not square: refused)", !rot2.ok && /square/.test(rot2.reason));
  const withExif = await sharp({ create: { width: 700, height: 700, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().withExif({ IFD0: { Copyright: "secret camera data" } }).toBuffer();
  const stripped = await normalisePhoto(withExif);
  ok("camera and location data (EXIF) never reach the stored copies", stripped.ok && !(await sharp(stripped.master).metadata()).exif && !(await sharp(stripped.thumb).metadata()).exif && !stripped.master.includes(Buffer.from("secret camera data")));

  // ---- what the browser side says (stand-ins for decode, find, cut) ----
  const file = (type: string, size = 1000, name = "p.jpg") => ({ type, size, name }) as unknown as File;
  const deps = (over: Partial<PhotoDeps> = {}): PhotoDeps => ({
    decode: async () => ({ width: 1200, height: 1600, source: {} }),
    detect: async () => [{ x: 450, y: 500, width: 300, height: 330 }],
    cut: async () => new Blob(["x"], { type: "image/jpeg" }),
    ...over,
  });
  (globalThis as { URL: typeof URL }).URL.createObjectURL = () => "blob:preview";
  const p1 = await preparePhoto(file("image/jpeg"), deps());
  ok("a good photo: the square is cut and a preview address is given", p1.ok && p1.previewUrl === "blob:preview" && p1.blob.size === 1);
  const reasons = async (f: File, d: PhotoDeps) => { const r = await preparePhoto(f, d); return r.ok ? "OK" : r.reason; };
  ok("a HEIC / PDF / GIF file: refused in words, with the hint about iPhones", /not a JPG, PNG or WebP/.test(await reasons(file("image/heic"), deps())) && /HEIC/.test(await reasons(file("image/heic"), deps())) && /not a JPG/.test(await reasons(file("application/pdf"), deps())) && /not a JPG/.test(await reasons(file("image/gif"), deps())));
  ok("a picture over 8 MB: refused", /8 MB/.test(await reasons(file("image/jpeg", PHOTO.maxBytes + 1), deps())));
  ok("a picture that cannot be decoded: refused", /cannot be read/.test(await reasons(file("image/jpeg"), deps({ decode: async () => { throw new Error("x"); } }))));
  ok("a picture shorter than 400 px: refused with the number", /at least 400 pixels/.test(await reasons(file("image/jpeg"), deps({ decode: async () => ({ width: 300, height: 900, source: {} }) }))));
  ok("no face: the sentence of the owner; two faces: asks for one person; the finder failing to start: says so and nothing is sent", /No single face was found/.test(await reasons(file("image/jpeg"), deps({ detect: async () => [] }))) && /More than one face/.test(await reasons(file("image/jpeg"), deps({ detect: async () => [{ x: 1, y: 1, width: 5, height: 5 }, { x: 9, y: 9, width: 5, height: 5 }] }))) && /photo checker could not start/.test(await reasons(file("image/jpeg"), deps({ detect: async () => { throw new Error("model"); } }))));
  ok("a face too near the edge: the head-room sentence; the cut failing: a sentence, not a crash", /too close to the edge/.test(await reasons(file("image/jpeg"), deps({ detect: async () => [{ x: 450, y: 10, width: 300, height: 330 }] }))) && /could not be prepared/.test(await reasons(file("image/jpeg"), deps({ cut: async () => { throw new Error("canvas"); } }))));
  ok("the address of a saved photo carries the id, the size and the version (so the browser keeps it until it changes)", photoSrc(6494, "thumb", 3) === "/api/employees/photo?id=6494&size=thumb&v=3");
  console.log(`photo selftest: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
