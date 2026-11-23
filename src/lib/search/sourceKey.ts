// src/lib/search/sourceKey.ts
//
// ONE NUMBER FOR EVERY SOURCE OF A DEEP SUMMARY (EDS). The engine, its citations, its second reader and its stored briefings all know a source by a number. Circulars and announcements are in different
// tables, each with its own row numbers, so the same number can mean a circular and an announcement. I therefore move an ANNOUNCEMENT's number above every circular's: base + its own id. Circulars keep
// their own numbers (nothing stored under them changes). Whoever shows a source (a chip, a card) asks here which kind it is and what its real id is.

/** Added to an announcement's id wherever it travels as an EDS source. Circular ids are far below it (hundreds), and an announcement id must be below it too. */
export const ANNOUNCEMENT_SOURCE_BASE = 1_000_000;

/** Returns the EDS source number of an announcement, or null if its id cannot be moved (not a whole number from 1 to base - 1). */
export function announcementSourceId(id: number): number | null {
  return Number.isInteger(id) && id >= 1 && id < ANNOUNCEMENT_SOURCE_BASE ? ANNOUNCEMENT_SOURCE_BASE + id : null;
}

export function isAnnouncementSourceId(n: number): boolean {
  return Number.isInteger(n) && n > ANNOUNCEMENT_SOURCE_BASE && n < 2 * ANNOUNCEMENT_SOURCE_BASE;
}

/** Returns the announcement's real id from its EDS source number. A number that is not one comes back as it is, because it is a circular's. */
export function realSourceId(n: number): number {
  return isAnnouncementSourceId(n) ? n - ANNOUNCEMENT_SOURCE_BASE : n;
}
