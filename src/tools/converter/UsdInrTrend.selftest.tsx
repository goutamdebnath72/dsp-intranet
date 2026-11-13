// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/converter/UsdInrTrend.selftest.tsx
// The dollar-rupee chart under the currency converter: its four figures, and that it appears for USD and INR (either way round) and for no other pair or kind.
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DateTime } from "luxon";
import { parseUsdInr } from "@/lib/live/usdInr";
import { UsdInrTrendBody, inr, isUsdInr, usdInrPoints } from "./UsdInrTrend";
import { ConverterCard } from "./ConverterCard";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const text = (x: string) => x.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const NOW = DateTime.fromISO("2026-11-13T11:00:00", { zone: "Asia/Kolkata" });
const trend = { points: parseUsdInr(JSON.parse(readFileSync("src/lib/live/fixtures/frankfurter-usd-inr.json", "utf8")), NOW) };
const html = renderToStaticMarkup(<UsdInrTrendBody trend={trend} />);
const t = text(html);

// THE CHART BEGINS ON THE SAME DATE A YEAR BACK: a working-day anniversary needs no note; a weekend one shows the rate of the last working day and says so
ok("the first point is the very date a year back (13 Nov 2025 when today is 13 Nov 2026) and, a working day, carries no note", usdInrPoints(trend)[0].full === "13 Nov 2025" && usdInrPoints(trend)[0].note === undefined && !/published no rate for/.test(t));
const weekend = { points: parseUsdInr(JSON.parse(readFileSync("src/lib/live/fixtures/frankfurter-usd-inr.json", "utf8")), DateTime.fromISO("2026-11-15T11:00:00", { zone: "Asia/Kolkata" })) };
const wt = text(renderToStaticMarkup(<UsdInrTrendBody trend={weekend} />));
ok("when the date a year back is a Saturday (15 Nov 2025) the chart still begins on it and says that the ECB published no rate that day, so the rate of Friday 14 Nov is shown", usdInrPoints(weekend)[0].full === "15 Nov 2025" && /The ECB published no rate for 15 Nov 2025 \(a weekend or a holiday\), so the rate of 14 Nov 2025, the last working day before it, is shown/.test(wt) && /Start · 1 year ago ₹88\.68 on 15 Nov 2025/.test(wt));
ok("the rupee formatting: 94.04 keeps its paise, a round axis value does not", inr(94.04) === "₹94.04" && inr(90) === "₹90" && inr(88.5) === "₹88.50");
ok("the points are labelled with their days", usdInrPoints(trend)[0].label === "13 Nov 2025" && usdInrPoints(trend).slice(-1)[0].full === "12 Nov 2026");
ok("the range chip says what the numbers are: rupees for one dollar, each working day, 13 Nov 2025 to 12 Nov 2026", /Rupees for one US dollar · rate of each working day, 13 Nov 2025 to 12 Nov 2026/.test(t));
ok("the rate a year ago: Start · 1 year ago, ₹88.69 on 13 Nov 2025", /Start · 1 year ago ₹88\.69 on 13 Nov 2025/.test(t));
ok("the highest in between: ₹96.83 on 20 May 2026, and the latest is below it", /Highest ₹96\.83 on 20 May 2026/.test(t) && /the latest is 2\.9% below it/.test(t));
ok("the lowest in between: ₹88.50 on 19 Nov 2025", /Lowest ₹88\.50 on 19 Nov 2025/.test(t));
ok("the latest rate: ₹94.04 on 12 Nov 2026, with the number of working days", /Latest rate ₹94\.04 on 12 Nov 2026/.test(t) && /255 working days shown/.test(t));
ok("the callouts on the line name the high and the low with their days", /High ₹96\.83 · 20 May 2026/.test(t) && /Low ₹88\.50 · 19 Nov 2025/.test(t));
ok("the line is a sloping line (a rate moves every day), not a staircase", !/ H[\d.]+ V[\d.]+/.test(html) && / L[\d.]+,[\d.]+/.test(html));
ok("no sentence about 'held from' (that is for prices that stay until changed)", !/held from/.test(t));
ok("the note says whose rates, working days only, that the last point is the converter's rate, and that banks and the RBI differ", /European Central Bank/.test(t) && /none for weekends and holidays/.test(t) && /the last point is the rate the converter above uses/.test(t) && /RBI/.test(t) && /margin/.test(t));

ok("the pair is USD and INR, in either order, and no other", isUsdInr("USD", "INR") && isUsdInr("INR", "USD") && !isUsdInr("USD", "EUR") && !isUsdInr("INR", "GBP") && !isUsdInr("EUR", "INR") && !isUsdInr("USD", "USD"));

// the converter: the chart is under it only for USD/INR
const card = (kind: "currency" | "length", from: string, to: string) => renderToStaticMarkup(<ConverterCard start={{ kind, from, to, value: 1 }} rates={{ base: "USD", date: "2026-11-12", source: "test", rates: { INR: 94.04, EUR: 0.87, GBP: 0.75 } }} ratesState="ok" />);
ok("USD to INR: the chart's card is under the converter", /aria-label="US dollar in rupees over the last year"/.test(card("currency", "USD", "INR")));
ok("INR to USD: the same chart", /aria-label="US dollar in rupees over the last year"/.test(card("currency", "INR", "USD")));
ok("USD to EUR, GBP to INR, and a length conversion: no chart", !/over the last year/.test(card("currency", "USD", "EUR")) && !/over the last year/.test(card("currency", "GBP", "INR")) && !/over the last year/.test(card("length", "km", "mi")));
ok("the card says it is fetching, and nothing typed is in its request: a fixed route in the hook call", /Fetching the dollar-rupee history/.test(card("currency", "USD", "INR")) && /useLive<UsdInrTrend>\("\/api\/live\/usd-inr"\)/.test(readFileSync("src/tools/converter/UsdInrTrend.tsx", "utf8")));

console.log(`UsdInrTrend: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
