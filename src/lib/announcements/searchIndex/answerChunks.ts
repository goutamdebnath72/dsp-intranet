// src/lib/announcements/searchIndex/answerChunks.ts
//
// THE PASSAGES AN ANNOUNCEMENT OFFERS TO A QUESTION (the answer-from-inside path, src/app/api/ai-search/answer/route.ts): I offer its body text first, then the passages of its PDF in page order, each with its page.
// A title-only announcement offers just its PDF's passages; an announcement with neither offers one empty passage (as it did before), which the answer path discards.

export interface PdfPassageRow {
  chunk_index: number | string;
  page: number | string | null;
  text: string | null;
}

export interface AnswerChunk {
  page: number | null;
  index: number;
  text: string;
}

export function announcementAnswerChunks(bodyText: string | null | undefined, pdfRows: PdfPassageRow[]): AnswerChunk[] {
  const out: AnswerChunk[] = [];
  const body = String(bodyText ?? "").trim();
  if (body) out.push({ page: null, index: 0, text: body });
  const rows = [...pdfRows].sort((a, b) => Number(a.chunk_index) - Number(b.chunk_index));
  for (const r of rows) {
    const text = String(r.text ?? "").trim();
    if (!text) continue;
    const page = r.page == null || Number(r.page) <= 0 ? null : Number(r.page);
    out.push({ page, index: out.length, text });
  }
  return out.length ? out : [{ page: null, index: 0, text: "" }];
}
