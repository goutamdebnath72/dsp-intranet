// src/lib/announcements/contentProcessing.ts
import sanitizeHtml from "sanitize-html";

// The only tags the rich-text editor can produce (bold, italic, underline,
// colored text via <span style="color">, paragraphs/line breaks). Anything
// outside this set is stripped on save so a crafted payload can never inject
// script/style/img or event handlers into a stored announcement.
//
// sanitize-html is pure Node (no jsdom / no ESM chain), so it bundles cleanly
// into the Vercel serverless runtime — unlike isomorphic-dompurify, whose
// jsdom dependency triggers ERR_REQUIRE_ESM there.
const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "span"];

/**
 * Sanitize editor HTML for safe storage + rendering. Removes any tag or
 * attribute outside the rich-text whitelist. `style` is permitted only for a
 * text `color` (the editor's one styling feature); every other style property
 * and all URI-bearing attributes are dropped. Returns a trimmed string; an
 * effectively-empty document collapses to "".
 */
export function sanitizeAnnouncementHtml(
  html: string | null | undefined,
): string {
  const raw = (html || "").trim();
  if (!raw) return "";

  const clean = sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    // Allow the style attribute on span only (for color).
    allowedAttributes: {
      span: ["style"],
    },
    // Whitelist ONLY the color CSS property, with sane value shapes
    // (#rrggbb, rgb(), or a bare color keyword). Anything else is stripped.
    allowedStyles: {
      "*": {
        color: [
          /^#(0x)?[0-9a-fA-F]+$/,
          /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/,
          /^[a-zA-Z]+$/,
        ],
      },
    },
    // No links, images, or URI schemes at all.
    allowedSchemes: [],
    disallowedTagsMode: "discard",
  }).trim();

  // An empty editor doc collapses to "<p></p>" -> normalize to "".
  return clean === "<p></p>" ? "" : clean;
}

/**
 * Derive a plain-text projection of the (already sanitized) HTML for embedding
 * and literal search. Block/line boundaries become spaces so words don't run
 * together; entities are decoded; whitespace is collapsed.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  const raw = (html || "").trim();
  if (!raw) return "";

  const spaced = raw
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, " "); // drop any remaining tags

  const decoded = spaced
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  return decoded.replace(/\s+/g, " ").trim();
}
