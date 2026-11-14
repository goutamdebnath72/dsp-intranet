// scripts/lib/paced.ts: THE PLANT'S RAILRADAR KEY, ONE REQUEST AT A TIME, never closer than `gapMs` (2.2 s = 27 a minute; the key's limit is 30). A refusal for going over the minute's limit (429) is waited out (65 s) and tried
// again, up to three times; only then is it handed back. `count()` is the number of requests made (a refused one counts too: RailRadar counts every request). Used by the scripts that collect fares.
import type { Fetcher } from "../../src/lib/live/fare";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makePaced(gapMs = 2200): { fetcher: Fetcher; count: () => number } {
  let calls = 0;
  let last = 0;
  let chain: Promise<unknown> = Promise.resolve();
  const fetcher: Fetcher = (url) => {
    const key = process.env.RAILRADAR_API_KEY;
    if (!key) throw new Error("RAILRADAR_API_KEY is not set (run with --env-file=.env.local).");
    const run = chain.then(async () => {
      for (let attempt = 1; ; attempt++) {
        const wait = Math.max(0, last + gapMs - Date.now());
        if (wait) await sleep(wait);
        last = Date.now();
        calls++;
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 15000);
        try {
          const r = await fetch(url, { signal: ctl.signal, headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
          if (r.status === 429 && attempt < 3) { console.log("  (RailRadar asked for a pause: waiting 65 seconds)"); await sleep(65000); continue; }
          return { status: r.status, json: (await r.json().catch(() => null)) as unknown };
        } finally {
          clearTimeout(timer);
        }
      }
    });
    chain = run.catch(() => undefined);
    return run;
  };
  return { fetcher, count: () => calls };
}
