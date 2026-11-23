// src/lib/announcements/pdfLinkMark.ts
//
// THE EDITOR'S "PDF LINK" MARK (Tiptap): words marked with it are written as <a data-pdf-link="true" role="button" tabindex="0" title="Opens the PDF">…</a> and nothing else (no address: see src/lib/announcements/pdfLink.ts).
// It replaces Tiptap's own Link, which StarterKit brings (it keeps an address and turns typed web addresses into links); I switch that one off in the editor.
import { Mark } from "@tiptap/core";

export const PdfLink = Mark.create({
  name: "pdfLink",
  // I do not want typing at the end of the linked words to extend the link
  inclusive: false,
  parseHTML() {
    return [{ tag: "a[data-pdf-link]" }];
  },
  renderHTML() {
    return ["a", { "data-pdf-link": "true", role: "button", tabindex: "0", title: "Opens the PDF" }, 0];
  },
});
