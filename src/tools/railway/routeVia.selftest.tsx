// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/railway/routeVia.selftest.tsx
// THE TWO POORVA EXPRESSES: 12303 goes by Patna, 12381 by Gaya; each line says so. The table is checked against the stops RailRadar gave for each train (routeVia.evidence.json), so a train cannot be listed from memory.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { parseRailway } from "../../lib/live/railway";
import type { FindTrain } from "../../lib/live/fareFind";
import { FindRow } from "./FareFinder";
import { RailwayBody } from "./RailwayCard";
import { ROUTE_VIA, viaOf } from "./routeVia";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const ev = JSON.parse(readFileSync("src/tools/railway/routeVia.evidence.json", "utf8")) as Record<string, string>;
const codes = (n: string) => new Set(ev[n].split(" ").map((x) => x.split("@")[0]));

// the evidence says what the table says
const NAMES: Record<string, string> = { PNBE: "Patna", GAYA: "Gaya", SV: "Siwan", BUI: "Ballia", BTH: "Bettiah" };
ok("every train in the table has its stop list in the evidence", Object.keys(ROUTE_VIA).every((n) => !!ev[n] && codes(n).size >= 10));
ok("each train's via station is one it calls at, and NONE of its rivals calls there (so the name tells the trains apart)", Object.entries(ROUTE_VIA).every(([n, v]) => codes(n).has(v.code) && v.rivals.length > 0 && v.rivals.every((r) => !!ev[r] && !codes(r).has(v.code))));
ok("the via word is the place's name, and no two trains of one group share it (Poorva: Patna, Gaya; Purvanchal: Siwan, Ballia, Bettiah; Khatipura: Gaya, Patna)", Object.entries(ROUTE_VIA).every(([n, v]) => NAMES[v.code] === v.via && v.rivals.every((r) => ROUTE_VIA[r] && ROUTE_VIA[r].via !== v.via && ROUTE_VIA[r].rivals.includes(n))));
ok("12303 goes by Patna and not Gaya; 12381 by Gaya and not Patna (the Poorva Express)", codes("12303").has("PNBE") && codes("12303").has("MKA") && !codes("12303").has("GAYA") && codes("12381").has("GAYA") && codes("12381").has("DOS") && !codes("12381").has("PNBE"));
ok("the three Purvanchal Expresses to Gorakhpur: 15047 calls at Siwan (not Ballia, not Bettiah), 15049 at Ballia, 15051 at Bettiah", codes("15047").has("SV") && !codes("15047").has("BUI") && !codes("15047").has("BTH") && codes("15049").has("BUI") && !codes("15049").has("SV") && codes("15051").has("BTH") && !codes("15051").has("SV"));
ok("the Khatipura specials: 03007 calls at Gaya and not Patna, 09710 at Patna and not Gaya", codes("03007").has("GAYA") && !codes("03007").has("PNBE") && codes("09710").has("PNBE") && !codes("09710").has("GAYA"));
ok("nothing is said for a train whose route was not checked (the return trains 12304, 12382, 15048, 15050, 15052; the Amrit Bharat pair 03009 and 13065; any other number)", ["12304", "12382", "15048", "15050", "15052", "03009", "13065", "12019"].every((n) => !viaOf(n)) && viaOf(" 12303 ")?.via === "Patna");
ok("each hover note names the route's own main stops and where the other trains of the name go", /Patna Jn/.test(ROUTE_VIA["12303"].note) && /Gaya/.test(ROUTE_VIA["12303"].note) && /12303 goes by Patna/.test(ROUTE_VIA["12381"].note) && /Siwan/.test(ROUTE_VIA["15047"].note) && /Ballia/.test(ROUTE_VIA["15047"].note) && /Bettiah/.test(ROUTE_VIA["15047"].note) && /09710 goes by Patna/.test(ROUTE_VIA["03007"].note));

// the lines
const train = (number: string, name: string): FindTrain => ({ number, name, label: "Superfast", kind: null, departure: "09:49", arrival: "09:47", days: ["mon", "tue", "fri", "sat"], endsAt: { code: "SSB", name: "Shakurbasti" }, distanceKm: number === "12303" ? 1374 : 1290, classes: [], hint: false, receivedAt: "2026-11-14T08:00:00.000Z" } as FindTrain);
const a = text(renderToStaticMarkup(<FindRow t={train("12303", "Poorva Express")} />));
const b = text(renderToStaticMarkup(<FindRow t={train("12381", "Poorva Express")} />));
const c = text(renderToStaticMarkup(<FindRow t={train("12019", "Shatabdi")} />));
ok("the fare finder's line says 'via Patna' for 12303 and 'via Gaya' for 12381, before 'runs on to', and says nothing for another train", /12303 · Superfast · via Patna · runs on to Shakurbasti · 1,374 km/.test(a) && /12381 · Superfast · via Gaya · runs on to Shakurbasti · 1,290 km/.test(b) && !/via /.test(c));
const rw = parseRailway(JSON.parse(readFileSync("src/lib/live/fixtures/railradar-dgr-sample.json", "utf8")), { min: 1 });
const card = renderToStaticMarkup(<RailwayBody data={rw} now={{ hm: "10:00", day: "wed" as const }} />);
ok("the Durgapur card's line for Poorva Express 12303 says via Patna (a hover note too); a train with no checked route says nothing", /12303[^<]*·[^<]*<span[^>]*>Superfast|12303 · [\s\S]{0,400}data-via-route="Patna"/.test(card) && /data-via-route="Patna"[^>]*title="The Patna route/.test(card) && !/data-via-route="Gaya"/.test(card));
console.log(`routeVia selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
