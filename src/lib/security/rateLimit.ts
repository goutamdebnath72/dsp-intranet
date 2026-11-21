// src/lib/security/rateLimit.ts
//
// SMALL, FAST LIMITERS (pure, no I/O): a sliding window of the last N requests per key, and a failure lock (too many wrong passwords in a while locks the key for a while).
// Both are O(1) per call and bounded in memory (a key table that grows past MAX_KEYS drops its expired and then its oldest keys), so they cost the request nothing worth measuring.
// HONEST LIMIT: the tables live in the memory of one server copy. On Vercel a burst can be served by several copies, each with its own table, so the real ceiling for a determined caller is
// (the limit x the copies that answer). That still stops a script from one machine at full speed and the casual guessing; a limit shared by every copy needs a store they all reach (the database).
// Who is calling: the key is the login's ticket when there is one, else the address Vercel puts in x-forwarded-for (Vercel overwrites a value the caller sends).

export interface Take { ok: boolean; /** seconds until the caller may try again (0 when ok) */ retryAfterSec: number }

const MAX_KEYS = 5000;

function prune<V>(m: Map<string, V>, expired: (v: V) => boolean): void {
  if (m.size <= MAX_KEYS) return;
  for (const [k, v] of m) if (expired(v)) m.delete(k);
  // still too many: drop the oldest (a Map keeps insertion order)
  for (const k of m.keys()) { if (m.size <= MAX_KEYS) break; m.delete(k); }
}

/** at most `max` calls per `windowMs` for each key */
export function createLimiter(opts: { max: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return {
    take(key: string, now: number = Date.now()): Take {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + opts.windowMs - now) / 1000)) };
      }
      recent.push(now);
      hits.delete(key); hits.set(key, recent); // re-insert: the most recently used key is the last
      prune(hits, (v) => v.length === 0 || now - v[v.length - 1] >= opts.windowMs);
      return { ok: true, retryAfterSec: 0 };
    },
    /** for tests */
    size: () => hits.size,
  };
}

/** `max` failures within `windowMs` lock the key until the oldest of them is `windowMs` old; a success clears the key */
export function createFailureLock(opts: { max: number; windowMs: number }) {
  const fails = new Map<string, number[]>();
  const live = (key: string, now: number) => (fails.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  return {
    /** is the key locked now? */
    blocked(key: string, now: number = Date.now()): Take {
      const f = live(key, now);
      if (f.length >= opts.max) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((f[0] + opts.windowMs - now) / 1000)) };
      return { ok: true, retryAfterSec: 0 };
    },
    fail(key: string, now: number = Date.now()): void {
      const f = live(key, now);
      f.push(now);
      fails.delete(key); fails.set(key, f);
      prune(fails, (v) => v.length === 0 || now - v[v.length - 1] >= opts.windowMs);
    },
    reset(key: string): void { fails.delete(key); },
    size: () => fails.size,
  };
}

/** the caller's address: Vercel sets x-forwarded-for (its first entry is the client) and overwrites what the caller sent; "unknown" when there is none */
export function clientIp(headers: { get(name: string): string | null }): string {
  const fwd = (headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return fwd || (headers.get("x-real-ip") || "").trim() || "unknown";
}

/** the 429 answer's headers */
export const retryHeaders = (t: Take): Record<string, string> => ({ "Retry-After": String(t.retryAfterSec), "Cache-Control": "no-store" });
