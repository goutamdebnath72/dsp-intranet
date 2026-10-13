// src/lib/search/frontPathTrace.ts
//
// Step 2 of the front-path plan (HANDOFF_dsp-intranet_front-path.md): ROUTE LOGGING. PASSIVE: it changes no answer,
// only records, for every /api/ai-search request, what happened between the Enter key and the reply:
//   - which route answered (holiday / nl2sql / cache / legacy / clarify / circular / eds / title / none / error),
//   - how long each stage took (name checks, the omnibar engine, circular search, synthesis),
//   - how many model calls it made and how many tokens they used, and how long a Groq rate-limit made it wait.
// The numbers go out as response headers (x-omni-*, Server-Timing) and as ONE console line per request, so the
// acceptance harness and the person at the keyboard read the same facts: "no guessing where the time goes".
//
// It uses AsyncLocalStorage, so the model adapter (nl2sql/llm.ts) and the synthesis call can report their usage
// without being passed anything; outside a traced request every function here quietly does nothing (scripts, tests).

import { AsyncLocalStorage } from "node:async_hooks";

export interface ModelCall {
  model: string;
  prompt: number;
  completion: number;
  total: number;
  cached: number;
  /** Wall-clock milliseconds of this one call. */
  ms: number;
}

export interface Trace {
  startedAt: number;
  route: string | null;
  /** The analytics kind (count, clarify, error ...) when the answer was one. */
  kind: string | null;
  /** What the front-path gate (frontGate.ts) decided: "skipped" (model skipped, circular search first), "model" (asked as
   *  before) or "fallback" (it skipped, circular search found nothing or failed, so the model was asked after all).
   *  null = the gate is off. */
  gate: string | null;
  /** The synthesis-intent verdict for the question (synthesisIntent.ts), "level;score", e.g. "synthesis;7". null = not asked. */
  synth: string | null;
  steps: Map<string, number>;
  calls: ModelCall[];
  /** Milliseconds spent sleeping because Groq said "too many tokens this minute". */
  waitedMs: number;
}

export interface TraceSummary {
  route: string;
  kind: string | null;
  gate: string | null;
  synth: string | null;
  totalMs: number;
  steps: { name: string; ms: number }[];
  modelCalls: number;
  tokens: { prompt: number; completion: number; total: number; cached: number };
  waitedMs: number;
}

const store = new AsyncLocalStorage<Trace>();

export function startTrace(now: number = Date.now()): Trace {
  return { startedAt: now, route: null, kind: null, gate: null, synth: null, steps: new Map(), calls: [], waitedMs: 0 };
}

/** Run `fn` with `trace` as the current request's trace (everything it awaits sees it). */
export function withTrace<T>(trace: Trace, fn: () => Promise<T>): Promise<T> {
  return store.run(trace, fn);
}

/** Start timing a stage; call the returned function to stop. Repeated stages with the same name add up. */
export function traceStep(name: string): () => void {
  const t = store.getStore();
  if (!t) return () => {};
  const from = Date.now();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    t.steps.set(name, (t.steps.get(name) ?? 0) + (Date.now() - from));
  };
}

export function traceModelCall(call: ModelCall): void {
  store.getStore()?.calls.push(call);
}

export function traceWait(ms: number): void {
  const t = store.getStore();
  if (t) t.waitedMs += ms;
}

export function setTraceRoute(route: string, kind?: string | null): void {
  const t = store.getStore();
  if (!t) return;
  t.route = route;
  if (kind !== undefined) t.kind = kind;
}

export function setTraceGate(gate: "skipped" | "model" | "fallback"): void {
  const t = store.getStore();
  if (t) t.gate = gate;
}

export function setTraceSynth(level: string, score: number): void {
  const t = store.getStore();
  if (t) t.synth = `${level};${score}`;
}

export function summarizeTrace(t: Trace, now: number = Date.now()): TraceSummary {
  const tokens = { prompt: 0, completion: 0, total: 0, cached: 0 };
  for (const c of t.calls) {
    tokens.prompt += c.prompt;
    tokens.completion += c.completion;
    tokens.total += c.total;
    tokens.cached += c.cached;
  }
  return {
    route: t.route ?? "unknown",
    kind: t.kind,
    gate: t.gate,
    synth: t.synth,
    totalMs: Math.max(0, now - t.startedAt),
    steps: Array.from(t.steps, ([name, ms]) => ({ name, ms })),
    modelCalls: t.calls.length,
    tokens,
    waitedMs: t.waitedMs,
  };
}

/**
 * Name the route from the reply itself. The server decided what to send, so the shape of the reply (and the `source`
 * the omnibar engine stamps on an analytics answer) IS the route. A list is circular search; an empty list is "none".
 */
export function routeFromReply(status: number, mode: string, body: unknown): { route: string; kind: string | null } {
  if (status >= 400) return { route: "error", kind: null };
  if (mode === "title") return { route: "title", kind: null };
  if (Array.isArray(body)) return { route: body.length ? "circular" : "none", kind: null };
  const b = body as { synthesis?: unknown; analytics?: { source?: string; kind?: string } } | null;
  if (b?.synthesis) return { route: "eds", kind: null };
  if (b?.analytics) return { route: b.analytics.source ?? "analytics", kind: b.analytics.kind ?? null };
  return { route: "unknown", kind: null };
}

const fixed = (ms: number) => (ms / 1000).toFixed(1);

/** The headers the harness (and a browser's network tab) can read. All values are plain ASCII. */
export function traceHeaders(s: TraceSummary): Record<string, string> {
  const h: Record<string, string> = {
    "x-omni-route": s.route,
    "x-omni-ms": String(Math.round(s.totalMs)),
    "x-omni-model-calls": String(s.modelCalls),
    "x-omni-tokens": String(s.tokens.total),
    "x-omni-tokens-prompt": String(s.tokens.prompt),
    "x-omni-tokens-completion": String(s.tokens.completion),
    "x-omni-waited-ms": String(Math.round(s.waitedMs)),
  };
  if (s.kind) h["x-omni-kind"] = s.kind;
  if (s.gate) h["x-omni-gate"] = s.gate;
  if (s.synth) h["x-omni-synth"] = s.synth;
  const timing = [...s.steps.map((x) => `${x.name};dur=${Math.round(x.ms)}`), `total;dur=${Math.round(s.totalMs)}`];
  h["server-timing"] = timing.join(", ");
  return h;
}

/** ONE readable line per request for the server console (dev terminal / Vercel log). */
export function traceLine(s: TraceSummary, query: string): string {
  const q = query.replace(/\s+/g, " ").trim();
  const shown = q.length > 80 ? `${q.slice(0, 77)}...` : q;
  const model = s.modelCalls
    ? `model ${s.modelCalls} call${s.modelCalls === 1 ? "" : "s"}, ${s.tokens.total} tokens (${s.tokens.prompt} in + ${s.tokens.completion} out)`
    : "model 0 calls";
  const waited = s.waitedMs > 0 ? `, waited ${fixed(s.waitedMs)}s for Groq's per-minute limit` : "";
  const steps = s.steps.length ? ` | ${s.steps.map((x) => `${x.name} ${fixed(x.ms)}s`).join(", ")}` : "";
  const gate = s.gate ? ` | gate ${s.gate}` : "";
  // only worth a mention when the question looks like a synthesis one
  const synth = s.synth && !s.synth.startsWith("none") ? ` | synth ${s.synth.replace(";", " ")}` : "";
  return `[front-path] ${s.route}${s.kind ? `/${s.kind}` : ""} ${fixed(s.totalMs)}s | ${model}${waited}${steps}${gate}${synth} | q="${shown}"`;
}
