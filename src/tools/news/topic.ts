// src/tools/news/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words of the headlines card, and the language a line asks for ("hindi news"). The data cards and their sources stay in src/lib/live and src/components/tools/live.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

/** the papers the card reads, by the names a line may call them, and the tab each opens ("dainik bhaskar" opens the Hindi tab). Only whole names: "bhaskar" alone is a person's name and opens nothing. */
const PAPERS: Array<[string[], string]> = [
  [["dainik bhaskar", "dainik jagran", "amar ujala", "navbharat times", "nav bharat times", "live hindustan", "hindustan hindi"], "hi"],
  [["hindustan times", "times of india", "the hindu", "ndtv", "the telegraph", "telegraph india", "telegraph online", "indian express", "the indian express"], "en"],
  [["economic times", "the economic times", "wall street journal", "wsj", "business line", "hindu business line", "the hindu business line"], "biz"],
  [["anandabazar", "ananda bazar", "anandabazar patrika", "ananda bazar patrika", "sangbad pratidin", "abp ananda"], "bn"],
];
const PAPER_TAB = new Map(PAPERS.flatMap(([names, tab]) => names.map((n): [string, string] => [n.replace(/ /g, "_"), tab])));
const PAPER_PHRASES = PAPERS.flatMap(([names]) => names).filter((n) => n.includes(" "));
const PAPER_WORDS = PAPERS.flatMap(([names]) => names).filter((n) => !n.includes(" "));

export const newsTopic = defineTopic({
  id: "news",
  live: {
    keys: ["news", "newsfeed", "newsfeeds", "newspaper", "newspapers", "headline", "headlines", "stories", "samachar", "khabar", "khabrein", "समाचार", "খবর", ...PAPER_WORDS],
    phrases: PAPER_PHRASES,
    extra: ["hindi", "bengali", "bangla", "english", "top", "breaking", "stories", "story", "national", "india", "latest", "morning", "daily", "paper", "newspaper", "in", "hindi", "bangla", "business", "economy", "economic", "corporate", "finance", "financial", "feed", "feeds", "ticker", "update", "updates", "online", "edition", "what's", "whats", "hindustan", "my"],
    // the card opens on business; a line can ask for a language instead ("hindi news"), or for business by name ("business news")
    lang: (w) => {
      const paper = w.map((x) => PAPER_TAB.get(x)).find(Boolean);
      if (paper) return paper;
      if (w.some((x) => ["hindi", "samachar", "khabar", "khabrein", "समाचार", "hindustan"].includes(x))) return "hi";
      if (w.some((x) => ["bengali", "bangla", "খবর"].includes(x))) return "bn";
      if (w.includes("english")) return "en";
      return w.some((x) => ["business", "economy", "economic", "corporate", "finance", "financial"].includes(x)) ? "biz" : undefined;
    },
  },
  samples: [
    { q: "top news headlines", note: "opens on business news first: The Economic Times, Mint, The Hindu BusinessLine and The Wall Street Journal, from their own free feeds; tabs for general English, Hindi and Bengali news. It keeps itself current (every minute): each headline is a card that rolls when its story develops, and the same story from several papers is one card; changes wait while you are reading. Each story opens on the paper's own page in a new tab", instant: true },
    { q: "news feed", note: "'newsfeed', 'newspaper' and 'news ticker' open the same card", instant: true },
    { q: "business news", note: "the business tab by name; 'economy news' or 'corporate news' also work", instant: true },
    { q: "hindi news", note: "the Hindi tab: Dainik Bhaskar, Dainik Jagran, Amar Ujala, Hindustan and Navbharat Times, in that order of priority; a paper's name ('dainik bhaskar', 'amar ujala') opens it too", instant: true },
    { q: "bengali news", note: "the Bengali tab: Anandabazar Patrika, Sangbad Pratidin, Bartaman, Ei Samay, Aajkaal and BBC বাংলা mixed, Anandabazar with the most places; newest at the top", instant: true },
    { q: "english news", note: "general headlines in English, in this order of priority: The Telegraph, The Hindu and The Times of India (top, the same level), then Hindustan Times and The Indian Express, then NDTV and BBC News India", instant: true },
  ],
});
