// src/lib/search/siteSearch.ts
import { links } from "@/lib/links";

export interface SiteResult {
  title: string;
  subtitle?: string;
  href: string; // "#" or empty means "no link yet"
  category: string;
  hasLink: boolean;
  score: number;
}

// Collapse to a tight token: lowercase, keep only letters/digits + Indic.
// "C & IT" -> "cit", "e-Str2" -> "estr2", "राजभाषा" stays.
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F\u0980-\u09FF]+/g, "");
}

// Split a title into normalized words for word-start / word-boundary checks.
function words(title: string): string[] {
  return (title || "")
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097F\u0980-\u09FF]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

// Connector words ignored when forming an acronym.
const CONNECTORS = new Set(["and", "of", "the", "for", "to"]);

// Acronym = first letter of each significant word. "Wheel & Axle" -> "wa".
function acronym(title: string): string {
  return words(title)
    .map((w) => normalize(w))
    .filter((w) => w && !CONNECTORS.has(w))
    .map((w) => w[0])
    .join("");
}

/**
 * Search the static site directory (links.js) by name.
 *
 * Tiered scoring (higher = better):
 *   100 exact name match (normalized)
 *    80 whole normalized name starts with the query
 *    60 any word in the name starts with the query (acronym / prefix)
 *    40 any word in the name CONTAINS the query (word-bounded; avoids mid-word
 *       hits like "erp" inside "Sinter Plant")
 *    20 the query contains the whole name (user typed extra words)
 *
 * Returns ALL matches, linked or not — the caller shows a "link not yet
 * available" note for URL-less entries.
 */
export function searchSites(query: string, limit = 6): SiteResult[] {
  const q = normalize(query);
  if (q.length < 2) return [];

  // Contiguous whole-word concatenations of the query. A short site acronym is
  // only matched if the query SPELLS IT OUT with whole words (e.g. "c" + "it" ->
  // "cit" for C&IT), never as a fragment inside a longer word ("lis" in "list").
  const qWords = words(query).map(normalize).filter(Boolean);
  const qRuns = new Set<string>();
  for (let i = 0; i < qWords.length; i++) {
    let acc = "";
    for (let j = i; j < Math.min(i + 5, qWords.length); j++) {
      acc += qWords[j];
      qRuns.add(acc);
    }
  }

  const out: SiteResult[] = [];

  // A query with "&" signals ACRONYM intent (w&a -> Wheel & Axle): match only the
  // full name (c&it -> "cit") or the acronym, never loose word-prefixes.
  const acronymMode = /&/.test(query);

  for (const link of links) {
    const title = link.title || "";
    const nTitle = normalize(title);
    if (!nTitle) continue;

    const ws = words(title).map(normalize).filter(Boolean);

    const acr = acronym(title);

    // Banding: full-name exact (100) > acronym matches (92 exact / 85 prefix,
    // i.e. consecutive word-initials like Wheel+Axle) > single-title prefix (80)
    // > single-word start (60) > word contains (40) > spelled-out run (20).
    // So EVERY consecutive-initials match ranks above any single-word prefix.
    let score = 0;
    if (acronymMode) {
      if (nTitle === q) score = 100; // "c&it" -> full name "cit"
      else if (acr === q) score = 92; // "w&a" -> initials "wa"
      else if (acr.startsWith(q) && q.length >= 2) score = 85;
    } else {
      if (nTitle === q) score = 100;
      else if (acr === q) score = 92;
      else if (acr.startsWith(q) && q.length >= 2) score = 85;
      else if (nTitle.startsWith(q)) score = 80;
      else if (ws.some((w) => w.startsWith(q))) score = 60;
      else if (ws.some((w) => w.includes(q))) score = 40;
      else if (qRuns.has(nTitle) && nTitle.length >= 2) score = 20;
    }

    // Also match the subtitle (e.g. BAMS has subtitle "(Attendance)"), scored a
    // notch below the equivalent title match so title hits always rank higher.
    if (score === 0 && link.subtitle) {
      const sws = words(link.subtitle).map(normalize).filter(Boolean);
      const nSub = normalize(link.subtitle);
      if (nSub === q) {
        score = 70;
      } else if (sws.some((w) => w.startsWith(q))) {
        score = 50;
      } else if (sws.some((w) => w.includes(q))) {
        score = 30;
      }
    }

    if (score > 0) {
      const hasLink = !!link.href && link.href !== "#";
      out.push({
        title,
        subtitle: link.subtitle,
        href: link.href || "#",
        category: link.category,
        hasLink,
        score: score + (hasLink ? 1 : 0) + Math.max(0, 5 - nTitle.length) * 0.1,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
