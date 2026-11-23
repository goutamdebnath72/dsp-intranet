// src/lib/announcements/searchIndex/edsSources.ts
//
// ANNOUNCEMENTS AS SOURCES OF A DEEP SUMMARY (EDS): their full text (the body, then the text of the PDF) as the engine reads it, and the name a reader sees for each.
// I keep the numbers they travel under in src/lib/search/sourceKey.ts.

import type { DataSource } from "typeorm";
import { DateTime } from "luxon";
import { IST } from "@/lib/dates";

/** the most characters of one source handed to the writer; I use the circulars' own budget */
export const EDS_SOURCE_CHARS = 60000;

/** body, then the PDF's text, clamped: this is what the engine reads of an announcement */
export function announcementFullText(body: string | null | undefined, pdfText: string | null | undefined): string {
  const parts = [String(body ?? "").trim(), String(pdfText ?? "").trim()].filter(Boolean);
  const text = parts.join("\n");
  return text.length > EDS_SOURCE_CHARS ? text.slice(0, EDS_SOURCE_CHARS) : text;
}

/** I name an announcement to the reader in the briefing like this: Announcement "Title" (17 Nov 2026) */
export function announcementLabel(title: string, date: string | null | undefined): string {
  const t = String(title ?? "").replace(/\s+/g, " ").trim();
  const short = t.length > 60 ? `${t.slice(0, 59).trimEnd()}…` : t;
  const d = date ? DateTime.fromISO(date, { setZone: true }).setZone(IST) : null;
  return `Announcement “${short}”${d?.isValid ? ` (${d.toFormat("dd LLL yyyy")})` : ""}`;
}

/** The full text of these announcements by their real id. A database without the index tables gives the body alone; a failure gives nothing, and the caller keeps the search excerpt. */
export async function fetchAnnouncementFullText(ds: DataSource, ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const want = Array.from(new Set(ids.filter((n) => Number.isInteger(n) && n > 0)));
  if (want.length === 0) return out;
  const take = (rows: Array<Record<string, unknown>>) => {
    for (const r of rows) out.set(Number(r.id), announcementFullText(r.contentText as string | null, r.pdf_text as string | null));
  };
  try {
    take(await ds.query(
      `SELECT a.id, a."contentText", i.pdf_text
         FROM public.announcement a
         LEFT JOIN public.announcement_index i ON i.announcement_id = a.id AND i.pdf_status = 'ready'
        WHERE a.id = ANY($1::int[])`,
      [want],
    ));
  } catch {
    try {
      take(await ds.query(`SELECT id, "contentText", NULL AS pdf_text FROM public.announcement WHERE id = ANY($1::int[])`, [want]));
    } catch {
      /* I let the search excerpt stand */
    }
  }
  return out;
}
