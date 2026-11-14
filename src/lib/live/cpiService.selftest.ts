// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/cpiService.selftest.ts
// When MoSPI is asked: when nothing is saved (everything), when a month that should be out is not saved (only that month), never otherwise; what is saved is shown when MoSPI does not answer.
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { parseRows, type CpiRow } from "./cpi";
import { cpiAnswer } from "./cpiService";
import type { CpiStore } from "./cpiStore";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const fx = JSON.parse(readFileSync("src/lib/live/fixtures/mospi-cpi-sample.json", "utf8")) as { new: any[]; old: any[] };
const NEW = parseRows({ data: fx.new }, "2024"), OLD = parseRows({ data: fx.old }, "2012");
const IST = (iso: string) => DateTime.fromISO(iso, { zone: "Asia/Kolkata" });

function store(initial: CpiRow[]): CpiStore & { saved: CpiRow[][] } {
  const rows = [...initial];
  const saved: CpiRow[][] = [];
  return { saved, async all() { return [...rows]; }, async put(r) { saved.push(r); rows.push(...r); } };
}
/** a MoSPI that answers each query from the sample (the new series by month, the old by year) and records the questions */
function mospi(opts: { fail?: boolean; newest?: string } = {}) {
  const urls: string[] = [];
  const get = async (url: string) => {
    urls.push(url);
    if (opts.fail) throw new Error("down");
    if (/getCPIIndex/.test(url)) return { data: fx.old, meta_data: { totalPages: 1 }, statusCode: true };
    const months = (/month_code=([\d,]+)/.exec(url)?.[1] ?? "").split(",").map(Number);
    return { data: fx.new.filter((r) => months.includes(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(r.month) + 1)), meta_data: { totalPages: 1 }, statusCode: true };
  };
  return { urls, get };
}

(async () => {
  const s1 = store([]), m1 = mospi();
  const a1 = await cpiAnswer({ store: s1, now: IST("2026-11-14T10:00"), get: m1.get });
  ok("nothing saved: everything is asked and saved, and the answer is built", m1.urls.length === 2 && s1.saved.length === 1 && s1.saved[0].length === 210 && a1.latest === "2026-10" && a1.inflation.length === 128, `${m1.urls.length} ${s1.saved[0]?.length}`);

  const s2 = store([...OLD, ...NEW]), m2 = mospi();
  const a2 = await cpiAnswer({ store: s2, now: IST("2026-11-14T10:00"), get: m2.get });
  ok("all that is due is saved: MoSPI is not asked at all", m2.urls.length === 0 && s2.saved.length === 0 && a2.latest === "2026-10");

  const s3 = store([...OLD, ...NEW]), m3 = mospi();
  const a3 = await cpiAnswer({ store: s3, now: IST("2026-11-12T10:00"), get: m3.get });
  ok("the 12th before 4 pm: October is not out yet, so nothing is asked", m3.urls.length === 0 && a3.latest === "2026-10");

  const s4 = store([...OLD, ...NEW.filter((r) => r.month !== "2026-10")]), m4 = mospi();
  const a4 = await cpiAnswer({ store: s4, now: IST("2026-11-14T10:00"), get: m4.get });
  ok("October is due and not saved: only October is asked (one request), saved and shown", m4.urls.length === 1 && /month_code=10&/.test(m4.urls[0]) && s4.saved.length === 1 && a4.latest === "2026-10", m4.urls.join("\n"));

  const s5 = store([...OLD, ...NEW.filter((r) => r.month <= "2026-08")]), m5 = mospi();
  await cpiAnswer({ store: s5, now: IST("2026-11-14T10:00"), get: m5.get });
  ok("two months behind: both are asked together", m5.urls.length === 1 && /month_code=9,10&/.test(m5.urls[0]), m5.urls.join("\n"));

  const s6 = store([...OLD, ...NEW.filter((r) => r.month !== "2026-10")]), m6 = mospi({ fail: true });
  const a6 = await cpiAnswer({ store: s6, now: IST("2026-11-14T10:00"), get: m6.get });
  ok("MoSPI not answering: what is saved is shown (September is the latest), nothing thrown, nothing saved", a6.latest === "2026-09" && s6.saved.length === 0);

  const s7 = store([]), m7 = mospi({ fail: true });
  ok("MoSPI not answering and nothing saved: an error, not an empty chart", await (async () => { try { await cpiAnswer({ store: s7, now: IST("2026-11-14T10:00"), get: m7.get }); return false; } catch { return true; } })());

  const s8 = store([]), m8 = mospi();
  const [x, y] = await Promise.all([cpiAnswer({ store: s8, now: IST("2026-11-14T10:00"), get: m8.get }), cpiAnswer({ store: s8, now: IST("2026-11-14T10:00"), get: m8.get })]);
  ok("two people opening the card at once cost MoSPI one load", m8.urls.length === 2 && s8.saved.length === 1 && x.latest === y.latest, `${m8.urls.length} ${s8.saved.length}`);
  console.log(`cpiService: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
