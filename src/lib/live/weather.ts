// src/lib/live/weather.ts
//
// THE WEATHER AT DURGAPUR, NOW AND FOR THE WEEK, from Open-Meteo (https://open-meteo.com): a free forecast service that needs no key and no sign-up (weather data by Open-Meteo.com, CC BY 4.0, for non-commercial use).
// Only the place is sent (Durgapur's own coordinates, fixed below): nothing the reader types goes anywhere. The answer is CHECKED before it is shown: every list the same length, every date and number valid, the
// figures plausible for the place, and the "now" reading not old; a source that sends something else is an error, and the card shows the last good answer or says so.
//
// WHAT IS SHOWN: the reading now (temperature, what it feels like, humidity, wind with its direction, rain in the last hour, and the sky in words), the next 24 hours three hours at a time, and seven days (the sky,
// the highest and lowest temperature, the chance of rain and the rain expected, sunrise and sunset, the UV index). The sky in words comes from the WMO weather code that Open-Meteo gives (the standard table below).
import { DateTime } from "luxon";

/** Durgapur, West Bengal (the city's own coordinates, to two places: the forecast is for this grid point) */
export const PLACE = { name: "Durgapur", lat: 23.52, lon: 87.31, zone: "Asia/Kolkata" } as const;
const FIELDS = {
  current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day",
  daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max",
  hourly: "temperature_2m,precipitation_probability,weather_code",
};
export const WEATHER_URL = `https://api.open-meteo.com/v1/forecast?latitude=${PLACE.lat}&longitude=${PLACE.lon}&current=${FIELDS.current}&daily=${FIELDS.daily}&hourly=${FIELDS.hourly}&forecast_days=7&timezone=${encodeURIComponent(PLACE.zone)}`;

/** the sky in words, from the WMO weather code (the standard table; a code that is not in it is "Not reported", never a guess) */
export const SKY: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Rime fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Heavy freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Light rain showers", 81: "Rain showers", 82: "Violent rain showers", 85: "Light snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
};
export const skyText = (code: number): string => SKY[code] ?? "Not reported";
/** what kind of picture the sky is, for the card's icon */
export type SkyKind = "clear" | "partly" | "cloud" | "fog" | "drizzle" | "rain" | "storm" | "snow" | "unknown";
export function skyKind(code: number): SkyKind {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code >= 95 && code <= 99) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  return "unknown";
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
/** the direction the wind blows FROM, in words ("W", "NNE") */
export const compass = (deg: number): string => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

export interface WeatherNow { time: string; temp: number; feels: number; humidity: number; windKmh: number; windFrom: string; rainMm: number; code: number; text: string; isDay: boolean }
export interface WeatherHour { time: string; temp: number; rainChance: number; code: number; text: string }
export interface WeatherDay { date: string; code: number; text: string; max: number; min: number; rainChance: number; rainMm: number; sunrise: string; sunset: string; uv: number }
export interface Weather { place: string; now: WeatherNow; hours: WeatherHour[]; days: WeatherDay[] }

export class WeatherError extends Error {}

const num = (v: unknown, lo: number, hi: number, what: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) throw new WeatherError(`The weather service sent an unusable ${what}.`);
  return v;
};
const arr = (o: Record<string, unknown>, k: string, n: number): unknown[] => {
  const a = o[k];
  if (!Array.isArray(a) || a.length !== n) throw new WeatherError(`The weather service sent an incomplete ${k} list.`);
  return a;
};
const when = (v: unknown, what: string): DateTime => {
  const d = typeof v === "string" ? DateTime.fromISO(v, { zone: PLACE.zone }) : DateTime.invalid("x");
  if (!d.isValid) throw new WeatherError(`The weather service sent an unusable ${what}.`);
  return d;
};

/** How old the "now" reading may be (hours) before it is refused: the service refreshes it every quarter of an hour. */
export const MAX_AGE_HOURS = 3;

/** Reads and checks Open-Meteo's answer. `now` is the time at Durgapur (the "now" reading must be within MAX_AGE_HOURS of it). */
export function parseWeather(json: unknown, now: DateTime = DateTime.now()): Weather {
  const j = json as Record<string, Record<string, unknown> | undefined>;
  const cur = j?.current, day = j?.daily, hr = j?.hourly;
  if (!cur || !day || !hr) throw new WeatherError("The weather service sent an incomplete answer.");
  const at = when(cur.time, "time");
  if (Math.abs(now.setZone(PLACE.zone).diff(at, "hours").hours) > MAX_AGE_HOURS) throw new WeatherError("The weather service's reading is old.");
  const code = (v: unknown) => num(v, 0, 99, "sky code");
  const nowRead: WeatherNow = {
    time: at.toFormat("yyyy-MM-dd'T'HH:mm"),
    temp: num(cur.temperature_2m, -20, 60, "temperature"),
    feels: num(cur.apparent_temperature, -30, 70, "feels-like temperature"),
    humidity: num(cur.relative_humidity_2m, 0, 100, "humidity"),
    windKmh: num(cur.wind_speed_10m, 0, 300, "wind speed"),
    windFrom: compass(num(cur.wind_direction_10m, 0, 360, "wind direction")),
    rainMm: num(cur.precipitation, 0, 500, "rain"),
    code: code(cur.weather_code),
    text: skyText(code(cur.weather_code)),
    isDay: cur.is_day === 1,
  };
  // the next 24 hours, three hours at a time, from the hour now
  const ht = arr(hr, "time", Array.isArray(hr.time) ? hr.time.length : -1);
  const n = ht.length;
  const htemp = arr(hr, "temperature_2m", n), hrain = arr(hr, "precipitation_probability", n), hcode = arr(hr, "weather_code", n);
  const from = at.startOf("hour");
  const hours: WeatherHour[] = [];
  for (let i = 0; i < n && hours.length < 8; i++) {
    const t = when(ht[i], "hour");
    if (t < from || Math.round(t.diff(from, "hours").hours) % 3 !== 0) continue;
    hours.push({ time: t.toFormat("yyyy-MM-dd'T'HH:mm"), temp: num(htemp[i], -20, 60, "hourly temperature"), rainChance: num(hrain[i], 0, 100, "chance of rain"), code: code(hcode[i]), text: skyText(code(hcode[i])) });
  }
  if (hours.length < 4) throw new WeatherError("The weather service sent too few hours.");
  const dt = arr(day, "time", Array.isArray(day.time) ? day.time.length : -1);
  const m = dt.length;
  if (m < 5 || m > 16) throw new WeatherError("The weather service sent an unusable number of days.");
  const dcode = arr(day, "weather_code", m), dmax = arr(day, "temperature_2m_max", m), dmin = arr(day, "temperature_2m_min", m), dpop = arr(day, "precipitation_probability_max", m), dsum = arr(day, "precipitation_sum", m), dsr = arr(day, "sunrise", m), dss = arr(day, "sunset", m), duv = arr(day, "uv_index_max", m);
  const days: WeatherDay[] = dt.map((d, i) => {
    const date = when(d, "date");
    const max = num(dmax[i], -20, 60, "highest temperature"), min = num(dmin[i], -20, 60, "lowest temperature");
    if (min > max) throw new WeatherError("The weather service sent a lowest temperature above the highest.");
    const rise = when(dsr[i], "sunrise"), set = when(dss[i], "sunset");
    if (set <= rise) throw new WeatherError("The weather service sent a sunset before the sunrise.");
    return { date: date.toISODate() as string, code: code(dcode[i]), text: skyText(code(dcode[i])), max, min, rainChance: num(dpop[i], 0, 100, "chance of rain"), rainMm: num(dsum[i], 0, 1000, "rain"), sunrise: rise.toFormat("HH:mm"), sunset: set.toFormat("HH:mm"), uv: num(duv[i], 0, 20, "UV index") };
  });
  if (days[0].date !== at.toISODate()) throw new WeatherError("The weather service's first day is not today.");
  return { place: PLACE.name, now: nowRead, hours, days };
}
