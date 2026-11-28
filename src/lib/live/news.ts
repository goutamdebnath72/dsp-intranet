// src/lib/live/news.ts
//
// The news card's sources: free feeds the publishers themselves offer. Its first tab is BUSINESS (what the executives of a company read first: The Economic Times, Mint, The Hindu BusinessLine and
// The Wall Street Journal), then the general headlines in English, Hindi and Bengali. I take headline, publisher, time and link only. A tab shows the feeds that answer; one that fails is left out
// (and named), and only when none answers is it an error.
//   Business Standard and Financial Express publish RSS feeds, but their servers refuse every automated request (even for robots.txt), so I do NOT use them: I do not work around a feed that cannot be read.
//   The feeds are free to read; some of the stories they point to (WSJ, Mint Premium, ET Prime, a BusinessLine subscriber piece) may ask for a subscription on the publisher's own page, which the card says.
import { DateTime } from "luxon";
import { curate as curateBengali, FRONT_PAGE } from "./bengali";
import { attachPictures, bingSite, parseBingPictures, type PictureHint } from "./bingImages";
import type { PageFacts } from "./pageFacts";
import { isReadableArticle, usableImage } from "./thumb";
import { mergeFeeds, newestFirst, parseRss, onePerPicture, parseSitemap, sameStory, titleKey, type FeedItem } from "./rss";
import { isSteelStory, searchItems, selectSteel, steelItemsOf, steelPapers, STEEL_HOURS, STEEL_SEARCHES } from "./steel";
import { assignDesk, priorityOf, recordMove, SCOPE_RANK, type DeskItem } from "./priority";
import { RECORD_SEARCHES } from "./records";

export type NewsLang = "en" | "hi" | "bn";
export const NEWS_LANGS: NewsLang[] = ["en", "hi", "bn"];
/** The card's tabs: business first (English), then the languages. */
export type NewsTab = "biz" | "steel" | NewsLang;
export const NEWS_TABS: NewsTab[] = ["biz", "steel", ...NEWS_LANGS];

export interface FeedSource {
  name: string;
  url: string;
  /** Set for an aggregator whose headlines end with " - Publisher". */
  splitSource?: boolean;
  /** Items of this feed that are not news and are left out (the printed edition's page listings). */
  skip?: (title: string) => boolean;
  /** The PRIORITY of the paper: how many stories it is given in each round of the merge (default 1). Equal weights are the same level; my top papers weigh 3, the second rank 2, the rest 1. */
  weight?: number;
  /** Set when the feed is of one paper only (a Google News search of one site): its items are named by the feed's own name, not by the name Google puts after the headline. */
  keepName?: boolean;
  /** The desk of this feed in a curated tab (a section of the paper: "sports", "metro"); see bengali.ts. */
  desk?: string;
  /** The paper's own home page, for the "Source" link when the feed itself is a search of Google News. */
  home?: string;
  /** True when the feed is a paper's news sitemap (headline, address, time and sometimes picture of each story), not RSS (parseSitemap in rss.ts). */
  sitemap?: boolean;
  /** Items of this feed whose ADDRESS says they are not stories (a short video, a gallery) and are left out. */
  skipLink?: (link: string) => boolean;
  /** How long one answer of this feed is kept before it is asked again; the route's own pace (a minute) when not set. The steel searches are asked every five minutes. */
  ttlMs?: number;
}

/** A listing of a PRINTED page ("কলকাতা, Friday, 13 Nov, 2026 | রাজ্য - page 3"). The card is for the online edition, so I leave these out. */
export const isPrintedPage = (title: string): boolean => /\bpage \d+\b/i.test(title);
/** A listing, not a story: a printed page, a section's own page ("West Bengal News in Bengali | বাংলার খবর", "Memari"), or anything of fewer than three words. */
export const isListing = (title: string): boolean => isPrintedPage(title) || /\bnews in bengali\b/i.test(title) || title.trim().split(/\s+/).length < 3;

export const NEWS_SOURCES: Record<NewsLang, FeedSource[]> = {
  // English, in my PRIORITY: the first three are the top level (weight 3, the same level), Hindustan Times and The Indian Express the second (weight 2), the rest after them (weight 1).
  // The Telegraph's own feed refuses automated requests, so I read it through Google News' public feed of that one site (the links lead on to telegraphindia.com).
  en: [
    { name: "The Telegraph", url: "https://news.google.com/rss/search?q=site:telegraphindia.com+when:1d&hl=en-IN&gl=IN&ceid=IN:en", splitSource: true, keepName: true, skip: isPrintedPage, weight: 3, home: "https://www.telegraphindia.com/" },
    { name: "The Hindu", url: "https://www.thehindu.com/news/national/feeder/default.rss", weight: 3 },
    { name: "Times of India", url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms", weight: 3 },
    { name: "Hindustan Times", url: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml", weight: 2 },
    { name: "The Indian Express", url: "https://indianexpress.com/section/india/feed/", weight: 2 },
    { name: "NDTV", url: "https://feeds.feedburner.com/ndtvnews-top-stories" },
    { name: "BBC News India", url: "https://feeds.bbci.co.uk/news/world/asia/india/rss.xml" },
  ],
  // The Hindi papers in my ORDER OF PRIORITY (the first is chosen first, the first to be named, and wins a tie of time), each from its own online edition's free national feed.
  hi: [
    { name: "दैनिक भास्कर", url: "https://www.bhaskar.com/rss-v1--category-1061.xml" },
    { name: "दैनिक जागरण", url: "https://rss.jagran.com/rss/news/national.xml" },
    { name: "अमर उजाला", url: "https://www.amarujala.com/rss/india-news.xml" },
    { name: "हिन्दुस्तान", url: "https://api.livehindustan.com/feeds/rss/national/rssfeed.xml" },
    { name: "नवभारत टाइम्स", url: "https://navbharattimes.indiatimes.com/india/rssfeed/1564454.xml" },
  ],
  // The Bengali tab is hand-curated (src/lib/live/bengali.ts). I read Anandabazar Patrika's online edition SECTION BY SECTION (each section is a desk), because the paper's own sections are the best
  // judge of what a story is. Its own feed refuses automated requests, so each is a Google News search of that one section (the links lead on to anandabazar.com). The other Bengali papers follow, and help
  // tell what is trending (a story that three papers carry). The Kolkata section lies inside the West Bengal one, so a story in both is filed under the more specific desk (the heavier weight).
  bn: [
    { name: "Anandabazar Patrika", url: "https://news.google.com/rss/search?q=site:anandabazar.com/west-bengal+when:2d&hl=bn&gl=IN&ceid=IN:bn", splitSource: true, keepName: true, skip: isListing, weight: 4, desk: "state", home: "https://www.anandabazar.com/" },
    { name: "Anandabazar Patrika", url: "https://news.google.com/rss/search?q=site:anandabazar.com/india+when:2d&hl=bn&gl=IN&ceid=IN:bn", splitSource: true, keepName: true, skip: isListing, weight: 4, desk: "national" },
    { name: "Anandabazar Patrika", url: "https://news.google.com/rss/search?q=site:anandabazar.com/west-bengal/kolkata+when:2d&hl=bn&gl=IN&ceid=IN:bn", splitSource: true, keepName: true, skip: isListing, weight: 5, desk: "metro" },
    { name: "Anandabazar Patrika", url: "https://news.google.com/rss/search?q=site:anandabazar.com/sports+when:2d&hl=bn&gl=IN&ceid=IN:bn", splitSource: true, keepName: true, skip: isListing, weight: 4, desk: "sports" },
    { name: "Anandabazar Patrika", url: "https://news.google.com/rss/search?q=site:anandabazar.com/business+when:2d&hl=bn&gl=IN&ceid=IN:bn", splitSource: true, keepName: true, skip: isListing, weight: 4, desk: "business" },
    { name: "Anandabazar Patrika", url: "https://news.google.com/rss/search?q=site:anandabazar.com/world+when:2d&hl=bn&gl=IN&ceid=IN:bn", splitSource: true, keepName: true, skip: isListing, weight: 4, desk: "world" },
    { name: "Anandabazar Patrika", url: "https://news.google.com/rss/search?q=site:anandabazar.com/entertainment+when:2d&hl=bn&gl=IN&ceid=IN:bn", splitSource: true, keepName: true, skip: isListing, weight: 4, desk: "entertainment" },
    { name: "Anandabazar Patrika", url: "https://news.google.com/rss/search?q=site:anandabazar.com+when:1d&hl=bn&gl=IN&ceid=IN:bn", splitSource: true, keepName: true, skip: isListing, weight: 3, desk: "other" },
    // The other Bengali dailies: Sangbad Pratidin's own feed answers; Bartaman, Ei Samay and Aajkaal I read as whole papers through Google News' public search of the one site (their own feeds are not open).
    { name: "Sangbad Pratidin", url: "https://www.sangbadpratidin.in/feed/", weight: 2, skip: isListing },
    // Bartaman and Ei Samay publish a news sitemap (fresher and fuller than a search of them, with the paper's own addresses, and Ei Samay's with a picture for each story): I read that, and not Google News.
    { name: "Bartaman", url: "https://bartamanpatrika.com/news-sitemap.xml", sitemap: true, skip: isListing, weight: 2, home: "https://bartamanpatrika.com/" },
    { name: "Ei Samay", url: "https://eisamay.com/news_sitemap.xml", sitemap: true, skip: isListing, skipLink: (l) => /\/(?:samay-shorts|shorts-video|videos?|photogallery)\//i.test(l), weight: 2, home: "https://eisamay.com/" },
    { name: "Aajkaal", url: "https://news.google.com/rss/search?q=site:aajkaal.in+when:2d&hl=bn&gl=IN&ceid=IN:bn", splitSource: true, keepName: true, skip: isListing, weight: 2 },
    { name: "BBC বাংলা", url: "https://feeds.bbci.co.uk/bengali/rss.xml", weight: 1 },
  ],
};

/** The business papers, in English: one feed of each, the corporate and business desk (I do not take the paper's general front page). */
export const BUSINESS_SOURCES: FeedSource[] = [
  { name: "The Economic Times", url: "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms" },
  { name: "Mint", url: "https://www.livemint.com/rss/companies" },
  { name: "The Hindu BusinessLine", url: "https://www.thehindubusinessline.com/feeder/default.rss" },
  { name: "The Wall Street Journal", url: "https://feeds.content.dowjones.io/public/rss/WSJcomUSBusiness" },
];

/** The tabs that are hand-curated rather than newest first: their stories are chosen and ordered by desk. */
const CURATED: Partial<Record<NewsTab, (stories: FeedItem[], limit: number) => FeedItem[]>> = { bn: curateBengali };

/** The Steel tab reads the steel searches (src/lib/live/steel.ts) and, after them, the business papers' own feeds (a steel story or a steel share's news in The Economic Times or Mint is steel news too); buildNews knows which is which by the place in this list. */
export const STEEL_TAB_SOURCES: FeedSource[] = [...STEEL_SEARCHES, ...BUSINESS_SOURCES];
/** The Business tab reads the four papers' own feeds and, after them, the record searches (records.ts): a record of the market, gold, silver or the rupee stands first. */
export const BUSINESS_TAB_SOURCES: FeedSource[] = [...BUSINESS_SOURCES, ...RECORD_SEARCHES];
export const SOURCES_OF = (tab: NewsTab): FeedSource[] => (tab === "biz" ? BUSINESS_TAB_SOURCES : tab === "steel" ? STEEL_TAB_SOURCES : NEWS_SOURCES[tab]);
/**
 * Feeds read ONLY for their pictures (src/lib/live/bingImages.ts): Bing News' search of the sites of the two papers that refuse automated reading (Anandabazar Patrika, The Telegraph), and of Aajkaal (whose own pages give a picture but
 * whose sitemap has English headlines only, so its stories come through Google News). Their items are never shown as stories; a story gets the picture of the item that is the same story.
 */
export const IMAGE_HELPERS: Record<NewsLang, Array<{ name: string; url: string; home: string }>> = {
  en: [bingSite("telegraphindia.com", "en")],
  hi: [],
  bn: [bingSite("anandabazar.com", "bn"), bingSite("anandabazar.com/west-bengal", "bn"), bingSite("anandabazar.com/india", "bn"), bingSite("anandabazar.com/sports", "bn"), bingSite("aajkaal.in", "bn")],
};
/** What the route reads for a tab: its sources, then (for a language tab) the picture helpers, in this order. */
export const READ_OF = (tab: NewsTab): Array<{ name: string; url: string; home?: string; ttlMs?: number }> => (isLang(tab) ? [...NEWS_SOURCES[tab], ...IMAGE_HELPERS[tab]] : SOURCES_OF(tab));
/** The pictures the helper feeds gave: the texts that come after the sources. */
const hintsOf = (lang: NewsLang, texts: Array<string | null> | undefined): PictureHint[] => (texts ?? []).slice(NEWS_SOURCES[lang].length).flatMap((t) => (t ? parseBingPictures(t) : []));

/**
 * THE OWNER'S TWO RULES FOR WHAT A CARD MAY SHOW, WITHOUT EXCEPTION, IN EVERY TAB (the Steel tab and the priority news too). (1) A story with no picture is not shown. (2) A story that needs a subscription is not shown.
 * Both are decided from the story's own page (src/lib/live/pageFacts.ts). The picture is looked for in this order: the feed's own; the paper's own page; a story of the same headline in the picture helpers' feeds; and, for a story still without one, Bing News searched
 * for that very headline (pictureByHeadline), accepted only when an item has the SAME headline, so that the picture is relevant or there is none. No picture after all of that: the story is discarded.
 */
export const PICTURE_REQUIRED = true;
export const PAID_STORIES_SHOWN = false;

/** What the owner's rules leave of a list: a story the paper marks as paid goes; a story with no picture goes (a priority story too); a story that has not been looked at keeps what its feed gave. */
export function applyFacts<T extends FeedItem>(items: T[], facts: ReadonlyMap<string, PageFacts> | undefined, opts: { requirePicture: boolean } = { requirePicture: PICTURE_REQUIRED }): T[] {
  // no facts at all (the pages were not asked: a test, or a caller that wants the plain list): the list as it is
  if (!facts) return items;
  return items.flatMap((it) => {
    const f = facts?.get(it.link);
    if (!PAID_STORIES_SHOWN && f?.paid) return [];
    // the picture of the feed, or else the one on the story's own page: whichever can become a thumbnail (a 17 MB animated GIF cannot)
    const image = [it.image, f?.image].find((x): x is string => !!x && usableImage(x));
    if (!image && opts.requirePicture) return [];
    return [image ? (image !== it.image ? { ...it, image } : it) : ((): T => { const { image: _drop, ...rest } = it; return rest as T; })()];
  });
}

/** The stories to look at next, in the order of the tab (what has been looked at is left out), at most `n`: only those of papers whose pages are read. */
const unlooked = (items: FeedItem[], facts: ReadonlyMap<string, PageFacts> | undefined, n: number): string[] => items.map((i) => i.link).filter((l, i, a) => isReadableArticle(l) && !facts?.has(l) && a.indexOf(l) === i).slice(0, n);

export const LANG_LABEL: Record<NewsTab, string> = { biz: "Business", steel: "Steel", en: "English", hi: "हिन्दी", bn: "বাংলা" };

export interface NewsData {
  /** True when every picture of the list has been looked at and is not a logo (the route sets it; a saved copy without it is not taken). */
  verified?: true;
  lang: NewsTab;
  items: FeedItem[];
  /** The feeds that answered, and the ones that did not. */
  used: string[];
  failed: string[];
  /** Steel tab only: the papers that carried the stories shown (there are many, so `used` names only the engines and the business papers that answered). */
  steelPapers?: string[];
}

export function isLang(x: string | null): x is NewsLang {
  return x === "en" || x === "hi" || x === "bn";
}

/** A tab the route will answer: business, steel or one of the languages (anything else is English). */
export function isTab(x: string | null): x is NewsTab {
  return x === "biz" || x === "steel" || isLang(x);
}

/** Returns the merged top stories of a language from the feeds' texts (a null text is a feed that did not answer). */
/** How many stories the card keeps: enough for a live screen, few enough to read. */
export const NEWS_LIMIT = 15;

/**
 * The STEEL tab: SAIL, its units, any other steel plant or company and the steel industry, hunted in many papers by the searches of steel.ts, and picked out of the business papers' own feeds too (share-price news of a steel company
 * is kept: many professionals follow it). Newest at the top, each story kept 48 hours after it was reported. `used` names the engines and papers that answered, `steelPapers` the papers that carried the stories shown.
 */
/** The steel stories of every steel search and of the business papers' feeds, before any rule is applied; and which engines and papers answered. */
function steelPool(texts: Array<string | null>): { pool: FeedItem[]; used: string[]; failed: string[] } {
  const pool: FeedItem[] = [];
  const used: string[] = [], failed: string[] = [];
  const engines: string[] = [], answered = new Set<string>();
  // An engine is "not answering" only when none of its searches answered (it is asked in several ways).
  STEEL_SEARCHES.forEach((s, j) => {
    if (!engines.includes(s.name)) engines.push(s.name);
    const text = texts[j] ?? null;
    if (text) { answered.add(s.name); pool.push(...steelItemsOf(s, text)); }
  });
  for (const e of engines) (answered.has(e) ? used : failed).push(e);
  BUSINESS_SOURCES.forEach((s, i) => {
    const text = texts[STEEL_SEARCHES.length + i] ?? null;
    const items = text ? parseRss(text, s.name, s.splitSource) : [];
    if (!items.length) { failed.push(s.name); return; }
    used.push(s.name);
    pool.push(...items.filter((it) => isSteelStory(it.title)));
  });
  return { pool, used, failed };
}

function buildSteel(texts: Array<string | null>, now: DateTime, meaning?: (a: string, b: string) => boolean, facts?: ReadonlyMap<string, PageFacts>): NewsData {
  const { pool, used, failed } = steelPool(texts);
  // a steel story that has no picture, or that its paper marks as paid, is left out (see PICTURE_REQUIRED)
  const items = selectSteel(applyFacts(pool, facts), now, undefined, meaning);
  if (!used.length) throw new Error("None of the news feeds answered.");
  return { lang: "steel", items, used, failed, steelPapers: steelPapers(items) };
}

/** The most priority stories (a demise, an accident, a record) shown above a tab's ordinary list. */
export const PRIORITY_CAP = 8;

interface Pool { merged: FeedItem[]; used: string[]; failed: string[] }

/** Reads the feeds of one language and merges them: the stories of every feed in the ROUND-ROBIN order of the paper priorities (a prefix of it is what an ordinary tab shows), the same story from several papers once. */
function languagePool(lang: NewsLang, texts: Array<string | null>, now: DateTime, facts?: ReadonlyMap<string, PageFacts>): Pool {
  const sources = NEWS_SOURCES[lang];
  const feeds: FeedItem[][] = [];
  const weights: number[] = [];
  const used: string[] = [], failed: string[] = [];
  sources.forEach((s, i) => {
    const items = texts[i]
      ? (s.sitemap ? parseSitemap(texts[i] as string, s.name) : parseRss(texts[i] as string, s.name, s.splitSource))
          .filter((it) => !s.skip?.(it.title) && !s.skipLink?.(it.link))
          .map((it) => ({ ...it, ...(s.keepName ? { source: s.name } : {}), ...(s.desk ? { desk: s.desk } : {}) }))
      : [];
    if (items.length) { feeds.push(items); weights.push(s.weight ?? 1); if (!used.includes(s.name)) used.push(s.name); }
  });
  // A paper read in several sections is named once, and I call it "not answering" only when none of its sections answered.
  for (const s of sources) if (!used.includes(s.name) && !failed.includes(s.name)) failed.push(s.name);
  if (!feeds.length) return { merged: [], used, failed };
  // the picture of a story the feed gave none: Bing's, where Bing has the same story; then the owner's rules (no picture, or paid: not shown)
  const merged = mergeFeeds(feeds, 400, now, 36, weights);
  return { merged: facts ? onePerPicture(applyFacts(attachPictures(merged, hintsOf(lang, texts)), facts)) : merged, used, failed };
}

/** The ordinary list of a language tab from its pool (the stories left after the priority news is taken out). */
function ordinary(lang: NewsLang, merged: FeedItem[], limit: number): FeedItem[] {
  // I CHOOSE the stories a paper at a time (so that no one paper fills the screen) and SHOW them by when each story was FIRST reported, newest first: a new story arrives at the top, the others only move down,
  // and a development of a story changes its own card without moving it.
  const curate = CURATED[lang];
  return curate ? curate(merged, limit) : newestFirst(merged.slice(0, limit), (i) => i.publishedAt);
}

/**
 * A LANGUAGE TAB (English, Hindi, Bengali) WITH THE PRIORITY DESK. Above the ordinary list stand, from the stories of ALL THREE languages: the deaths of renowned people and the big accidents of West Bengal and India (src/lib/live/priority.ts),
 * each in the tab of the language it ARRIVED in first and in no other (the same news in another language is left out of that tab's ordinary list too). West Bengal first, then India, then (a demise only) the world; the newest first within a
 * scope; at most PRIORITY_CAP. `textsByLang` holds the feeds' texts of the three languages (a missing one is a language whose feeds were not asked, and then its news is not matched).
 */
/** The priority stories of the three languages (before they are assigned to a tab): what buildTab works from, and what the route puts to the judge of sameNews.ts. */
export function flaggedOf(textsByLang: Partial<Record<NewsLang, Array<string | null>>>, now: DateTime, facts?: ReadonlyMap<string, PageFacts>): DeskItem[] {
  return NEWS_LANGS.flatMap((l) => (textsByLang[l] ? languagePool(l, textsByLang[l]!, now, facts).merged : []).flatMap((it) => { const f = priorityOf(it.title); return f ? [{ ...it, lang: l, flag: f }] : []; }));
}

export function buildTab(lang: NewsLang, textsByLang: Partial<Record<NewsLang, Array<string | null>>>, now: DateTime, limit = lang === "bn" ? FRONT_PAGE : NEWS_LIMIT, meaning?: (a: string, b: string) => boolean, onFlagged?: (titles: string[]) => void, facts?: ReadonlyMap<string, PageFacts>): NewsData {
  const pools = {} as Record<NewsLang, Pool>;
  for (const l of NEWS_LANGS) pools[l] = textsByLang[l] ? languagePool(l, textsByLang[l]!, now, facts) : { merged: [], used: [], failed: [] };
  const mine = pools[lang];
  if (!mine.merged.length) throw new Error("None of the news feeds answered.");
  const flagged: DeskItem[] = NEWS_LANGS.flatMap((l) => pools[l].merged.flatMap((it) => { const f = priorityOf(it.title); return f ? [{ ...it, lang: l, flag: f }] : []; }));
  // the route puts these headlines to the judge of sameNews.ts after the answer has gone; it takes them from here, so that the pools are not made a second time just to find them
  onFlagged?.(flagged.map((f) => f.title));
  const owned = assignDesk(flagged, meaning);
  // every story that belongs to any priority group is taken out of every ordinary list (it stands once, in its owner's block)
  const claimed = new Set(flagged.flatMap((f) => [f.link, f.id].filter(Boolean) as string[]));
  const block = owned[lang].slice(0, PRIORITY_CAP).map(({ lang: _l, ...it }) => it as FeedItem);
  const rest = mine.merged.filter((it) => !claimed.has(it.link) && !(it.id && claimed.has(it.id)));
  return { lang, items: [...block, ...ordinary(lang, rest, limit)], used: mine.used, failed: mine.failed };
}

/**
 * The BUSINESS tab: first a RECORD of the market, gold, silver or the rupee (a record high or low: the record searches and the four papers' own stories, picked by their headlines, src/lib/live/priority.ts, recordMove), newest first, up to
 * PRIORITY_CAP, each 36 hours at most; then the papers' own stories as before (share-price news of every kind stays). A record is shown once, in the first block.
 */
function buildBusiness(texts: Array<string | null>, now: DateTime, limit: number, facts?: ReadonlyMap<string, PageFacts>): NewsData {
  const feeds: FeedItem[][] = [], pool: FeedItem[] = [];
  const used: string[] = [], failed: string[] = [];
  BUSINESS_SOURCES.forEach((s, i) => {
    const items = texts[i] ? parseRss(texts[i] as string, s.name, s.splitSource) : [];
    if (!items.length) { failed.push(s.name); return; }
    used.push(s.name);
    pool.push(...items.filter((it) => recordMove(it.title)));
    feeds.push(items.filter((it) => !recordMove(it.title)));
  });
  const engines: string[] = [], answered = new Set<string>();
  RECORD_SEARCHES.forEach((s, j) => {
    if (!engines.includes(s.name)) engines.push(s.name);
    const text = texts[BUSINESS_SOURCES.length + j] ?? null;
    if (text) { answered.add(s.name); pool.push(...searchItems(s, text).filter((it) => recordMove(it.title))); }
  });
  for (const e of engines) if (!answered.has(e)) failed.push(e);
  const dated = pool.filter((i) => i.publishedAt && DateTime.fromISO(i.publishedAt).isValid);
  // A real record is told by many papers: a story is taken when two or more papers carry it, or when one of the four business papers does (a single other paper's claim is not enough: a news search brings in much that is old or wrong).
  const business = new Set(BUSINESS_SOURCES.map((s) => s.name));
  const block = newestFirst(mergeFeeds([dated], 400, now, 36).filter((i) => (i.also?.length ?? 0) >= 1 || business.has(i.source)), (i) => i.publishedAt).slice(0, PRIORITY_CAP).map((i) => ({ ...i, flag: { kind: "record" as const, scope: "india" as const } }));
  // (a paper's own premium or subscriber stories, and a story with no picture, are left out: the owner's rules)
  const general = feeds.some((f) => f.length) ? newestFirst(onePerPicture(applyFacts(mergeFeeds(feeds.filter((f) => f.length), 400, now, 36), facts)).slice(0, limit), (i) => i.publishedAt) : [];
  if (!used.length && !block.length) throw new Error("None of the news feeds answered.");
  return { lang: "biz", items: [...block, ...general], used, failed };
}

export function buildNews(lang: NewsTab, texts: Array<string | null>, now: DateTime, limit = lang === "bn" ? FRONT_PAGE : NEWS_LIMIT, meaning?: (a: string, b: string) => boolean, facts?: ReadonlyMap<string, PageFacts>): NewsData {
  if (lang === "steel") return buildSteel(texts, now, meaning, facts);
  if (lang === "biz") return buildBusiness(texts, now, limit, facts);
  const pool = languagePool(lang, texts, now, facts);
  if (!pool.merged.length) throw new Error("None of the news feeds answered.");
  return { lang, items: ordinary(lang, pool.merged, limit), used: pool.used, failed: pool.failed };
}

/** The sort key of the priority block, exported for the tests. */
export const scopeRank = SCOPE_RANK;

/**
 * THE STORIES TO LOOK AT NEXT for a tab (their pages are read for the picture and the paywall mark): the next `n` stories, in the order of the tab, that have not been looked at (`facts` holds those that have) and whose paper's pages are read. A language
 * tab looks at its own stories and at the priority stories of the other two languages (which decide who owns a story). Call it again with the facts so far to get the following ones.
 */
export function candidateLinks(tab: NewsTab, textsByLang: Partial<Record<NewsLang, Array<string | null>>>, texts: Array<string | null>, now: DateTime, facts: ReadonlyMap<string, PageFacts> | undefined, n = 30): string[] {
  if (isLang(tab)) {
    const own = textsByLang[tab] ? languagePool(tab, textsByLang[tab]!, now).merged : [];
    const flagged = NEWS_LANGS.filter((l) => l !== tab).flatMap((l) => (textsByLang[l] ? languagePool(l, textsByLang[l]!, now).merged : []).filter((it) => priorityOf(it.title)));
    return unlooked([...own, ...flagged], facts, n);
  }
  if (tab === "biz") {
    const feeds: FeedItem[][] = BUSINESS_SOURCES.map((s, i) => (texts[i] ? parseRss(texts[i] as string, s.name, s.splitSource) : [])).filter((f) => f.length);
    return unlooked(feeds.length ? mergeFeeds(feeds, 400, now, 36) : [], facts, n);
  }
  // steel: the steel stories of the business papers (the searches' own papers are many and are not read)
  const pool: FeedItem[] = [];
  BUSINESS_SOURCES.forEach((s, i) => { const text = texts[STEEL_SEARCHES.length + i]; if (text) pool.push(...parseRss(text, s.name, s.splitSource).filter((it) => isSteelStory(it.title))); });
  return unlooked(pool, facts, n);
}

/**
 * THE STORIES OF A TAB THAT STILL HAVE NO PICTURE, newest first, at most `n`, each headline once: the ones whose paper gave none, whose own page (when it can be read, and has been) gave none, and that no picture helper's feed knows. The route asks Bing News for each
 * of these headlines (pictureByHeadline) and keeps what it finds in `facts`. A story whose page has not been looked at yet is not here (its page may give the picture), and a paid one is not either.
 */
export function needPictures(tab: NewsTab, textsByLang: Partial<Record<NewsLang, Array<string | null>>>, texts: Array<string | null>, now: DateTime, facts: ReadonlyMap<string, PageFacts>, n = 24, searched: ReadonlySet<string> = new Set()): Array<{ title: string; link: string; same: string[] }> {
  let pool: FeedItem[];
  if (isLang(tab)) {
    const of = (l: NewsLang) => (textsByLang[l] ? attachPictures(languagePool(l, textsByLang[l]!, now).merged, hintsOf(l, textsByLang[l])) : []);
    pool = [...of(tab), ...NEWS_LANGS.filter((l) => l !== tab).flatMap((l) => of(l).filter((it) => priorityOf(it.title)))];
  } else if (tab === "biz") {
    const feeds: FeedItem[][] = BUSINESS_SOURCES.map((s, i) => (texts[i] ? parseRss(texts[i] as string, s.name, s.splitSource) : [])).filter((f) => f.length);
    pool = feeds.length ? mergeFeeds(feeds, 400, now, 36) : [];
  } else {
    pool = newestFirst(steelPool(texts).pool.filter((i) => i.publishedAt && DateTime.fromISO(i.publishedAt).isValid && now.diff(DateTime.fromISO(i.publishedAt), "hours").hours <= STEEL_HOURS), (i) => i.publishedAt);
  }
  // THE SAME STORY FROM MANY PAPERS is searched ONCE (the Steel pool has one story in fifteen papers): `same` holds the links of its other reports, which share what is found
  const groups: Array<{ head: FeedItem; same: string[] }> = [];
  for (const it of pool) {
    const g = groups.find((x) => titleKey(x.head.title) === titleKey(it.title) || sameStory(x.head.title, it.title));
    if (g) g.same.push(it.link); else groups.push({ head: it, same: [] });
  }
  const out: Array<{ title: string; link: string; same: string[] }> = [];
  for (const { head: it, same } of groups) {
    const f = facts.get(it.link);
    if (f?.paid) continue;
    if ([it.image, f?.image].some((x) => !!x && usableImage(x))) continue;
    // a page that can be read and has not been read yet will say for itself
    if (isReadableArticle(it.link) && !f) continue;
    // a story already searched for in this build is not asked again (what was found is in `facts`)
    if (searched.has(it.link)) continue;
    out.push({ title: it.title, link: it.link, same });
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Is this a news answer that may be taken from the database and shown? It must be the shape written AND honour the owner's rule that every story has a picture (a copy saved by an older build, with stories that have none, is not taken: the tab is
 * made again instead). Used when a server starts empty and seeds a tab from its saved copy (envelope.ts seedFromSaved).
 */
export function looksLikeNewsAnswer(x: unknown): x is NewsData {
  const d = x as NewsData | null;
  if (!d || typeof d !== "object" || !isTab(typeof d.lang === "string" ? d.lang : null)) return false;
  if (d.verified !== true || !Array.isArray(d.items) || !d.items.length || !Array.isArray(d.used) || !Array.isArray(d.failed)) return false;
  return d.items.every((i) => !!i && typeof i.title === "string" && !!i.title && typeof i.link === "string" && /^https?:\/\//i.test(i.link) && typeof i.source === "string" && typeof i.publishedAt === "string" && typeof i.image === "string" && /^https:\/\//i.test(i.image));
}

/** Does the tab hold a priority story (a death, an accident, a visit, a record) reported in the last `hours` hours? Such a tab is kept for less time, because the news round it moves. */
export function hasRecentPriority(data: NewsData, now: DateTime, hours = 3): boolean {
  return data.items.some((i) => !!i.flag && (!i.publishedAt || now.diff(DateTime.fromISO(i.publishedAt), "hours").hours <= hours));
}
