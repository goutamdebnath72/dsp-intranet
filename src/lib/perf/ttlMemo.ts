// src/lib/perf/ttlMemo.ts
//
// REMEMBER AN ANSWER FOR A WHILE: the one small cache the speed work uses (a router decision, the list of example queries). Per server instance, in memory, so a new deploy or a cold start begins empty.
//  - ttlMemo(seconds, load): one value, reloaded when it is older than `seconds`. seconds <= 0 = no memory at all (every call loads: the previous way).
//  - ttlMap(seconds, max): values by key, at most `max` of them (the oldest leaves first). Only what the caller puts is kept, so a failed answer is never remembered by mistake.
// A failed load is never kept: the next call tries again.

export function ttlMemo<A extends unknown[], T>(seconds: () => number, load: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  let held: { at: number; value: T } | null = null;
  return async (...args: A) => {
    const ttl = seconds() * 1000;
    if (ttl > 0 && held && Date.now() - held.at < ttl) return held.value;
    const value = await load(...args);
    if (ttl > 0) held = { at: Date.now(), value };
    return value;
  };
}

export function ttlMap<T>(seconds: () => number, max = 200) {
  const store = new Map<string, { at: number; value: T }>();
  return {
    get(key: string): T | undefined {
      const ttl = seconds() * 1000;
      if (ttl <= 0) return undefined;
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at >= ttl) { store.delete(key); return undefined; }
      return hit.value;
    },
    set(key: string, value: T): void {
      if (seconds() <= 0) return;
      store.delete(key);
      store.set(key, { at: Date.now(), value });
      while (store.size > max) store.delete(store.keys().next().value as string);
    },
    clear(): void { store.clear(); },
  };
}
