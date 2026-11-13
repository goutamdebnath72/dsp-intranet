// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/weather/WeatherCard.selftest.tsx
// The Durgapur weather card and the words that open it: drawn from Open-Meteo's real answer (13 Nov 2026), with every figure and its source; the route is fixed and reads nothing from the caller.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DateTime } from "luxon";
import { detectTool } from "../../lib/tools/detect";
import { parseWeather } from "../../lib/live/weather";
import { DAY_GRID, dayLabel, deg, hourLabel, isDaylight, WeatherBody, WEATHER_REFRESH_MS } from "./WeatherCard";
import { weatherTopic } from "./topic";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const real = JSON.parse(readFileSync("src/lib/live/fixtures/open-meteo-durgapur.json", "utf8"));
const w = parseWeather(real, DateTime.fromISO(real.current.time, { zone: "Asia/Kolkata" }));
const html = renderToStaticMarkup(<WeatherBody w={w} />);
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

ok("the card shows the temperature now, the sky in words, what it feels like, humidity, wind with its direction, rain, sunrise and sunset", text.includes(`${Math.round(w.now.temp)}°`) && text.includes(w.now.text) && /Feels like/.test(text) && text.includes(`${w.now.humidity}%`) && new RegExp(`from ${w.now.windFrom}`).test(text) && /Rain now/.test(text) && text.includes(w.days[0].sunrise) && text.includes(w.days[0].sunset));
ok("today's high, low, chance of rain and UV are said", /Today: high/.test(text) && text.includes(deg(w.days[0].max)) && text.includes(deg(w.days[0].min)) && /UV index/.test(text));
ok("the next 24 hours are an ordered list with a time, a picture, a temperature and a chance of rain for each hour", /aria-label="The next 24 hours/.test(html) && (html.match(/<li[^>]*title="[^"]+"/g) ?? []).length === w.hours.length && w.hours.every((h) => text.includes(hourLabel(h.time))));
ok("seven days are listed, the first as Today and the second as Tomorrow, each with its highest and lowest", /7 days/.test(text) && text.includes("Today") && text.includes("Tomorrow") && w.days.every((d) => text.includes(deg(d.max))) && /aria-label="The forecast for the week"/.test(html));
ok("the day labels read as Today, Tomorrow, then the weekday and date; the hour as '6 pm'", dayLabel("2026-11-13", "2026-11-13") === "Today" && dayLabel("2026-11-14", "2026-11-13") === "Tomorrow" && dayLabel("2026-11-16", "2026-11-13") === "Mon 16 Nov" && hourLabel("2026-11-13T18:00") === "6 pm" && hourLabel("2026-11-13T00:00") === "12 am");
ok("night and day are told by that day's sunrise and sunset: 6 pm on 13 Nov is after sunset, 10 am is day", !isDaylight("2026-11-13T18:00", w) && isDaylight("2026-11-13T10:00", w) && !isDaylight("2026-11-13T05:00", w));
// the week as a table with uniform columns
const rows = html.match(/<div role="row"[^>]*>/g) ?? [];
ok("the week is ONE table: a header row and seven day rows share the same grid, so each column is a straight line down the card", /role="table"/.test(html) && rows.length === 8 && rows.every((r) => r.includes(DAY_GRID.split(" ")[0]) && r.includes("grid-cols-[minmax(0,1fr)_1.5rem_2.75rem_2.25rem_2.25rem]") && r.includes("sm:grid-cols-[7rem_1.5rem_9.5rem_3.5rem_4rem_2.5rem_minmax(5rem,1fr)_2.5rem]")));
ok("the columns are Day, the picture, Sky, Rain, Amount, Low, the bar (named Temperature range) and High (the header names them), and each day row has a cell for every column, the amount being a dash on a dry day", ["Day", "Sky", "Rain", "Amount", "Low", "Temperature range", "High"].every((c) => new RegExp(`role="columnheader"[^>]*>${c}<`).test(html)) && (html.match(/role="cell"/g) ?? []).length === 7 * 8 && (html.match(/>–<\/span>/g) ?? []).length === w.days.filter((d) => d.rainMm === 0).length);
ok("the figures are in fixed-width columns, right-aligned in tabular digits (rain, amount, high, low), so 4% and 31%, 9° and 30° line up on their right edge", (html.match(/role="cell" class="text-right[^"]*tabular-nums/g) ?? []).length + (html.match(/role="cell" class="hidden text-right[^"]*tabular-nums/g) ?? []).length === 7 * 4);
ok("each day's bar names both its ends on hover: the low at the left end and the high at the right end, and says both to a screen reader", w.days.every((d) => html.includes(`>Low ${deg(d.min)}<`) && html.includes(`>High ${deg(d.max)}<`) && html.includes(`aria-label="Low ${deg(d.min)}, high ${deg(d.max)}"`)));
ok("the card says the temperatures are in Celsius, that a forecast changes, and points to the Meteorological Department for what matters", /degrees Celsius/.test(text) && /changes/.test(text) && /Meteorological Department/.test(text));
ok("the card refreshes itself every ten minutes", WEATHER_REFRESH_MS === 10 * 60 * 1000);
// the words
const live = (q: string) => { const h = detectTool(q, DateTime.fromISO("2026-11-13T10:00:00+05:30")); return h && h.kind === "live" ? h.topic : null; };
ok("'durgapur weather report with forecast' and its like open the card", ["durgapur weather report with forecast", "weather", "forecast", "durgapur weather", "weather today", "mausam", "मौसम", "আবহাওয়া", "weather forecast tomorrow", "7 day forecast", "weather report"].every((q) => live(q) === "weather"));
ok("another place, or an ordinary question, is not the card's: 'weather in delhi', 'rain coat allowance', 'forecast of sales', a bare 'durgapur'", ["weather in delhi", "rain coat allowance", "forecast of sales", "durgapur", "temperature"].every((q) => live(q) !== "weather"));
ok("the sample questions are the card's own words", weatherTopic.samples.every((s) => live(s.q) === "weather") && weatherTopic.samples.some((s) => s.q === "durgapur weather report with forecast"));
// the route is fixed and reads nothing from the caller
const route = readFileSync("src/app/api/live/weather/route.ts", "utf8");
ok("the route reads nothing from the caller: no request parameter, no URL parsing, the fixed address only", /export async function GET\(\)/.test(route) && !/searchParams|req\.|request/.test(route) && /WEATHER_URL/.test(route));
console.log(`WeatherCard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
