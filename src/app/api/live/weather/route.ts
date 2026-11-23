// src/app/api/live/weather/route.ts
//
// The weather at Durgapur, now and for the week, from Open-Meteo (src/lib/live/weather.ts). I read nothing from the caller: the address asked is fixed (Durgapur's coordinates). I check the answer; if the
// source fails, I return the last good answer marked as such, and with none, a plain failure. I keep it for ten minutes (the service refreshes its reading every quarter of an hour).
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
