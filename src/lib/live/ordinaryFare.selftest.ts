// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/ordinaryFare.selftest.ts
// The railway's ordinary-class fare table (Circular 24 of 2025), as typed in: its internal rules (which catch a misreading of the scanned pages) and the hint built on it.
import { fareHint, ORDINARY_TABLE_MAX_KM, SLABS, slabOf } from "./ordinaryFare";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

ok("the slabs run without a gap from 1 km to 500 km: 5 km wide to 300 km, then 10 km", SLABS[0].from === 1 && SLABS[SLABS.length - 1].to === 500 && SLABS.every((s, i) => i === 0 || s.from === SLABS[i - 1].to + 1) && SLABS.filter((s) => s.to <= 300).every((s) => s.to - s.from === 4) && SLABS.filter((s) => s.from > 300).every((s) => s.to - s.from === 9) && SLABS.length === 60 + 20);
ok("in EVERY row the ticket fare is the basic fare rounded up to a multiple of Rs 5, and not under Rs 10 (the lowest ticket): a slip in reading either column of the scan would show here", SLABS.every((s) => s.fare === Math.max(10, Math.ceil(s.basic / 5) * 5)), SLABS.filter((s) => s.fare !== Math.max(10, Math.ceil(s.basic / 5) * 5)).map((s) => `${s.from}-${s.to}: ${s.basic}/${s.fare}`).join());
ok("fares never fall as the distance grows (basic and ticket)", SLABS.every((s, i) => i === 0 || (s.basic >= SLABS[i - 1].basic && s.fare >= SLABS[i - 1].fare)));
ok("the revision of 26 Dec 2025 shows: no step up to 215 km; the first slab after it (216-220) is Rs 55 against Rs 45 for 211-215", slabOf(215)!.fare === 45 && slabOf(216)!.fare === 55 && slabOf(216)!.basic - slabOf(215)!.basic === 6);
ok("figures read straight off the table: 1-5 km Rs 10 (basic 3); 41-45 km Rs 10; 46-50 km Rs 15; 100 km Rs 25; 156-160 km Rs 35; 300 km Rs 65; 301-310 km Rs 70; 500 km Rs 100", slabOf(1)!.fare === 10 && slabOf(1)!.basic === 3 && slabOf(43)!.fare === 10 && slabOf(48)!.fare === 15 && slabOf(100)!.fare === 25 && slabOf(158)!.fare === 35 && slabOf(300)!.fare === 65 && slabOf(305)!.fare === 70 && slabOf(500)!.fare === 100);
ok("a distance outside the table, or not a whole number of km, has no slab", slabOf(0) === null && slabOf(501) === null && slabOf(42.5) === null && slabOf(-3) === null && ORDINARY_TABLE_MAX_KM === 500);

// the hint
const h = (d: number) => fareHint(d);
ok("Durgapur to Asansol, 42.3 km: Rs 10, one figure (the slab 41-45 km holds the whole uncertainty of 40-44 km: 36-40 is Rs 10 as well)", h(42.3)!.low === 10 && h(42.3)!.high === 10 && h(42.3)!.km === 42);
ok("Durgapur to Howrah side, 158 km (tolerance 2 km): 156-160 km is one slab, Rs 35 only", h(158)!.low === 35 && h(158)!.high === 35 && h(158)!.tolerance === 2);
ok("when the uncertainty crosses a fare step the hint is a RANGE: 160.5 km could be 158.5-162.5 km, slabs 156-160 (Rs 35) and 161-165 (Rs 40): Rs 35 to 40, with both slabs named", (() => { const x = h(160.5)!; return x.low === 35 && x.high === 40 && x.slabs.length === 2; })());
ok("the tolerance is 2 km, or 1% of the distance when that is more (300 km: 3 km)", h(100)!.tolerance === 2 && h(300)!.tolerance === 3 && h(450)!.tolerance === 5);
ok("a distance whose range passes the end of the table (499 km, tolerance 5) has no hint; nor has zero, a negative, NaN or Infinity", h(499) === null && h(0) === null && h(-4) === null && h(NaN) === null && h(Infinity) === null);
ok("the shortest trips cost the minimum ticket: 3 km is Rs 10, 0.5 km is Rs 10", h(3)!.low === 10 && h(3)!.high === 10 && h(0.5)!.low === 10);
ok("a range crossing 215 km shows the revision's step: 214 km gives Rs 45 to 55", (() => { const x = h(214)!; return x.low === 45 && x.high === 55; })());
console.log(`ordinaryFare: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
