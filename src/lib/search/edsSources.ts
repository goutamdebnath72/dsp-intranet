// src/lib/search/edsSources.ts
//
// THE SOURCES OF A DEEP SUMMARY (EDS) FROM THE SEARCH RESULTS: circulars AND announcements, in the order the search ranked them. A circular keeps its own number and gets its full text from its chunks; an announcement
// travels under its moved number (sourceKey.ts), its full text is its body and the text of its PDF, and it is named to the reader by its label. A holiday note is not a source. Pure: the texts are given.

import type { SearchResultRow } from "./titleSearch";
import { announcementSourceId } from "./sourceKey";
import { announcementLabel } from "@/lib/announcements/searchIndex/edsSources";

export interface EdsSources {
  /** what the engine reads, in rank order */
  sources: SearchResultRow[];
  /** the names of the announcements among them, by their moved number */
  announcementLabels: Map<number, string>;
  /** the results as the screen lists them under the briefing: announcements under their moved numbers too, so a citation and its card are the same number */
  resultRows: SearchResultRow[];
}

export function assembleEdsSources(rows: SearchResultRow[], circularText: Map<number, string>, announcementText: Map<number, string>): EdsSources {
  const sources: SearchResultRow[] = [];
  const announcementLabels = new Map<number, string>();
  const resultRows: SearchResultRow[] = [];
  for (const r of rows) {
    if (r.type === "circular") {
      sources.push({ ...r, chunkText: circularText.get(r.id) || r.chunkText });
      resultRows.push(r);
    } else if (r.type === "announcement") {
      const sid = announcementSourceId(r.id);
      if (sid === null) { resultRows.push(r); continue; }
      sources.push({ ...r, id: sid, chunkText: announcementText.get(r.id) || r.chunkText });
      announcementLabels.set(sid, announcementLabel(r.headline, r.publishedAt));
      resultRows.push({ ...r, id: sid });
    } else {
      resultRows.push(r);
    }
  }
  return { sources, announcementLabels, resultRows };
}
