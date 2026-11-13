// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/converter/converterModel.selftest.ts
import { CONV_KINDS, ENGINE_UNITS, boxNumber, compute, defaultPair, engineRows, optionsFor, parseEngine, plainNumber } from "./converterModel";
import type { Rates } from "./currency";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const rates: Rates = { base: "USD", date: "2026-11-11", source: "test table", rates: { INR: 93.69, EUR: 0.86, GBP: 0.76 } };

const hpps = compute("power", 1, "hp", "ps", null);
ok("the Google example: 1 bhp is 1.01387 PS and the formula says multiply by 1.0139", !!hpps && boxNumber("power", hpps.result) === "1.01387" && hpps.formula === "For an approximate result, multiply the power value by 1.0139");
ok("a temperature has a formula of its own", compute("temperature", 100, "C", "F", null)?.formula === "To convert, multiply the value by 1.8, then add 32." && compute("temperature", 0, "K", "C", null)?.formula === "To convert, subtract 273.15." && compute("temperature", 0, "C", "K", null)?.formula === "To convert, add 273.15.");
ok("a temperature is converted both ways", compute("temperature", 100, "C", "F", null)?.result === 212 && Math.abs((compute("temperature", 212, "F", "C", null)?.result ?? 0) - 100) < 1e-9);
ok("currency needs the rates and says the rate and the date", compute("currency", 100, "USD", "INR", null) === null && (() => { const c = compute("currency", 100, "USD", "INR", rates); return !!c && Math.abs(c.result - 9369) < 1e-6 && /1 USD = 93.69 INR/.test(c.formula) && /2026-11-11/.test(c.notes[0]); })());
ok("money is shown to the paisa, other results to six digits", boxNumber("currency", 9369.123456) === "9369.12" && boxNumber("currency", 0.0123456) === "0.01235" && boxNumber("length", 3.10685596) === "3.10686");
ok("typing a result back gives the first value (both boxes are editable)", (() => { const f = compute("length", 5, "km", "mi", null)!; const b = compute("length", f.result, "mi", "km", null)!; return Math.abs(b.result - 5) < 1e-9; })());
ok("every kind has at least two units and a default pair that exists", CONV_KINDS.every((k) => { const o = optionsFor(k).map((x) => x.id); const [a, b] = defaultPair(k); return o.length >= 2 && o.includes(a) && o.includes(b); }));
ok("an unknown unit or a bad number gives nothing", compute("length", 1, "km", "kg", null) === null && compute("length", NaN, "km", "m", null) === null);
ok("numbers for the boxes have no grouping and no trailing zeros", plainNumber(1250000) === "1250000" && plainNumber(0.5) === "0.5" && plainNumber(1 / 3, 6) === "0.333333" && plainNumber(NaN) === "");

ok("engine power: 1 bhp is 1.01387 PS and 0.7457 kW, listed PS first, then bhp, then kW", (() => { const r = engineRows(1, "hp"); return !!r && r.map((x) => x.short).join() === "PS,bhp,kW" && boxNumber("power", r[0].value) === "1.01387" && r[1].value === 1 && boxNumber("power", r[2].value) === "0.7457"; })());
ok("engine power: the same power gives the largest number in PS, then bhp, then kW, whichever unit is typed", ["ps", "hp", "kW"].every((id) => { const r = engineRows(100, id)!; return r[0].value > r[1].value && r[1].value > r[2].value; }));
ok("engine power: 100 kW is 134.1 bhp and 135.96 PS; and PS is explained as the German Pferdestärke", (() => { const r = engineRows(100, "kW")!; return Math.abs(r[1].value - 134.102) < 0.001 && Math.abs(r[0].value - 135.962) < 0.001; })() && /Pferdestärke/.test(ENGINE_UNITS[0].meaning) && /horse strength/.test(ENGINE_UNITS[0].meaning));
ok("engine power questions: '100 bhp', 'ps bhp kw', 'engine power', 'bhp vs ps vs kw' are read; a lone unit, a repeat or a sentence is not", (() => { const a = parseEngine("100 bhp"), b = parseEngine("ps bhp kw"), c = parseEngine("engine power"), d = parseEngine("bhp vs ps vs kw"); return a?.value === 100 && a.id === "hp" && b?.id === "ps" && c?.id === "hp" && d?.id === "hp"; })() && ["kw", "100 kw kw", "engine power circular", "bhp of the new truck"].every((q) => parseEngine(q) === null));
ok("the engine kind has three options and its default pair", optionsFor("engine").length === 3 && defaultPair("engine").join() === "hp,ps" && compute("engine", 1, "hp", "ps", null) !== null && compute("engine", 1, "hp", "m", null) === null);
console.log(`converterModel selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
