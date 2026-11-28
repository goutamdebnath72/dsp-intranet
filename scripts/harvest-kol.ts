// scripts/harvest-kol.ts: collects and saves the trains that START at Howrah (HWH), Sealdah (SDAH), Santragachi (SRC) or Kolkata (KOAA) and go over NEITHER Durgapur NOR Asansol, with their details and fares, while the plant's paid RailRadar
// month lasts (to 14 Dec 2026). The rules of the set are in src/lib/live/kolkataSet.ts (a train is taken once, under its starting station; trains of the Durgapur and Asansol sets are out), the tables in src/lib/live/kolkataStore.ts.
// It goes in three steps, and you can stop it at any time and run it again: what is saved is not asked again.
//   1. THE SET (6 requests, only when the catalogue is empty or with --refresh-boards): the boards of the four stations and of Durgapur and Asansol (with the pass-throughs); the trains that start at one of the four, once each, minus the
//      trains on the Durgapur or Asansol board, are catalogued (public.train_kol).
//   2. THE DETAILS (1 request per train): each train's full record: its details, its classes, its halts with times and EVERY station of its route. A train whose route goes over Durgapur or Asansol is put OUT, with the reason.
//   3. THE FARES (only for trains the reservation system sells: the others, suburban and local trains, have details and no fare): for each class of the train and each halt after the starting station, the fare (public.train_fare_leg_kol), and the
//      fare to the end of the run (public.train_fare_kol), as the Durgapur and Asansol sets have. One request per class per halt.
//   npx tsx --env-file=.env.local scripts/harvest-kol.ts                         all three steps (the fares in the order: regular trains, then specials)
//   npx tsx --env-file=.env.local scripts/harvest-kol.ts budget                  what is left to ask, and how many requests it needs (no request is made)
//   npx tsx --env-file=.env.local scripts/harvest-kol.ts list                    what is saved
//   npx tsx --env-file=.env.local scripts/harvest-kol.ts verify --only 12810,22301   asks the eight classes of these trains' end fares and compares with the classes the train's record lists (8 requests each)
//   options: --only 12841,12810  --limit N (trains this time)  --max-requests N (default 16000)  --gap-ms 2500  --reserve 400 (stop when RailRadar says fewer than this are left of the month: the app's own timetable needs a few)
//            --refresh-boards  --details-only (steps 1 and 2)  --no-details  --max-age-hours 72
// It stops at once when RailRadar refuses (limit reached, key refused), when the month's own counter falls to the reserve, and it refuses to run after FARES_LIVE_UNTIL.
import { Pool } from "pg";
import { DateTime } from "luxon";
import { askFares, askLeg, CLASSES, journeyDateFor, parseSchedule, type FareClass } from "../src/lib/live/fare";
import { fareServiceOpen, FARES_LIVE_UNTIL } from "../src/lib/live/fareService";
import { boardUrl, goesOver, hasReservedFares, haltsOnlyJson, parseBoard, parseTrainFull, requestsFor, reservedClasses, selectCandidates, TERMINAL_CODES, trainUrl, EXCLUDED_STATIONS, type BoardRow } from "../src/lib/live/kolkataSet";
import { catalogueFromTrain, kolStore, type CatalogueRow } from "../src/lib/live/kolkataStore";
import { STATION, type Day } from "../src/lib/live/railway";
import { makePaced } from "./lib/paced";

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(name);
const IST = (d: Date | null) => (d ? DateTime.fromJSDate(d).setZone(STATION.zone).toFormat("d LLL yyyy, h:mm a") + " IST" : "-");

/** The order of work: trains the reservation system may sell first, local and suburban ones after; the specials ("Train on Demand") after the regular trains; each group by number. */
const LOCAL_TYPES = /suburban|emu|memu|passenger/i;
const rank = (c: Pick<CatalogueRow, "type" | "prsBookable" | "classes">) => (LOCAL_TYPES.test(c.type) ? 2 : /demand|special/i.test(c.type) ? 1 : 0);
const byWork = (a: CatalogueRow, b: CatalogueRow) => rank(a) - rank(b) || a.number.localeCompare(b.number);

async function main() {
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", (e) => console.warn("database connection lost, a new one is made on the next call:", e.message));
  try {
    const store = kolStore(db);
    await store.ensure();
    const cmd = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "run";
    const only = arg("--only")?.split(",").map((x) => x.trim()).filter(Boolean);
    const maxAgeH = Number(arg("--max-age-hours") ?? 72);
    const fresh = (iso: string) => DateTime.now().diff(DateTime.fromISO(iso), "hours").hours < maxAgeH;

    if (cmd === "list") {
      const s = await store.summary();
      const all = await store.trains();
      const inSet = all.filter((t) => t.inSet);
      const by = (f: (t: CatalogueRow) => string) => Object.entries(inSet.reduce<Record<string, number>>((m, t) => ((m[f(t)] = (m[f(t)] ?? 0) + 1), m), {})).sort().map(([k, v]) => `${k} ${v}`).join(", ");
      console.log(`${s.trains} train(s) catalogued, ${s.inSet} in the set (${s.trains - s.inSet} out). Fares to the end saved for ${s.withFares}; stop fares for ${s.withLegs} train(s) (${s.legRows} rows). Oldest ${IST(s.oldest)}, newest ${IST(s.newest)}.`);
      console.log(`In the set, by starting station: ${by((t) => t.from)}`);
      console.log(`In the set, by type: ${by((t) => t.type)}`);
      const out = all.filter((t) => !t.inSet);
      console.log(`Out of the set, by reason: ${Object.entries(out.reduce<Record<string, number>>((m, t) => { const r = t.reason.replace(/\(.*\)/, "").trim(); m[r] = (m[r] ?? 0) + 1; return m; }, {})).map(([k, v]) => `${k} ${v}`).join("; ")}`);
      return;
    }

    if (cmd === "budget") {
      const all = (await store.trains()).filter((t) => t.inSet);
      const pending = all.filter((t) => t.halts.length === 0);
      let need = 0, trains = 0, noFare = 0, done = 0;
      const rows: string[] = [];
      for (const t of all.filter((x) => x.halts.length > 0)) {
        if (!hasReservedFares(t)) { noFare++; continue; }
        const have = new Set((await store.legs(t.number)).map((l) => l.to));
        const fare = await store.fare(t.number);
        // the classes are those found at the end station when it has been asked; before that, the record's own list (an estimate)
        const nClasses = fare ? Math.max(1, fare.set.classes.length) : Math.max(1, reservedClasses(t).length);
        const r = (fare ? 0 : 8) + nClasses * t.halts.slice(1).filter((h) => h.code !== t.to && !have.has(h.code)).length;
        if (r === 0) { done++; continue; }
        need += r; trains++;
        rows.push(`${t.number} ${t.name.slice(0, 30).padEnd(30)} ${t.from}->${t.to} ${String(t.halts.length - 1).padStart(3)} halts, ${nClasses} classes${fare ? "" : " (estimate)"} = ${r}`);
      }
      console.log(`${all.length} trains in the set; ${pending.length} without their details yet (1 request each); ${noFare} with no reserved fares (details only); ${done} with all their stop fares saved.`);
      console.log(`${trains} train(s) still need fares: ${need} requests (about ${Math.round((need * 2.5) / 3600 * 10) / 10} hours at 2.5 s each).`);
      if (flag("--verbose")) console.log(rows.join("\n"));
      return;
    }

    if (!fareServiceOpen(DateTime.now())) {
      console.log(`The paid fare service is closed (it was asked until ${FARES_LIVE_UNTIL}). Nothing is asked. What is saved stays as it is.`);
      return;
    }
    const limit = Number(arg("--limit") ?? Infinity);
    const cap = Number(arg("--max-requests") ?? 16000);
    const reserve = Number(arg("--reserve") ?? 400);
    const { fetcher, count, remaining } = makePaced(Number(arg("--gap-ms") ?? 2500));
    const stopNow = (): string | null => {
      if (count() >= cap) return `the cap of ${cap} requests`;
      const left = remaining();
      if (left !== null && left < reserve) return `RailRadar says only ${left} requests are left of the month (the reserve is ${reserve})`;
      return null;
    };
    const refused = (e: unknown) => { const s = (e as { status?: number }).status; return s === 429 || s === 401 || s === 403; };
    const get = async (url: string) => {
      const r = await fetcher(url);
      if (r.status === 429 || r.status === 401 || r.status === 403) throw Object.assign(new Error(`RailRadar answered ${r.status}.`), { status: r.status });
      return r;
    };

    if (cmd === "verify") {
      for (const n of only ?? []) {
        const c = (await store.trains()).find((t) => t.number === n && t.inSet && t.halts.length);
        if (!c) { console.log(`${n}: not in the catalogue with its details: run the script first.`); continue; }
        const date = journeyDateFor(c.runDays as Day[]);
        if (!date) { console.log(`${n}: no running day in the next 8 days`); continue; }
        const set = await askFares(n, c.to, date, fetcher, c.from);
        const sold = set.classes.map((x) => x.code).sort().join("/");
        const listed = reservedClasses(c).map((x) => x.code).sort().join("/");
        console.log(`${n} ${c.name} ${c.from}->${c.to}: the fare service sells ${sold || "nothing"}; the train's record lists ${listed || "nothing"} (${c.classes.join("/")}): ${sold === listed ? "SAME" : "DIFFERENT"}`);
      }
      console.log(`${count()} request(s) made. RailRadar says ${remaining()} left of the month.`);
      return;
    }

    // ---------------- 1. the set
    let catalogue = await store.trains();
    if (catalogue.length === 0 || flag("--refresh-boards")) {
      console.log("Reading the boards of Howrah, Sealdah, Santragachi, Kolkata, Durgapur and Asansol (6 requests)...");
      const read = async (code: string): Promise<BoardRow[]> => { const r = await get(boardUrl(code)); if (r.status !== 200) throw new Error(`The board of ${code} was answered ${r.status}.`); return parseBoard(r.json, code); };
      const boards: Record<string, BoardRow[]> = {}, passing: Record<string, BoardRow[]> = {};
      for (const c of TERMINAL_CODES) boards[c] = await read(c);
      for (const c of EXCLUDED_STATIONS) passing[c] = await read(c);
      const { candidates, rejected } = selectCandidates(boards, passing);
      const now = new Date();
      const known = new Map(catalogue.map((c) => [c.number, c]));
      for (const c of candidates) {
        // a train already read stays as it is; a new one is put in the catalogue as "to be read" (no halts yet)
        if (known.has(c.number) && known.get(c.number)!.halts.length) continue;
        await store.putTrain({ number: c.number, name: c.name, type: c.type, category: "", from: c.from, fromName: c.fromName, to: c.to, toName: c.toName, runDays: c.runDays, distanceKm: null, durationMin: null, totalHalts: null, returnTrain: null, classes: [], prsBookable: false, hasReversal: false, touches: c.touches, inSet: true, reason: "", halts: [], fetchedAt: now.toISOString() });
      }
      for (const r of rejected) await store.putTrain({ number: r.number, name: r.name, type: "", category: "", from: r.from, fromName: "", to: "", toName: "", runDays: [], distanceKm: null, durationMin: null, totalHalts: null, returnTrain: null, classes: [], prsBookable: false, hasReversal: false, touches: [], inSet: false, reason: r.reason, halts: [], fetchedAt: now.toISOString() });
      console.log(`${candidates.length} train(s) start at the four stations and are on neither the Durgapur nor the Asansol board; ${rejected.length} are out. (${count()} requests so far)`);
      catalogue = await store.trains();
    }

    // ---------------- 2. the details
    if (!flag("--no-details")) {
      const pending = catalogue.filter((c) => c.inSet && c.halts.length === 0 && (!only || only.includes(c.number))).sort(byWork);
      console.log(`${pending.length} train(s) wait for their details.`);
      let done = 0, out = 0;
      for (const c of pending) {
        const why = stopNow();
        if (done >= limit || why) { if (why) console.log(`Stopping: ${why}.`); break; }
        try {
          const r = await get(trainUrl(c.number));
          if (r.status !== 200) throw new Error(`the record was answered ${r.status}`);
          const t = parseTrainFull(r.json, c.number);
          if (t.from !== c.from) throw new Error(`the train starts at ${t.from}, not ${c.from}`);
          const over = goesOver(t);
          if (over.length) {
            await store.putTrain({ ...catalogueFromTrain(t, c.touches, false, `route goes over ${over.map((x) => (x === "DGR" ? "Durgapur (DGR)" : "Asansol (ASN)")).join(" and ")}`, new Date()), halts: [] });
            out++;
            console.log(`${c.number} ${t.name}: OUT, its route goes over ${over.join(" and ")}`);
          } else {
            await store.putTrain(catalogueFromTrain(t, c.touches, true, "", new Date()));
            done++;
            console.log(`${String(done).padStart(3)}  ${c.number} ${t.name} ${t.from}->${t.to}, ${t.halts.length - 1} halts after the start, ${t.type}${hasReservedFares(t) ? `, classes ${reservedClasses(t).map((x) => x.code).join("/")}` : ", no reserved fares"}  (requests ${count()}, left ${remaining() ?? "?"})`);
          }
        } catch (e) {
          console.log(`${c.number} ${c.name}: FAILED: ${e instanceof Error ? e.message : e}`);
          if (refused(e)) { console.log("Stopping: RailRadar refused (limit reached or key not accepted)."); return; }
        }
      }
      console.log(`Details: ${done} train(s) in the set read, ${out} put out for going over Durgapur or Asansol. ${count()} request(s) so far.`);
    }
    if (flag("--details-only")) return;

    // ---------------- 3. the fares
    catalogue = await store.trains();
    const todo = catalogue.filter((c) => c.inSet && c.halts.length > 0 && hasReservedFares(c) && (!only || only.includes(c.number))).sort(byWork);
    console.log(`\n${todo.length} train(s) have fares to collect.`);
    let trainsDone = 0, saved = 0, failed = 0, stopped = false;
    for (const c of todo) {
      if (trainsDone >= limit) break;
      const why0 = stopNow();
      if (why0) { console.log(`Stopping: ${why0}.`); stopped = true; break; }
      const date = journeyDateFor(c.runDays as Day[]);
      if (!date) { failed++; console.log(`${c.number} ${c.name}: no running day in the next 8 days, skipped`); continue; }
      // the halts after the starting station, as parseSchedule reads them (distances from the starting station)
      const sch = parseSchedule({ success: true, data: { train: { number: c.number, name: c.name }, route: c.halts.map((h) => ({ sequence: h.seq, station: { code: h.code, name: h.name }, distance: h.km })) } }, c.number, c.from);
      const have = new Map((await store.legs(c.number)).map((l) => [l.to, l.receivedAt]));
      const end = sch.stops.find((s) => s.code === c.to) ?? { code: c.to, name: c.toName, seq: Number.MAX_SAFE_INTEGER, km: c.distanceKm ?? 0 };
      const before = count();
      let got = 0, none = 0, asked = 0;
      try {
        // THE END OF THE RUN FIRST, with all eight classes: the record's own list of classes is not enough (12021 lists CC and sells 2S too), so the classes are found here, as for the Durgapur set
        let classes: FareClass[];
        const row = await store.fare(c.number);
        if (row && fresh(row.receivedAt) && have.has(c.to)) {
          classes = CLASSES.filter((k) => row.set.classes.some((x) => x.code === k.code));
        } else {
          const leg = await askLeg(c.number, end, CLASSES, date, fetcher, c.from);
          asked++;
          if (leg) { await store.putLeg(c.number, leg, new Date()); got++; saved++; } else none++;
          await store.putFare({ train: c.number, trainName: c.name, from: c.from, to: c.to, journeyDate: date, distanceKm: leg?.distanceKm ?? 0, classes: leg?.classes ?? [] }, new Date());
          classes = CLASSES.filter((k) => leg?.classes.some((x) => x.code === k.code));
        }
        // then each halt in between, for the classes that answered at the end (none answered: the train has no fare to sell, nothing more is asked)
        if (classes.length) {
          for (const stop of sch.stops.filter((s) => s.code !== c.to && !(have.has(s.code) && fresh(have.get(s.code)!)))) {
            const why = stopNow();
            if (why) { console.log(`Stopping: ${why}.`); stopped = true; break; }
            const leg = await askLeg(c.number, stop, classes, date, fetcher, c.from);
            asked++;
            if (leg) { await store.putLeg(c.number, leg, new Date()); got++; saved++; } else none++;
          }
        }
        if (!stopped) trainsDone++;
        console.log(`${stopped ? "STOP" : String(trainsDone).padStart(3)}  ${c.number} ${c.name} ${c.from}->${c.to}: ${sch.stops.length} halts, ${asked} asked, ${got} saved, ${none} with no fare; classes ${classes.length ? classes.map((x) => x.code).join("/") : "none sold"}; ${count() - before} requests (total ${count()}, left ${remaining() ?? "?"})`);
        if (stopped) break;
      } catch (e) {
        failed++;
        console.log(`${c.number} ${c.name}: FAILED: ${e instanceof Error ? e.message : e}`);
        if (refused(e)) { console.log("Stopping: RailRadar refused (limit reached or key not accepted)."); stopped = true; break; }
      }
    }
    console.log(`\n${trainsDone} train(s) done (${saved} stop fares saved), ${failed} failed. ${count()} request(s) made; RailRadar says ${remaining() ?? "?"} left of the month.${stopped ? " STOPPED: run it again to go on." : ""}`);
  } finally {
    await db.end();
  }
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
