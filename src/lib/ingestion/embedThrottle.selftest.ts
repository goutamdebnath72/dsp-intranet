// src/lib/ingestion/embedThrottle.selftest.ts
// Run:  npx tsx src/lib/ingestion/embedThrottle.selftest.ts      (no network, no database, no real waiting: the clock is fake)
import { applyWithQuotaWait, isQuotaError, memoized, throttled, type Clock } from "./embedThrottle";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};
// a fake clock: sleeping just moves time forward
const fakeClock = () => {
  let t = 1_000_000;
  const slept: number[] = [];
  const clock: Clock = { now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } };
  return { clock, slept, advance: (ms: number) => { t += ms; } };
};

(async () => {
  // ---- isQuotaError: the real message from your terminal, and what is NOT a quota error ----
  const real = new Error('Gemini API HTTP 429: {\n "error": {\n "code": 429,\n "message": "You exceeded your current quota, please check your plan and billing details.",\n "status": "RESOURCE_EXHAUSTED"');
  check("the real Google 429 message is recognised as a quota error", isQuotaError(real));
  check("'RESOURCE_EXHAUSTED' and 'rate limit' alone are recognised too", isQuotaError(new Error("RESOURCE_EXHAUSTED")) && isQuotaError(new Error("Rate limit reached")));
  check("a bad key, a network error or a database error is NOT a quota error", !isQuotaError(new Error("Gemini API HTTP 400: API key not valid")) && !isQuotaError(new Error("fetch failed")) && !isQuotaError(new Error("connection lost")) && !isQuotaError(new Error("Invalid response structure from Gemini")));

  // ---- throttled: spacing and order ----
  {
    const { clock, slept } = fakeClock();
    const starts: number[] = [];
    const base = async (t: string) => (starts.push(clock.now()), [t.length]);
    const th = throttled(base, 1000, clock);
    await th("a"); await th("bb"); await th("ccc");
    check("calls are at least 1000 ms apart (the first goes at once)", starts.length === 3 && starts[1] - starts[0] >= 1000 && starts[2] - starts[1] >= 1000 && slept.length === 2, JSON.stringify([starts.map((s) => s - starts[0]), slept]));
  }
  {
    const { clock, advance } = fakeClock();
    const th = throttled(async () => [1], 1000, clock);
    await th("a");
    advance(5000);
    const t0 = clock.now();
    await th("b");
    check("no needless waiting when enough time has already passed", clock.now() === t0);
  }
  {
    const { clock } = fakeClock();
    const order: string[] = [];
    const th = throttled(async (t) => (order.push(t), [0]), 500, clock);
    const results = await Promise.all(["x", "y", "z"].map((t) => th(t)));
    check("calls made at the same moment still run ONE AT A TIME, in order, and each gets its own answer", order.join("") === "xyz" && results.length === 3);
  }
  {
    const { clock } = fakeClock();
    let n = 0;
    const th = throttled(async () => { if (++n === 1) throw new Error("boom"); return [n]; }, 100, clock);
    const r1 = await th("a").then(() => "ok", () => "failed");
    const r2 = await th("b").then((v) => String(v), () => "failed");
    check("a failed call does not block the next one", r1 === "failed" && r2 === "2");
  }

  // ---- memoized ----
  {
    let calls = 0;
    const m = memoized(async (t) => (calls++, [t.length]));
    await m("same"); await m("same"); await m("other");
    check("the same text is embedded once", calls === 2);
    let n = 0;
    const flaky = memoized(async () => { if (++n === 1) throw new Error("x"); return [1]; });
    await flaky("t").catch(() => undefined);
    const v = await flaky("t");
    check("a FAILED call is not remembered: the next attempt really tries again", v[0] === 1 && n === 2);
  }

  // ---- applyWithQuotaWait ----
  {
    const { clock, slept } = fakeClock();
    let calls = 0;
    const waitsSeen: string[] = [];
    const r = await applyWithQuotaWait(async () => { if (++calls < 3) throw real; return "applied"; }, { waitsMs: [65000, 65000], clock, onWait: (ms, a, tot) => waitsSeen.push(`${ms / 1000}s ${a}/${tot}`) });
    check("two quota refusals, then success: it waited 65 s twice and the circular was applied", r.ok && r.value === "applied" && r.waits === 2 && calls === 3 && slept.join() === "65000,65000" && waitsSeen.join("|") === "65s 1/2|65s 2/2", JSON.stringify([r, slept, waitsSeen]));
  }
  {
    const { clock, slept } = fakeClock();
    let calls = 0;
    const r = await applyWithQuotaWait(async () => { calls++; throw real; }, { waitsMs: [65000, 65000], clock });
    check("still refused after every wait: it gives up, says quotaExhausted, and made exactly 3 attempts", !r.ok && r.quotaExhausted && calls === 3 && slept.length === 2);
  }
  {
    const { clock, slept } = fakeClock();
    let calls = 0;
    const r = await applyWithQuotaWait(async () => { calls++; throw new Error("Gemini API HTTP 400: API key not valid"); }, { waitsMs: [65000, 65000], clock });
    check("a real error (bad key) is returned AT ONCE: no waiting, no retry, and it is not called 'quota'", !r.ok && !r.quotaExhausted && calls === 1 && slept.length === 0);
  }
  {
    const { clock } = fakeClock();
    const r = await applyWithQuotaWait(async () => 42, { waitsMs: [65000], clock });
    check("success on the first try waits for nothing", r.ok && r.value === 42 && r.waits === 0);
  }
  // ---- the pieces together: a circular with 6 chunks hits the limit at the 4th call; the retry reuses the 3 vectors it already has ----
  {
    const { clock } = fakeClock();
    const real429At = 4;
    let apiCalls = 0;
    const api = async (t: string) => { apiCalls++; if (apiCalls === real429At) throw real; return [t.length]; };
    const embed = memoized(throttled(api, 100, clock));
    const texts = ["c1", "c22", "c333", "c4444", "c55555", "c666666"];
    const r = await applyWithQuotaWait(async () => { const out: number[][] = []; for (const t of texts) out.push(await embed(t)); return out; }, { waitsMs: [65000], clock });
    check("6 chunks, refused at the 4th: after the wait only the 4th, 5th and 6th are requested again (7 API calls, not 10)", r.ok && r.value!.length === 6 && apiCalls === 7, String(apiCalls));
  }

  console.log(`\nembedThrottle selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
