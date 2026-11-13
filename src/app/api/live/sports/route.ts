// src/app/api/live/sports/route.ts
//
// SPORTS HEADLINES (India's own, and the world's big events) from ESPNcricinfo, The Hindu Sport and BBC Sport (src/lib/live/sports.ts). Reads nothing from the caller.
import { DateTime } from "luxon";
import { getText } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { SPORTS_SOURCES, buildSports } from "@/lib/live/sports";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function GET() {
  return liveRoute({
    key: "sports",
    ttlMs: 5 * 60 * 1000,
    source: SPORTS_SOURCES.map((s) => s.name).join(", "),
    sourceUrl: "https://www.espncricinfo.com/",
    sourceLinks: [{ name: "ESPNcricinfo", url: "https://www.espncricinfo.com/" }, { name: "The Hindu Sport", url: "https://www.thehindu.com/sport/" }, { name: "BBC Sport", url: "https://www.bbc.com/sport" }],
    load: async () => {
      const texts = await Promise.all(SPORTS_SOURCES.map((s) => getText(s.url, { timeoutMs: 7000 }).catch(() => null)));
      return buildSports(texts, DateTime.now());
    },
  });
}
