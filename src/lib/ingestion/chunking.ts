// src/lib/ingestion/chunking.ts
//
// How a circular's text becomes stored chunks. ONE definition, used by the upload route AND by the archive re-read tool
// (reread.ts), so a re-read circular is chunked exactly like a freshly uploaded one.
// (This is the logic that used to sit inline in the upload route; it behaves the same.)

export const CHUNK_WORDS = 200;

export interface PageUnit {
  page: number; // 1-based page, or 0 when the text has no page (whole document)
  text: string;
}
export interface PlannedChunk {
  index: number;
  page: number;
  text: string;
}

/**
 * Prefer the per-page OCR text, so every chunk keeps its page number (the viewer jumps to that page). With no per-page text
 * (a born-digital PDF whose text came from the PDF itself), the whole document is one page-less unit (page 0).
 */
export function buildPageUnits(perPageText: string[], extractedText: string): PageUnit[] {
  const units: PageUnit[] = [];
  const havePageText = perPageText.some((t) => t && t.trim().length > 0);
  if (havePageText) {
    for (let pi = 0; pi < perPageText.length; pi++) {
      const t = (perPageText[pi] || "").replace(/\s+/g, " ").trim();
      if (t.length > 0) units.push({ page: pi + 1, text: t });
    }
  } else if (extractedText && extractedText.length > 0) {
    units.push({ page: 0, text: extractedText });
  }
  return units;
}

/** 200-word chunks, per page, numbered 0.. across the whole document. */
export function planChunks(units: PageUnit[], chunkWords: number = CHUNK_WORDS): PlannedChunk[] {
  const out: PlannedChunk[] = [];
  let index = 0;
  for (const unit of units) {
    const words = unit.text.split(/\s+/);
    for (let i = 0; i < words.length; i += chunkWords) {
      const text = words.slice(i, i + chunkWords).join(" ");
      if (!text.trim()) continue;
      out.push({ index, page: unit.page, text });
      index++;
    }
  }
  return out;
}

/** The text of the whole document, as used for its single whole-document vector (clean spaces, at most 8192 characters). */
export function documentEmbeddingText(text: string): string | null {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= 20) return null;
  return t.length > 8192 ? t.slice(0, 8192) : t;
}
