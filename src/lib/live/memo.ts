// src/lib/live/memo.ts
//
// A SMALL MEMORY FOR THE LIVE ROUTES. Each answer is kept for a while (so that many people opening the same card in a minute cost the other site one request), and when the other site fails the
// LAST GOOD answer is returned with `stale: true` and its own time, so that the card can say "as of 3:10 pm, the source is not answering now" instead of showing nothing, or showing an old number as new.
// On a serverless host the memory lives only as long as the running instance: that is fine, it is a courtesy, not a store. Nothing about any user is kept.

interface Entry {
  at: number;
  value: unknown;
}
const store = new Map<string, Entry>();

export interface Memoised<T> {
  value: T;
  /** when the value was fetched (ms since the epoch) */
  at: number;
  /** the other site failed, and this is the last good answer */
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

/** for the tests */
export function clearMemo(): void {
  store.clear();
}

/** What is kept under a key, with its time, without asking the source (null when nothing is kept). */
export function recall<T>(key: string): { value: T; at: number } | null {
  const hit = store.get(key);
  return hit ? { value: hit.value as T, at: hit.at } : null;
}

export function remember(key: string, value: unknown, now: () => number = Date.now): void {
  store.set(key, { at: now(), value });
}
