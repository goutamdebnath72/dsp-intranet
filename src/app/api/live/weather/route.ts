// src/app/api/live/weather/route.ts
//
// THE WEATHER AT DURGAPUR, NOW AND FOR THE WEEK, from Open-Meteo (src/lib/live/weather.ts). Reads nothing from the caller: the address asked is fixed (Durgapur's coordinates). The answer is checked; if the
// source fails, the last good answer is returned and marked as such, and with none, a plain failure. Kept for ten minutes (the service refreshes its reading every quarter of an hour).
import { DateTime } from "luxon";
import { getJson } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { parseWeather, WEATHER_URL, type Weather } from "@/lib/live/weather";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  return liveRoute<Weather>({
    key: "weather",
    ttlMs: 10 * 60 * 1000,
    source: "Open-Meteo (weather data by Open-Meteo.com)",
    sourceUrl: "https://open-meteo.com/",
    load: async () => parseWeather(await getJson(WEATHER_URL, { timeoutMs: 10000 }), DateTime.now()),
  });
}
