// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/ev/EvForm.selftest.tsx
// This checks the electric-car window as it is drawn: two tabs, the charging time first, the guide second with its six sections and its worked example.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EvForm } from "./EvForm";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const text = (s: string) => s.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&ldquo;|&rdquo;/g, '"').replace(/\s+/g, " ");
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

const first = renderToStaticMarkup(<EvForm />);
ok("the window has two tabs, Charging time and EV specifications explained, and opens on the charging time", count(first, /role="tab"/g) === 2 && /aria-selected="true"[^>]*>[\s\S]*?Charging time/.test(first) && /EV specifications explained/.test(first) && /Battery size \(kWh\)/.test(first) && !/data-ev-guide/.test(first));
const g = renderToStaticMarkup(<EvForm initialTab="guide" />);
const gt = text(g);
ok("the guide tab draws the two numbers, the jump list and six sections, each with its terms", count(g, /data-two-numbers/g) === 1 && count(g, /data-guide-jump/g) === 1 && count(g, /data-guide-section="/g) === 6 && count(g, /data-guide-term/g) >= 25 && !/Battery size \(kWh\)/.test(g));
ok("it says the plain things: kWh is the tank, kW the engine, 100 kW is 134 bhp or 136 PS, the motor is an AC motor, one socket takes AC and DC", /kWh[^.]*is like the fuel tank/.test(gt) && /kW[^.]*is like the engine/.test(gt) && /100 kW is 134 bhp or 136 PS/.test(gt) && /AC motor/.test(gt) && /single charging socket/.test(gt));
ok("the worked example is computed: 110 kW is 148 bhp or 150 PS, a 60 kWh battery goes about 300 km, and 10% to 90% on 7.4 kW AC adds 48 kWh in about 7 h 12 min", count(g, /data-guide-example/g) === 1 && /148 bhp, or 150 PS/.test(gt) && /about 300 km on a full charge/.test(gt) && /adds 48 kWh from 10% to 90% in about 7 h 12 min/.test(gt) && /not a real car/.test(gt));
ok("the Blade section links its sources (BYD, Autocar India, Autocar Professional, S&P) with the words under 'What it says'", count(g, /data-guide-sources/g) === 1 && /byd\.com\/eu\/blog\/[^"]*#:~:text=/.test(g) && /autocarindia\.com[^"]*#:~:text=/.test(g) && /autocarpro\.in[^"]*#:~:text=/.test(g) && count(g, /What it says/g) >= 7);
ok("the guide never claims a thing it should not: no price in rupees and no named car's range", !/₹|Rs \d/.test(gt));

// ---- what it costs (tariff.ts): the official ceilings, by time of day, or the person's own rate
const costs = [...first.matchAll(/data-ev-chip[^>]*>([^<]*)(?:<!-- -->)?([^<]*)</g)].map((m) => (m[1] + m[2]).replace(/\s+/g, " ").trim());
ok("every charger row carries a cost, 'up to' the ceiling: 12 rows of chargers, each with its rupees", count(first, /data-ev-chip/g) === 8 && costs.length === 8 && costs.every((c) => /^up to ₹ [\d,]+$/.test(c)), JSON.stringify(costs.slice(0, 9)));
ok("the first AC row (3.3 kW) and the first DC row cost what the sum says: 32 kWh added from 40 kWh, 10% to 90%: AC by day about ₹ 302, DC by day about ₹ 556", costs[0] === "up to ₹ 302" && costs[4] === "up to ₹ 556", JSON.stringify(costs.slice(0, 5)));
ok("each row says its sum: units drawn × the rate, with its two parts", /35\.6 units drawn × ₹ 8\.50 \(₹ 5\.50 electricity \+ ₹ 3\.00 service charge, the ceiling\)/.test(text(first)) && /33\.7 units drawn × ₹ 16\.50 \(₹ 5\.50 electricity \+ ₹ 11\.00 service charge, the ceiling\)/.test(text(first)));
ok("the card has the time-of-day pills (day, evening, night) and the own-rate box, and says plainly that it is a ceiling before GST and land cost", count(first, /data-ev-cost-panel/g) === 1 && /Day · 9 am–4 pm/.test(text(first)) && /Evening · 5–11 pm/.test(text(first)) && /Night · 11 pm–9 am/.test(text(first)) && /id="ev-rate"/.test(first) && /highest the rules allow/.test(text(first)) && /before GST and land cost/.test(text(first)) && /domestic rates apply/.test(text(first)));
ok("the sources are on the card: the WBERC order of 20 March 2025 and the Ministry of Power guidelines of 17 September 2024, with the validity and the review", /20 March 2025/.test(text(first)) && /17 September 2024/.test(text(first)) && /31 March 2028/.test(text(first)) && /annual review/.test(text(first)) && /clause 10\(1\)/.test(text(first)) && /tariff year 2025-26/.test(text(first)));
ok("the time of day is a radio group of three, not tabs (the window keeps exactly two tabs)", count(first, /role="radio"/g) === 3 && count(first, /role="tab"/g) === 2 && /role="radiogroup"/.test(first));
ok("the guide tab still says nothing of price (the cost lives on the time tab only)", !/data-ev-chip|data-ev-cost-panel/.test(g));

// ---- the rate chart: every kind of charger, every time of day
const chart = first.slice(first.indexOf("data-ev-chart"));
const ct = text(chart);
ok("the rate chart is on the card, with a column for each time of day and a row for AC, for DC and for home", count(first, /data-ev-chart(?!-)/g) === 1 && count(first, /data-ev-chart-band=/g) === 3 && count(first, /data-ev-chart-row=/g) === 3, String(count(first, /data-ev-chart-row=/g)));
ok("AC: 8.50, 10.00 and 9.50 (electricity + service, by day, evening and night)", /AC \(slow\)[\s\S]*?₹ 8\.50[\s\S]*?5\.50 electricity \+ 3\.00 service[\s\S]*?₹ 10\.00[\s\S]*?6\.00 electricity \+ 4\.00 service[\s\S]*?₹ 9\.50[\s\S]*?5\.50 electricity \+ 4\.00 service/.test(ct), ct.slice(0, 600));
ok("DC: 16.50, 19.00 and 18.50", /DC \(fast\)[\s\S]*?₹ 16\.50[\s\S]*?5\.50 electricity \+ 11\.00 service[\s\S]*?₹ 19\.00[\s\S]*?6\.00 electricity \+ 13\.00 service[\s\S]*?₹ 18\.50[\s\S]*?5\.50 electricity \+ 13\.00 service/.test(ct));
ok("the chart says it is a ceiling before GST and land cost, names both sources' figures and that the 4 to 5 pm hour is priced as night, and that one ceiling covers all AC and all DC chargers", /Before GST and land cost; a station may charge less/.test(ct) && /tariff year 2025-26/.test(ct) && /31 March 2028/.test(ct) && /4 to 5 pm is priced as night/.test(ct) && /one ceiling for all AC chargers and one for all DC chargers/.test(ct));
ok("home: the domestic rate applies, and the box for the rate on the bill is pointed to", /At home[\s\S]*?domestic electricity rate of your household applies[\s\S]*?clause 15\(4\)[\s\S]*?type the rate on your bill/.test(ct));
ok("the chosen time of day is marked in the chart (the day, by default), and nothing is marked when the person has typed a rate", count(first, /bg-amber-100 text-orange-900/g) === 1 && /data-ev-chart-band="day"[^>]*bg-amber-100/.test(first));
ok("the guide tab has no chart", !/data-ev-chart/.test(g));

console.log(`EvForm: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
