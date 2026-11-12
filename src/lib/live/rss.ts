// src/lib/live/rss.ts
//
// HEADLINES FROM THE NEWS SITES' OWN RSS FEEDS (the feeds they publish for exactly this use): a headline, where it came from, when, and the link to the story, which the card opens in a new tab.
// Only the headline and the link are taken, never the story: the reader goes to the publisher for it. Pure: the feed's text in, the items out (tested on saved slices of real feeds).
import { DateTime } from "luxon";

export interface FeedItem {
  title: string;
  /** an http(s) link to the story, nothing else (a "javascript:" or "data:" link is dropped) */
  link: string;
  /** ISO time, or "" when the feed gave none that could be read */
  publishedAt: string;
  /** the publisher, from the feed or, for an aggregator, the name after the last " - " of the headline */
  source: string;
  /** the feed's own short description, tags removed (used only to sort sports stories, never shown) */
  summary: string;
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", ndash: "–", mdash: "—" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]{1,6});/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => NAMED[n.toLowerCase()] ?? m);
}

/** the text of a tag: CDATA unwrapped, markup removed, entities decoded, white space collapsed */
function field(block: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (!m) return "";
  let v = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
  v = cdata ? cdata[1] : v;
  v = decodeEntities(v.replace(/<[^>]+>/g, " ")).replace(/<[^>]+>/g, " ");
  return v.replace(/\s+/g, " ").trim();
}

export function parseDate(s: string): string {
  const t = s.trim();
  if (!t) return "";
  const d = DateTime.fromRFC2822(t, { setZone: true });
  if (d.isValid) return d.toUTC().toISO() ?? "";
  const iso = DateTime.fromISO(t, { setZone: true });
  return iso.isValid ? (iso.toUTC().toISO() ?? "") : "";
}

export function safeLink(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/** The items of an RSS 2.0 feed. `defaultSource` names the publisher when the item does not; with `splitSource`, a trailing " - Publisher" is moved out of the headline (Google News). */
export function parseRss(xml: string, defaultSource: string, splitSource = false): FeedItem[] {
  const out: FeedItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    let title = field(block, "title");
    const link = safeLink(field(block, "link") || field(block, "guid"));
    if (!title || !link) continue;
    let source = field(block, "source") || defaultSource;
    if (splitSource) {
      const i = title.lastIndexOf(" - ");
      if (i > 10) { source = title.slice(i + 3).trim() || source; title = title.slice(0, i).trim(); }
    }
    out.push({ title, link, publishedAt: parseDate(field(block, "pubDate") || field(block, "dc:date")), source, summary: field(block, "description").slice(0, 400) });
  }
  return out;
}

/** headline of two feeds that are the same story: lower case, only letters and digits, the first 60 of them */
export const titleKey = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 60);

/**
 * One list from several feeds, in the order of importance the feeds themselves give: the first story of each, then the second of each, and so on (a round robin), so that no one publisher fills
 * the list; the same story twice (by headline) is shown once, from the first feed that has it. Stories older than `maxAgeHours` are dropped when they carry a date.
 */
export function mergeFeeds(feeds: FeedItem[][], limit: number, now: DateTime, maxAgeHours = 36): FeedItem[] {
  const fresh = (i: FeedItem) => {
    if (!i.publishedAt) return true;
    const d = DateTime.fromISO(i.publishedAt);
    return !d.isValid || now.diff(d, "hours").hours <= maxAgeHours;
  };
  const lists = feeds.map((f) => f.filter(fresh));
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (let rank = 0; out.length < limit && lists.some((l) => rank < l.length); rank++) {
    for (const l of lists) {
      const it = l[rank];
      if (!it) continue;
      const k = titleKey(it.title);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(it);
      if (out.length >= limit) break;
    }
  }
  return out;
}
