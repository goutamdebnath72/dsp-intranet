// src/app/api/live/news/route.ts
//
// THE TOP HEADLINES: business (The Economic Times, Mint, BusinessLine, WSJ) or general news in English, Hindi or Bengali, from the publishers' own free feeds (src/lib/live/news.ts). The only thing read
// from the caller is the tab, and only from a fixed list (biz, en, hi, bn); anything else is English. Feeds that do not answer are left out and named.
import { DateTime } from "luxon";
import { getText } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { memo } from "@/lib/live/memo";
import { SOURCES_OF, buildNews, isTab, type NewsTab } from "@/lib/live/news";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

/** how long one answer is kept: a minute, and for the Bengali tab (eleven feeds, eight of them searches of Google News) two, so that the other sites are asked politely */
const TTL_MS: Partial<Record<NewsTab, number>> = { bn: 2 * 60 * 1000 };

export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("lang");
  const lang: NewsTab = isTab(asked) ? asked : "en";
  const sources = SOURCES_OF(lang);
  const ttlMs = TTL_MS[lang] ?? 60 * 1000; // the card refreshes itself at a minute, and the host shares one answer among everyone who has it open
  return liveRoute({
    key: `news-${lang}`,
    ttlMs,
    source: [...new Set(sources.map((s) => s.name))].join(", "),
    sourceUrl: sources[0].home ?? `${new URL(sources[0].url).origin}/`,
    // every paper that is read is named and linked (each to its own site), not only the first
    sourceLinks: [...new Map(sources.map((s) => [s.name, { name: s.name, url: s.home ?? `${new URL(s.url).origin}/` }])).values()],
    load: async () => {
      // each feed is kept on its own, so that one that fails for a moment gives its last good answer and the others are not held up
      const texts = await Promise.all(sources.map(async (s) => { try { return (await memo(`news-src:${s.url}`, ttlMs, () => getText(s.url, { timeoutMs: 7000 }))).value; } catch { return null; } }));
      return buildNews(lang, texts, DateTime.now());
    },
  });
}
