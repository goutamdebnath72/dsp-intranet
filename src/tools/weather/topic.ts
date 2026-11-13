// src/tools/weather/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words of the Durgapur weather card ("durgapur weather report with forecast"). The data, its source and its checks are in
// src/lib/live/weather.ts; how it looks is in WeatherCard.tsx and ui.tsx. It is listed once, in src/tools/registry.ts.
// Only Durgapur is known: a line that names another place ("weather in delhi") is not this card's, because every word of a line must be one of the key words, the extra words below or a filler.
import { defineTopic } from "@/tools/types";

export const weatherTopic = defineTopic({
  id: "weather",
  live: {
    keys: ["weather", "forecast", "mausam", "মৌসুম", "मौसम", "আবহাওয়া", "rainfall"],
    extra: ["durgapur", "dgp", "report", "reports", "today", "tomorrow", "now", "current", "latest", "live", "week", "weekly", "daily", "hourly", "7", "seven", "day", "days", "next", "temperature", "rain", "update", "updates", "outside", "plant", "city", "steel", "city's", "with", "and", "forecasts"],
  },
  samples: [
    { q: "durgapur weather report with forecast", note: "the weather at Durgapur now (temperature, what it feels like, humidity, wind, rain, sunrise and sunset), the next 24 hours three hours at a time, and seven days with the highest and lowest temperature and the chance of rain; from Open-Meteo, refreshed every ten minutes", instant: true },
    { q: "weather", note: "the same card: 'forecast', 'durgapur weather', 'weather today' and 'mausam' open it too", instant: true },
  ],
});
