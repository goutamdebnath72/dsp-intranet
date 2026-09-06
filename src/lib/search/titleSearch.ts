// src/lib/search/titleSearch.ts
import { DataSource, ILike } from "typeorm";
import { Circular } from "@/lib/db/models/circular.model";
import { Announcement } from "@/lib/db/models/announcement.model";
import { DateTime } from "luxon";

export type SearchResultRow = {
  id: number;
  type: "circular" | "announcement";
  headline: string;
  url: string | null;
  publishedAt: string | null;
  similarity?: number | null;
  chunkText?: string | null;
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
    }),
    announcementRepository.find({
      where: { title: ILike(`%${q}%`) },
      order: { date: "DESC" },
      take: 5,
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
