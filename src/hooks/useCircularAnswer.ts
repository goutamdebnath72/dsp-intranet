"use client";

// src/hooks/useCircularAnswer.ts
//
// ANSWER FIRST (step 29a). When the plain search has found documents, ask /api/ai-search/answer to read them and write the answer
// (verified word for word on the server). The documents are shown at once; the answer appears above them when it is ready, or
// nothing appears if the text does not prove an answer. Off unless NEXT_PUBLIC_FRONT_PATH_ANSWER_FIRST=true.

import { useEffect, useMemo, useRef, useState } from "react";
import { pickAnswerItems, type CircularAnswer, type PassageType } from "@/lib/search/circularAnswer";
import type { DocSummary } from "@/lib/search/documentSummary";

export type AnswerStatus = "idle" | "loading" | "done";
export interface AnswerState {
  status: AnswerStatus;
  answer: CircularAnswer | null;
  /** the summary a reply carries when no precise answer could be proved (documentSummary.ts); null while loading or when there is no document text */
  summary?: DocSummary | null;
}

const IDLE: AnswerState = { status: "idle", answer: null };

/** The documents a reply is summarised from when the match is not strong enough to read for an answer: the best one or two circulars or announcements, whatever their match. */
export function pickSummaryItems(results: { id: number; type: string }[], max = 2): { type: PassageType; id: number }[] {
  return results.filter((r) => r.type === "circular" || r.type === "announcement").slice(0, max).map((r) => ({ type: r.type as PassageType, id: r.id }));
}
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
  /** false for a search for a person (the circulars that mention a name are not what was asked for): no summary is made for it */
  allowSummary?: boolean;
}): AnswerState {
  const { enabled, query, results, mode } = input;
  const allowSummary = input.allowSummary !== false;
  const picked = useMemo(() => {
    if (!enabled || mode !== "semantic") return { items: [] as { type: PassageType; id: number }[], strong: false };
    const strongItems = pickAnswerItems(results);
    // a strong match is read for a precise answer; any other reply that found a circular or an announcement is summarised (mandatory: no reply shows a bare title)
    return strongItems.length ? { items: strongItems, strong: true } : { items: allowSummary ? pickSummaryItems(results) : [], strong: false };
  }, [enabled, mode, results, allowSummary]);
  const items = picked.items;
  const key = items.length ? `${query.trim().toLowerCase()}|${picked.strong ? "s" : "w"}|${items.map((i) => `${i.type}${i.id}`).join(",")}` : "";
  const latest = useRef<{ query: string; items: { type: PassageType; id: number }[]; strong: boolean }>({ query, items, strong: picked.strong });
  latest.current = { query, items, strong: picked.strong };
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
      body: JSON.stringify({ q: latest.current.query.trim(), items: latest.current.items, strong: latest.current.strong }),
      signal: ctl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setState({ key, value: { status: "done", answer: data?.answer ?? null, summary: data?.summary ?? null } }))
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
