// src/lib/announcements/highlightHtml.ts
import { classifyQuoted, highlightRegexSource } from "@/lib/search/quotedMatch";

/**
 * I wrap query matches in <mark> WITHIN an already-sanitized HTML string, without
 * corrupting its tags. I only ever insert marks into text that sits between
 * tags (the ">...<" gaps), never inside a tag or an attribute value, so
 * existing <span style="color:..."> etc. stay intact.
 *
 * Matching mirrors the search + excerpt highlighter (classifyQuoted +
 * highlightRegexSource): a double-quoted Latin phrase is whole-word;
 * everything else is a case-insensitive substring. I give the <mark> the same class as
 * the search-list excerpt, for a consistent look.
 */
export function highlightAnnouncementHtml(
  safeHtml: string,
  query: string | null | undefined,
): string {
  const html = safeHtml || "";
  const q = (query || "").trim();
  if (!html || !q) return html;

  const mode = classifyQuoted(q);
  const phrase = mode.phrase;
  if (!phrase || phrase.length < 2) return html;

  let matcher: RegExp;
  try {
    // Global + case-insensitive; the source is the same one search uses.
    matcher = new RegExp(highlightRegexSource(mode), "gi");
  } catch {
    return html;
  }

  const MARK_OPEN =
    '<mark class="bg-yellow-300 text-yellow-900 font-extrabold px-1 rounded-sm shadow-sm">';
  const MARK_CLOSE = "</mark>";

  // I split the HTML into tags and text. Odd segments (tags) are passed through
  // untouched; even segments (visible text) get the highlight applied.
  const segments = html.split(/(<[^>]+>)/g);

  return segments
    .map((seg) => {
      if (!seg) return seg;
      // A tag segment starts with "<": I never touch it.
      if (seg.startsWith("<")) return seg;
      // Text segment: I wrap matches. I reset lastIndex per segment for /g safety.
      matcher.lastIndex = 0;
      return seg.replace(matcher, (m) => `${MARK_OPEN}${m}${MARK_CLOSE}`);
    })
    .join("");
}
