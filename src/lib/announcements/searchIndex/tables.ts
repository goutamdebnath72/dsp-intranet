// src/lib/announcements/searchIndex/tables.ts
//
// THE DATABASE SIDE OF THE SEARCH INDEX (src/lib/nl2sql/sql/29_announcement_search_index.sql). I take the same care as admin/files.ts: every READ is wrapped in a savepoint, so a database where the tables are not there yet
// (the SQL file not run, and nothing indexed yet) simply has no index: announcements, their PDFs and their literal search are untouched.
//
// I keep two PARTS apart, so that one can be redone without the other: the BODY (source 'body' passages) and the PDF (source 'pdf' passages, its page pictures, its text). Each has its own state in
// announcement_index. The functions that REPLACE a part return the addresses of the page pictures it had, for the caller to delete from storage after the commit.

import type { QueryFn } from "@/lib/facility/types";
import { tryInSavepoint } from "../admin/files";

export interface PartState {
  status: "ready" | "failed";
  note: string | null;
}
export interface PdfState extends PartState {
  /** Count of pages that have text. */
  pages: number | null;
  /** ... of those, the ones taken from the PDF's own text */
  textPages: number | null;
  /** ... and of those, the ones read by AI */
  ocrPages: number | null;
}
export interface BodyState extends PartState {
  chunks: number | null;
}
export interface IndexState {
  pdf: PdfState | null;
  body: BodyState | null;
}

export interface IndexedChunk {
  index: number;
  page: number;
  text: string;
  /** Held as a pgvector literal "[0.1,0.2,...]". */
  vector: string;
}

/** Creates the tables if they are not there. If the database user may not, I let the error go up so the caller records it as the reason. */
export async function ensureIndexTables(q: QueryFn): Promise<void> {
  await q(
    `CREATE TABLE IF NOT EXISTS public.announcement_index (
       announcement_id integer PRIMARY KEY REFERENCES public.announcement(id) ON DELETE CASCADE,
       pdf_status varchar(10) CHECK (pdf_status IN ('ready', 'failed')), pdf_note text,
       pdf_pages integer, pdf_text_pages integer, pdf_ocr_pages integer, pdf_text text,
       body_status varchar(10) CHECK (body_status IN ('ready', 'failed')), body_note text, body_chunks integer,
       indexed_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS public.announcement_chunk (
       id serial PRIMARY KEY,
       announcement_id integer NOT NULL REFERENCES public.announcement(id) ON DELETE CASCADE,
       source varchar(4) NOT NULL CHECK (source IN ('body', 'pdf')),
       chunk_index integer NOT NULL, page integer, text text NOT NULL,
       embedding vector(768)
     )`,
  );
  await q(`CREATE INDEX IF NOT EXISTS announcement_chunk_announcement_idx ON public.announcement_chunk (announcement_id)`);
  await q(
    `CREATE TABLE IF NOT EXISTS public.announcement_page (
       announcement_id integer NOT NULL REFERENCES public.announcement(id) ON DELETE CASCADE,
       page integer NOT NULL CHECK (page >= 1), url text NOT NULL,
       PRIMARY KEY (announcement_id, page)
     )`,
  );
}

const PDF_RESET = `pdf_status = NULL, pdf_note = NULL, pdf_pages = NULL, pdf_text_pages = NULL, pdf_ocr_pages = NULL, pdf_text = NULL`;

async function takePageUrls(q: QueryFn, id: number): Promise<string[]> {
  const rows = await q(`SELECT url FROM public.announcement_page WHERE announcement_id = $1 ORDER BY page`, [id]);
  await q(`DELETE FROM public.announcement_page WHERE announcement_id = $1`, [id]);
  return rows.map((r) => String(r.url));
}

async function insertChunks(q: QueryFn, id: number, source: "body" | "pdf", chunks: IndexedChunk[]): Promise<void> {
  for (const c of chunks) {
    await q(
      `INSERT INTO public.announcement_chunk (announcement_id, source, chunk_index, page, text, embedding) VALUES ($1, $2, $3, $4, $5, $6::vector)`,
      [id, source, c.index, c.page, c.text, c.vector],
    );
  }
}

/** I remove everything the PDF part holds for an announcement (its PDF was removed or replaced) and leave the body part alone. Returns the page pictures it had. Missing tables are fine. */
export async function dropPdfIndex(q: QueryFn, id: number): Promise<string[]> {
  const urls = await tryInSavepoint(q, async () => {
    await q(`DELETE FROM public.announcement_chunk WHERE announcement_id = $1 AND source = 'pdf'`, [id]);
    const u = await takePageUrls(q, id);
    await q(`UPDATE public.announcement_index SET ${PDF_RESET}, indexed_at = now() WHERE announcement_id = $1`, [id]);
    return u;
  });
  return urls ?? [];
}

/** I replace the PDF part with a freshly read one, taking its passages, page pictures and text together. Returns the page pictures it had before. */
export async function savePdfIndex(q: QueryFn, id: number, o: { chunks: IndexedChunk[]; text: string; pages: number; textPages: number; ocrPages: number; note: string | null; pageUrls: Map<number, string> }): Promise<string[]> {
  await q(`DELETE FROM public.announcement_chunk WHERE announcement_id = $1 AND source = 'pdf'`, [id]);
  const old = await takePageUrls(q, id);
  await insertChunks(q, id, "pdf", o.chunks);
  for (const [page, url] of Array.from(o.pageUrls.entries()).sort((a, b) => a[0] - b[0])) {
    await q(`INSERT INTO public.announcement_page (announcement_id, page, url) VALUES ($1, $2, $3)`, [id, page, url]);
  }
  await q(
    `INSERT INTO public.announcement_index (announcement_id, pdf_status, pdf_note, pdf_pages, pdf_text_pages, pdf_ocr_pages, pdf_text, indexed_at)
     VALUES ($1, 'ready', $2, $3, $4, $5, $6, now())
     ON CONFLICT (announcement_id) DO UPDATE
        SET pdf_status = 'ready', pdf_note = EXCLUDED.pdf_note, pdf_pages = EXCLUDED.pdf_pages, pdf_text_pages = EXCLUDED.pdf_text_pages,
            pdf_ocr_pages = EXCLUDED.pdf_ocr_pages, pdf_text = EXCLUDED.pdf_text, indexed_at = now()`,
    [id, o.note, o.pages, o.textPages, o.ocrPages, o.text],
  );
  return old;
}

/** Records that the PDF could not be read. I drop what an older PDF left, because it belonged to a PDF that is no longer there. Returns the page pictures it had. */
export async function savePdfFailure(q: QueryFn, id: number, note: string): Promise<string[]> {
  await q(`DELETE FROM public.announcement_chunk WHERE announcement_id = $1 AND source = 'pdf'`, [id]);
  const old = await takePageUrls(q, id);
  await q(
    `INSERT INTO public.announcement_index (announcement_id, pdf_status, pdf_note, pdf_pages, pdf_text_pages, pdf_ocr_pages, pdf_text, indexed_at)
     VALUES ($1, 'failed', $2, NULL, NULL, NULL, NULL, now())
     ON CONFLICT (announcement_id) DO UPDATE
        SET pdf_status = 'failed', pdf_note = EXCLUDED.pdf_note, pdf_pages = NULL, pdf_text_pages = NULL, pdf_ocr_pages = NULL, pdf_text = NULL, indexed_at = now()`,
    [id, note.slice(0, 500)],
  );
  return old;
}

/** Replaces the body part: the passages of the announcement's own text. No chunks (an empty body) clears it. */
export async function saveBodyIndex(q: QueryFn, id: number, o: { chunks: IndexedChunk[] }): Promise<void> {
  await q(`DELETE FROM public.announcement_chunk WHERE announcement_id = $1 AND source = 'body'`, [id]);
  if (o.chunks.length === 0) {
    await tryInSavepoint(q, () => q(`UPDATE public.announcement_index SET body_status = NULL, body_note = NULL, body_chunks = NULL, indexed_at = now() WHERE announcement_id = $1`, [id]));
    return;
  }
  await insertChunks(q, id, "body", o.chunks);
  await q(
    `INSERT INTO public.announcement_index (announcement_id, body_status, body_note, body_chunks, indexed_at)
     VALUES ($1, 'ready', NULL, $2, now())
     ON CONFLICT (announcement_id) DO UPDATE SET body_status = 'ready', body_note = NULL, body_chunks = EXCLUDED.body_chunks, indexed_at = now()`,
    [id, o.chunks.length],
  );
}

/** Records that the body's passages could not be made. I keep the old ones (they are the previous text's) because the literal search and the whole-record vector still serve; the state says it. */
export async function saveBodyFailure(q: QueryFn, id: number, note: string): Promise<void> {
  await q(
    `INSERT INTO public.announcement_index (announcement_id, body_status, body_note, indexed_at)
     VALUES ($1, 'failed', $2, now())
     ON CONFLICT (announcement_id) DO UPDATE SET body_status = 'failed', body_note = EXCLUDED.body_note, indexed_at = now()`,
    [id, note.slice(0, 500)],
  );
}

/** The state of the index of these announcements; with a missing table I return none of them. */
export async function indexStateOf(q: QueryFn, ids: number[]): Promise<Map<number, IndexState>> {
  const out = new Map<number, IndexState>();
  if (ids.length === 0) return out;
  const rows = await tryInSavepoint(q, () =>
    q(
      `SELECT announcement_id, pdf_status, pdf_note, pdf_pages, pdf_text_pages, pdf_ocr_pages, body_status, body_note, body_chunks FROM public.announcement_index WHERE announcement_id = ANY($1::int[])`,
      [ids],
    ),
  );
  const n = (v: unknown) => (v == null ? null : Number(v));
  const s = (v: unknown) => (v == null ? null : String(v));
  for (const r of rows ?? []) {
    out.set(Number(r.announcement_id), {
      pdf: r.pdf_status == null ? null : { status: r.pdf_status === "ready" ? "ready" : "failed", note: s(r.pdf_note), pages: n(r.pdf_pages), textPages: n(r.pdf_text_pages), ocrPages: n(r.pdf_ocr_pages) },
      body: r.body_status == null ? null : { status: r.body_status === "ready" ? "ready" : "failed", note: s(r.body_note), chunks: n(r.body_chunks) },
    });
  }
  return out;
}

/** The page pictures of an announcement, used when deleting it: the pictures go from storage after the commit, and the rows go by cascade. A missing table gives none. */
export async function pageUrlsOf(q: QueryFn, id: number): Promise<string[]> {
  const rows = await tryInSavepoint(q, () => q(`SELECT url FROM public.announcement_page WHERE announcement_id = $1`, [id]));
  return (rows ?? []).map((r) => String(r.url));
}
