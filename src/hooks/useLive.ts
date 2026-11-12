// src/hooks/useLive.ts
//
// THE BROWSER'S SIDE OF A LIVE CARD: fetch one of our /api/live routes, check what came back (src/lib/live/envelope.ts), keep it for two minutes so that typing on does not ask again,
// and offer a refresh. The request carries nothing the user typed: it is the fixed address of the route. A failure is a plain state, never an exception.
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
}

export function useLive<T>(path: string, enabled = true): UseLive<T> {
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
    fetch(path, { cache: "no-store" })
      .then(async (r) => {
        const j: unknown = await r.json().catch(() => null);
        if (!validEnvelope(j)) throw new Error((j as { error?: string } | null)?.error ?? "The source did not answer.");
        return j as LiveEnvelope<T>;
      })
      .then((j) => { if (!live) return; cache.set(path, { at: Date.now(), env: j as LiveEnvelope<unknown> }); setEnv(j); setState("ok"); setError(""); })
      .catch((e: Error) => { if (!live) return; setError(e.message || "The source did not answer."); setState(env ? "ok" : "error"); });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { state, env, error, reload };
}
