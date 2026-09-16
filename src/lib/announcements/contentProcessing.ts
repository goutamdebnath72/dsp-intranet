// src/lib/announcements/contentProcessing.ts
import DOMPurify from "isomorphic-dompurify";

// The only tags/attributes the rich-text editor can produce (bold, italic,
// underline, colored text, paragraphs/line breaks). Anything outside this set
// is stripped on save so a crafted payload can never inject script/style/img
// or event handlers into a stored announcement.
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "span",
];

// `style` is allowed only so the editor's text color (color: #rrggbb) survives;
// DOMPurify still scrubs dangerous style values. No href/src/event attributes.
const ALLOWED_ATTR = ["style"];

/**
 * Sanitize editor HTML for safe storage + rendering. Removes any tag or
 * attribute outside the rich-text whitelist. Returns a trimmed string;
 * an effectively-empty document collapses to "".
 */
export function sanitizeAnnouncementHtml(
  html: string | null | undefined,
): string {
  const raw = (html || "").trim();
  if (!raw) return "";

  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Block URI-bearing attributes entirely (defense in depth; none are in
    // ALLOWED_ATTR anyway).
    ALLOWED_URI_REGEXP: /^$/,
  }).trim();

  // Editor emits "<p></p>" for an empty doc.
  return clean === "<p></p>" ? "" : clean;
}

/**
 * Derive a plain-text projection of the (already sanitized) HTML for embedding
 * and literal search. Block elements become spaces so words don't run
 * together; entities are decoded; whitespace is collapsed.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  const raw = (html || "").trim();
  if (!raw) return "";

  // Strip to text: DOMPurify with no allowed tags returns the text content
  // with tags removed. We first turn block/line boundaries into spaces.
  const spaced = raw
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, " "); // drop any remaining tags

  // Decode a handful of common entities, then collapse whitespace.
  const decoded = spaced
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  return decoded.replace(/\s+/g, " ").trim();
}