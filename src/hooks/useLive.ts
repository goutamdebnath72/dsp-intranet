// src/hooks/useLive.ts
//
// THE BROWSER'S SIDE OF A LIVE CARD: fetch one of our /api/live routes, check what came back (src/lib/live/envelope.ts), keep it for two minutes so that typing on does not ask again,
// and offer a refresh. The request carries nothing the user typed: it is the fixed address of the route. A failure is a plain state, never an exception.
// A card that must stay current (the news) asks for `refreshMs`: it then asks again by itself at that pace, QUIETLY (the card keeps what it shows, nothing is replaced by a loading state), only
// while the page is visible, and a failed quiet refresh leaves what is shown and sets `lagging`. `refresh` is the same quiet refresh on demand.
"use client";

import { useCallback, useEffect, useState } from "react";
import { validEnvelope, type LiveEnvelope } from "@/lib/live/envelope";

export type LiveState = "loading" | "ok" | "error";

const CACHE_MS = 2 * 60 * 1000;
const cache = new Map<string, { at: number; env: LiveEnvelope<unknown> }>();

export interface UseLive<T> {
  state: LiveState;
  env: LiveEnvelope<T> | null;
  error: string;
  reload: () => void;
  /** ask again without replacing what is shown (the card keeps its figures; `refreshing` is true meanwhile) */
  refresh: () => void;
  refreshing: boolean;
  /** the last quiet refresh failed: what is shown is the last good answer */
  lagging: boolean;
}

/** fetch the route and check the envelope; the one place a live card asks the network */
async function getEnvelope<T>(path: string): Promise<LiveEnvelope<T>> {
  const r = await fetch(path, { cache: "no-store" });
  const j: unknown = await r.json().catch(() => null);
  // a page that is not JSON at all (the server restarting or recompiling, a gateway error) is not "the source did not answer"
  if (j === null) throw new Error("The server did not give a proper answer just now (it may be restarting). Try again in a moment.");
  if (!validEnvelope(j)) throw new Error((j as { error?: string } | null)?.error ?? "The source did not answer.");
  return j as LiveEnvelope<T>;
}

export function useLive<T>(path: string, enabled = true, opts: { refreshMs?: number } = {}): UseLive<T> {
  const refreshMs = opts.refreshMs ?? 0;
  const hit = cache.get(path);
  const [env, setEnv] = useState<LiveEnvelope<T> | null>(hit && Date.now() - hit.at < CACHE_MS ? (hit.env as LiveEnvelope<T>) : null);
  const [state, setState] = useState<LiveState>(env ? "ok" : "loading");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const c = cache.get(path);
    if (tick === 0 && c && Date.now() - c.at < CACHE_MS) { setEnv(c.env as LiveEnvelope<T>); setState("ok"); return; }
    let live = true;
    setState("loading");
    getEnvelope<T>(path)
      .then((j) => { if (!live) return; cache.set(path, { at: Date.now(), env: j as LiveEnvelope<unknown> }); setEnv(j); setState("ok"); setError(""); })
      .catch((e: Error) => { if (!live) return; setError(e.message || "The source did not answer."); setState(env ? "ok" : "error"); });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  // the quiet refresh: on a timer while the page is visible, on return to the page when the answer has gone stale, and on demand
  const [refreshing, setRefreshing] = useState(false);
  const [lagging, setLagging] = useState(false);
  const quiet = useCallback(() => {
    setRefreshing(true);
    return getEnvelope<T>(path)
      .then((j) => { cache.set(path, { at: Date.now(), env: j as LiveEnvelope<unknown> }); setEnv(j); setState("ok"); setError(""); setLagging(false); })
      .catch(() => setLagging(true))
      .finally(() => setRefreshing(false));
  }, [path]);
  useEffect(() => {
    if (!enabled || !refreshMs) return;
    setLagging(false);
    // a tab opened again with an answer that is already older than the pace: bring it up to date at once, quietly
    const c0 = cache.get(path);
    if (c0 && Date.now() - c0.at >= refreshMs) void quiet();
    const timer = setInterval(() => { if (!document.hidden) void quiet(); }, refreshMs);
    const back = () => { const c = cache.get(path); if (!document.hidden && (!c || Date.now() - c.at >= refreshMs)) void quiet(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", back); };
  }, [path, enabled, refreshMs, quiet]);
  const refresh = useCallback(() => { void quiet(); }, [quiet]);
  return { state, env, error, reload, refresh, refreshing, lagging };
}
