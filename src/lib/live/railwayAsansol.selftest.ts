// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/railwayAsansol.selftest.ts
// I test the trains of Asansol that Durgapur does not stop, using samples of RailRadar's real boards of Asansol and of Durgapur (with the pass-throughs), 16 Nov 2026. A train that stops at both is left out; one that
// passes Durgapur without stopping is "pass"; one that is not in Durgapur's timetable at all is "away"; the local trains are kept apart; an answer that cannot tell the two kinds apart is refused.
import { readFileSync } from "node:fs";
import { clock } from "./railway";
import { filterAsansol, parseAsansol, type AsansolTrain } from "./railwayAsansol";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const fx = (n: string) => JSON.parse(readFileSync(`src/lib/live/fixtures/${n}`, "utf8"));
const asn = fx("railradar-asn-sample.json"), dgr = fx("railradar-dgr-all-sample.json");
const LOW = { minAsn: 1, minDgr: 1, minPass: 1 };
const r = parseAsansol(asn, dgr, LOW);
const all: AsansolTrain[] = [...r.express, ...r.local];
const by = (n: string) => all.find((t) => t.number === n) as AsansolTrain;

ok("17 rows of Asansol's board give 11 trains: 4 that stop at Durgapur too are left out, and 2 that only pass Asansol are not trains to take there", r.count === 11 && all.length === 11 && r.station === "Asansol");
ok("a train that stops at BOTH stations is not listed (15048, 15050, 15052, 13051), nor one that only passes Asansol (00441, 00442)", ["15048", "15050", "15052", "13051", "00441", "00442"].every((n) => !all.some((t) => t.number === n)));
ok("a train that passes Durgapur without stopping and stops at Asansol is 'pass': the Rajdhanis 12301 and 12302, the Duronto 22213, Garba 12937 and Himgiri 13042 (5)", ["12301", "12302", "22213", "12937", "13042"].every((n) => by(n)?.via === "pass") && r.pass === 5);
ok("a train that is not in Durgapur's timetable at all is 'away': South Bihar 13287, Asansol-Hatia 13513, Tatanagar-Buxar 18183, the special 03512, Parasnath 12941, the MEMU 63541 (6)", ["13287", "13513", "18183", "03512", "12941", "63541"].every((n) => by(n)?.via === "away") && r.away === 6 && r.pass + r.away === r.count);
ok("the local (MEMU) train is kept apart from the express and mail trains, and the special stays among the express ones", r.local.length === 1 && r.local[0].number === "63541" && r.express.length === 10 && by("03512").kind === "special" && by("03512").label === "Special" && by("12302").label === "Rajdhani" && by("22213").label === "Duronto Express");
ok("the time is the time AT ASANSOL: a train that starts there has only a departure (13513 at 04:10), one that ends there only an arrival (12941 at 10:10)", by("13513").arrival === null && by("13513").departure === "04:10" && by("12941").departure === null && by("12941").arrival === "10:10" && by("22213").arrival === "00:55" && by("22213").departure === "01:00");
ok("the days are the days AT ASANSOL, moved on from the starting station: 22213 leaves Shalimar on Mon, Wed, Fri and is at Asansol after midnight on Tue, Thu, Sat; 13287 is daily", by("22213").days.join() === "tue,thu,sat" && by("13287").days.length === 7 && by("13513").days.join() === "mon,wed,thu,sat,sun");
const sorted = (l: AsansolTrain[]) => l.every((t, i) => i === 0 || clock(l[i - 1]) <= clock(t));
ok("the lists are in the order of the clock at Asansol (00:15 first, 18:49 last)", sorted(r.express) && clock(r.express[0]) === "00:15" && clock(r.express[r.express.length - 1]) === "18:49");
ok("the filters: only the trains that run today, without the specials, and one of the two kinds", filterAsansol(r.express, { today: "tue", specials: true }).every((t) => t.days.includes("tue")) && filterAsansol(r.express, { today: null, specials: false }).every((t) => t.kind !== "special") && filterAsansol(r.express, { today: null, specials: true, via: "pass" }).every((t) => t.via === "pass") && filterAsansol(r.express, { today: null, specials: true }).length === r.express.length);

const clone = (x: unknown) => JSON.parse(JSON.stringify(x));
const throws = (a: unknown, d: unknown, o?: object) => { try { parseAsansol(a, d, o); return false; } catch { return true; } };
ok("an answer that is not a success, is for another station, or has no list of trains is refused (either board)", throws({ success: false }, dgr, LOW) && throws(asn, null, LOW) && throws(dgr, dgr, LOW) && throws(asn, asn, LOW) && throws((() => { const c = clone(asn); delete c.data.trains; return c; })(), dgr, LOW));
ok("a Durgapur board WITHOUT the pass-through rows is refused (every train would otherwise look as if it did not go over Durgapur), and so is one with too few trains", throws(asn, (() => { const c = clone(dgr); c.data.trains = c.data.trains.filter((x: any) => x.stop.stopType !== "pass-through"); return c; })(), LOW) && throws(asn, dgr) && throws(asn, dgr, { ...LOW, minDgr: 100 }));
ok("an Asansol board with too few trains is refused; more than a tenth unreadable is refused; one bad train among many is skipped", throws(asn, dgr, { ...LOW, minAsn: 500 }) && throws((() => { const c = clone(asn); for (let i = 0; i < 4; i++) c.data.trains[i].train.number = "X"; return c; })(), dgr, LOW) && (() => { const c = clone(asn); c.data.trains[0].stop.arrival = "99:99"; c.data.trains = [...c.data.trains, ...c.data.trains.slice(1).map((x: any) => ({ ...clone(x), train: { ...clone(x.train), number: String(Number(x.train.number) + 70000).padStart(5, "0") } }))]; return parseAsansol(c, dgr, LOW).count >= 10; })());
ok("a stop of a kind that is not known (not halt, origin, destination or pass-through) is counted as unreadable, never taken for a stop", throws((() => { const c = clone(asn); for (const x of c.data.trains) x.stop.stopType = "mystery"; return c; })(), dgr, LOW));

console.log(`railwayAsansol: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
