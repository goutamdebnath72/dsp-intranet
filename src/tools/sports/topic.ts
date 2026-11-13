// src/tools/sports/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words of the sports headlines card. The data cards and their sources stay in src/lib/live and src/components/tools/live.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

export const sportsTopic = defineTopic({
  id: "sports",
  live: {
    keys: ["sports", "sport", "cricket", "ipl", "olympics", "olympic", "football", "hockey", "tennis"],
    extra: ["news", "update", "updates", "scores", "score", "live", "match", "matches", "world", "cup", "asian", "games", "commonwealth", "india", "headlines", "latest", "results", "today", "feed", "feeds", "newsfeed", "newsfeeds", "ticker", "stories", "story", "top", "breaking", "my"],
  },
  samples: [
    { q: "sports news feed", note: "'sports newsfeed', 'sports headlines' and 'sports news ticker' open the same card", instant: true },
    { q: "cricket news india", note: "sports headlines: those with India in them, and the big world events (World Cups, the Olympics, the Asian and Commonwealth Games)", instant: true },
  ],
});
