// src/lib/live/text.ts
//
// THE TEXT OF A WEB PAGE, flat: scripts and styles removed, every tag a separator ("|"), entities decoded, runs of separators and spaces collapsed. The parsers of the live cards read this flat
// text for the few labelled tables they need ("Petrol Price in Indian Metro Cities ... | New Delhi | ₹102.12 | 0.00 |"), which is far steadier than the page's markup.

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " ", "&rupee;": "₹" };

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, "|")
    .replace(/&#x([0-9a-f]{1,6});/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|rupee);/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .replace(/(?:\s*\|\s*)+/g, "| ")
    .trim();
}

/** "₹2,775.00" or "2,775" -> 2775; null when it is not a plain amount */
export function amount(s: string | undefined): number | null {
  const m = /^[^\d-]*(-?\d[\d,]*(?:\.\d+)?)/.exec((s ?? "").trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
