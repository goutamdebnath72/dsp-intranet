// src/app/api/live/news/route.ts
//
// THE TOP HEADLINES in English, Hindi or Bengali, from the publishers' own free feeds (src/lib/live/news.ts). The only thing read from the caller is the language, and only from a fixed list
// (en, hi, bn); anything else is English. Feeds that do not answer are left out and named.
import { DateTime } from "luxon";
import { getText } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { NEWS_SOURCES, buildNews, isLang, type NewsLang } from "@/lib/live/news";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("lang");
  const lang: NewsLang = isLang(asked) ? asked : "en";
  return liveRoute({
    key: `news-${lang}`,
    ttlMs: 5 * 60 * 1000,
    source: NEWS_SOURCES[lang].map((s) => s.name).join(", "),
    sourceUrl: `${new URL(NEWS_SOURCES[lang][0].url).origin}/`,
    load: async () => {
      const texts = await Promise.all(NEWS_SOURCES[lang].map((s) => getText(s.url, { timeoutMs: 7000 }).catch(() => null)));
      return buildNews(lang, texts, DateTime.now());
    },
  });
}
