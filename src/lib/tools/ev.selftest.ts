// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/tools/ev.selftest.ts
import { estimateCharge, hoursText, validateEv, isEvProblem, EV_DEFAULTS, CHARGERS, type EvInput } from "./ev";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const ev = (o: Partial<EvInput> = {}): EvInput => ({ ...EV_DEFAULTS, ...o });
const est = (i: EvInput, kind: "AC" | "DC", kw: number) => { const r = estimateCharge(i, { kind, kw }); if (isEvProblem(r)) throw new Error(r.error); return r; };

ok("AC: 40 kWh from 10 to 90 percent (32 kWh) on a 7.4 kW point takes about 4 h 48 min", near(est(ev(), "AC", 7.4).hours, 32 / (7.4 * 0.9), 1e-9) && hoursText(est(ev(), "AC", 7.4).hours) === "4 h 48 min");
ok("AC: the car's on-board charger limits a bigger charger (7.4 kW car on a 22 kW point is no faster)", est(ev(), "AC", 22).hours === est(ev(), "AC", 7.4).hours && est(ev(), "AC", 22).limitedBy === "car" && est(ev(), "AC", 3.3).limitedBy === "charger");
ok("AC: a car that takes 22 kW charges three times faster on a 22 kW point than on 7.4", near(est(ev({ carAcKw: 22 }), "AC", 7.4).hours / est(ev({ carAcKw: 22 }), "AC", 22).hours, 22 / 7.4, 1e-9));
ok("DC: more charger power is faster until the car's own limit, then no faster", est(ev(), "DC", 30).hours > est(ev(), "DC", 60).hours && est(ev(), "DC", 120).hours === est(ev(), "DC", 60).hours && est(ev(), "DC", 120).limitedBy === "car");
ok("DC: 10 to 80 percent of 40 kWh at a 50 kW peak is 40 to 60 minutes (the usual figure of makers is about 40 to 60 for cars of this size)", (() => { const m = est(ev({ toPct: 80, carDcKw: 50 }), "DC", 50).hours * 60; return m >= 40 && m <= 60; })());
ok("DC: the last stretch is slower: 80 to 90 percent takes longer per kWh than 10 to 50", (() => { const a = est(ev({ fromPct: 80, toPct: 90 }), "DC", 60); const b = est(ev({ fromPct: 10, toPct: 20 }), "DC", 60); return a.hours > b.hours; })());
ok("DC is much quicker than AC for the same battery", est(ev(), "DC", 60).hours < est(ev(), "AC", 7.4).hours / 3);
ok("energy added, energy drawn and range added", (() => { const r = est(ev(), "AC", 7.4); return near(r.addedKwh, 32, 1e-9) && near(r.fromGridKwh, 32 / 0.9, 1e-9) && near(r.addedKm, 192, 1e-9); })());
ok("bad inputs are told in words, never a wrong number", [ev({ capacityKwh: 0 }), ev({ fromPct: 90, toPct: 10 }), ev({ toPct: 120 }), ev({ fromPct: 100 }), ev({ carAcKw: 0 }), ev({ capacityKwh: NaN })].every((i) => validateEv(i) !== null) && isEvProblem(estimateCharge(ev(), { kind: "DC", kw: 0 })));
ok("times are said in hours and minutes", hoursText(0.7) === "42 min" && hoursText(2) === "2 h" && hoursText(0.001) === "under 1 min" && hoursText(NaN) === "—");
ok("the chargers cover AC 3.3 to 22 and DC 30 to 240", CHARGERS.filter((c) => c.kind === "AC").length === 4 && CHARGERS.filter((c) => c.kind === "DC").length === 4 && CHARGERS.every((c) => c.kw > 0 && c.label && c.note));

console.log(`ev selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
