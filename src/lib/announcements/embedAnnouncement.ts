// src/lib/announcements/embedAnnouncement.ts
import { getDb } from "@/lib/db";
import { generateEmbedding, normalizeVector } from "@/lib/ai/embedding.service";

/** the most characters of one announcement that make its own vector (the circulars' whole-document rule) */
export const RECORD_EMBED_CHARS = 8192;

/**
 * The text an announcement's own vector is made from: its title, its body text, and the start of the text of its PDF (so that an announcement that is only a title and a PDF is found by what the PDF says,
 * not by its title alone). Plain text, never HTML. Empty when there is nothing at all.
 */
export function recordEmbeddingText(title: string, contentText: string | null | undefined, pdfText?: string | null): string {
  const parts = [title || "", contentText || "", pdfText || ""].filter(Boolean);
  const text = parts.join("\n").trim();
  return text.length > RECORD_EMBED_CHARS ? text.slice(0, RECORD_EMBED_CHARS) : text;
}

/**
 * Compute and store the semantic embedding for a single announcement.
 *
 * Embeds `title + contentText + the start of its PDF's text` (plain text — never HTML), matching the
 * circular pipeline's 768-dim Gemini path. Writes the normalized vector into
 * announcement.embedding as a pgvector literal.
 *
 * `pdfText` left out = read from the PDF index if there is one (an edit of the title or body must not forget what the PDF says).
 *
 * Non-throwing: a Gemini failure logs and returns false so the caller (create
 * / edit) can still succeed — the announcement is simply not yet searchable
 * and will be indexed on its next save.
 */
export async function embedAnnouncement(
  announcementId: number,
  title: string,
  contentText: string | null | undefined,
  pdfText?: string | null,
): Promise<boolean> {
  try {
    // No embedding service key: nothing can be embedded, so the database is not touched either (the order matters for tests that run without any service: they must never reach a real database)
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
    const dataSource = await getDb();
    let pdf = pdfText;
    if (pdf === undefined) {
      try {
        const rows = await dataSource.query<any[]>(`SELECT pdf_text AS text FROM public.announcement_index WHERE announcement_id = $1 AND pdf_status = 'ready'`, [announcementId]);
        pdf = rows?.[0]?.text == null ? null : String(rows[0].text);
      } catch {
        pdf = null; // no index table yet: the title and body only
      }
    }
    const text = recordEmbeddingText(title, contentText, pdf);
    if (!text) return false; // nothing to embed

    const raw = await generateEmbedding(text, "search_document");
    const normalized = normalizeVector(raw);
    const vectorString = `[${normalized.join(",")}]`;

    await dataSource.query(
      `UPDATE public.announcement SET embedding = $1::vector WHERE id = $2`,
      [vectorString, announcementId],
    );

    console.log(`✅ Embedding indexed for announcement #${announcementId}`);
    return true;
  } catch (error: any) {
    console.error(
      `⚠️ Announcement embedding failed for #${announcementId}:`,
      error?.message ?? error,
    );
    return false;
  }
}

/** The same, for an announcement known only by its id (its title and body are read from the database). */
export async function embedAnnouncementById(announcementId: number): Promise<boolean> {
  try {
    const dataSource = await getDb();
    const rows = await dataSource.query<any[]>(`SELECT title, "contentText" FROM public.announcement WHERE id = $1`, [announcementId]);
    if (!rows?.[0]) return false;
    return embedAnnouncement(announcementId, String(rows[0].title ?? ""), rows[0].contentText == null ? null : String(rows[0].contentText));
  } catch (error: any) {
    console.error(`⚠️ Announcement embedding failed for #${announcementId}:`, error?.message ?? error);
    return false;
  }
}
