// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/tools/live/FuelTrend.selftest.tsx
// The Kolkata fuel chart: three tabs, a staircase, and the four figures under each (the price a year ago, the highest, the lowest, today's), drawn from the real sources of 12-13 Nov 2026.
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DateTime } from "luxon";
import { parseLpgKolkata, parsePpacKolkata, type FuelTrend } from "@/lib/live/fuelTrend";
import { FuelTrendBody, toPoints, rs } from "./FuelTrendCard";
import { TrendChart, datesThatFit, dateTicks } from "./LivePieces";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const fx = (n: string) => readFileSync(`src/lib/live/fixtures/${n}`, "utf8");
const NOW = DateTime.fromISO("2026-11-13T11:00:00", { zone: "Asia/Kolkata" });
const ppac = parsePpacKolkata(fx("ppac-metro-pdftext.txt"), NOW);
const lpg = parseLpgKolkata(fx("fuel-lpg-kolkata-months.txt"), NOW);
const full: FuelTrend = { petrol: { id: "petrol", grain: "day", points: ppac.petrol }, diesel: { id: "diesel", grain: "day", points: ppac.diesel }, lpg: { id: "lpg", grain: "month", points: lpg }, notes: [] };
const h = (t: FuelTrend) => renderToStaticMarkup(<FuelTrendBody trend={t} />);
const text = (x: string) => x.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const petrol = h(full);
ok("three tabs, in order: Petrol, Diesel, LPG 14.2 kg, each with its latest price; Petrol is the one open", /role="tablist"/.test(petrol) && /id="fuel-tab-petrol"[^>]*aria-selected="true"/.test(petrol) && /id="fuel-tab-diesel"[^>]*aria-selected="false"/.test(petrol) && /id="fuel-tab-lpg"[^>]*aria-selected="false"/.test(petrol) && petrol.indexOf("fuel-tab-petrol") < petrol.indexOf("fuel-tab-diesel") && petrol.indexOf("fuel-tab-diesel") < petrol.indexOf("fuel-tab-lpg") && /LPG 14\.2 kg/.test(petrol) && /₹113\.51/.test(petrol) && /₹99\.82/.test(petrol) && /₹968/.test(petrol));
ok("the chart is a tab panel of its tab, and says Kolkata and its range: 13 Nov 2025 to 12 Nov 2026", /role="tabpanel"[^>]*aria-labelledby="fuel-tab-petrol"/.test(petrol) && /Kolkata · per litre · price of each day, 13 Nov 2025 to 12 Nov 2026/.test(text(petrol)));
const t = text(petrol);
ok("the price on this day one year ago (13 Nov 2025): Start · 1 year ago, ₹105.41 on 13 Nov 2025", /Start · 1 year ago ₹105\.41 on 13 Nov 2025/.test(t));
ok("the highest in between: ₹113.51, the DAY it was reached (25 May 2026, not the latest day on which it still held), held to the latest day", /Highest ₹113\.51 on 25 May 2026/.test(t) && /held from 25 May 2026 to the latest day/.test(t));
ok("the lowest in between: ₹105.41 on 13 Nov 2025, held until 31 Dec 2025", /Lowest ₹105\.41 on 13 Nov 2025/.test(t) && /held from 13 Nov 2025 to 31 Dec 2025/.test(t));
ok("today's price: ₹113.51, with the latest day published and the number of days", /Today's price ₹113\.51 on 12 Nov 2026/.test(t) && /365 days, from the same date a year ago to today/.test(t));
ok("the callouts on the line name the high and the low with their days", /High ₹113\.51 · 25 May 2026/.test(t) && /Low ₹105\.41 · 13 Nov 2025/.test(t));
ok("the line is a staircase (horizontal then vertical steps), not a sloping line", /d="M[\d.,]+ (H[\d.]+ V[\d.]+ ?)+/.test(petrol) && !/ L[\d.]+,[\d.]+ L[\d.]+,[\d.]+ L/.test(petrol.match(/<path d="M[^"]*"[^>]*stroke-width="2.5"/)?.[0] ?? ""));
ok("the note under petrol says the source (PPAC), that a price stays until the day it is changed, and that today's price is the latest day published; it names no LPG sentence", /Petroleum Planning & Analysis Cell \(PPAC\)/.test(t) && /staircase because a price stays the same until the day it is changed/.test(t) && /latest day it has published/.test(t) && !/GoodReturns/.test(t));

// diesel and LPG: the same chart for another series (the tab opens when the others are missing, as the component starts on the first it has)
const dsl = text(h({ ...full, petrol: null }));
ok("diesel: ₹92.02 a year ago, highest ₹99.82 on 25 May 2026, lowest ₹92.02 on 13 Nov 2025 held until 14 May 2026, today ₹99.82", /Start · 1 year ago ₹92\.02 on 13 Nov 2025/.test(dsl) && /Highest ₹99\.82 on 25 May 2026/.test(dsl) && /Lowest ₹92\.02 on 13 Nov 2025/.test(dsl) && /held from 13 Nov 2025 to 14 May 2026/.test(dsl) && /Today's price ₹99\.82 on 12 Nov 2026/.test(dsl));
const gas = h({ ...full, petrol: null, diesel: null });
const g = text(gas);
ok("LPG: the start is honest about its length (10 months ago, Jan 2026, ₹879), highest ₹968 from Jun 2026, lowest ₹879 from Jan 2026 held to Feb 2026, today ₹968 on 13 Nov 2026", /Start · 10 months ago ₹879 on Jan 2026/.test(g) && /Highest ₹968 on Jun 2026/.test(g) && /held from Jun 2026 to the latest day/.test(g) && /Lowest ₹879 on Jan 2026/.test(g) && /held from Jan 2026 to Feb 2026/.test(g) && /Today's price ₹968 on 13 Nov 2026/.test(g) && /Kolkata · per cylinder · price of each month, Jan 2026 to 13 Nov 2026/.test(g));
ok("the LPG note says plainly why it is shorter (PPAC has no LPG table; GoodReturns holds ten months), that earlier months are not guessed, and that a month is drawn from its first day", /PPAC publishes no LPG table/.test(g) && /holds ten months/.test(g) && /begins in Jan 2026 and not a full year back/.test(g) && /none is guessed/.test(g) && /from the first day of that month/.test(g));
ok("the missing series are not offered as tabs; a note from the route (saved copy) is shown", !/fuel-tab-petrol/.test(gas) && /fuel-tab-lpg/.test(gas) && /saved on 13 November 2026/.test(text(h({ ...full, notes: ["The PPAC table could not be read just now, so the petrol prices are a copy saved on 13 November 2026."] }))));

// the points
const pts = toPoints(full.lpg!);
ok("a month is labelled by its month, today's price by its day; a day by its date with the year", pts[0].label === "Jan 2026" && pts[9].label === "Oct 2026" && pts[10].label === "13 Nov 2026" && toPoints(full.petrol!)[0].label === "13 Nov 2025" && toPoints(full.petrol!)[364].full === "12 Nov 2026");
ok("rupees: a round figure has none of the paise, the rest two places", rs(106) === "₹106" && rs(113.51) === "₹113.51" && rs(968) === "₹968" && rs(1234567) === "₹12,34,567");

// the chart's new options leave the gold chart as it was
const goldish = [{ label: "a", value: 10 }, { label: "b", value: 12 }, { label: "c", value: 12 }, { label: "d", value: 9 }];
const lineChart = renderToStaticMarkup(<TrendChart points={goldish} format={String} ariaLabel="x" />);
const stepChart = renderToStaticMarkup(<TrendChart points={goldish} format={String} ariaLabel="x" step ties="first" />);
ok("without the options the chart is a sloping line and names the LATEST of equal highs (c); with them, a staircase naming the FIRST (b) and how long it held", /Highest 12 on c/.test(text(lineChart)) && !/H[\d.]+ V[\d.]+/.test(lineChart) && !/held from/.test(text(lineChart)) && /Highest 12 on b/.test(text(stepChart)) && /H[\d.]+ V[\d.]+/.test(stepChart) && /held from b to c/.test(text(stepChart)));

// the dates under the axis never touch: fewer of them on a narrow screen, six when it is wide or not yet measured
ok("dates that fit: 6 unmeasured or wide, 3 at a phone's width, never fewer than the first and the last", datesThatFit(0) === 6 && datesThatFit(650) === 6 && datesThatFit(900) === 6 && datesThatFit(320) === 3 && datesThatFit(180) === 2 && datesThatFit(50) === 2 && dateTicks(366, 2).join() === "0,365" && dateTicks(366, 3).join() === "0,183,365");

console.log(`FuelTrend selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
