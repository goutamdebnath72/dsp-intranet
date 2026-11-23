// src/lib/search/edsSources.ts
//
// These are the sources of a deep summary (EDS) taken from the search results: circulars AND announcements, in the order the search ranked them. A circular keeps its own number and gets its full text from its chunks; an announcement
// travels under its moved number (sourceKey.ts), its full text is its body and the text of its PDF, and it is named to the reader by its label. I do not treat a holiday note as a source. This is pure: the texts are given.

import type { SearchResultRow } from "./titleSearch";
import { announcementSourceId } from "./sourceKey";
import { announcementLabel } from "@/lib/announcements/searchIndex/edsSources";

export interface EdsSources {
  /** What the engine reads, in rank order. */
  sources: SearchResultRow[];
  /** The names of the announcements among them, by their moved number. */
  announcementLabels: Map<number, string>;
  /** The results as the screen lists them under the briefing. I put announcements under their moved numbers here too, so a citation and its card carry the same number. */
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
