// src/lib/live/envelope.ts
//
// THE SHAPE EVERY LIVE ROUTE ANSWERS IN, and the checks the browser applies before it shows anything: where the numbers came from, when they were fetched, and whether the source failed and
// these are the last good ones. My rule: a card never shows a number without its source and its time.
import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { memo } from "./memo";
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
}

const savedAt = new Map<string, number>();

/** The whole of a live route: the answer (fresh, or the last good one) or a plain failure. The host caches it for a short while. */
export async function liveRoute<T>(opts: { key: string; ttlMs: number; source: string; sourceUrl: string; sourceLinks?: SourceLink[] | ((data: T) => SourceLink[]); load: () => Promise<T>; persist?: Persist<T> }): Promise<NextResponse> {
  try {
    const m = await memo(opts.key, opts.ttlMs, opts.load);
    if (opts.persist && !m.stale && savedAt.get(opts.key) !== m.at) {
      savedAt.set(opts.key, m.at);
      try { await (await opts.persist.store()).put(opts.key, m.value, m.at); } catch { /* The card must never fail because of the saved copy. */ }
    }
    const links = typeof opts.sourceLinks === "function" ? opts.sourceLinks(m.value) : opts.sourceLinks;
    const body: LiveEnvelope<T> = { ok: true, fetchedAt: DateTime.fromMillis(m.at).toUTC().toISO() ?? "", source: opts.source, sourceUrl: opts.sourceUrl, ...(links && links.length ? { sources: links } : {}), stale: m.stale, data: m.value };
    return NextResponse.json(body, { headers: { "Cache-Control": `public, s-maxage=${Math.max(30, Math.round(opts.ttlMs / 1000))}, stale-while-revalidate=${Math.round(opts.ttlMs / 1000)}` } });
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
