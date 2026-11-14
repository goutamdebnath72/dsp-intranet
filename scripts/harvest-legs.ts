// scripts/harvest-legs.ts: COLLECT AND SAVE THE FARES TO EVERY STOP AFTER DURGAPUR on the route of each train, while the plant's paid RailRadar month lasts (to 14 Dec 2026).
// The plant pays for the fare service, so the most is taken from it: for each express/mail train that has fares (public.train_fare, filled by scripts/harvest-fares.ts) and for each stop after Durgapur, the fare of each class the
// train has, saved in public.train_fare_leg with the time received. For each LOCAL (MEMU) train the stops get the hint from the railway's fare table (no fare request). The card shows them under "Fares to every stop".
// RUN scripts/harvest-fares.ts FIRST (it finds which classes each train has), then this:
//   npx tsx --env-file=.env.local scripts/harvest-legs.ts                         everything not saved in the last 72 hours
//   npx tsx --env-file=.env.local scripts/harvest-legs.ts --only 12019,13005      just these trains
//   npx tsx --env-file=.env.local scripts/harvest-legs.ts --limit 10              at most 10 trains this time
//   npx tsx --env-file=.env.local scripts/harvest-legs.ts --max-requests 3000     stop after about 3,000 requests (default 14,000)
//   npx tsx --env-file=.env.local scripts/harvest-legs.ts --gap-ms 3000          seconds between requests, in ms (default 3000 = 20 a minute, leaving room for the intranet itself)
//   npx tsx --env-file=.env.local scripts/harvest-legs.ts --no-locals | --no-express
//   npx tsx --env-file=.env.local scripts/harvest-legs.ts list                    what is saved
// COST: one request for each train's schedule, then one per class per stop (about 3 to 5 classes, 10 to 30 stops): a whole pass is several thousand requests of the 30,000 a month, at 20 a minute: ABOUT 15 HOURS for the whole 18,000. It can be stopped
// at any time and run again: a stop saved in the last 72 hours is not asked again. It stops at once if RailRadar says the limit is reached or the key is refused, and it refuses to run after FARES_LIVE_UNTIL.
import { Pool } from "pg";
import { DateTime } from "luxon";
import { askLeg, CLASSES, journeyDateFor, localLegs, parseSchedule, type FareClass } from "../src/lib/live/fare";
import { fareServiceOpen, FARES_LIVE_UNTIL } from "../src/lib/live/fareService";
import { LEG_TABLE_STATEMENTS, typeormLegStore } from "../src/lib/live/fareLegStore";
import { FARE_TABLE_STATEMENTS, typeormFareStore } from "../src/lib/live/fareStore";
import { parseRailway, RAILRADAR_URL, STATION, type Train } from "../src/lib/live/railway";
import { FARE_BASE_URL } from "../src/lib/live/fare";
import { makePaced } from "./lib/paced";

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(name);

async function main() {
  // a pool, not one connection: a dropped connection (the network blinking in a run of many hours) is replaced by a new one instead of ending the run
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", (e) => console.warn("database connection lost, a new one is made on the next call:", e.message));
  try {
    for (const sql of [...FARE_TABLE_STATEMENTS, ...LEG_TABLE_STATEMENTS]) await db.query(sql);
    if (process.argv[2] === "list") {
      const r = (await db.query(`SELECT count(*)::int AS legs, count(DISTINCT train_number)::int AS trains, min(fetched_at) AS oldest, max(fetched_at) AS newest, count(*) FILTER (WHERE classes->0->>'basis' = 'table')::int AS hints FROM public.train_fare_leg`)).rows[0];
      const f = (d: Date | null) => (d ? DateTime.fromJSDate(d).setZone(STATION.zone).toFormat("d LLL yyyy, h:mm a") + " IST" : "-");
      console.log(`${r.legs} stop fare(s) saved for ${r.trains} train(s) (${r.hints} of them local-train hints). Oldest received: ${f(r.oldest)}. Newest received: ${f(r.newest)}.`);
      return;
    }
    if (!fareServiceOpen(DateTime.now())) {
      console.log(`The paid fare service is closed (it was asked until ${FARES_LIVE_UNTIL}). Nothing is asked. The saved fares stay as they are.`);
      return;
    }
    const maxAgeH = Number(arg("--max-age-hours") ?? 72);
    const only = arg("--only")?.split(",").map((x) => x.trim()).filter(Boolean);
    const limit = Number(arg("--limit") ?? Infinity);
    const cap = Number(arg("--max-requests") ?? 14000);
    // 3 s between requests = 20 a minute: the key allows 30, and the rest is left for the intranet's own requests (the timetable, a click on Fares): at 27 a minute the app was turned away now and then
    const { fetcher, count } = makePaced(Number(arg("--gap-ms") ?? 3000));
    const fares = typeormFareStore(db), legs = typeormLegStore(db);
    const fresh = (iso: string) => DateTime.now().diff(DateTime.fromISO(iso), "hours").hours < maxAgeH;
    const today = DateTime.now().setZone(STATION.zone).toFormat("yyyy-MM-dd");

    console.log("Reading the timetable of Durgapur (1 request)...");
    const tt = await fetcher(RAILRADAR_URL);
    if (tt.status !== 200) throw new Error(`The timetable request was answered ${tt.status}.`);
    const rw = parseRailway(tt.json);
    const pick = (g: { east: Train[]; west: Train[]; other: Train[] }) => [...g.east, ...g.west, ...g.other].filter((t, i, a) => t.toCode !== STATION.code && a.findIndex((u) => u.number === t.number) === i && (!only || only.includes(t.number))).sort((a, b) => a.number.localeCompare(b.number));
    // the REGULAR trains first, the specials (festival and Puja trains, numbered 0xxxx, there are many and they run a few days) after them, each group in number order
    const express = (flag("--no-express") ? [] : pick(rw.express)).sort((a, b) => Number(a.kind === "special") - Number(b.kind === "special") || a.number.localeCompare(b.number));
    const locals = flag("--no-locals") ? [] : pick(rw.local);
    console.log(`${express.length} express/mail and ${locals.length} local trains go on from Durgapur.\n`);

    const schedule = async (t: Train) => {
      const r = await fetcher(`${FARE_BASE_URL}/${t.number}?haltsOnly=true`);
      if (r.status === 429 || r.status === 401 || r.status === 403) throw Object.assign(new Error(`RailRadar answered ${r.status}.`), { status: r.status });
      if (r.status !== 200) throw new Error(`The schedule was answered ${r.status}.`);
      return parseSchedule(r.json, t.number);
    };
    const refused = (e: unknown) => { const s = (e as { status?: number }).status; return s === 429 || s === 401 || s === 403; };

    let trainsDone = 0, saved = 0, noClass = 0, failed = 0, stopped = false;
    for (const t of express) {
      if (trainsDone >= limit || count() >= cap) { stopped = count() >= cap; break; }
      const end = await fares.get(t.number);
      const codes = end?.set.classes.map((c) => c.code) ?? [];
      const classes = codes.flatMap((c) => CLASSES.filter((k) => k.code === c)) as FareClass[];
      if (classes.length === 0) { noClass++; continue; }
      const have = await legs.list(t.number);
      const freshTo = new Set(have.filter((h) => fresh(h.receivedAt)).map((h) => h.leg.to));
      const date = journeyDateFor(t.days);
      if (!date) { failed++; console.log(`${t.number} ${t.name}: no running day, skipped`); continue; }
      try {
        const before = count();
        const sch = await schedule(t);
        const todo = sch.stops.filter((s) => !freshTo.has(s.code));
        let got = 0, none = 0;
        for (const stop of todo) {
          if (count() >= cap) { stopped = true; break; }
          const leg = await askLeg(t.number, stop, classes, date, fetcher);
          if (leg) { await legs.put(t.number, leg, DateTime.now().toJSDate()); got++; saved++; } else none++;
        }
        trainsDone++;
        console.log(`${String(trainsDone).padStart(3)}  ${t.number} ${t.name} -> ${t.toCode}: ${sch.stops.length} stops after Durgapur, ${freshTo.size} already saved, ${got} saved, ${none} with no fare; classes ${codes.join("/")}; ${count() - before} requests (total ${count()})`);
        if (stopped) break;
      } catch (e) {
        failed++;
        console.log(`${t.number} ${t.name}: FAILED: ${e instanceof Error ? e.message : e}`);
        if (refused(e)) { console.log("Stopping: RailRadar refused (limit reached or key not accepted)."); stopped = true; break; }
      }
    }

    // the local trains: one request for the schedule, the hints are worked out
    let localDone = 0, localLegsSaved = 0;
    for (const t of stopped ? [] : locals) {
      if (localDone >= limit || count() >= cap) break;
      const have = await legs.list(t.number);
      if (have.length > 0 && have.every((h) => fresh(h.receivedAt))) continue;
      try {
        const sch = await schedule(t);
        const hs = localLegs(sch, today);
        for (const h of hs) { await legs.put(t.number, h, DateTime.now().toJSDate()); localLegsSaved++; }
        localDone++;
        console.log(`${String(localDone).padStart(3)}  local ${t.number} ${t.name}: ${hs.length} stop hints${sch.reverses ? " (up to the reversal)" : ""}`);
      } catch (e) {
        failed++;
        console.log(`local ${t.number} ${t.name}: FAILED: ${e instanceof Error ? e.message : e}`);
        if (refused(e)) { console.log("Stopping: RailRadar refused (limit reached or key not accepted)."); break; }
      }
    }
    console.log(`\n${trainsDone} express train(s) done (${saved} stop fares saved; ${noClass} trains skipped for having no fares), ${localDone} local train(s) (${localLegsSaved} hints), ${failed} failed. ${count()} request(s) made.${stopped ? " STOPPED at the request cap or on a refusal: run it again to go on." : ""}`);
  } finally {
    await db.end();
  }
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
