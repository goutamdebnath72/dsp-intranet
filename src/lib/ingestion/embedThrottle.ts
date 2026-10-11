// src/lib/ingestion/embedThrottle.ts
//
// Being polite to the embedding service when the archive re-read applies hundreds of vectors. The first apply of the whole archive
// hit "429 RESOURCE_EXHAUSTED" on the five heaviest circulars (50-75 chunks sent in a rapid burst); the tool left them untouched, but
// it should not need a second manual run. So:
//   throttled()     spaces the calls out (one at a time, at least minIntervalMs apart)
//   memoized()      remembers a vector already computed, so a retried circular does not pay for the same chunk twice
//   applyWithQuotaWait()  if the service refuses on quota, WAIT for the per-minute window to clear and try the circular again;
//                         if it still refuses after the waits, say so (quotaExhausted) so the run can stop instead of burning time.
// All time-dependent parts are injectable, so this is tested without waiting.

export type EmbedFn = (text: string) => Promise<number[]>;

export interface Clock {
  sleep(ms: number): Promise<void>;
  now(): number;
}
export const realClock: Clock = { sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now() };

/** Calls are made one after another, never closer together than minIntervalMs. */
export function throttled(embed: EmbedFn, minIntervalMs: number, clock: Clock = realClock): EmbedFn {
  let last = -Infinity;
  let chain: Promise<unknown> = Promise.resolve();
  return (text) => {
    const run = chain.then(async () => {
      const wait = last + minIntervalMs - clock.now();
      if (wait > 0) await clock.sleep(wait);
      try {
        return await embed(text);
      } finally {
        last = clock.now();
      }
    });
    chain = run.catch(() => undefined); // one failure must not block the next call
    return run as Promise<number[]>;
  };
}

/** The same text is embedded once; a failed call is NOT remembered. */
export function memoized(embed: EmbedFn): EmbedFn {
  const seen = new Map<string, number[]>();
  return async (text) => {
    const hit = seen.get(text);
    if (hit) return hit;
    const v = await embed(text);
    seen.set(text, v);
    return v;
  };
}

/** True for a rate-limit / quota refusal (as opposed to a real error such as a bad key). */
export const isQuotaError = (e: unknown): boolean => /\b429\b|RESOURCE_EXHAUSTED|exceeded your current quota|rate.?limit/i.test(String((e as any)?.message ?? e));

export interface QuotaWaitResult<T> {
  ok: boolean;
  value?: T;
  error?: Error;
  /** The service still refused on quota after every wait: more circulars would only fail the same way. */
  quotaExhausted: boolean;
  waits: number;
}

/** Runs fn; on a quota refusal waits waitsMs[0], retries, then waitsMs[1], ... Any other error is returned at once, not retried. */
export async function applyWithQuotaWait<T>(
  fn: () => Promise<T>,
  opts: { waitsMs: number[]; clock?: Clock; onWait?: (waitMs: number, attempt: number, total: number) => void },
): Promise<QuotaWaitResult<T>> {
  const clock = opts.clock ?? realClock;
  let waits = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return { ok: true, value: await fn(), quotaExhausted: false, waits };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (!isQuotaError(err)) return { ok: false, error: err, quotaExhausted: false, waits };
      if (attempt >= opts.waitsMs.length) return { ok: false, error: err, quotaExhausted: true, waits };
      opts.onWait?.(opts.waitsMs[attempt], attempt + 1, opts.waitsMs.length);
      await clock.sleep(opts.waitsMs[attempt]);
      waits++;
    }
  }
}
