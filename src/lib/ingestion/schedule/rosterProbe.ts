// src/lib/ingestion/schedule/rosterProbe.ts
//
// Is this circular a ROSTER (a health check-up schedule: a ruled table of T.No / Name / Deptt.Code / Department, with the date printed once per
// group of rows)? Decided from the PAGES, not from what the uploader typed as the headline.
//
// Two steps, cheapest first:
//   1. STRUCTURE (image only, about a second a page): a ruled table whose last column is cut into MERGED cells, far fewer than the rows beside them
//      (a roster prints each date once for a whole group of rows; an ordinary table has a rule on every row in every column). Pages of letters and
//      ordinary tables fail here, so an ordinary circular costs nothing but this look at its first few pages.
//   2. HEADINGS (one English OCR of ONE page, once per document): the top of the table must read like a roster's heading row: the TICKET column
//      (T.No) and at least two of Name, Deptt, Department, Date, Code. A ruled table with date cells that is NOT a roster stops here and is read
//      the normal way. (If the first roster-like page has no headings, being a continuation page, the next one is tried before giving up.)
//
// The probe looks at the first few pages only (ROSTER_DISCOVERY_PAGES): a circular that has shown no roster table by then is treated as an ordinary
// one, so no long document pays for a search it cannot need. Once a roster table is confirmed, every later page is looked at too (the schedule may
// run to the last page, and the page after it may be a letter).
//
// Nothing here writes anything or changes how an ordinary page is read.

import { clusterLines, findHorizontalLines, loadGray } from "./lines";
import { estimateTilt, deskewPng } from "./deskew";
import { findDateCells, findFrame, type Frame } from "./dateCells";
import { maskRules } from "./extractSchedule";
import { wordsFromTsv, type Word } from "./rosterRows";

/** How many of a document's first pages are looked at to find a roster table. */
export const ROSTER_DISCOVERY_PAGES = 6;

export interface RosterStructure {
  rosterLike: boolean;
  why: string;
}

/** Does the page have the STRUCTURE of a roster: a ruled table with a column of merged date cells? (Looks at the picture only.) */
export async function analyzeRosterStructure(png: Buffer): Promise<RosterStructure> {
  const tilt = estimateTilt(await loadGray(png));
  const { png: straight } = await deskewPng(png, tilt.k);
  const g = await loadGray(straight);
  const frame = findFrame(g);
  if (!frame) return { rosterLike: false, why: "no ruled table" };
  const dc = findDateCells(g, frame);
  if (!dc) return { rosterLike: false, why: "a table without a date column" };
  // MERGED: the last column is cut into at most half as many cells as the column beside it is cut into rows. (On real roster pages the rows beside
  // the date column number 22 to 73 and its cells 2 to 12; in an ordinary table the two are the same.)
  const n = frame.rules.length;
  const xL = frame.rules[n - 3];
  const xR = frame.rules[n - 2];
  const width = xR - xL;
  const margin = Math.max(6, Math.round(0.03 * width));
  const rowRules = clusterLines(
    findHorizontalLines(g, {
      minLen: Math.round(0.85 * (width - 2 * margin)),
      maxGap: 4,
      windowFrom: Math.round(xL + margin),
      windowTo: Math.round(xR - margin),
      rowFrom: Math.max(0, Math.round(frame.top) - 12),
      rowTo: Math.min(g.height - 1, Math.round(frame.bottom) + 12),
    }),
    10,
  ).length;
  const rows = rowRules + 1;
  if (rows < 6 || dc.cells.length * 2 > rows) return { rosterLike: false, why: "a table whose last column is not cut into merged cells" };
  return { rosterLike: true, why: "a ruled table whose last column is cut into merged date cells" };
}

const OTHER_HEADINGS = ["name", "deptt", "department", "date", "code"];

/** How far below the top of the table frame the heading row is looked for (300 dpi pixels): the frame can start with a title block, which varies
 *  from one circular to the next (the heading row was found about 115 px down in one and about 220 px down in another). */
const HEADER_SEARCH_PX = 420;

/**
 * Do the words at the top of the table read like a roster's heading row: the TICKET column (T.No) and at least two of Name, Deptt, Department,
 * Date, Code? The ticket column is required so that a stray "name" or "date" in a table of something else cannot pass.
 */
export function headerLooksLikeRoster(words: Word[], frame: Pick<Frame, "top" | "rules">): boolean {
  const left = frame.rules[0] - 5;
  const right = frame.rules[frame.rules.length - 1] + 5;
  const hay = words
    .filter((w) => {
      const cy = w.top + w.height / 2;
      const cx = w.left + w.width / 2;
      return cy >= frame.top - 10 && cy <= frame.top + HEADER_SEARCH_PX && cx >= left && cx <= right;
    })
    .map((w) => w.text.toLowerCase().replace(/[^a-z]/g, ""))
    .join(" ");
  const ticketColumn = /\btno\b|ticketno|\bticket\b/.test(hay);
  return ticketColumn && OTHER_HEADINGS.filter((k) => hay.includes(k)).length >= 2;
}

/** Reads the heading row of the page's table (one English OCR of the page) and says whether it reads like a roster's. */
export async function confirmRosterHeader(png: Buffer, ocrTsv: (png: Buffer) => Promise<string>): Promise<boolean> {
  const tilt = estimateTilt(await loadGray(png));
  const { png: straight } = await deskewPng(png, tilt.k);
  const g = await loadGray(straight);
  const frame = findFrame(g);
  if (!frame) return false;
  const masked = await maskRules(straight, g, frame);
  return headerLooksLikeRoster(wordsFromTsv(await ocrTsv(masked)), frame);
}

export interface RosterVerdict {
  roster: boolean;
  why: string;
}

export interface RosterProbe {
  /** Page by page, in order. `ocrTsv` is an English whole-page OCR returning tesseract TSV (used once, to read the heading row). */
  classify(png: Buffer, pageNo: number, ocrTsv: (png: Buffer) => Promise<string>): Promise<RosterVerdict>;
  /** null = undecided, true = a roster circular, false = an ordinary one */
  readonly isRoster: boolean | null;
}

export function createRosterProbe(opts: { discoveryPages?: number } = {}): RosterProbe {
  const discoveryPages = opts.discoveryPages ?? ROSTER_DISCOVERY_PAGES;
  let confirmed: boolean | null = null;
  let headerTries = 0;
  return {
    get isRoster() {
      return confirmed;
    },
    async classify(png, pageNo, ocrTsv) {
      if (confirmed === false) return { roster: false, why: "this circular is not a roster" };
      if (confirmed === null && pageNo > discoveryPages) {
        confirmed = false; // no roster table in the first pages: an ordinary circular, and no more looking
        return { roster: false, why: `no roster table in the first ${discoveryPages} pages` };
      }
      const s = await analyzeRosterStructure(png);
      if (!s.rosterLike) return { roster: false, why: s.why };
      if (confirmed === null) {
        headerTries++;
        if (await confirmRosterHeader(png, ocrTsv)) confirmed = true;
        else {
          if (headerTries >= 2) confirmed = false; // two roster-like pages and neither has roster headings: not a roster
          return { roster: false, why: "a table with a date column, but its headings do not read like a roster's" };
        }
      }
      return { roster: true, why: s.why };
    },
  };
}
