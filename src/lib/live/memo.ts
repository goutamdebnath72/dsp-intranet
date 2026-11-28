// src/lib/live/memo.ts
//
// A small memory for the live routes. Each answer is kept for a while, so that many people opening the same card in a minute cost the other site one request. When the other site fails, I return the
// LAST GOOD answer with `stale: true` and its own time, so that the card can say "as of 3:10 pm, the source is not answering now" instead of showing nothing, or showing an old number as new.
// On a serverless host the memory lives only as long as the running instance: that is fine, because it is a courtesy, not a store. Nothing about any user is kept.

interface Entry {
  at: number;
  value: unknown;
}
const store = new Map<string, Entry>();

export interface Memoised<T> {
  value: T;
  /** When the value was fetched (ms since the epoch). */
  at: number;
  /** True when the other site failed and this is the last good answer. */
  stale: boolean;
}

export async function memo<T>(key: string, ttlMs: number, load: () => Promise<T>, now: () => number = Date.now): Promise<Memoised<T>> {
  const hit = store.get(key);
  if (hit && now() - hit.at < ttlMs) return { value: hit.value as T, at: hit.at, stale: false };
  try {
    const value = await load();
    const at = now();
    store.set(key, { at, value });
    return { value, at, stale: false };
  } catch (e) {
    if (hit) return { value: hit.value as T, at: hit.at, stale: true };
    throw e;
  }
}

/**
 * SERVE-THEN-REFRESH. For an answer that costs seconds to make (a news tab), nobody should wait for it when an older one is at hand. The entry has three ages:
 *   - fresh (younger than `ttlMs`): returned as it is;
 *   - REFRESH-AHEAD (older than `aheadAt` of the ttl, say 80%): returned at once, and a new one is made in the background (`schedule` keeps it alive on a serverless host: next/server's after()), so that in a busy hour nobody ever meets an expired entry;
 *   - STALE (older than the ttl but younger than `maxStaleMs`): returned at once, the new one made in the background the same way;
 *   - too old, or nothing kept: made now, the caller waits (and, if that fails, gets the old one marked stale, as `memo` does).
 * Only one refresh runs for a key at a time, however many ask.
 */
const inflight = new Map<string, Promise<unknown>>();

export interface SwrOptions {
  /** How long an old answer may still be served while a new one is made (default: three hours). */
  maxStaleMs?: number;
  /** The part of the ttl after which a refresh starts in the background while the answer is still served (default 0.8). */
  aheadAt?: number;
  /** Keeps a background job alive after the response has gone (next/server `after`); without it the job simply runs. */
  schedule?: (job: Promise<unknown>) => void;
  now?: () => number;
}

export interface Served<T> extends Memoised<T> {
  /** True when a new answer is being made in the background and this one is the one before it. */
  refreshing: boolean;
}

export async function memoSwr<T>(key: string, ttlOf: number | ((kept: T) => number), load: () => Promise<T>, opts: SwrOptions = {}): Promise<Served<T>> {
  const now = opts.now ?? Date.now;
  const hit = store.get(key);
  const age = hit ? now() - hit.at : Infinity;
  // the ttl may depend on what is kept (a tab with a priority story in it is kept for less time than a quiet one)
  const ttlMs = typeof ttlOf === "function" ? (hit ? ttlOf(hit.value as T) : 0) : ttlOf;
  const make = (): Promise<T> => {
    const running = inflight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const job = (async () => {
      try {
        const value = await load();
        store.set(key, { at: now(), value });
        return value;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, job);
    return job;
  };
  if (hit && age < ttlMs * (opts.aheadAt ?? 0.8)) return { value: hit.value as T, at: hit.at, stale: false, refreshing: false };
  if (hit && age < (opts.maxStaleMs ?? 3 * 60 * 60 * 1000)) {
    const job = make().then(() => undefined, () => undefined); // a failed background refresh leaves the old answer where it is
    try { (opts.schedule ?? (() => undefined))(job); } catch { /* outside a request: the job just runs */ }
    return { value: hit.value as T, at: hit.at, stale: false, refreshing: true };
  }
  try {
    const value = await make();
    return { value, at: store.get(key)?.at ?? now(), stale: false, refreshing: false };
  } catch (e) {
    if (hit) return { value: hit.value as T, at: hit.at, stale: true, refreshing: false };
    throw e;
  }
}

/** Marks what is kept under a key as old (just past `ageMs`), so that the next asking is answered from it at once while a new one is made in the background. Does nothing when nothing is kept. */
export function memoExpire(key: string, ageMs: number, now: () => number = Date.now): void {
  const hit = store.get(key);
  if (hit && now() - hit.at < ageMs) store.set(key, { at: now() - ageMs, value: hit.value });
}

/** for the tests */
export function clearMemo(): void {
  store.clear();
  inflight.clear();
}

/** Returns what is kept under a key, with its time, without asking the source (null when nothing is kept). */
export function recall<T>(key: string): { value: T; at: number } | null {
  const hit = store.get(key);
  return hit ? { value: hit.value as T, at: hit.at } : null;
}

export function remember(key: string, value: unknown, now: () => number = Date.now): void {
  store.set(key, { at: now(), value });
}
