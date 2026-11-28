// src/lib/live/bingImages.ts
//
// PICTURES FOR THE STORIES OF A PAPER THAT DOES NOT LET ITS PAGES BE READ. Anandabazar Patrika and The Telegraph refuse every automated request (403, even for robots.txt), so I cannot take the picture from their story pages, and I do not work around
// a refusal. Their stories reach the cards through Google News, whose feed has no pictures. Bing News holds the same stories WITH a picture (its own thumbnail, which it will size to what is asked): I ask it about each of those papers and give a story
// the picture of the Bing item that is the same story, when there is one. Bing's index is some hours behind Google's, so the newest stories often have no match yet (measured 28 Nov 2026: Bing held 7 of the newest 20 Anandabazar stories and 46 of 279
// over two days): a story with no match shows its tile. Bing is used for the PICTURES only: its items are never shown as stories, so its delay costs the lists nothing.
import { decodeEntities, safeLink, titleKey, wordsOf, isNumber, type FeedItem } from "./rss";

export interface PictureHint { title: string; image: string }

/** Bing News' RSS search of one paper's site, newest first. */
export const bingSite = (site: string, lang: "en" | "bn"): { name: string; url: string; home: string } => ({
  name: "Bing News (pictures)",
  url: `https://www.bing.com/news/search?q=${encodeURIComponent(`site:${site}`)}&format=rss&cc=in&setlang=${lang}&qft=${encodeURIComponent('sortbydate="1"')}`,
  home: "https://www.bing.com/news",
});

/** The picture of one item of Bing's feed (its <News:Image>), asked of Bing at 720 x 480 (3:2), over https and only on Bing's own host; "" when it has none. */
export function bingPictureOf(block: string): string {
  const raw = decodeEntities(/<News:Image>([\s\S]*?)<\/News:Image>/i.exec(block)?.[1] ?? "").trim();
  const u = safeLink(raw.replace(/^http:/i, "https:"));
  if (!u) return "";
  try {
    const url = new URL(u);
    if (url.hostname !== "www.bing.com" && url.hostname !== "th.bing.com") return "";
    url.searchParams.set("w", "720"); url.searchParams.set("h", "480"); url.searchParams.set("c", "7");
    return url.toString();
  } catch {
    return "";
  }
}

/** The headline and the picture of each item of Bing's feed. */
export function parseBingPictures(xml: string): PictureHint[] {
  const out: PictureHint[] = [];
  for (const m of xml.matchAll(/<item>[\s\S]*?<\/item>/gi)) {
    const title = decodeEntities(/<title>([\s\S]*?)<\/title>/i.exec(m[0])?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const image = bingPictureOf(m[0]);
    if (title && image) out.push({ title, image });
  }
  return out;
}

const bare = (t: string) => titleKey(t.replace(/[.\u2026]+\s*$/, ""));

/**
 * Is the hint the SAME headline: the picture of one story must never be put on another (the owner wants a picture that is 100% relevant or none). So this is strict: the same words (one headline the beginning of the other, because Bing cuts a long headline with "..."),
 * or at least four words in which 85% of the shorter headline's words are shared and the figures do not disagree. Two stories of one company or one sector ("SAIL vs Jindal Steel: stocks compared", "Tata Steel, JSW, SAIL: fresh targets") are NOT the same.
 */
export function sameHeadline(a: string, b: string): boolean {
  const ka = bare(a), kb = bare(b);
  if (ka.length >= 12 && kb.length >= 12 && (ka.startsWith(kb) || kb.startsWith(ka))) return true;
  const A = wordsOf(a).list, B = wordsOf(b).list, inB = wordsOf(b).set;
  if (Math.min(A.length, B.length) < 4) return false;
  const na = A.filter(isNumber), nb = new Set(B.filter(isNumber));
  if (na.length && nb.size && !na.some((n) => nb.has(n))) return false;
  const shared = A.filter((w) => inB.has(w)).length;
  return shared / Math.min(A.length, B.length) >= 0.85;
}

/** Bing News' search for one headline (its first nine words, the paper's name taken off), in India's edition. */
export const bingHeadlineSearch = (title: string): string => {
  const words = title.replace(/\s+[-\u2013|]\s+[^-\u2013|]{2,40}$/, "").split(/\s+/).filter(Boolean).slice(0, 9).join(" ");
  return `https://www.bing.com/news/search?q=${encodeURIComponent(words)}&format=rss&cc=in`;
};

const FOUND = new Map<string, { image: string | null; at: number }>();
const FOUND_MAX = 600;
/** A picture found is kept a day; "none found" only twenty minutes, because Bing's index is some hours behind the papers and may have the story later. */
const keepFor = (image: string | null) => (image ? 24 * 60 * 60 * 1000 : 20 * 60 * 1000);

/** What the picture search of this headline gave before (undefined: not asked, or the answer is old). */
export function pictureFound(title: string, now = Date.now()): string | null | undefined {
  const k = titleKey(title), f = FOUND.get(k);
  return f && now - f.at < keepFor(f.image) ? f.image : undefined;
}

/**
 * A SECOND SOURCE FOR A PICTURE: when a story's own paper gives none (its page refuses or has none), Bing News is asked for that headline, and the picture of the item that is the SAME headline (sameHeadline) is taken; none that is the same: none (the story is then
 * not shown). `getText` is the reader of an address (null when it fails: then nothing is kept, so that it is asked again).
 */
export async function pictureByHeadline(title: string, getText: (url: string) => Promise<string | null>): Promise<string | null> {
  const known = pictureFound(title);
  if (known !== undefined) return known;
  const xml = await getText(bingHeadlineSearch(title));
  if (xml === null) return null;
  const image = parseBingPictures(xml).find((h) => sameHeadline(title, h.title))?.image ?? null;
  if (FOUND.size >= FOUND_MAX) FOUND.delete(FOUND.keys().next().value as string);
  FOUND.set(titleKey(title), { image, at: Date.now() });
  return image;
}

/** Gives each story that has no picture the picture of the hint that is the same story (the first, Bing's order); a story that has one is left as it is. */
export function attachPictures<T extends FeedItem>(items: T[], hints: PictureHint[]): T[] {
  if (!hints.length) return items;
  return items.map((it) => {
    if (it.image) return it;
    const h = hints.find((x) => sameHeadline(it.title, x.title));
    return h ? { ...it, image: h.image } : it;
  });
}
