// scripts/check-manual-marks.ts
//
// For every quote the DSP history card takes from a PDF it opens in its own viewer (the two JO Manuals, SAIL's Steel Cities book, the annual reports, the Lok Sabha replies, the obituary), I check: is it on the PDF page that
// the card's page link opens, and does the viewer's highlight (src/tools/dsphistory/highlight.ts, on pdf.js's reading of the page) find it there?
// Run from the project root:  npx tsx --tsconfig tsconfig.selftest.json scripts/check-manual-marks.ts [folder]   (the folder holds the JO Manuals, default ~/Downloads/jo; the published PDFs are downloaded once into the system's temp folder)
// Last run: every quote marked on its page, none outside the page.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { findQuote, pieceOf } from "@/tools/dsphistory/highlight";
import { DOCS } from "@/tools/dsphistory/docs";
import * as H from "@/tools/dsphistory/history";

const folder = process.argv[2] ?? `${process.env.HOME}/Downloads/jo`;
const cache = `${tmpdir()}/history-docs-check`;
mkdirSync(cache, { recursive: true });
/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js's own objects */
const docs: Record<string, any> = {};
async function bytesOf(id: string): Promise<Uint8Array> {
  const d = DOCS[id];
  if (d.file) return new Uint8Array(readFileSync(`${folder}/${d.file}`));
  const f = `${cache}/${id}.pdf`;
  if (!existsSync(f)) execFileSync("curl", ["-sSL", "--fail", "--max-time", "600", "-o", f, d.remote as string]); // I use curl here because sail.co.in's certificate chain is incomplete and Node refuses it.
  return new Uint8Array(readFileSync(f));
}
async function pieces(id: string, n: number) {
  docs[id] ??= await pdfjs.getDocument({ data: await bytesOf(id), useSystemFonts: true, verbosity: 0 }).promise;
  const p = await docs[id].getPage(n), vp = p.getViewport({ scale: 1.5 }), tc = await p.getTextContent();
  return { items: tc.items.filter((i: any) => typeof i.str === "string").map((i: any) => pieceOf(i, vp.transform, vp.scale)), vp };
}
const all: any[] = [];
const walk = (v: any): void => { if (!v || typeof v !== "object") return; if (Array.isArray(v)) { v.forEach(walk); return; } if (v.doc && v.quote && v.pages) all.push(v); else Object.values(v).forEach(walk); };
walk([H.EVENTS, H.KEY_DATES, H.FACTS, H.MAKERS, H.FIRST_ITEMS, H.SAIL_STORY, H.UNITS, H.OTHER_BODIES, H.HEADS, Object.values(H.PHOTOS)]);

(async () => {
  let ok = 0, bad = 0, outside = 0;
  const per: Record<string, [number, number]> = {};
  for (const s of all) for (const n of s.pages as number[]) {
    const page = H.pdfPage(s, n);
    const { items, vp } = await pieces(s.doc, page);
    const rects = findQuote(items, s.quote);
    const c = (per[s.doc] ??= [0, 0]);
    if (!rects.length) { bad++; c[1]++; console.log("NOT MARKED", s.doc, "printed", n, "PDF page", page, s.quote.slice(0, 80)); continue; }
    ok++; c[0]++;
    if (rects.some((r) => r.x < -1 || r.y < -1 || r.x + r.w > vp.width + 1 || r.y + r.h > vp.height + 1)) outside++;
  }
  for (const [d, [a, b]] of Object.entries(per)) console.log(`  ${d}: ${a} marked, ${b} not`);
  console.log(`quotes ${ok + bad}, marked on their page ${ok}, not marked ${bad}, outside the page ${outside}`);
  process.exit(bad || outside ? 1 : 0);
})();
