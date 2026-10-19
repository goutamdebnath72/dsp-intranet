/** Self-test of the page image shrink. Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/pageImage.selftest.ts */
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { SHRINK_EDGE, SHRINK_QUALITY, shrinkForReading } from "./pageImage";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const heavy = (w: number, h: number) => sharp(randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } }).png().toBuffer(); // random pixels do not compress

(async () => {
  ok("the defaults are the ones measured on the real page: 2400 px, quality 85", SHRINK_EDGE === 2400 && SHRINK_QUALITY === 85);

  const png = await heavy(1200, 1600);
  const small = await shrinkForReading(png, { edge: 800, quality: 70 });
  const meta = await sharp(small).metadata();
  ok("a heavy page becomes a JPEG", meta.format === "jpeg" && small[0] === 0xff && small[1] === 0xd8, String(meta.format));
  ok("its long side is at most the given edge, and the shape is kept", Math.max(meta.width ?? 0, meta.height ?? 0) === 800 && Math.abs((meta.width ?? 0) / (meta.height ?? 1) - 1200 / 1600) < 0.01, `${meta.width}x${meta.height}`);
  ok("it is far smaller than the PNG (at least 3 times here)", small.length < png.length / 3, `${small.length} vs ${png.length}`);

  const big = await shrinkForReading(await heavy(3000, 2000));
  const bm = await sharp(big).metadata();
  ok("the default long side is 2400 px", Math.max(bm.width ?? 0, bm.height ?? 0) === 2400 && bm.format === "jpeg", `${bm.width}x${bm.height}`);

  const modest = await heavy(500, 400);
  const mm = await sharp(await shrinkForReading(modest)).metadata();
  ok("a page already smaller than the edge is never enlarged", (mm.width ?? 0) <= 500 && (mm.height ?? 0) <= 400, `${mm.width}x${mm.height}`);

  const flat = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const f = await shrinkForReading(flat);
  ok("an image that would not get smaller is sent as it is", f.length <= flat.length);

  const notImage = Buffer.from("this is not an image at all");
  ok("bytes that are not an image come back unchanged (never an error)", (await shrinkForReading(notImage)).equals(notImage));
  ok("an empty buffer comes back unchanged", (await shrinkForReading(Buffer.alloc(0))).length === 0);

  // transparency must become white, not black
  const rgba = Buffer.alloc(600 * 600 * 4);
  const noise = randomBytes(600 * 600 * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) { rgba[i] = noise[j]; rgba[i + 1] = noise[j + 1]; rgba[i + 2] = noise[j + 2]; rgba[i + 3] = 0; }
  const transparent = await sharp(rgba, { raw: { width: 600, height: 600, channels: 4 } }).png().toBuffer();
  const out = await shrinkForReading(transparent, { edge: 300 });
  const stats = await sharp(out).stats();
  ok("a fully transparent page becomes WHITE (not black)", (await sharp(out).metadata()).format === "jpeg" && stats.channels.every((c) => c.mean > 250), JSON.stringify(stats.channels.map((c) => Math.round(c.mean))));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
