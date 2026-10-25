// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/hospital/hospitalRoute.selftest.ts
// Step 51a: the hospital route inside runOmnibar: it comes first, needs no model, is skipped on a retry, and a question that is not about the OPD goes on to the other routes untouched.

import { readFileSync, existsSync } from "node:fs";
import { DateTime } from "luxon";
import { runOmnibar } from "../nl2sql/omnibar";
import { answerHospital } from "./engine";
import type { HolidaysOn } from "./closure";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

const NOW = DateTime.fromISO("2026-10-25T10:00:00", { zone: "Asia/Kolkata" });
const holidaysOn: HolidaysOn = async (iso) => {
  const f = `Holidays/holiday${iso.slice(0, 4)}_enriched.json`;
  if (!existsSync(f)) return { yearLoaded: false, hits: [] };
  const d = JSON.parse(readFileSync(f, "utf8")) as { holidays: { name: string; date: string; type: "CH" | "FH" | "RH"; categories: string | null }[] };
  return { yearLoaded: true, hits: d.holidays.filter((h) => h.date === iso).map((h) => ({ name: h.name, type: h.type, categories: h.categories })) };
};

type P = { kind: string; answer: string; hospital?: { status?: { tone: string } }; source?: string; attempt?: number };
async function main() {
  const calls = { hospital: 0, holiday: 0, model: 0 };
  const realHospital = async (q: string) => {
    calls.hospital++;
    const r = await answerHospital(q, { now: NOW, holidaysOn });
    return r ? ({ kind: "count", answer: r.summary, hospital: r.card } as never) : null;
  };
  const mk = (over: object = {}) =>
    ({
      enabled: true, verifiedMin: 1, skipModel: false, legacy: async () => null,
      holiday: async () => { calls.holiday++; return { kind: "count", answer: "holiday answer" } as never; },
      hospital: realHospital,
      llm: async () => { calls.model++; throw new Error("the model must not be called"); },
      withClient: async () => { throw new Error("no database needed"); },
      ...over,
    }) as never;
  const reset = () => { calls.hospital = 0; calls.holiday = 0; calls.model = 0; };

  reset();
  let o = (await runOmnibar("is opd open today", "U1", mk())) as P;
  ok("an OPD question is answered by the hospital route: the card, closed (Sunday)", o?.hospital?.status?.tone === "closed" && /sunday/i.test(o.answer), JSON.stringify(o));
  ok("...tagged for the feedback record with a source the table accepts", o?.source === "holiday" && o?.attempt === 1);
  ok("...without the holiday route and without the model", calls.holiday === 0 && calls.model === 0 && calls.hospital === 1);

  reset();
  o = (await runOmnibar("is opd open on 25 december", "U1", mk())) as P;
  ok("'is opd open on 25 december' is the hospital's, NOT the holiday parser's", o?.hospital?.status?.tone === "closed" && calls.holiday === 0);

  reset();
  o = (await runOmnibar("holidays in 2026", "U1", mk())) as P;
  ok("a holiday question is not taken by the hospital route: it goes on to the holiday route", o?.answer === "holiday answer" && calls.hospital === 1 && calls.holiday === 1 && calls.model === 0);

  reset();
  o = (await runOmnibar("list all executives in M&HS", "U1", mk({ holiday: async () => { calls.holiday++; return null; }, skipModel: true }))) as P;
  ok("an employee question passes through the hospital route untouched (here skipModel: nothing answers, the app goes on to the circulars)", o === null && calls.hospital === 1, JSON.stringify(o));

  reset();
  o = (await runOmnibar("is opd open today", "U1", mk({ hospital: async () => { calls.hospital++; throw new Error("engine exploded"); } }))) as P;
  ok("if the hospital route throws, the other routes go on (the holiday route answers)", o?.answer === "holiday answer" && calls.holiday === 1);

  reset();
  o = (await runOmnibar("is opd open today", "U1", mk({ hospital: undefined }))) as P;
  ok("an older caller with no hospital route behaves as before", o?.answer === "holiday answer" && calls.hospital === 0);

  reset();
  o = (await runOmnibar("is opd open today", "U1", mk(), { logId: null, reason: "wanted_documents", note: null, attempt: 1 })) as P;
  ok("on a retry (a 'No' on the first answer) the hospital route is skipped", calls.hospital === 0);

  reset();
  o = (await runOmnibar("which days does dr ajit karmakar sit in opd", "U1", mk())) as P;
  ok("a doctor question: the card has the days", /monday and thursday/i.test(JSON.stringify(o?.hospital ?? {})));

  console.log(`hospital route selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
