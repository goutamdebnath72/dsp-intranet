// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/ev/EvForm.selftest.tsx
// The electric-car window as it is drawn: two tabs, the charging time first, the guide second with its six sections and its worked example.
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

console.log(`EvForm: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
