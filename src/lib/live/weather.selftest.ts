// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/weather.selftest.ts
// The Durgapur weather: Open-Meteo's real answer (fixtures/open-meteo-durgapur.json, 13 Nov 2026) is read and checked; wrong answers are refused.
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { compass, MAX_AGE_HOURS, parseWeather, PLACE, skyKind, skyText, WEATHER_URL, WeatherError } from "./weather";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const real = JSON.parse(readFileSync("src/lib/live/fixtures/open-meteo-durgapur.json", "utf8"));
const at = (iso: string) => DateTime.fromISO(iso, { zone: "Asia/Kolkata" });
const NOW = at(real.current.time);
const w = parseWeather(real, NOW);
const clone = () => JSON.parse(JSON.stringify(real));
const refuses = (mut: (j: any) => void, now = NOW) => { const j = clone(); mut(j); try { parseWeather(j, now); return false; } catch (e) { return e instanceof WeatherError; } };

ok("the place is Durgapur, and only its coordinates and the zone go in the address (nothing a reader types)", PLACE.name === "Durgapur" && /latitude=23\.52&longitude=87\.31/.test(WEATHER_URL) && /timezone=Asia%2FKolkata/.test(WEATHER_URL) && /forecast_days=7/.test(WEATHER_URL) && WEATHER_URL.startsWith("https://api.open-meteo.com/"));
ok("the real answer is read: the reading now, with temperature, what it feels like, humidity, wind and its direction in words, rain and the sky in words", w.place === "Durgapur" && w.now.temp === real.current.temperature_2m && w.now.feels === real.current.apparent_temperature && w.now.humidity === real.current.relative_humidity_2m && /^[NSEW]{1,3}$/.test(w.now.windFrom) && w.now.text === skyText(real.current.weather_code) && typeof w.now.isDay === "boolean", JSON.stringify(w.now));
ok("the next hours are three hours apart, from the hour now, at most eight, none in the past", w.hours.length >= 4 && w.hours.length <= 8 && w.hours.every((h, k) => k === 0 || at(h.time).diff(at(w.hours[k - 1].time), "hours").hours === 3) && at(w.hours[0].time) >= NOW.startOf("hour") && at(w.hours[0].time).hour === NOW.hour, w.hours.map((h) => h.time.slice(11)).join());
ok("seven days, the first being today, each with highest above lowest, a chance of rain, rain, sunrise before sunset and a UV index", w.days.length === 7 && w.days[0].date === NOW.toISODate() && w.days.every((d) => d.max >= d.min && d.rainChance >= 0 && d.rainChance <= 100 && d.sunrise < d.sunset && d.uv >= 0 && d.text.length > 3), JSON.stringify(w.days[0]));
ok("the days are consecutive dates", w.days.every((d, k) => k === 0 || at(d.date).diff(at(w.days[k - 1].date), "days").days === 1));
// the sky in words
ok("the sky is told from the WMO code: 0 clear, 2 partly cloudy, 3 overcast, 61 light rain, 65 heavy rain, 95 thunderstorm; an unknown code is 'Not reported', never a guess", skyText(0) === "Clear sky" && skyText(2) === "Partly cloudy" && skyText(3) === "Overcast" && skyText(61) === "Light rain" && skyText(65) === "Heavy rain" && skyText(95) === "Thunderstorm" && skyText(42) === "Not reported");
ok("the sky's kind (for the icon) follows the code", skyKind(0) === "clear" && skyKind(2) === "partly" && skyKind(3) === "cloud" && skyKind(45) === "fog" && skyKind(53) === "drizzle" && skyKind(63) === "rain" && skyKind(81) === "rain" && skyKind(95) === "storm" && skyKind(73) === "snow" && skyKind(42) === "unknown");
ok("the wind direction is in sixteen points and wraps round", compass(0) === "N" && compass(90) === "E" && compass(180) === "S" && compass(277) === "W" && compass(350) === "N" && compass(360) === "N" && compass(45) === "NE" && compass(-90) === "W");
// refusals
ok("a missing part is refused", refuses((j) => { delete j.daily; }) && refuses((j) => { delete j.current; }) && refuses((j) => { delete j.hourly; }));
ok("a list of the wrong length is refused", refuses((j) => { j.daily.temperature_2m_max.pop(); }) && refuses((j) => { j.hourly.temperature_2m.pop(); }));
ok("an implausible or non-numeric figure is refused (a temperature of 99 degrees, text for humidity, a humidity above 100)", refuses((j) => { j.current.temperature_2m = 99; }) && refuses((j) => { j.current.relative_humidity_2m = "wet"; }) && refuses((j) => { j.current.relative_humidity_2m = 140; }) && refuses((j) => { j.daily.precipitation_probability_max[0] = 120; }));
ok("a lowest temperature above the highest is refused, and so is a sunset before the sunrise", refuses((j) => { j.daily.temperature_2m_min[2] = j.daily.temperature_2m_max[2] + 1; }) && refuses((j) => { j.daily.sunset[1] = j.daily.sunrise[1]; }));
ok("a bad date is refused", refuses((j) => { j.current.time = "yesterday"; }) && refuses((j) => { j.daily.time[3] = "soon"; }));
ok("an old reading is refused (more than three hours), a fresh one is not", refuses(() => {}, NOW.plus({ hours: MAX_AGE_HOURS + 1 })) && !refuses(() => {}, NOW.plus({ hours: 2 })));
ok("a first day that is not today is refused", refuses((j) => { j.daily.time = j.daily.time.map((d: string) => at(d).plus({ days: 1 }).toISODate()); }));
console.log(`weather: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
