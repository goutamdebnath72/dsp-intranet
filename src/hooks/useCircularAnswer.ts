"use client";

// src/hooks/useCircularAnswer.ts
//
// ANSWER FIRST (step 29a). When the plain search has found documents, ask /api/ai-search/answer to read them and write the answer
// (verified word for word on the server). The documents are shown at once; the answer appears above them when it is ready, or
// nothing appears if the text does not prove an answer. Off unless NEXT_PUBLIC_FRONT_PATH_ANSWER_FIRST=true.

import { useEffect, useMemo, useRef, useState } from "react";
import { pickAnswerItems, type CircularAnswer, type PassageType } from "@/lib/search/circularAnswer";

export type AnswerStatus = "idle" | "loading" | "done";
export interface AnswerState {
  status: AnswerStatus;
  answer: CircularAnswer | null;
}

const IDLE: AnswerState = { status: "idle", answer: null };
const TIMEOUT_MS = 50_000;

/** The browser reads this literal, so Next can replace it when the page is built. */
export function answerFirstEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_FRONT_PATH_ANSWER_FIRST ?? "").trim().toLowerCase() === "true";
}

export function useCircularAnswer(input: {
  enabled: boolean;
  query: string;
  results: { id: number; type: string; matchPercentage?: unknown; similarity?: number | null }[];
  mode: string | null;
}): AnswerState {
  const { enabled, query, results, mode } = input;
  const items = useMemo(() => (enabled && mode === "semantic" ? pickAnswerItems(results) : []), [enabled, mode, results]);
  const key = items.length ? `${query.trim().toLowerCase()}|${items.map((i) => `${i.type}${i.id}`).join(",")}` : "";
  const latest = useRef<{ query: string; items: { type: PassageType; id: number }[] }>({ query, items });
  latest.current = { query, items };
  const [state, setState] = useState<{ key: string; value: AnswerState }>({ key: "", value: IDLE });

  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, TIMEOUT_MS);
    setState({ key, value: { status: "loading", answer: null } });
    fetch("/api/ai-search/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: latest.current.query.trim(), items: latest.current.items }),
      signal: ctl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setState({ key, value: { status: "done", answer: data?.answer ?? null } }))
      .catch(() => {
        // an abort caused by a NEW search must not overwrite the new search's state; a timeout or a real failure ends this one quietly
        if (timedOut || !ctl.signal.aborted) setState({ key, value: { status: "done", answer: null } });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [key]);

  return key && state.key === key ? state.value : IDLE;
}
