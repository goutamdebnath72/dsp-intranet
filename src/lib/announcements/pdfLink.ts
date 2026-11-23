// src/lib/announcements/pdfLink.ts
//
// WORDS IN AN ANNOUNCEMENT THAT OPEN ITS PDF (pure). A word or a group of words of the body can be made a link to the announcement's PDF: the author selects them and presses "PDF link" in the editor's toolbar. The link
// carries NO address: it is the marker data-pdf-link on an <a> element, nothing else. The announcement's window (src/components/AnnouncementModal.tsx) turns a click on it into "open the PDF full screen"; the PDF is the
// one the announcement has (src/lib/announcements/attachment.ts, served by our own route). Because I give the link no address, nothing can be made to point anywhere else, whatever is pasted or typed.
// An announcement with NO PDF cannot have such a link: the saving code (admin/store.ts) turns the words back into plain text, and so does the window when it knows there is no PDF.

/** The marker attribute of a PDF link. */
export const PDF_LINK_ATTR = "data-pdf-link";

const PDF_LINK_RE = /<a\b[^>]*\bdata-pdf-link\b[^>]*>([\s\S]*?)<\/a>/gi;

/** Returns the same words with every PDF link taken off; the words stay. */
export function stripPdfLinks(html: string | null | undefined): string {
  return String(html ?? "").replace(PDF_LINK_RE, "$1");
}

/** Does this body hold at least one PDF link? */
export function hasPdfLinks(html: string | null | undefined): boolean {
  return /<a\b[^>]*\bdata-pdf-link\b/i.test(String(html ?? ""));
}
