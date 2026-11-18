// src/lib/search/sourceKey.ts
//
// ONE NUMBER FOR EVERY SOURCE OF A DEEP SUMMARY (EDS). The engine, its citations, its second reader and its stored briefings all know a source by a number. Circulars and announcements are in different
// tables, each with its own row numbers, so the same number can mean a circular and an announcement. An ANNOUNCEMENT's number is therefore moved above every circular's: base + its own id. Circulars keep
// their own numbers (nothing stored under them changes); whoever shows a source (a chip, a card) asks here which kind it is and what its real id is.

/** Added to an announcement's id wherever it travels as an EDS source. Circular ids are far below it (hundreds); an announcement id must be below it too. */
export const ANNOUNCEMENT_SOURCE_BASE = 1_000_000;

/** the EDS source number of an announcement, or null if its id is not one that can be moved (not a whole number from 1 to base - 1) */
export function announcementSourceId(id: number): number | null {
  return Number.isInteger(id) && id >= 1 && id < ANNOUNCEMENT_SOURCE_BASE ? ANNOUNCEMENT_SOURCE_BASE + id : null;
}

export function isAnnouncementSourceId(n: number): boolean {
  return Number.isInteger(n) && n > ANNOUNCEMENT_SOURCE_BASE && n < 2 * ANNOUNCEMENT_SOURCE_BASE;
}

/** the announcement's real id from its EDS source number (a number that is not one is returned as it is: it is a circular's) */
export function realSourceId(n: number): number {
  return isAnnouncementSourceId(n) ? n - ANNOUNCEMENT_SOURCE_BASE : n;
}
