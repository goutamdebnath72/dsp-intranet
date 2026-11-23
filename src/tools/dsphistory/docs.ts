// src/tools/dsphistory/docs.ts
//
// The documents the card's page links open in its own viewer (pure): a page number on the card opens that page of the document, drawn with the quoted words marked (DocViewer.tsx, PdfPageView.tsx). I keep every one of them
// ONCE in Vercel Blob (scripts/upload-history-docs.ts) and serve it by our own route, GET /api/history-docs/<id> (serve.ts), because the browser cannot read another site's PDF itself (pdf.js needs the bytes), the browser's own
// viewer cannot mark words, and fetching a publisher's file live from our server is not dependable (sail.co.in serves an incomplete certificate chain that Node refuses; a ministry's site may refuse a data centre).
//   * INTERNAL documents (the two JO Manuals 2022, which have no web address): the reader must be signed in.
//   * PUBLISHED PDFs (SAIL's Steel Cities book, the annual reports, the Lok Sabha replies, an obituary): public, so anyone may read them; their own address (`remote`) is where the copy came from and where "Open the whole
//     document" leads. I serve only the ids below: the route is not a general proxy.
// The page numbers the card cites are checked against the text of each PDF (scripts/check-manual-marks.ts: every cited quote is found on its page).
import { SRC } from "./history";

export interface HistoryDoc {
  /** This is the name the reader sees at the top of the viewer. */
  title: string;
  /** I save the copy under this name in Blob (the upload adds a random suffix). */
  blobName: string;
  /** For an internal document: its file as received (the upload reads it from a folder) and its number of pages. */
  file?: string;
  pages?: number;
  /** For a published PDF: its own address (the upload downloads it from there; "Open the whole document" leads there). */
  remote?: string;
}

export const DOCS: Readonly<Record<string, HistoryDoc>> = {
  "jo-086": { title: "SAIL JO Manual 2022, Industry & Company Awareness (file 086)", file: "086. SAIL JO Manual 2022 - Industry & Company Awarness.pdf", blobName: "history-docs/jo-086.pdf", pages: 102 },
  "jo-089": { title: "DSP JO Manual 2022, Revised Plant Specific Manual (file 089)", file: "089. DSP JO Manual 2022 - Revised Plant Specific Manual.pdf", blobName: "history-docs/jo-089.pdf", pages: 49 },
  "steel-cities": { title: SRC.cities.name, blobName: "history-docs/steel-cities.pdf", remote: SRC.cities.url },
  "lok-sabha-5356": { title: SRC.lokSabha.name, blobName: "history-docs/lok-sabha-5356.pdf", remote: SRC.lokSabha.url },
  "lok-sabha-1228": { title: SRC.lsReply.name, blobName: "history-docs/lok-sabha-1228.pdf", remote: SRC.lsReply.url },
  "steel-ministry-ar-2025-26": { title: SRC.mos26.name, blobName: "history-docs/steel-ministry-ar-2025-26.pdf", remote: SRC.mos26.url },
  "sail-ar-2022-23": { title: SRC.ar23.name, blobName: "history-docs/sail-ar-2022-23.pdf", remote: SRC.ar23.url },
  "sail-ar-2024-25": { title: SRC.ar25.name, blobName: "history-docs/sail-ar-2024-25.pdf", remote: SRC.ar25.url },
  "sail-ar-2025-26": { title: SRC.ar26.name, blobName: "history-docs/sail-ar-2025-26.pdf", remote: SRC.ar26.url },
  "skipper-ar-2014-15": { title: SRC.skipper.name, blobName: "history-docs/skipper-ar-2014-15.pdf", remote: SRC.skipper.url },
  "inae-obituary": { title: SRC.inae.name, blobName: "history-docs/inae-obituary.pdf", remote: SRC.inae.url },
};

/** I treat a published PDF as public; an internal document needs a signed-in reader. */
export const isPublic = (d: HistoryDoc): boolean => !!d.remote;

/** My own route for a document (the PDF itself; `?info=1` answers {title, pages?, bytes} as JSON, after the same sign-in check where one is needed) */
export const docRoute = (id: string): string => `/api/history-docs/${id}`;

/** I build the link to a page of a document this way, and the viewer and a plain link both use it (the browser's own PDF viewer takes #page=) */
export const docPageHref = (id: string, page: number): string => `${docRoute(id)}#page=${Math.max(1, Math.trunc(page))}`;

/** For "Open the whole document" I use the document at its own address where it has one (the reader leaves for the publisher's file), else our route */
export const wholeDocHref = (id: string, page: number): string => {
  const d = DOCS[id];
  return d?.remote ? `${d.remote}#page=${Math.max(1, Math.trunc(page))}` : docPageHref(id, page);
};
