// src/lib/announcements/searchIndex/reader.ts
//
// THE REAL PDF READER of the search index, the circular upload's own way (src/app/api/circulars/route.ts) with one difference that suits announcements: most are TRUE PDFs, so a page is taken from the PDF's OWN TEXT
// when that text is good (exact and free), and only a page without a usable text layer (a scan, an infographic, a broken font) is read by Gemini, as every page of a circular is (a primary model, and a checker where
// the primary fails). Every page is drawn as a picture (pdf-to-img, the circulars' own scale) and the picture is handed back to be kept in storage.
//
// Without GEMINI_API_KEY the pages with a usable text layer are still read; the others are named as unread.

import { createGeminiOcr, geminiOcrReaders } from "@/lib/ingestion/geminiOcr";
import { MAX_PAGES, type PageRead, type PdfReading } from "./indexer";

const PDF_RENDER_SCALE = 300 / 72;
/** a text layer shorter than this (in characters) is not trusted to be the whole page */
export const MIN_LAYER_CHARS = 120;

/** Is the PDF's own text of a page good enough to be the page? Long enough, and made of letters and digits (a broken font encoding gives long runs of symbols). */
export function textLayerIsGood(text: string): boolean {
  // glyphs the PDF could not map to characters come out as "(cid:123)": they are not text
  const t = (text || "").replace(/\(cid:\d+\)/g, "").replace(/\s+/g, "");
  if (t.length < MIN_LAYER_CHARS) return false;
  const letters = (t.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return letters / t.length >= 0.6;
}

/** The PDF's own text, page by page (index 0 = page 1). Never throws: a PDF whose text cannot be taken has no text layer. */
export async function textLayerOf(bytes: Buffer): Promise<string[]> {
  const pages: string[] = [];
  try {
    const mod: any = await import("pdf-parse");
    const parse = mod?.default ?? mod;
    await parse(bytes, {
      pagerender: async (pageData: any) => {
        const tc = await pageData.getTextContent({ normalizeWhitespace: true });
        let lastY: number | undefined;
        let text = "";
        for (const item of tc.items) {
          text += lastY === undefined || lastY === item.transform[5] ? item.str : `\n${item.str}`;
          lastY = item.transform[5];
        }
        pages[pageData.pageIndex] = text;
        return text;
      },
    });
  } catch {
    return [];
  }
  return pages;
}

export async function readPdf(bytes: Buffer, deadlineAt: number): Promise<PdfReading> {
  const layer = await textLayerOf(bytes);
  const { pdf: renderPdfToImages } = await import("pdf-to-img");
  const doc = await renderPdfToImages(bytes, { scale: PDF_RENDER_SCALE, format: "png" });
  const totalPages = doc.length || layer.length || 1;
  const toRead = Math.min(totalPages, MAX_PAGES);

  const haveKey = !!process.env.GEMINI_API_KEY;
  const ocr = haveKey ? createGeminiOcr({ readers: geminiOcrReaders(), deadlineAt, concurrency: 4 }) : null;
  const images: Array<Buffer | null> = [];
  const pages: PageRead[] = [];
  const needOcr: number[] = [];
  try {
    for (let page = 1; page <= toRead; page++) {
      let png: Buffer | null = null;
      try { png = await doc.getPage(page); } catch { png = null; }
      images[page - 1] = png;
      const own = (layer[page - 1] ?? "").trim();
      if (textLayerIsGood(own)) {
        pages[page - 1] = { text: own, via: "text" };
      } else if (ocr && png) {
        ocr.start(page, png); // both readers begin on the page while the next one is drawn
        needOcr.push(page);
        pages[page - 1] = { text: own, via: own ? "text" : "none", reason: "no usable text layer" };
      } else {
        pages[page - 1] = { text: own, via: own ? "text" : "none", reason: !png ? "the page could not be drawn" : "no usable text layer, and no AI reading is configured (GEMINI_API_KEY)" };
      }
    }
  } finally {
    await doc.destroy();
  }

  if (ocr && needOcr.length) {
    const result = await ocr.finish();
    for (const page of needOcr) {
      const text = result.texts.get(page);
      if (text && text.trim()) pages[page - 1] = { text, via: "ocr" };
      else pages[page - 1] = { ...pages[page - 1], reason: result.failedPages.find((f) => f.page === page)?.reason ?? "the AI could not read the page" };
    }
  }
  return { pages, images, totalPages };
}
