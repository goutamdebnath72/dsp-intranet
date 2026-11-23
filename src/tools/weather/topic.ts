// src/tools/weather/topic.ts
//
// What the search line needs to know about this topic (pure, no React): the words of the Durgapur weather card ("durgapur weather report with forecast"). The data, its source and its checks are in
// src/lib/live/weather.ts; how it looks is in WeatherCard.tsx and ui.tsx. I list it once, in src/tools/registry.ts.
// Only Durgapur is known: a line that names another place ("weather in delhi") is not this card's, because I require every word of a line to be one of the key words, the extra words below or a filler.
import { defineTopic } from "@/tools/types";

export const weatherTopic = defineTopic({
  id: "weather",
  intent: { title: "Weather at Durgapur", about: "The weather now at Durgapur, with the next hours and days: temperature, rain, humidity, wind, sunrise and sunset.", words: ["weather", "forecast", "temperature", "rain", "rainfall", "humidity", "wind", "mausam", "climate", "hot", "cold", "sunrise", "sunset", "umbrella"] },
  live: {
    keys: ["weather", "forecast", "mausam", "মৌসুম", "मौसम", "আবহাওয়া", "rainfall"],
    extra: ["durgapur", "dgp", "report", "reports", "today", "tomorrow", "now", "current", "latest", "live", "week", "weekly", "daily", "hourly", "7", "seven", "day", "days", "next", "temperature", "rain", "update", "updates", "outside", "plant", "city", "steel", "city's", "with", "and", "forecasts"],
  },
  samples: [
    { q: "durgapur weather report with forecast", note: "the weather at Durgapur now (temperature, what it feels like, humidity, wind, rain, sunrise and sunset), the next 24 hours three hours at a time, and seven days with the highest and lowest temperature and the chance of rain; from Open-Meteo, refreshed every ten minutes", instant: true },
    { q: "weather", note: "the same card: 'forecast', 'durgapur weather', 'weather today' and 'mausam' open it too", instant: true },
  ],
});
