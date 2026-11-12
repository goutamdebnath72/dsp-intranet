// src/lib/live/sports.ts
//
// SPORTS HEADLINES: from the feeds of ESPNcricinfo, The Hindu Sport and BBC Sport. Each story is sorted by its own words into
//   INDIA          India or an Indian team, player or league is directly in it (the national teams, the IPL, the ISL, the Ranji Trophy, the BCCI ...);
//   WORLD EVENTS   a major world event, with or without India (a World Cup, the Olympics, the Asian or Commonwealth Games, the Champions Trophy, a Grand Slam, Formula 1 ...);
//   OTHER          everything else.
// A story can be both. These are HEADLINES with links to the publisher's page; no free, steady live-score feed exists, and a card does not pretend to be one.
import type { DateTime } from "luxon";
import { mergeFeeds, parseRss, type FeedItem } from "./rss";
import type { FeedSource } from "./news";

export const SPORTS_SOURCES: FeedSource[] = [
  { name: "ESPNcricinfo", url: "https://www.espncricinfo.com/rss/content/story/feeds/0.xml" },
  { name: "The Hindu Sport", url: "https://www.thehindu.com/sport/feeder/default.rss" },
  { name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml" },
];

const INDIA = /\b(india|indian|indians|team india|men in blue|women in blue|bcci|ipl|wpl|isl|ranji|duleep|bharat|kohli|rohit sharma|bumrah|dhoni|gill|pant|jadeja|ashwin|hardik|surya|sindhu|neeraj chopra|chopra|mary kom|chhetri|gukesh|praggnanandhaa|vinesh|manu bhaker|sachin|harmanpreet|mandhana)\b/i;
const WORLD = /\b(world cup|olympic|olympics|asian games|commonwealth games|champions trophy|asia cup|world championship|world championships|world test championship|grand slam|wimbledon|us open|french open|roland garros|australian open|formula 1|f1|euros?|copa america|fifa|uefa|nations league|davis cup|t20 world|ashes|diamond league)\b/i;

export type SportsGroup = "india" | "world" | "other";

export function classify(item: Pick<FeedItem, "title" | "summary">): SportsGroup[] {
  const text = `${item.title} ${item.summary}`;
  const g: SportsGroup[] = [];
  if (INDIA.test(text)) g.push("india");
  if (WORLD.test(text)) g.push("world");
  if (!g.length) g.push("other");
  return g;
}

export interface SportsItem extends FeedItem {
  groups: SportsGroup[];
}

export interface SportsData {
  items: SportsItem[];
  used: string[];
  failed: string[];
}

export function buildSports(texts: Array<string | null>, now: DateTime, limit = 40): SportsData {
  const feeds: FeedItem[][] = [];
  const used: string[] = [], failed: string[] = [];
  SPORTS_SOURCES.forEach((s, i) => {
    const items = texts[i] ? parseRss(texts[i] as string, s.name) : [];
    if (items.length) { feeds.push(items); used.push(s.name); } else failed.push(s.name);
  });
  if (!feeds.length) throw new Error("None of the sports feeds answered.");
  return { items: mergeFeeds(feeds, limit, now, 48).map((i) => ({ ...i, groups: classify(i) })), used, failed };
}
