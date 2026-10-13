// Run: npx tsx --tsconfig tsconfig.json src/lib/search/frontPathTrace.selftest.ts
// No database, no network, no real model: the Groq endpoint is faked.

import {
  startTrace, withTrace, traceStep, traceModelCall, traceWait, setTraceRoute, summarizeTrace,
  routeFromReply, traceHeaders, traceLine,
} from "./frontPathTrace";
import { groqLlm } from "../nl2sql/llm";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const eq = (name: string, got: unknown, want: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---- outside a request everything is a quiet no-op
  const stop = traceStep("x");
  stop();
  traceModelCall({ model: "m", prompt: 1, completion: 1, total: 2, cached: 0, ms: 1 });
  traceWait(5);
  setTraceRoute("holiday");
  ok("no-ops outside a trace do not throw", true);

  // ---- steps add up, calls add up
  const t = startTrace(1_000);
  await withTrace(t, async () => {
    const a = traceStep("omnibar"); await sleep(30); a();
    const b = traceStep("omnibar"); await sleep(30); b();       // the same name adds up
    const c = traceStep("circular-search"); await sleep(10); c();
    c();                                                         // stopping twice counts once
    traceModelCall({ model: "m", prompt: 4687, completion: 185, total: 4872, cached: 0, ms: 1200 });
    traceModelCall({ model: "m", prompt: 100, completion: 20, total: 120, cached: 40, ms: 300 });
    traceWait(10_500);
    setTraceRoute("circular", null);
  });
  const s = summarizeTrace(t, 6_000);
  eq("route", s.route, "circular");
  eq("total ms", s.totalMs, 5_000);
  ok("repeated step name adds up", (s.steps.find((x) => x.name === "omnibar")?.ms ?? 0) >= 55);
  ok("stopping a step twice counts once", (s.steps.find((x) => x.name === "circular-search")?.ms ?? 0) < 60);
  eq("model calls", s.modelCalls, 2);
  eq("tokens", s.tokens, { prompt: 4787, completion: 205, total: 4992, cached: 40 });
  eq("waited", s.waitedMs, 10_500);

  // ---- two requests at once never mix (the whole point of AsyncLocalStorage)
  const t1 = startTrace(), t2 = startTrace();
  await Promise.all([
    withTrace(t1, async () => { await sleep(20); traceModelCall({ model: "a", prompt: 1, completion: 1, total: 2, cached: 0, ms: 1 }); await sleep(20); traceWait(100); }),
    withTrace(t2, async () => { traceModelCall({ model: "b", prompt: 5, completion: 5, total: 10, cached: 0, ms: 1 }); await sleep(35); traceModelCall({ model: "b", prompt: 5, completion: 5, total: 10, cached: 0, ms: 1 }); }),
  ]);
  eq("request 1 kept its own call", [t1.calls.length, t1.waitedMs], [1, 100]);
  eq("request 2 kept its own calls", [t2.calls.length, t2.waitedMs], [2, 0]);

  // ---- naming the route from the reply
  eq("holiday answer", routeFromReply(200, "semantic", { analytics: { source: "holiday", kind: "count" } }), { route: "holiday", kind: "count" });
  eq("model answer", routeFromReply(200, "semantic", { analytics: { source: "nl2sql", kind: "total" } }), { route: "nl2sql", kind: "total" });
  eq("verified answer", routeFromReply(200, "semantic", { analytics: { source: "cache", kind: "count" } }), { route: "cache", kind: "count" });
  eq("old engine", routeFromReply(200, "semantic", { analytics: { source: "legacy", kind: "count" } }), { route: "legacy", kind: "count" });
  eq("a clarify card", routeFromReply(200, "semantic", { analytics: { source: "none", kind: "clarify" } }), { route: "none", kind: "clarify" });
  eq("circular list", routeFromReply(200, "semantic", [{ id: 1 }]), { route: "circular", kind: null });
  eq("empty list", routeFromReply(200, "semantic", []), { route: "none", kind: null });
  eq("synthesis", routeFromReply(200, "intellectual", { synthesis: {}, results: [] }), { route: "eds", kind: null });
  eq("title mode", routeFromReply(200, "title", [{ id: 1 }]), { route: "title", kind: null });
  eq("a failure", routeFromReply(503, "semantic", { error: "search_unavailable" }), { route: "error", kind: null });
  eq("a shape we do not know", routeFromReply(200, "semantic", { something: 1 }), { route: "unknown", kind: null });

  // ---- headers and the console line
  const sum = { route: "nl2sql", kind: "total", totalMs: 4_730, steps: [{ name: "omnibar", ms: 4_500 }], modelCalls: 1, tokens: { prompt: 4687, completion: 185, total: 4872, cached: 0 }, waitedMs: 0 };
  const h = traceHeaders(sum);
  eq("route header", h["x-omni-route"], "nl2sql");
  eq("kind header", h["x-omni-kind"], "total");
  eq("tokens header", [h["x-omni-model-calls"], h["x-omni-tokens"], h["x-omni-tokens-prompt"], h["x-omni-tokens-completion"]], ["1", "4872", "4687", "185"]);
  eq("server-timing", h["server-timing"], "omnibar;dur=4500, total;dur=4730");
  ok("headers are plain ASCII", Object.values(h).every((v) => /^[\x20-\x7E]*$/.test(v)));
  eq("no kind header when there is none", "x-omni-kind" in traceHeaders({ ...sum, kind: null }), false);
  eq("console line", traceLine(sum, "how many executives in C&IT"), '[front-path] nl2sql/total 4.7s | model 1 call, 4872 tokens (4687 in + 185 out) | omnibar 4.5s | q="how many executives in C&IT"');
  ok("console line shortens a long question", traceLine({ ...sum, steps: [] }, "x".repeat(200)).includes('..."'));
  ok("console line mentions the rate-limit wait", /waited 10\.5s/.test(traceLine({ ...sum, waitedMs: 10_500 }, "q")));
  ok("console line for a free answer", traceLine({ ...sum, modelCalls: 0, tokens: { prompt: 0, completion: 0, total: 0, cached: 0 }, steps: [] }, "q").includes("model 0 calls"));

  // ---- the REAL model adapter reports into the trace (Groq is faked)
  process.env.GROQ_API_KEY = "test-key";
  delete process.env.GROQ_FALLBACK_MODELS;
  const realFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async () => {
    call++;
    if (call === 1) {
      // first answer: a per-minute 429 that asks us to wait 0.1 s
      return new Response(JSON.stringify({ error: { message: "Rate limit reached ... Please try again in 100ms." } }), { status: 429, headers: { "retry-after": "0.1" } });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 4687, completion_tokens: 185, total_tokens: 4872, prompt_tokens_details: { cached_tokens: 0 } } }),
      { status: 200, headers: { "x-ratelimit-remaining-tokens": "2954" } },
    );
  }) as typeof fetch;
  const origInfo = console.info, origWarn = console.warn;
  console.info = () => {}; console.warn = () => {};
  const tr = startTrace();
  let text = "";
  try {
    text = await withTrace(tr, () => groqLlm()("hello"));
  } finally {
    console.info = origInfo; console.warn = origWarn; globalThis.fetch = realFetch;
  }
  eq("the adapter still returns the model's text", text, '{"ok":true}');
  eq("the adapter reported one successful call", tr.calls.length, 1);
  eq("with the real token numbers", [tr.calls[0]?.prompt, tr.calls[0]?.completion, tr.calls[0]?.total], [4687, 185, 4872]);
  ok("and the time it slept for the 429", tr.waitedMs >= 600 && tr.waitedMs < 5_000, `waited ${tr.waitedMs}`);
  // outside a trace the adapter works exactly as before
  call = 1;
  globalThis.fetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: "x" } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { status: 200 })) as typeof fetch;
  console.info = () => {};
  try { eq("the adapter works untraced", await groqLlm()("hello"), "x"); } finally { console.info = origInfo; globalThis.fetch = realFetch; }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
