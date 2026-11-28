// src/tools/news/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words of the headlines card, and the language a line asks for ("hindi news"). I left the data cards and their sources in src/lib/live and src/components/tools/live.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. I list it once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

/** The papers the card reads, by the names a line may call them, and the tab each opens ("dainik bhaskar" opens the Hindi tab). I take only whole names: "bhaskar" alone is a person's name and opens nothing. */
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
  intent: { title: "News headlines", about: "The latest headlines: business, general English, Hindi and Bengali newspapers.", words: ["news", "headlines", "headline", "newspaper", "paper", "khabar", "samachar", "economic", "times", "hindu", "telegraph", "bhaskar", "anandabazar", "latest"] },
  live: {
    keys: ["news", "newsfeed", "newsfeeds", "newspaper", "newspapers", "headline", "headlines", "stories", "samachar", "khabar", "khabrein", "समाचार", "খবর", ...PAPER_WORDS],
    phrases: PAPER_PHRASES,
    extra: ["hindi", "bengali", "bangla", "english", "top", "breaking", "stories", "story", "national", "india", "latest", "morning", "daily", "paper", "newspaper", "in", "hindi", "bangla", "business", "economy", "economic", "corporate", "finance", "financial", "feed", "feeds", "ticker", "update", "updates", "online", "edition", "what's", "whats", "hindustan", "my", "steel", "sail", "ispat", "इस्पात", "स्टील"],
    // The card opens on business; a line can ask for a language instead ("hindi news"), or for business by name ("business news").
    lang: (w) => {
      const paper = w.map((x) => PAPER_TAB.get(x)).find(Boolean);
      if (paper) return paper;
      // Steel is asked for before the language: "इस्पात समाचार" (steel news, in Hindi) is the Steel tab, which has the Hindi papers' steel stories as well as the English ones.
      if (w.some((x) => ["steel", "sail", "ispat", "इस्पात", "स्टील"].includes(x))) return "steel";
      if (w.some((x) => ["hindi", "samachar", "khabar", "khabrein", "समाचार", "hindustan"].includes(x))) return "hi";
      if (w.some((x) => ["bengali", "bangla", "খবর"].includes(x))) return "bn";
      if (w.includes("english")) return "en";
      return w.some((x) => ["business", "economy", "economic", "corporate", "finance", "financial"].includes(x)) ? "biz" : undefined;
    },
  },
  samples: [
    { q: "top news headlines", note: "opens on business news first: The Economic Times, Mint, The Hindu BusinessLine and The Wall Street Journal, from their own free feeds (share-price and market news included); tabs for steel news, and for general English, Hindi and Bengali news. It keeps itself current (every minute): each headline is a card that rolls when its story develops, and the same story from several papers is one card; changes wait while you are reading. Each story opens on the paper's own page in a new tab", instant: true },
    { q: "news feed", note: "'newsfeed', 'newspaper' and 'news ticker' open the same card", instant: true },
    { q: "steel news", note: "the Steel tab: SAIL and its units and any other steel plant or company, with the news of their shares, hunted in many papers of India (English and Hindi, the well known and the little known) through Google News and Bing News and picked out of the business papers' feeds; newest at the top, each kept 48 hours after it was reported, sinking as it ages. 'sail news' or 'इस्पात समाचार' opens it too", instant: true },
    { q: "business news", note: "the business tab by name; 'economy news' or 'corporate news' also work", instant: true },
    { q: "hindi news", note: "the Hindi tab: Dainik Bhaskar, Dainik Jagran, Amar Ujala, Hindustan and Navbharat Times, in that order of priority; a paper's name ('dainik bhaskar', 'amar ujala') opens it too", instant: true },
    { q: "bengali news", note: "the Bengali tab: Anandabazar Patrika, Sangbad Pratidin, Bartaman, Ei Samay, Aajkaal and BBC বাংলা mixed, Anandabazar with the most places; newest at the top", instant: true },
    { q: "english news", note: "general headlines in English, in this order of priority: The Telegraph, The Hindu and The Times of India (top, the same level), then Hindustan Times and The Indian Express, then NDTV and BBC News India", instant: true },
  ],
});
