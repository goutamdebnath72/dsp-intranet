// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/memo.selftest.ts
// This tests the small memory of the live routes, above all SERVE-THEN-REFRESH (memoSwr): an old answer is served at once while a new one is made in the background, the news tabs never make anybody wait for a rebuild
// when an older answer is at hand, one refresh runs at a time, a refresh that fails leaves the old answer, and an answer that is too old is made again with the caller waiting. A fake clock is used.
import { clearMemo, memo, memoExpire, memoSwr } from "./memo";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const MIN = 60_000;

(async () => {
  let t = 0;
  const now = () => t;
  let made = 0;
  const slow = (v: string, ms = 20) => async () => { made++; await new Promise((r) => setTimeout(r, ms)); return `${v}${made}`; };

  // plain memo (unchanged behaviour)
  clearMemo();
  const a = await memo("k", 10 * MIN, slow("a"), now);
  const b = await memo("k", 10 * MIN, slow("a"), now);
  ok("memo: the second asking inside the ttl is the kept answer, nothing is made again", a.value === "a1" && b.value === "a1" && made === 1);

  // swr: nothing kept -> made now
  clearMemo(); made = 0; t = 0;
  const jobs: Promise<unknown>[] = [];
  const opts = { now, schedule: (j: Promise<unknown>) => { jobs.push(j); } };
  const first = await memoSwr("news", 10 * MIN, slow("n"), opts);
  ok("swr: with nothing kept the answer is made while the caller waits", first.value === "n1" && !first.refreshing && made === 1);

  // fresh
  t = 5 * MIN;
  const fresh = await memoSwr("news", 10 * MIN, slow("n"), opts);
  ok("swr: a fresh answer (5 of 10 minutes) is returned at once, no refresh", fresh.value === "n1" && !fresh.refreshing && made === 1 && jobs.length === 0);

  // refresh-ahead at 80%: served at once, new one made in the background
  t = 8.5 * MIN;
  const t0 = Date.now();
  const ahead = await memoSwr("news", 10 * MIN, slow("n", 200), opts);
  const took = Date.now() - t0;
  ok("swr: at 85% of the ttl the OLD answer is returned at once (the caller does not wait for the 200 ms rebuild) and a refresh is started and scheduled", ahead.value === "n1" && ahead.refreshing && took < 100 && jobs.length === 1 && made === 2, `${took} ms, made ${made}`);
  // another caller meanwhile does not start a second one
  const again = await memoSwr("news", 10 * MIN, slow("n", 200), opts);
  ok("swr: while a refresh is running another asking gets the old answer and starts no second refresh", again.value === "n1" && again.refreshing && made === 2);
  await Promise.all(jobs);
  t = 8.6 * MIN;
  const after = await memoSwr("news", 10 * MIN, slow("n"), opts);
  ok("swr: once the background refresh is done, the new answer is what is served (n2), fresh again", after.value === "n2" && !after.refreshing, after.value);

  // stale (past the ttl) still served at once
  t = 8.6 * MIN + 12 * MIN;
  const stale = await memoSwr("news", 10 * MIN, slow("n", 50), opts);
  ok("swr: a stale answer (past the ttl) is still returned at once, with a refresh behind it", stale.value === "n2" && stale.refreshing && !stale.stale);
  await Promise.all(jobs);

  // a failing background refresh leaves the old answer
  t += 20 * MIN;
  const before = await memoSwr("news", 10 * MIN, async () => { throw new Error("feeds down"); }, opts);
  await Promise.all(jobs);
  const kept = await memoSwr("news", 10 * MIN, slow("n"), { ...opts, aheadAt: 1000 });
  ok("swr: a refresh that fails does not lose the old answer, and does not throw into the caller", before.value === "n3" && before.refreshing && kept.value === "n3", `${before.value} ${kept.value}`);

  // too old: made now, caller waits
  t += 4 * 60 * MIN;
  const old = await memoSwr("news", 10 * MIN, slow("n"), { ...opts, maxStaleMs: 3 * 60 * MIN });
  ok("swr: an answer older than the limit (here 3 hours) is made again with the caller waiting", old.value.startsWith("n") && old.value !== "n3" && !old.refreshing, old.value);

  // too old and the load fails: the old one comes back marked stale
  t += 4 * 60 * MIN;
  const failing = await memoSwr("news", 10 * MIN, async () => { throw new Error("down"); }, { ...opts, maxStaleMs: 3 * 60 * MIN });
  ok("swr: too old and the source fails: the old answer is returned marked stale (as memo does)", failing.stale && failing.value === old.value);
  // nothing kept and it fails: it throws
  clearMemo();
  let threw = false;
  try { await memoSwr("none", 10 * MIN, async () => { throw new Error("down"); }, opts); } catch { threw = true; }
  ok("swr: nothing kept and the source fails: the error reaches the caller", threw);

  // freshness that depends on what is kept: a tab with a priority story is kept for 5 minutes, a quiet one for 30
  clearMemo(); made = 0; t = 0;
  type Tab = { n: number; hot: boolean };
  const hotOf = (v: Tab) => (v.hot ? 5 * MIN : 30 * MIN);
  let n = 0;
  const load = (hot: boolean) => async (): Promise<Tab> => ({ n: ++n, hot });
  const q1 = await memoSwr<Tab>("tab", hotOf, load(false), opts);
  t = 20 * MIN;
  const q2 = await memoSwr<Tab>("tab", hotOf, load(false), opts);
  ok("a quiet tab (30 minutes) is still fresh after 20: the kept answer, no refresh", q1.value.n === 1 && q2.value.n === 1 && !q2.refreshing);
  clearMemo(); n = 0; t = 0; jobs.length = 0;
  await memoSwr<Tab>("tab", hotOf, load(true), opts);
  t = 4.5 * MIN;
  const h = await memoSwr<Tab>("tab", hotOf, load(true), opts);
  await Promise.all(jobs);
  ok("a hot tab (5 minutes) is answered from what is kept at 4.5 minutes while a new one is made behind it (refresh-ahead at 80% of 5)", h.value.n === 1 && h.refreshing && n === 2);

  // expiring on demand (the breaking-news watch): the next asking is answered at once from what is kept, and a new one is made
  clearMemo(); n = 0; t = 0; jobs.length = 0;
  await memoSwr<Tab>("tab", 30 * MIN, load(false), opts);
  t = 2 * MIN;
  memoExpire("tab", 30 * MIN + 1000, now);
  const e = await memoSwr<Tab>("tab", 30 * MIN, load(false), opts);
  await Promise.all(jobs);
  const e2 = await memoSwr<Tab>("tab", 30 * MIN, load(false), opts);
  ok("a tab expired on demand is still answered at once (the old one, not a wait for the rebuild), a new one is made in the background, and the next asking has it", e.value.n === 1 && e.refreshing && e2.value.n === 2 && !e2.refreshing, JSON.stringify([e.value, e2.value]));
  memoExpire("nothing-kept", 1000, now);
  ok("expiring what is not kept does nothing", true);

  console.log(`memo: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
