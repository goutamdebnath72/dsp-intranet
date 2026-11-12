// src/lib/live/news.ts
//
// THE NEWS CARD'S SOURCES: free feeds the publishers themselves offer, in English, Hindi and Bengali. Headline, publisher, time and link only. A language shows the feeds that answer; one that
// fails is left out (and named), and only when none answers is it an error.
import type { DateTime } from "luxon";
import { mergeFeeds, parseRss, type FeedItem } from "./rss";

export type NewsLang = "en" | "hi" | "bn";
export const NEWS_LANGS: NewsLang[] = ["en", "hi", "bn"];

export interface FeedSource {
  name: string;
  url: string;
  /** an aggregator whose headlines end with " - Publisher" */
  splitSource?: boolean;
}

export const NEWS_SOURCES: Record<NewsLang, FeedSource[]> = {
  en: [
    { name: "The Hindu", url: "https://www.thehindu.com/news/national/feeder/default.rss" },
    { name: "Times of India", url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms" },
    { name: "NDTV", url: "https://feeds.feedburner.com/ndtvnews-top-stories" },
    { name: "Hindustan Times", url: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml" },
    { name: "BBC News India", url: "https://feeds.bbci.co.uk/news/world/asia/india/rss.xml" },
  ],
  hi: [
    { name: "BBC हिंदी", url: "https://feeds.bbci.co.uk/hindi/rss.xml" },
    { name: "दैनिक भास्कर", url: "https://www.bhaskar.com/rss-v1--category-1061.xml" },
    { name: "अमर उजाला", url: "https://www.amarujala.com/rss/breaking-news.xml" },
  ],
  bn: [
    { name: "BBC বাংলা", url: "https://feeds.bbci.co.uk/bengali/rss.xml" },
    { name: "সংবাদ প্রতিদিন", url: "https://www.sangbadpratidin.in/feed/" },
    { name: "Google News বাংলা", url: "https://news.google.com/rss?hl=bn&gl=IN&ceid=IN:bn", splitSource: true },
  ],
};

export const LANG_LABEL: Record<NewsLang, string> = { en: "English", hi: "हिन्दी", bn: "বাংলা" };

export interface NewsData {
  lang: NewsLang;
  items: FeedItem[];
  /** the feeds that answered, and the ones that did not */
  used: string[];
  failed: string[];
}

export function isLang(x: string | null): x is NewsLang {
  return x === "en" || x === "hi" || x === "bn";
}

/** The merged top stories of a language from the feeds' texts (a null text is a feed that did not answer). */
export function buildNews(lang: NewsLang, texts: Array<string | null>, now: DateTime, limit = 12): NewsData {
  const sources = NEWS_SOURCES[lang];
  const feeds: FeedItem[][] = [];
  const used: string[] = [], failed: string[] = [];
  sources.forEach((s, i) => {
    const items = texts[i] ? parseRss(texts[i] as string, s.name, s.splitSource) : [];
    if (items.length) { feeds.push(items); used.push(s.name); } else failed.push(s.name);
  });
  if (!feeds.length) throw new Error("None of the news feeds answered.");
  return { lang, items: mergeFeeds(feeds, limit, now), used, failed };
}
