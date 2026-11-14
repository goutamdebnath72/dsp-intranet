// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/railway.selftest.ts
// The Durgapur railway station reader: drawn from a sample of RailRadar's real answer (13 Nov 2026): checks the shape, moves the days on to the day the train is at Durgapur, places each train towards Howrah or away from it only
// when the data supports it, separates the local (MEMU) trains and the specials, orders by the clock, and refuses an answer that is not the expected one. Also: the plant's API key is never in the source.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { clock, daysChip, filterTrains, headingOf, nextTrain, parseRailway, shiftDays, type Train } from "./railway";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const raw = JSON.parse(readFileSync("src/lib/live/fixtures/railradar-dgr-sample.json", "utf8"));
const r = parseRailway(raw, { min: 1 });
const all: Train[] = [...r.express.east, ...r.express.west, ...r.express.other, ...r.local.east, ...r.local.west, ...r.local.other];
const by = (n: string) => all.find((t) => t.number === n) as Train;

ok("all 24 trains of the sample are read, for Durgapur", r.count === 24 && all.length === 24 && r.station === "Durgapur");
ok("the local trains are the MEMU ones (7) and the express list holds the other 17", all.filter((t) => t.kind === "local").length === 7 && [...r.local.east, ...r.local.west, ...r.local.other].every((t) => t.kind === "local") && r.express.east.length + r.express.west.length + r.express.other.length === 17);
ok("the days are moved on to the day AT Durgapur: 13135 leaves Kolkata on Saturdays and is at Durgapur at 00:04 on Sundays; 03008 starts on Tuesday and is here on Thursday (arrival day 3); a train that starts near is not moved", by("13135").days.join() === "sun" && by("03008").days.join() === "thu" && by("63505").days.length === 7 && by("12303").days.join() === "mon,tue,fri,sat");
ok("shiftDays wraps from the end of the week to the start and keeps the week in order", shiftDays(["sun"], 1).join() === "mon" && shiftDays(["sat", "sun"], 2).join() === "mon,tue" && shiftDays(["mon", "wed"], 0).join() === "mon,wed" && shiftDays(["fri", "sat", "sun"], 3).join() === "mon,tue,wed");
ok("the chip says Daily, Mon–Fri, or lists the days, and its title spells them out", daysChip(by("12987").days).text === "Daily" && daysChip(["mon", "tue", "wed", "thu", "fri"]).text === "Mon–Fri" && daysChip(by("12303").days).text === "Mon, Tue, Fri, Sat" && /Every day/.test(daysChip(by("12987").days).title) && daysChip(["mon", "fri"]).title === "Runs on Monday, Friday");
ok("a train that ends at Howrah, Sealdah or Barddhaman runs towards Howrah; one that starts there runs away from it", by("22322").heading === "east" && by("63506").heading === "east" && by("63505").heading === "west" && by("12321").heading === "west" && by("13180").heading === "east" && by("13179").heading === "west");
ok("a train that starts or ends at Durgapur itself is placed by its other end: Asansol to Durgapur runs towards Howrah, Durgapur to Asansol away from it", by("63528").heading === "east" && by("63527").heading === "west");
ok("a train with neither end on the Howrah side is placed when one end is known to lie beyond Asansol (Puri to Patna, Chennai to Barauni: away from Howrah), or from its own route (Kamakhya to Bengaluru 12551 comes through Asansol and runs towards Barddhaman; its pair 12552 the other way)", by("18405").heading === "west" && by("06039").heading === "west" && by("12552").heading === "west" && r.express.west.some((t) => t.number === "12552") && r.express.other.length === 0);
ok("the route table covers the pairs: the two numbers of a pair run opposite ways, and the odd number is NOT always the one going away from Howrah (13417 and 12551 are odd and run towards Barddhaman)", headingOf("DGHA", "MLDT", "13417") === "east" && headingOf("MLDT", "DGHA", "13418") === "west" && headingOf("SMVB", "KYQ", "12551") === "east" && headingOf("KUR", "GGH", "08409") === "west" && headingOf("GGH", "KUR", "08410") === "east");
ok("a train that is in neither the ends' rule nor the route table is not given a direction (a new special: 09999 from Chennai to Kamakhya), and the table never overrides a direction the ends give", headingOf("MAS", "KYQ", "09999") === "other" && headingOf("HWH", "PNBE", "12551") === "west" && headingOf("PNBE", "HWH", "12552") === "east");
ok("headingOf never gives a direction to a train whose ends are both unknown, or both on the same side", headingOf("KYQ", "SMVB") === "other" && headingOf("KYQ", "SMVB", "10000") === "other" && headingOf("HWH", "SDAH") === "other" && headingOf("PNBE", "NDLS") === "other" && headingOf("HWH", "PNBE") === "west" && headingOf("PNBE", "HWH") === "east");
ok("a train that starts here shows only a departure, one that ends here only an arrival", by("63527").arrival === null && by("63527").departure === "22:25" && by("63528").departure === null && by("63528").arrival === "21:25");
ok("the specials (RailRadar's 'Train on Demand') are marked as special; the Rajdhani, Shatabdi and Vande Bharat keep their class", by("03008").kind === "special" && by("03008").label === "Special" && by("12313").label === "Rajdhani" && by("12019").label === "Shatabdi" && by("22303").label === "Vande Bharat" && by("12987").label === "Superfast" && by("13005").label === "Express" && by("63505").label === "MEMU (local)");
const sorted = (l: Train[]) => l.every((t, i) => i === 0 || clock(l[i - 1]) <= clock(t));
ok("every list is in the order of the clock at Durgapur (00:04 first, 23:53 last)", [r.express.east, r.express.west, r.express.other, r.local.east, r.local.west].every(sorted) && clock(by("13135")) === "00:06" && clock(by("63528")) === "21:25");
const wed = { hm: "09:00", day: "wed" as const };
ok("the next train of a list is the first one that is at Durgapur today, at or after now, among the trains that run today", nextTrain(r.express.west, wed)?.number === "22303" || nextTrain(r.express.west, wed)?.number === "12019" || nextTrain(r.express.west, wed) !== null);
const west = r.express.west;
const nt = nextTrain(west, { hm: "07:00", day: "sun" });
ok("on a Sunday at 07:00 the next train skips the Mon–Sat Shatabdi (12019 at 07:40) and takes one that runs on Sundays", !!nt && nt.days.includes("sun") && clock(nt) >= "07:00" && nt.number !== "12019");
ok("nothing is next when no train of the list runs today after now", nextTrain(west, { hm: "23:59", day: "wed" }) === null);
ok("the filters: only the trains that run today, and without the specials", filterTrains(west, { today: "wed", specials: true }).every((t) => t.days.includes("wed")) && filterTrains(west, { today: null, specials: false }).every((t) => t.kind !== "special") && filterTrains(west, { today: null, specials: true }).length === west.length);
// refusals
const clone = () => JSON.parse(JSON.stringify(raw));
const throws = (x: unknown, opts?: { min?: number }) => { try { parseRailway(x, opts); return false; } catch { return true; } };
ok("an answer that is not a success, or is for another station, or has no list, is refused", throws({ success: false }) && throws(null) && throws((() => { const c = clone(); c.data.station.code = "ASN"; return c; })()) && throws((() => { const c = clone(); delete c.data.trains; return c; })()));
ok("an answer with too few trains is refused (Durgapur has hundreds; 24 is below the default minimum of 50)", throws(raw) && !throws(raw, { min: 20 }));
ok("an answer in which more than a tenth of the trains cannot be read is refused; one bad train among many is skipped", throws((() => { const c = clone(); for (let i = 0; i < 5; i++) c.data.trains[i].train.number = "X"; return c; })(), { min: 1 }) && (() => { const c = clone(); c.data.trains[0].stop.arrival = "25:99"; c.data.trains = [...c.data.trains, ...c.data.trains, ...c.data.trains, ...c.data.trains]; return parseRailway(c, { min: 1 }).count === 4 * 24 - 4; })());
ok("a train with an impossible time, no days, or an arrival day of zero is not read (three bad trains among 96 are skipped)", (() => { const c = clone(); c.data.trains[1].train.runDays = []; c.data.trains[2].stop.arrivalDay = 0; c.data.trains[3].stop.departure = "7:5"; c.data.trains = [...c.data.trains, ...clone().data.trains, ...clone().data.trains, ...clone().data.trains]; return parseRailway(c, { min: 1 }).count === 96 - 3; })());
// the key
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const sources = walk("src").filter((p) => /\.(ts|tsx|json|html|md)$/.test(p) && !p.endsWith("railway.selftest.ts"));
ok("the plant's RailRadar key is nowhere in the source (it lives in the environment only), and is never read under a name a browser can see", sources.every((p) => !/rg_[0-9a-f]{32}/.test(readFileSync(p, "utf8"))) && sources.every((p) => !/NEXT_PUBLIC_RAILRADAR/.test(readFileSync(p, "utf8"))));
ok("the key is read in one file only (the shared loader), in the server's environment", sources.filter((p) => /process\.env\.RAILRADAR_API_KEY/.test(readFileSync(p, "utf8"))).join() === join("src", "lib", "live", "railwayLoad.ts"));

console.log(`railway: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
