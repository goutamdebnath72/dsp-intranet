// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/tyre/tyre.selftest.ts
import { parseTyre, readTyre, LOAD_INDEX_KG, SPEED_KMH } from "./tyre";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const t = parseTyre("205/55 R16 91V");
ok("205/55 R16 91V is read part by part", !!t && t.width === 205 && t.aspect === 55 && t.rim === 16 && t.construction === "R" && t.load === 91 && t.speed === "V");
const r = t ? readTyre(t) : null;
ok("the meanings: aspect ratio 55 (not a height) giving a sidewall of 112.75 mm, 16 inch rim, 615 kg, 240 km/h", !!r && r.rows.some((x) => x.meaning === "Aspect ratio" && x.part === "55" && /^the height of the sidewall as a percentage of the tyre width\. Sidewall height = width × aspect ratio = 205 mm × 55% = 112\.75 mm \(on an inflated tyre\)/.test(x.detail) && !/NOT/.test(x.detail)) && !r.rows.some((x) => /height/i.test(x.meaning)) && r.facts.some((f) => f.label === "Sidewall height" && /^112\.75 mm/.test(f.value)) && r.notes[0].includes("406.4 mm + 2 × 112.75 mm = 631.9 mm") && r.rows.some((x) => x.meaning === "Load index" && /615 kg/.test(x.detail)) && r.rows.some((x) => x.meaning === "Speed symbol" && /240 km\/h/.test(x.detail)) && r.rows.some((x) => x.meaning === "Rim diameter" && /406\.4 mm/.test(x.detail)));
ok("the overall diameter is 631.9 mm and the tyre turns about 504 times a km", !!r && r.facts.some((f) => /^631\.9 mm/.test(f.value)) && r.facts.some((f) => f.label.startsWith("Turns") && Math.abs(Number(f.value) - 504) <= 1), JSON.stringify(r?.facts));
ok("other spellings are read: P215/65R15 95H, 165/80 r14, tyre size 195/65-15 91H, 225/45 ZR17 94(Y)", (() => { const a = parseTyre("P215/65R15 95H"), b = parseTyre("165/80 r14"), c = parseTyre("tyre size 195/65-15 91H"), d = parseTyre("225/45 ZR17 94(Y)"); return a?.vehicleClass === "P" && a.load === 95 && a.speed === "H" && b?.rim === 14 && b.load === undefined && c?.width === 195 && c.speed === "H" && d?.construction === "ZR" && d.speed === "(Y)"; })());
ok("a twin load index and the extra markings are read: 195/75 R16C 107/105R, 225/45 R17 94W XL", (() => { const a = parseTyre("195/75 R16 107/105R"), b = parseTyre("225/45 R17 94W XL"); return a?.load === 107 && a.load2 === 105 && a.speed === "R" && b?.extras[0] === "XL"; })());
ok("things that are not tyre sizes are not read: dates, fractions, sums, impossible figures", ["205/55", "24/01/2026", "205/55 16", "12*45+7", "50/60 R16", "205/55 R40", "205/55 R16 91", "205/55 R16 999V", "205/55 R16 91A"].every((q) => parseTyre(q) === null));
ok("the load table is the standard one", LOAD_INDEX_KG[91] === 615 && LOAD_INDEX_KG[100] === 800 && LOAD_INDEX_KG[60] === 250 && LOAD_INDEX_KG[130] === 1900 && Object.keys(LOAD_INDEX_KG).length === 71 && Object.entries(LOAD_INDEX_KG).every(([k, v], i, a) => i === 0 || v > a[i - 1][1]));
ok("the speed table is the standard one", SPEED_KMH.V.kmh === 240 && SPEED_KMH.H.kmh === 210 && SPEED_KMH.W.kmh === 270 && SPEED_KMH.Y.kmh === 300 && SPEED_KMH.T.kmh === 190 && SPEED_KMH.Q.kmh === 160 && SPEED_KMH.Z.over === true);
ok("without a load index the reading says so", (() => { const x = parseTyre("205/55 R16"); return !!x && readTyre(x).notes[0].includes("load index and speed symbol"); })());

console.log(`tyre selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
