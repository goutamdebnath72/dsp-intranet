// src/lib/live/envelope.ts
//
// THE SHAPE EVERY LIVE ROUTE ANSWERS IN, and the checks the browser applies before it shows anything: where the numbers came from, when they were fetched, and whether the source failed and
// these are the last good ones. My rule: a card never shows a number without its source and its time.
import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { memo, memoSwr, recall, remember, type SwrOptions } from "./memo";
import type { SnapshotStore } from "./snapshotStore";

/** One place the numbers came from, with a link to it. */
export interface SourceLink {
  name: string;
  url: string;
}

export interface LiveEnvelope<T> {
  ok: true;
  /** ISO time the data was fetched from the source. */
  fetchedAt: string;
  /** The source, in words ("IBJA (India Bullion and Jewellers Association)"). */
  source: string;
  /** A link to the source's own page. */
  sourceUrl: string;
  /** Used when the figures come from several places, each with its own link (the card then names and links every one). Absent for a card with one source. */
  sources?: SourceLink[];
  /** True when the source failed just now, and this is the last good answer. */
  stale: boolean;
  data: T;
}

export interface LiveFailure {
  ok: false;
  error: string;
}

export function validEnvelope(x: unknown): x is LiveEnvelope<unknown> {
  const e = x as LiveEnvelope<unknown>;
  return !!e && e.ok === true && typeof e.fetchedAt === "string" && typeof e.source === "string" && typeof e.stale === "boolean" && e.data !== undefined && e.data !== null;
}

/** A card may keep its last good answer in the database too (`persist`): it is saved whenever a fresh answer is had, and shown, marked stale with its own time, when the source fails AND the memory holds nothing (a restart, a quiet night). `check` says whether a saved answer is the shape the card expects. */
export interface Persist<T> {
  store: () => Promise<SnapshotStore>;
  check: (x: unknown) => x is T;
  /** A SERVER THAT STARTS EMPTY (a restart, a new instance on a serverless host) takes the saved copy as what it keeps, with the time it was saved, when it is younger than the three hours an old answer may be served (see memoSwr): the first asking is then answered at once and a new answer is made in the background. For a card whose answer takes seconds to make (the news tabs). */
  seed?: boolean;
}

const savedAt = new Map<string, number>();
const seeding = new Map<string, Promise<void>>();
/** When the database last had no usable copy for a key: it is not asked again for a minute (a busy card must not read the database at every asking while the first build is still running). */
const noCopyAt = new Map<string, number>();
const NO_COPY_RETRY_MS = 60 * 1000;
/** How old a saved copy may be and still be served (the same three hours as memoSwr's `maxStaleMs`). */
const SEED_MAX_AGE_MS = 3 * 60 * 60 * 1000;

/** Puts the saved copy of `key` into the server's memory when the memory holds nothing under it (one reading for each key at a time, even when many ask together). Never throws: no database, nothing saved, or a copy that is not the shape expected (check) or too old is "nothing". */
export function seedFromSaved<T>(key: string, persist: Persist<T>, now: () => number = Date.now): Promise<void> {
  if (recall(key)) return Promise.resolve();
  const running = seeding.get(key);
  if (running) return running;
  if (now() - (noCopyAt.get(key) ?? -Infinity) < NO_COPY_RETRY_MS) return Promise.resolve();
  const job = (async () => {
    try {
      const saved = await (await persist.store()).get(key);
      if (saved && persist.check(saved.value) && now() - saved.at < SEED_MAX_AGE_MS) {
        if (!recall(key)) {
          remember(key, saved.value, () => saved.at);
          savedAt.set(key, saved.at); // it is saved already: not written back
        }
        noCopyAt.delete(key);
      } else noCopyAt.set(key, now());
    } catch {
      noCopyAt.set(key, now()); // the card must never fail because of the saved copy
    } finally {
      seeding.delete(key);
    }
  })();
  seeding.set(key, job);
  return job;
}

/** The value of a live card: what the server keeps (made if need be, memoSwr when `swr` is given), seeded from the saved copy first when the card asks for it, and saved when it is new. This is what liveRoute answers from, and what a background warm-up asks for. */
export async function liveValue<T>(opts: { key: string; ttlMs: number | ((kept: T) => number); load: () => Promise<T>; persist?: Persist<T>; swr?: SwrOptions }): Promise<{ value: T; at: number; stale: boolean }> {
  if (opts.persist?.seed) await seedFromSaved(opts.key, opts.persist);
  const m = opts.swr ? await memoSwr(opts.key, opts.ttlMs, opts.load, opts.swr) : await memo(opts.key, typeof opts.ttlMs === "function" ? 0 : opts.ttlMs, opts.load);
  if (opts.persist && !m.stale && savedAt.get(opts.key) !== m.at) {
    savedAt.set(opts.key, m.at);
    noCopyAt.delete(opts.key); // a copy is being saved: the database has one from now on
    const write = (async () => { try { await (await opts.persist!.store()).put(opts.key, m.value, m.at); } catch { /* The card must never fail because of the saved copy. */ } })();
    // a card served with serve-then-refresh does not wait for the write (the host keeps it alive); the others wait, as before
    if (opts.swr?.schedule) { try { opts.swr.schedule(write); } catch { /* outside a request the write just runs */ } } else await write;
  }
  return { value: m.value as T, at: m.at, stale: m.stale };
}

/** The whole of a live route: the answer (fresh, or the last good one) or a plain failure. The host caches it for a short while. */
export async function liveRoute<T>(opts: { key: string; ttlMs: number | ((kept: T) => number); source: string; sourceUrl: string; sourceLinks?: SourceLink[] | ((data: T) => SourceLink[]); load: () => Promise<T>; persist?: Persist<T>;
  /** Serve an older answer at once and make the new one in the background (memoSwr), for a card whose answer takes seconds to make; `cacheMs` is then how long the host's shared cache may keep the response (default: the ttl). */
  swr?: SwrOptions & { cacheMs?: number } }): Promise<NextResponse> {
  try {
    const m = await liveValue<T>(opts);
    const links = typeof opts.sourceLinks === "function" ? opts.sourceLinks(m.value) : opts.sourceLinks;
    const body: LiveEnvelope<T> = { ok: true, fetchedAt: DateTime.fromMillis(m.at).toUTC().toISO() ?? "", source: opts.source, sourceUrl: opts.sourceUrl, ...(links && links.length ? { sources: links } : {}), stale: m.stale, data: m.value };
    return NextResponse.json(body, { headers: { "Cache-Control": `public, s-maxage=${Math.max(30, Math.round((opts.swr?.cacheMs ?? (typeof opts.ttlMs === "number" ? opts.ttlMs : 60_000)) / 1000))}, stale-while-revalidate=${Math.round((typeof opts.ttlMs === "number" ? opts.ttlMs : 600_000) / 1000)}` } });
  } catch (e) {
    if (opts.persist) {
      try {
        const saved = await (await opts.persist.store()).get(opts.key);
        if (saved && opts.persist.check(saved.value)) {
          const links = typeof opts.sourceLinks === "function" ? opts.sourceLinks(saved.value) : opts.sourceLinks;
          const body: LiveEnvelope<T> = { ok: true, fetchedAt: DateTime.fromMillis(saved.at).toUTC().toISO() ?? "", source: opts.source, sourceUrl: opts.sourceUrl, ...(links && links.length ? { sources: links } : {}), stale: true, data: saved.value };
          return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
        }
      } catch { /* No saved copy, so the plain failure below. */ }
    }
    const body: LiveFailure = { ok: false, error: e instanceof Error ? e.message : "The source did not answer." };
    return NextResponse.json(body, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
