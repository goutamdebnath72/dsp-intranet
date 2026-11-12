// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/fuel.selftest.ts
import { readFileSync } from "node:fs";
import { assemble, parseMetroTable, parseLpgCity, CITIES, type City } from "./fuel";
import { htmlToText, amount } from "./text";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const fx = (n: string) => readFileSync(`src/lib/live/fixtures/${n}.txt`, "utf8");
const lpg: Record<City, string> = { Delhi: fx("fuel-lpg-new-delhi"), Mumbai: fx("fuel-lpg-mumbai"), Chennai: fx("fuel-lpg-chennai"), Kolkata: fx("fuel-lpg-kolkata") };

const all = assemble(fx("fuel-petrol"), fx("fuel-diesel"), lpg);
const by = (c: City) => all.find((x) => x.city === c)!;
ok("the four metros, in order", all.map((x) => x.city).join() === CITIES.join());
ok("petrol per litre as the page of 12 Nov 2026 had it: Delhi 102.12, Kolkata 113.51, Mumbai 111.21, Chennai 107.76", by("Delhi").petrol.price === 102.12 && by("Kolkata").petrol.price === 113.51 && by("Mumbai").petrol.price === 111.21 && by("Chennai").petrol.price === 107.76);
ok("diesel: Delhi 95.20, Kolkata 99.82, Mumbai 97.83, Chennai 99.55", by("Delhi").diesel.price === 95.2 && by("Kolkata").diesel.price === 99.82 && by("Mumbai").diesel.price === 97.83 && by("Chennai").diesel.price === 99.55);
ok("LPG of Delhi: 14.2 kg 942, 19 kg 2820 (+10), 5 kg 349.50, 47.5 kg 7045.50 (+24.50)", by("Delhi").lpg.dom14.price === 942 && by("Delhi").lpg.com19.price === 2820 && by("Delhi").lpg.com19.change === 10 && by("Delhi").lpg.dom5.price === 349.5 && by("Delhi").lpg.com47.price === 7045.5 && by("Delhi").lpg.com47.change === 24.5);
ok("LPG of Mumbai, Chennai, Kolkata 14.2 kg: 941.50, 957.50, 968", by("Mumbai").lpg.dom14.price === 941.5 && by("Chennai").lpg.dom14.price === 957.5 && by("Kolkata").lpg.dom14.price === 968);
ok("a change is read with its sign: +17.00 for the Kolkata 19 kg cylinder", by("Kolkata").lpg.com19.change === 17 && by("Delhi").petrol.change === 0);
ok("the rupee sign written as an entity is decoded, tags become separators", htmlToText("<td>&#x20b9;941.50</td><td>0.00</td>") === "| ₹941.50| 0.00|" && amount("₹2,775.00") === 2775 && amount("+10.50") === 10.5 && amount("(0.00)") === 0 && amount("n/a") === null);

// the self-check: a changed page is an error, never a wrong number
const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };
ok("a missing table is an error", throws(() => parseMetroTable("nothing here", "Petrol")) && throws(() => parseLpgCity("nothing here", "Delhi")));
ok("a missing city is an error", throws(() => parseMetroTable(fx("fuel-petrol").replace("| Chennai|", "| Madras|"), "Petrol")));
ok("an impossible price is an error: petrol at 10 rupees, LPG at 94 rupees", throws(() => parseMetroTable(fx("fuel-petrol").replace("102.12", "10.21"), "Petrol")) && throws(() => parseLpgCity(lpg.Delhi.replace("942.00", "94.20"), "Delhi")));
ok("cylinders out of the order of their sizes are an error (the 5 kg dearer than the 14.2 kg)", throws(() => parseLpgCity(lpg.Delhi.replace("349.50", "949.50"), "Delhi")));
ok("a cylinder missing from the table is an error", throws(() => parseLpgCity(lpg.Delhi.replace("Commercial (47.5 Kg)", "Commercial (50 Kg)"), "Delhi")));
ok("the 4 cities are not confused with others in the list (Gurgaon and Noida follow Delhi in the page)", by("Delhi").petrol.price !== 102.97 && by("Delhi").petrol.price !== 101.96);

console.log(`fuel selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
