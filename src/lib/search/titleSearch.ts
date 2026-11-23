// src/lib/search/titleSearch.ts
import { PERF } from "@/lib/perf/switches";
import { DataSource, ILike } from "typeorm";
import { Circular } from "@/lib/db/models/circular.model";
import { Announcement } from "@/lib/db/models/announcement.model";
import { DateTime } from "luxon";

export type SearchResultRow = {
  id: number;
  type: "circular" | "announcement" | "holiday";
  headline: string;
  url: string | null;
  publishedAt: string | null;
  similarity?: number | null;
  chunkText?: string | null;
  matchPage?: number | null; // 1-based page of the best-matching chunk, the viewer's jump target
  matchPages?: number[]; // All distinct 1-based pages that contain a match
  /** Set for an announcement whose best evidence is a passage of its PDF (matchPage is then a page of that PDF) */
  matchInPdf?: boolean;
  /** Set for an announcement found by its words (the typed phrase, or most of the question's content words): I let it keep its place beside the circulars however low its cosine is */
  lexicalHit?: boolean;
};

export function formatLuxonDate(dateVal: any): string | null {
  if (!dateVal) return null;
  if (DateTime.isDateTime(dateVal)) return dateVal.toISO();
  if (dateVal instanceof Date) return DateTime.fromJSDate(dateVal).toISO();
  if (typeof dateVal === "string") {
    const parsed = DateTime.fromISO(dateVal);
    return parsed.isValid ? parsed.toISO() : dateVal;
  }
  return null;
}

export async function executeTitleSearch(
  dataSource: DataSource,
  q: string,
): Promise<SearchResultRow[]> {
  const circularRepository = dataSource.getRepository(Circular);
  const announcementRepository = dataSource.getRepository(Announcement);

  const [circularRows, announcementRows] = await Promise.all([
    circularRepository.find({
      where: { headline: ILike(`%${q}%`) },
      order: { publishedAt: "DESC" },
      take: 5,
      // I read only what is shown (src/lib/perf/switches.js: slimCircularReads), not the embedding and the extracted text of each row
      ...(PERF.slimCircularReads ? { select: { id: true, headline: true, fileUrls: true, publishedAt: true } } : {}),
    }),
    announcementRepository.find({
      where: { title: ILike(`%${q}%`) },
      order: { date: "DESC" },
      take: 5,
      ...(PERF.slimCircularReads ? { select: { id: true, title: true, date: true } } : {}),
    }),
  ]);

  const mappedCirculars: SearchResultRow[] = circularRows.map((r) => ({
    id: r.id,
    type: "circular",
    headline: r.headline,
    url: Array.isArray(r.fileUrls) && r.fileUrls.length ? r.fileUrls[0] : null,
    publishedAt: formatLuxonDate(r.publishedAt),
    similarity: null,
  }));

  const mappedAnnouncements: SearchResultRow[] = announcementRows.map((r) => ({
    id: r.id,
    type: "announcement",
    headline: r.title,
    url: `/announcements/${r.id}`,
    publishedAt: formatLuxonDate(r.date),
    similarity: null,
  }));

  return [...mappedCirculars, ...mappedAnnouncements].sort((a, b) => {
    const timeA = a.publishedAt
      ? DateTime.fromISO(a.publishedAt).toMillis()
      : 0;
    const timeB = b.publishedAt
      ? DateTime.fromISO(b.publishedAt).toMillis()
      : 0;
    return timeB - timeA;
  });
}
