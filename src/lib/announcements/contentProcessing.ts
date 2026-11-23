// src/lib/announcements/contentProcessing.ts
import sanitizeHtml from "sanitize-html";
import { paletteColourPatterns } from "@/lib/announcements/palette";
import { PDF_LINK_ATTR } from "@/lib/announcements/pdfLink";

// These are the only tags the rich-text editor can produce (bold, italic, underline,
// text in one of the palette's five colours via <span style="color">, paragraphs/line breaks). I strip anything
// outside this set on save so a crafted payload can never inject
// script/style/img or event handlers into a stored announcement.
//
// I use sanitize-html because it is pure Node (no jsdom / no ESM chain), so it bundles cleanly
// into the Vercel serverless runtime, unlike isomorphic-dompurify, whose
// jsdom dependency triggers ERR_REQUIRE_ESM there.
// "a" is allowed ONLY as the marker of a PDF link (see below): it never keeps an address.
const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "span", "a"];

/**
 * I sanitize editor HTML for safe storage and rendering. Any tag or
 * attribute outside the rich-text whitelist is removed. `style` is permitted only for a
 * text `color` (the editor's one styling feature); I drop every other style property
 * and all URI-bearing attributes. Returns a trimmed string; an
 * effectively-empty document collapses to "".
 */
export function sanitizeAnnouncementHtml(
  html: string | null | undefined,
): string {
  const raw = (html || "").trim();
  if (!raw) return "";

  const clean = sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    // I allow the style attribute on span only (for color).
    allowedAttributes: {
      span: ["style"],
      // I allow a PDF link as an <a> with the marker and nothing else (no href: see src/lib/announcements/pdfLink.ts)
      a: [PDF_LINK_ATTR, "role", "tabindex", "title"],
    },
    transformTags: {
      // I turn an <a> with the marker into exactly the PDF link (whatever else it carried, an address included, is dropped); any other <a> (a link pasted from a page) becomes a plain <span>, so its words stay and its address does not.
      a: (_tag, attribs) => {
        const out: { tagName: string; attribs: Record<string, string> } =
          attribs[PDF_LINK_ATTR] !== undefined
            ? { tagName: "a", attribs: { [PDF_LINK_ATTR]: "true", role: "button", tabindex: "0", title: "Opens the PDF" } }
            : { tagName: "span", attribs: {} };
        return out;
      },
    },
    // I whitelist ONLY the color CSS property, and of colours only the editor's own five (src/lib/announcements/palette.ts), as #rrggbb or as rgb(r, g, b).
    // Any other colour (the pale grey that pasted text carries, a keyword, a stray hex) is stripped: it dimmed the body of an announcement.
    allowedStyles: {
      "*": {
        color: paletteColourPatterns(),
      },
    },
    // I allow no links with an address, no images, and no URI schemes at all.
    allowedSchemes: [],
    disallowedTagsMode: "discard",
  }).trim();

  // An empty editor doc collapses to "<p></p>", so I normalize it to "".
  return clean === "<p></p>" ? "" : clean;
}

/**
 * I derive a plain-text projection of the (already sanitized) HTML for embedding
 * and literal search. Block/line boundaries become spaces so words don't run
 * together; entities are decoded; whitespace is collapsed.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  const raw = (html || "").trim();
  if (!raw) return "";

  const spaced = raw
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, " "); // I drop any remaining tags

  const decoded = spaced
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  return decoded.replace(/\s+/g, " ").trim();
}
