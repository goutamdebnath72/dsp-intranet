// src/lib/live/news.ts
//
// THE NEWS CARD'S SOURCES: free feeds the publishers themselves offer. Its first tab is BUSINESS (what the executives of a company read first: The Economic Times, Mint, The Hindu BusinessLine and
// The Wall Street Journal), then the general headlines in English, Hindi and Bengali. Headline, publisher, time and link only. A tab shows the feeds that answer; one that fails is left out
// (and named), and only when none answers is it an error.
//   Business Standard and Financial Express publish RSS feeds, but their servers refuse every automated request (even for robots.txt), so they are NOT used: a feed that cannot be read is not worked around.
//   The feeds are free to read; some of the stories they point to (WSJ, Mint Premium, ET Prime, a BusinessLine subscriber piece) may ask for a subscription on the publisher's own page, which the card says.
import type { DateTime } from "luxon";
import { curate as curateBengali, FRONT_PAGE } from "./bengali";
import { mergeFeeds, newestFirst, parseRss, type FeedItem } from "./rss";

export type NewsLang = "en" | "hi" | "bn";
export const NEWS_LANGS: NewsLang[] = ["en", "hi", "bn"];
/** the card's tabs: business first (English), then the languages */
export type NewsTab = "biz" | NewsLang;
export const NEWS_TABS: NewsTab[] = ["biz", ...NEWS_LANGS];

export interface FeedSource {
  name: string;
  url: string;
  /** an aggregator whose headlines end with " - Publisher" */
  splitSource?: boolean;
  /** items of this feed that are not news and are left out (the printed edition's page listings) */
  skip?: (title: string) => boolean;
  /** the PRIORITY of the paper: how many stories it is given in each round of the merge (default 1). Equal weights are the same level; the owner's top papers weigh 3, the second rank 2, the rest 1. */
  weight?: number;
  /** the feed is of one paper only (a Google News search of one site): its items are named by the feed's own name, not by the name Google puts after the headline */
  keepName?: boolean;
  /** the desk of this feed in a curated tab (a section of the paper: "sports", "metro"); see bengali.ts */
  desk?: string;
  /** the paper's own home page, for the "Source" link when the feed itself is a search of Google News */
  home?: string;
}

/** a listing of a PRINTED page ("কলকাতা, Friday, 13 Nov, 2026 | রাজ্য - page 3"): the card is for the online edition, so these are left out */
export const isPrintedPage = (title: string): boolean => /\bpage \d+\b/i.test(title);
/** a listing, not a story: a printed page, a section's own page ("West Bengal News in Bengali | বাংলার খবর", "Memari"), anything of fewer than three words */
export const isListing = (title: string): boolean => isPrintedPage(title) || /\bnews in bengali\b/i.test(title) || title.trim().split(/\s+/).length < 3;

export const NEWS_SOURCES: Record<NewsLang, FeedSource[]> = {
  // English, in the owner's PRIORITY: the first three are the top level (weight 3, the same level), Hindustan Times and The Indian Express the second (weight 2), the rest after them (weight 1).
  // The Telegraph's own feed refuses automated requests, so it is read through Google News' public feed of that one site (the links lead on to telegraphindia.com).
  en: [
    { name: "The Telegraph", url: "https://news.google.com/rss/search?q=site:telegraphindia.com+when:1d&hl=en-IN&gl=IN&ceid=IN:en", splitSource: true, keepName: true, skip: isPrintedPage, weight: 3, home: "https://www.telegraphindia.com/" },
    { name: "The Hindu", url: "https://www.thehindu.com/news/national/feeder/default.rss", weight: 3 },
    { name: "Times of India", url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms", weight: 3 },
    { name: "Hindustan Times", url: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml", weight: 2 },
    { name: "The Indian Express", url: "https://indianexpress.com/section/india/feed/", weight: 2 },
    { name: "NDTV", url: "https://feeds.feedburner.com/ndtvnews-top-stories" },
    { name: "BBC News India", url: "https://feeds.bbci.co.uk/news/world/asia/india/rss.xml" },
  ],
  // the Hindi papers in the owner's ORDER OF PRIORITY (the first is chosen first, the first to be named, and wins a tie of time), each from its own online edition's free national feed
  hi: [
    { name: "दैनिक भास्कर", url: "https://www.bhaskar.com/rss-v1--category-1061.xml" },
    { name: "दैनिक जागरण", url: "https://rss.jagran.com/rss/news/national.xml" },
    { name: "अमर उजाला", url: "https://www.amarujala.com/rss/india-news.xml" },
    { name: "हिन्दुस्तान", url: "https://api.livehindustan.com/feeds/rss/national/rssfeed.xml" },
    { name: "नवभारत टाइम्स", url: "https://navbharattimes.indiatimes.com/india/rssfeed/1564454.xml" },
  ],
  // THE BENGALI TAB IS HAND-CURATED (src/lib/live/bengali.ts). Anandabazar Patrika's online edition is read SECTION BY SECTION (each section is a desk), because the paper's own sections are the best
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
    // the other Bengali dailies: Sangbad Pratidin's own feed answers; Bartaman, Ei Samay and Aajkaal are read as whole papers through Google News' public search of the one site (their own feeds are not open)
    { name: "Sangbad Pratidin", url: "https://www.sangbadpratidin.in/feed/", weight: 2, skip: isListing },
    { name: "Bartaman", url: "https://news.google.com/rss/search?q=site:bartamanpatrika.com+when:2d&hl=bn&gl=IN&ceid=IN:bn", splitSource: true, keepName: true, skip: isListing, weight: 2 },
    { name: "Ei Samay", url: "https://news.google.com/rss/search?q=site:eisamay.com+when:2d&hl=bn&gl=IN&ceid=IN:bn", splitSource: true, keepName: true, skip: isListing, weight: 2 },
    { name: "Aajkaal", url: "https://news.google.com/rss/search?q=site:aajkaal.in+when:2d&hl=bn&gl=IN&ceid=IN:bn", splitSource: true, keepName: true, skip: isListing, weight: 2 },
    { name: "BBC বাংলা", url: "https://feeds.bbci.co.uk/bengali/rss.xml", weight: 1 },
  ],
};

/** the business papers, in English: one feed of each, the corporate and business desk (not the paper's general front page) */
export const BUSINESS_SOURCES: FeedSource[] = [
  { name: "The Economic Times", url: "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms" },
  { name: "Mint", url: "https://www.livemint.com/rss/companies" },
  { name: "The Hindu BusinessLine", url: "https://www.thehindubusinessline.com/feeder/default.rss" },
  { name: "The Wall Street Journal", url: "https://feeds.content.dowjones.io/public/rss/WSJcomUSBusiness" },
];

/** the tabs that are hand-curated rather than newest first: their stories are chosen and ordered by desk */
const CURATED: Partial<Record<NewsTab, (stories: FeedItem[], limit: number) => FeedItem[]>> = { bn: curateBengali };

export const SOURCES_OF = (tab: NewsTab): FeedSource[] => (tab === "biz" ? BUSINESS_SOURCES : NEWS_SOURCES[tab]);
export const LANG_LABEL: Record<NewsTab, string> = { biz: "Business", en: "English", hi: "हिन्दी", bn: "বাংলা" };

export interface NewsData {
  lang: NewsTab;
  items: FeedItem[];
  /** the feeds that answered, and the ones that did not */
  used: string[];
  failed: string[];
}

export function isLang(x: string | null): x is NewsLang {
  return x === "en" || x === "hi" || x === "bn";
}

/** a tab the route will answer: business or one of the languages (anything else is English) */
export function isTab(x: string | null): x is NewsTab {
  return x === "biz" || isLang(x);
}

/** The merged top stories of a language from the feeds' texts (a null text is a feed that did not answer). */
/** how many stories the card keeps: enough for a live screen, few enough to read */
export const NEWS_LIMIT = 15;

export function buildNews(lang: NewsTab, texts: Array<string | null>, now: DateTime, limit = lang === "bn" ? FRONT_PAGE : NEWS_LIMIT): NewsData {
  const sources = SOURCES_OF(lang);
  const feeds: FeedItem[][] = [];
  const weights: number[] = [];
  const used: string[] = [], failed: string[] = [];
  sources.forEach((s, i) => {
    const items = texts[i]
      ? parseRss(texts[i] as string, s.name, s.splitSource)
          .filter((it) => !s.skip?.(it.title))
          .map((it) => ({ ...it, ...(s.keepName ? { source: s.name } : {}), ...(s.desk ? { desk: s.desk } : {}) }))
      : [];
    if (items.length) { feeds.push(items); weights.push(s.weight ?? 1); if (!used.includes(s.name)) used.push(s.name); }
  });
  // a paper read in several sections is named once, and is "not answering" only when none of its sections answered
  for (const s of sources) if (!used.includes(s.name) && !failed.includes(s.name)) failed.push(s.name);
  if (!feeds.length) throw new Error("None of the news feeds answered.");
  // the stories are CHOSEN a paper at a time (so that no one paper fills the screen) and SHOWN by when each story was FIRST reported, newest first: a new story arrives at the top, the others only move down,
  // and a development of a story changes its own card without moving it
  const curate = CURATED[lang];
  if (curate) return { lang, items: curate(mergeFeeds(feeds, 400, now, 36, weights), limit), used, failed };
  return { lang, items: newestFirst(mergeFeeds(feeds, limit, now, 36, weights), (i) => i.publishedAt), used, failed };
}
