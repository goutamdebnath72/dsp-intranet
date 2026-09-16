// src/lib/announcements/embedAnnouncement.ts
import { getDb } from "@/lib/db";
import { generateEmbedding, normalizeVector } from "@/lib/ai/embedding.service";

/**
 * Compute and store the semantic embedding for a single announcement.
 *
 * Embeds `title + contentText` (plain text — never HTML), matching the
 * circular pipeline's 768-dim Gemini path. Writes the normalized vector into
 * announcement.embedding as a pgvector literal.
 *
 * Non-throwing: a Gemini failure logs and returns false so the caller (create
 * / edit) can still succeed — the announcement is simply not yet searchable
 * and will be indexed on its next save.
 */
export async function embedAnnouncement(
  announcementId: number,
  title: string,
  contentText: string | null | undefined,
): Promise<boolean> {
  try {
    const parts = [title || "", contentText || ""].filter(Boolean);
    const text = parts.join("\n").trim();
    if (!text) return false; // nothing to embed

    const raw = await generateEmbedding(text, "search_document");
    const normalized = normalizeVector(raw);
    const vectorString = `[${normalized.join(",")}]`;

    const dataSource = await getDb();
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
