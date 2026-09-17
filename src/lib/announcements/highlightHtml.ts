// src/lib/announcements/highlightHtml.ts
import { classifyQuoted, highlightRegexSource } from "@/lib/search/quotedMatch";

/**
 * Wrap query matches in <mark> WITHIN an already-sanitized HTML string, without
 * corrupting its tags. We only ever insert marks into text that sits between
 * tags (the ">...<" gaps) — never inside a tag or an attribute value — so
 * existing <span style="color:..."> etc. stay intact.
 *
 * Matching mirrors the search + excerpt highlighter (classifyQuoted +
 * highlightRegexSource): a double-quoted Latin phrase is whole-word;
 * everything else is a case-insensitive substring. The <mark> class matches
 * the search-list excerpt for a consistent look.
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
    // Global + case-insensitive; source is the same one search uses.
    matcher = new RegExp(highlightRegexSource(mode), "gi");
  } catch {
    return html;
  }

  const MARK_OPEN =
    '<mark class="bg-yellow-300 text-yellow-900 font-extrabold px-1 rounded-sm shadow-sm">';
  const MARK_CLOSE = "</mark>";

  // Split the HTML into tags vs text. Odd segments (tags) are passed through
  // untouched; even segments (visible text) get the highlight applied.
  const segments = html.split(/(<[^>]+>)/g);

  return segments
    .map((seg) => {
      if (!seg) return seg;
      // A tag segment starts with "<" — never touch it.
      if (seg.startsWith("<")) return seg;
      // Text segment: wrap matches. Reset lastIndex per segment for /g safety.
      matcher.lastIndex = 0;
      return seg.replace(matcher, (m) => `${MARK_OPEN}${m}${MARK_CLOSE}`);
    })
    .join("");
}
