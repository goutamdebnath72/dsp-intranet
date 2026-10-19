// src/lib/ingestion/geminiProbe.ts
//
// ONE GEMINI READING OF ONE PAGE, WITH EVERYTHING THE SERVICE SAYS ABOUT IT (step 39d). Not used by the app: it exists to find out WHY a page's read is
// slow or never comes back (seen on 19 Oct 2026: page 1 of a circular read in 13 s while page 2 of the same upload hung through three attempts of 50 s).
// It sends exactly the request the upload sends (same instructions, temperature 0), waits as long as it is told, and reports the time, how the
// answer ended, how many tokens went to the page, to the answer and to "thinking", and whether the answer repeats itself. The two knobs that could change
// the behaviour (the answer's length limit and the thinking budget) are options, so a hypothesis costs one command and touches nothing in the app.
//
// Pure apart from the injected fetch. Unit-tested by geminiProbe.selftest.ts. Used by scripts/gemini-probe.ts.

import { DEFAULT_GEMINI_MODEL, PAGE_READER_PROMPT, STOPPED_MARKER, cutAtLoop, sniffImageMime } from "./pageReader";

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<any>;
}>;

export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface ProbeOptions {
  png: Buffer;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** How long to wait for the answer, in ms (default 300 000). */
  timeoutMs?: number;
  /** The answer's length limit in tokens (default 8192, as the upload sends). */
  maxTokens?: number;
  /** Tokens the model may spend thinking (0 = none). Left out of the request when undefined: the service's own default. */
  thinkingBudget?: number;
  fetchImpl?: FetchLike;
}

export interface ProbeResult {
  ok: boolean;
  seconds: number;
  status?: number;
  finishReason?: string;
  promptTokens?: number;
  answerTokens?: number;
  thinkingTokens?: number;
  totalTokens?: number;
  text?: string;
  /** The answer repeats itself (the reader would cut it at the loop). */
  looped?: boolean;
  error?: string;
  request: { model: string; timeoutMs: number; maxTokens: number; thinkingBudget: number | null; imageBytes: number };
}

export async function probePage(o: ProbeOptions): Promise<ProbeResult> {
  const model = o.model || DEFAULT_GEMINI_MODEL;
  const timeoutMs = o.timeoutMs ?? 300_000;
  const maxTokens = o.maxTokens ?? 8192;
  const doFetch: FetchLike = o.fetchImpl ?? ((url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>);
  const request = { model, timeoutMs, maxTokens, thinkingBudget: o.thinkingBudget ?? null, imageBytes: o.png.length };
  const generationConfig: Record<string, unknown> = { temperature: 0, maxOutputTokens: maxTokens };
  if (o.thinkingBudget !== undefined) generationConfig.thinkingConfig = { thinkingBudget: o.thinkingBudget };
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: PAGE_READER_PROMPT }, { inline_data: { mime_type: sniffImageMime(o.png), data: o.png.toString("base64") } }] }],
    generationConfig,
  });
  const url = `${o.baseUrl ?? DEFAULT_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`;
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 100) / 10;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": o.apiKey }, body, signal: ctl.signal });
    if (!res.ok) return { ok: false, seconds: seconds(), status: res.status, error: (await res.text()).slice(0, 400), request };
    const data = await res.json();
    const cand = data?.candidates?.[0];
    const text = ((cand?.content?.parts ?? []) as { text?: unknown }[]).map((p) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
    const u = data?.usageMetadata ?? {};
    return {
      ok: true,
      seconds: seconds(),
      status: res.status,
      finishReason: cand?.finishReason ?? data?.promptFeedback?.blockReason,
      promptTokens: u.promptTokenCount,
      answerTokens: u.candidatesTokenCount,
      thinkingTokens: u.thoughtsTokenCount,
      totalTokens: u.totalTokenCount,
      text,
      looped: cutAtLoop(text).length < text.length,
      request,
    };
  } catch (e) {
    const aborted = ctl.signal.aborted;
    return { ok: false, seconds: seconds(), error: aborted ? `no answer after ${Math.round(timeoutMs / 1000)} s (the request was abandoned)` : `request failed: ${(e as Error)?.message ?? e}`, request };
  } finally {
    clearTimeout(timer);
  }
}

const n = (x: number | undefined) => (x === undefined ? "not reported" : x.toLocaleString("en-US"));

/** The probe's result as a few plain lines. */
export function formatProbe(r: ProbeResult, label: string): string {
  const q = r.request;
  const lines = [
    `${label} (${q.imageBytes.toLocaleString("en-US")} bytes)`,
    `request: ${q.model} | wait up to ${Math.round(q.timeoutMs / 1000)} s | answer limit ${q.maxTokens} tokens | thinking budget ${q.thinkingBudget === null ? "the service's default" : q.thinkingBudget}`,
  ];
  if (!r.ok) {
    lines.push(`RESULT: FAILED after ${r.seconds} s${r.status ? ` | HTTP ${r.status}` : ""}: ${r.error}`);
    return lines.join("\n");
  }
  const text = r.text ?? "";
  lines.push(`RESULT: answered in ${r.seconds} s | HTTP ${r.status} | finish reason: ${r.finishReason ?? "not reported"}`);
  lines.push(`tokens: page ${n(r.promptTokens)} | answer ${n(r.answerTokens)} | thinking ${n(r.thinkingTokens)} | total ${n(r.totalTokens)}`);
  lines.push(`text: ${text.length.toLocaleString("en-US")} characters | repeats itself: ${r.looped ? "YES" : "no"} | stopped early: ${text.includes(STOPPED_MARKER) || (r.finishReason !== undefined && r.finishReason !== "STOP") ? "YES" : "no"}`);
  lines.push(`starts: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
  lines.push(`ends:   ${text.slice(-160).replace(/\s+/g, " ")}`);
  return lines.join("\n");
}
