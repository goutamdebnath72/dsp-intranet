// scripts/harvest-fares.ts: COLLECT AND SAVE THE FARES of every express and mail train that stops at Durgapur, while the plant's paid RailRadar month lasts (to 14 Dec 2026).
// The fares are saved in the database (table public.train_fare, with the time received) and the card on the intranet shows them with "Fares last received ...". Run it now, and again about once a week until the month ends;
// after FARES_LIVE_UNTIL (src/lib/live/fareService.ts) it refuses to run, because on the free plan every request is taken from the 100 a month the timetable needs.
//   npx tsx --env-file=.env.local scripts/harvest-fares.ts                      all trains whose saved fares are older than 48 hours (or missing)
//   npx tsx --env-file=.env.local scripts/harvest-fares.ts --max-age-hours 120   a lazier pass (skips trains saved in the last 5 days)
//   npx tsx --env-file=.env.local scripts/harvest-fares.ts --only 12019,12313    just these trains
//   npx tsx --env-file=.env.local scripts/harvest-fares.ts --limit 20            at most 20 trains this time
//   npx tsx --env-file=.env.local scripts/harvest-fares.ts list                  what is saved (how many trains, the oldest and newest time received)
// The LOCAL (MEMU) trains get a HINT instead (src/lib/live/ordinaryFare.ts: the railway's published fare table applied to the distance from Durgapur to the end station): ONE request each, for the train's schedule.
// COST: 8 requests per express train (one per class), 1 per local train, and one for the timetable: a full pass over about 250 trains is about 2,000 requests of the 30,000 a month, paced at 27 a minute (the key's limit is 30), so about 75 minutes.
// It can be stopped at any time and run again: the trains already saved are skipped. It stops at once if RailRadar says the limit is reached or the key is refused.
import { Pool } from "pg";
import { DateTime } from "luxon";
import { askFares, askLocalFare, journeyDateFor } from "../src/lib/live/fare";
import { fareServiceOpen, FARES_LIVE_UNTIL } from "../src/lib/live/fareService";
import { FARE_TABLE_STATEMENTS, typeormFareStore } from "../src/lib/live/fareStore";
import { parseRailway, RAILRADAR_URL, STATION, type Train } from "../src/lib/live/railway";
import { makePaced } from "./lib/paced";

const GAP_MS = 2200;
const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };

const { fetcher: paced, count } = makePaced(GAP_MS);

async function main() {
  // a pool, not one connection: a dropped connection (the network blinking in a run of many hours) is replaced by a new one instead of ending the run
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", (e) => console.warn("database connection lost, a new one is made on the next call:", e.message));
  try {
    for (const sql of FARE_TABLE_STATEMENTS) await db.query(sql); // the table (safe to repeat), closed to the public roles
    if (process.argv[2] === "list") {
      const r = (await db.query(`SELECT count(*)::int AS n, min(fetched_at) AS oldest, max(fetched_at) AS newest, count(*) FILTER (WHERE jsonb_array_length(classes) = 0)::int AS none FROM public.train_fare`)).rows[0];
      const f = (d: Date | null) => (d ? DateTime.fromJSDate(d).setZone(STATION.zone).toFormat("d LLL yyyy, h:mm a") + " IST" : "-");
      console.log(`${r.n} train(s) saved (${r.none} of them with no fare listed). Oldest received: ${f(r.oldest)}. Newest received: ${f(r.newest)}.`);
      return;
    }
    if (!fareServiceOpen(DateTime.now())) {
      console.log(`The paid fare service is closed (it was asked until ${FARES_LIVE_UNTIL}). Nothing is asked: every request would be taken from the free plan's 100 a month. The saved fares stay as they are.`);
      return;
    }
    const maxAgeH = Number(arg("--max-age-hours") ?? 48);
    const only = arg("--only")?.split(",").map((x) => x.trim()).filter(Boolean);
    const limit = Number(arg("--limit") ?? Infinity);
    const store = typeormFareStore(db);

    console.log("Reading the timetable of Durgapur (1 request)...");
    const { status, json } = await paced(RAILRADAR_URL);
    if (status !== 200) throw new Error(`The timetable request was answered ${status}.`);
    const rw = parseRailway(json);
    const seen = new Set<string>();
    const trains: Train[] = [];
    for (const t of [...rw.express.east, ...rw.express.west, ...rw.express.other]) {
      if (t.toCode === STATION.code || seen.has(t.number) || (only && !only.includes(t.number))) continue;
      seen.add(t.number);
      trains.push(t);
    }
    trains.sort((a, b) => a.number.localeCompare(b.number));
    const locals: Train[] = [];
    for (const t of [...rw.local.east, ...rw.local.west, ...rw.local.other]) {
      if (t.toCode === STATION.code || seen.has(t.number) || (only && !only.includes(t.number))) continue;
      seen.add(t.number);
      locals.push(t);
    }
    locals.sort((a, b) => a.number.localeCompare(b.number));
    console.log(`${trains.length} express/mail trains and ${locals.length} local trains go on from Durgapur. Asking for those saved more than ${maxAgeH} hours ago, or not at all.\n`);

    let done = 0, skipped = 0, failed = 0, noFare = 0;
    for (const t of trains) {
      if (done >= limit) break;
      const row = await store.get(t.number);
      if (row && DateTime.now().diff(DateTime.fromISO(row.receivedAt), "hours").hours < maxAgeH) { skipped++; continue; }
      const date = journeyDateFor(t.days);
      if (!date) { console.log(`${t.number} ${t.name}: no running day in the timetable, skipped`); failed++; continue; }
      try {
        const set = await askFares(t.number, t.toCode, date, paced);
        await store.put(set, DateTime.now().toJSDate());
        done++;
        if (set.classes.length === 0) noFare++;
        console.log(`${String(done).padStart(3)}  ${t.number} ${t.name} -> ${t.toCode}: ${set.classes.length ? set.classes.map((c) => `${c.code} ${c.total}`).join(", ") : "no fare listed"}`);
      } catch (e) {
        failed++;
        const status = (e as { status?: number }).status;
        console.log(`${t.number} ${t.name}: FAILED: ${e instanceof Error ? e.message : e}`);
        if (status === 429 || status === 401 || status === 403) { console.log("Stopping: RailRadar refused (limit reached or key not accepted)."); break; }
      }
    }
    // the local trains: one request each (the schedule), a hint from the fare table
    let localDone = 0;
    for (const t of locals) {
      if (localDone >= limit) break;
      const row = await store.get(t.number);
      if (row && DateTime.now().diff(DateTime.fromISO(row.receivedAt), "hours").hours < maxAgeH) { skipped++; continue; }
      try {
        const set = await askLocalFare(t.number, t.toCode, paced, DateTime.now().setZone(STATION.zone).toFormat("yyyy-MM-dd"));
        await store.put(set, DateTime.now().toJSDate());
        localDone++;
        const c = set.classes[0];
        console.log(`${String(localDone).padStart(3)}  local ${t.number} ${t.name} -> ${t.toCode}: ${c ? `about ${c.total}${c.high ? "-" + c.high : ""} (${set.distanceKm} km)` : (set.distanceKm === 0 ? "no hint (the train reverses on its way)" : `no hint (${set.distanceKm} km is beyond the table)`)}`);
      } catch (e) {
        failed++;
        const status = (e as { status?: number }).status;
        console.log(`local ${t.number} ${t.name}: FAILED: ${e instanceof Error ? e.message : e}`);
        if (status === 429 || status === 401 || status === 403) { console.log("Stopping: RailRadar refused (limit reached or key not accepted)."); break; }
      }
    }
    console.log(`\nSaved ${done} express train(s) and ${localDone} local train(s) (${noFare} with no fare listed), skipped ${skipped} already saved, ${failed} failed. ${count()} request(s) made.`);
  } finally {
    await db.end();
  }
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
