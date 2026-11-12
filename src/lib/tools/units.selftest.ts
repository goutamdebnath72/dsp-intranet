// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/tools/units.selftest.ts
import { parseConversion, convertWords, findUnit, UNITS, TEMPERATURES } from "./units";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const r = (q: string) => { const x = parseConversion(q); return x && x.kind === "convert" ? x.result : undefined; };
const close = (a: number | undefined, b: number, tol = 1e-6) => a !== undefined && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

ok("length", close(r("5 km in miles"), 3.106856) && close(r("1 mile to km"), 1.609344) && close(r("12 inches to cm"), 30.48) && close(r("100 m to ft"), 328.083990) && close(r("1 nautical mile to km"), 1.852));
ok("area, including Indian use", close(r("1 acre to sq ft"), 43560) && close(r("1 hectare to acres"), 2.4710538) && close(r("1000 sq ft to sq m"), 92.90304) && close(r("1 gaj to sq ft"), 9) && close(r("2 m2 to cm2"), 20000));
ok("volume", close(r("1 gallon to litres"), 3.785411784) && close(r("1 imperial gallon to litres"), 4.54609) && close(r("1 barrel to litres"), 158.987294928) && close(r("1 m3 to litres"), 1000) && close(r("500 cc to ml"), 500));
ok("mass, including quintal and tola", close(r("1 quintal to kg"), 100) && close(r("1 tonne to kg"), 1000) && close(r("1 kg to lb"), 2.2046226) && close(r("10 tola to g"), 116.63804) && close(r("5 ton to kg"), 5000));
ok("temperature", close(r("98.6 f to c"), 37) && close(r("100 celsius to fahrenheit"), 212) && close(r("0 c to k"), 273.15) && close(r("-40 f to c"), -40) && close(r("300 k to c"), 26.85));
ok("temperature: the degree sign", close(r("37 °c to °f"), 98.6));
ok("angle: degrees and radians both ways", close(r("180 degrees to radians"), Math.PI) && close(r("3.14159265358979 rad to deg"), 180) && close(r("90 deg to grad"), 100) && close(r("1 turn to deg"), 360) && close(r("1 rad to deg"), 57.29577951));
ok("energy: calories, kcal, kWh, BTU, joule", close(r("1 kcal to cal"), 1000) && close(r("1 cal to J"), 4.184) && close(r("1 kWh to MJ"), 3.6) && close(r("1 kWh to kcal"), 860.4207) && close(r("1 BTU to J"), 1055.05585262) && close(r("1 kWh to calories"), 860420.65));
ok("force", close(r("1 kgf to N"), 9.80665) && close(r("1 lbf to N"), 4.4482216) && close(r("1 tf to kN"), 9.80665) && close(r("1000 N to kgf"), 101.97162));
ok("power: bhp and kW both ways, PS and TR", close(r("1 bhp to kw"), 0.7456998716) && close(r("100 kw to bhp"), 134.1022) && close(r("1 hp to W"), 745.69987) && close(r("1 ps to kw"), 0.73549875) && close(r("1 TR to kw"), 3.5168528));
ok("pressure: bar, psi, kgf/cm2", close(r("1 bar to psi"), 14.5037738) && close(r("1 kgf/cm2 to bar"), 0.980665) && close(r("1 kg/cm2 to psi"), 14.2233, 1e-4) && close(r("1 atm to bar"), 1.01325) && close(r("10 mpa to bar"), 100));
ok("speed and time", close(r("72 km/h to m/s"), 20) && close(r("60 mph to kmph"), 96.56064) && close(r("10 knots to km/h"), 18.52) && close(r("2 hours to minutes"), 120) && close(r("1 week to days"), 7));
ok("'what is', 'convert', thousand separators and a trailing ?", close(r("what is 5 km in miles?"), 3.106856) && close(r("convert 1,000 g to kg"), 1) && close(r("how much is 1 kg in lb"), 2.2046226));
ok("the answer reports one unit too", (parseConversion("5 km in miles") as { oneUnit: number }).oneUnit > 0.62 && (parseConversion("5 km in miles") as { oneUnit: number }).oneUnit < 0.622);
ok("a word with several meanings says which it took", (parseConversion("1 ton to kg") as { notes: string[] }).notes.some((n) => /metric tonne/.test(n)) && (parseConversion("1 bhp to kw") as { notes: string[] }).notes.some((n) => /mechanical/.test(n) && /735/.test(n)) && (parseConversion("1 kWh to calories") as { notes: string[] }).notes.some((n) => /kilocalories/.test(n)) && (parseConversion("1 gallon to litres") as { notes: string[] }).notes.some((n) => /US gallon/.test(n)));
ok("units of different kinds are told apart, not converted", (() => { const x = parseConversion("5 km to kg"); return !!x && x.kind === "mismatch" && /length/.test(x.message) && /mass/.test(x.message); })());
ok("a temperature cannot become a length", (() => { const x = parseConversion("20 c to m"); return !!x && x.kind === "mismatch"; })());
ok("not a conversion: a sentence, an unknown unit, a bare number, other joiners", ["who is in charge of blast furnace", "5 foo to bar", "5 km", "100", "5 years to retirement", "holiday list 2026 to 2027", "10 people in C&IT", "12 months to 2026"].every((q) => parseConversion(q) === null), JSON.stringify(["who is in charge of blast furnace", "5 foo to bar", "5 km", "100", "5 years to retirement", "holiday list 2026 to 2027", "10 people in C&IT", "12 months to 2026"].map((q) => parseConversion(q))));
ok("a very long text is refused", parseConversion("5 km in " + "miles ".repeat(30)) === null);
ok("aliases do not collide: every alias names one unit", (() => { const seen = new Map<string, string>(); let bad = ""; for (const u of UNITS) for (const a of u.aliases) { const k = a.toLowerCase(); if (seen.has(k) && seen.get(k) !== u.id) bad += `${k} (${seen.get(k)} / ${u.id}) `; seen.set(k, u.id); } return !bad; })());
ok("every unit is reachable by its own alias and a round trip returns the value", UNITS.every((u) => { const same = UNITS.find((x) => x.kind === u.kind && x.id !== u.id); if (!same) return true; const c = convertWords(7, u.aliases[0], same.aliases[0]); if (!c || c.kind !== "convert") return false; const back = convertWords(c.result, same.aliases[0], u.aliases[0]); return !!back && back.kind === "convert" && Math.abs(back.result - 7) < 1e-9; }));
ok("a conversion without a number is for one unit, as Google reads it; ordinary words are not units", (() => { const c = parseConversion("bhp to ps"); return !!c && c.kind === "convert" && c.value === 1 && c.fromId === "hp" && c.toId === "ps" && Math.abs(c.result - 1.01387) < 1e-5; })() && ["transfer to kolkata", "who to contact", "time to leave", "pay to dsp"].every((q) => parseConversion(q) === null));
ok("a conversion names the ids of its two units, for the converter card", (() => { const c = parseConversion("100 c to f"); return !!c && c.kind === "convert" && c.fromId === "C" && c.toId === "F"; })());
ok("tables are complete", UNITS.length >= 90 && TEMPERATURES.length === 3 && !!findUnit("sq. ft.") && !!findUnit("Metres") && !!findUnit("Kilograms"));

console.log(`units selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
