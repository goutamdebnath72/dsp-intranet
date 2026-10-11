// src/lib/ai/geminiEmbedding.selftest.ts
// Run:  npx tsx src/lib/ai/geminiEmbedding.selftest.ts      (no network, no database: fetch is stubbed)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateEmbedding, normalizeVector } from "./geminiEmbedding";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

const realFetch = globalThis.fetch;
const realWarn = console.warn;
const realError = console.error;
const calls: { url: string; body: any }[] = [];
const vec = (n: number) => Array.from({ length: 768 }, (_, i) => (i + n) / 1000);
const ok = (v: number[]) => new Response(JSON.stringify({ embedding: { values: v } }), { status: 200 });
const http = (status: number, retryAfter?: string) => new Response("no", { status, headers: retryAfter ? { "retry-after": retryAfter } : {} });
const stub = (script: Array<Response | Error>) => {
  calls.length = 0;
  let n = 0;
  (globalThis as any).fetch = async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const r = script[Math.min(n++, script.length - 1)];
    if (r instanceof Error) throw r;
    return r.clone();
  };
};
let uid = 0;
const fresh = (s: string) => `${s} ${Date.now()} ${uid++}`; // the query cache is keyed on text: never reuse one across checks

(async () => {
  console.warn = () => {};
  console.error = () => {};
  process.env.GEMINI_API_KEY = "test-key";
  try {
    stub([ok(vec(1))]);
    const v = await generateEmbedding(fresh("Rs. 15,000 gift card"));
    check("returns the 768 numbers Google sent", v.length === 768 && v[0] === 0.001);
    check("the request: model gemini-embedding-001, 768 dimensions, key in the URL", calls[0].body.model === "models/gemini-embedding-001" && calls[0].body.outputDimensionality === 768 && /gemini-embedding-001:embedContent\?key=test-key/.test(calls[0].url));
    check("the DEFAULT task type is RETRIEVAL_QUERY (what an upload uses, so a re-read matches it)", calls[0].body.taskType === "RETRIEVAL_QUERY");

    stub([ok(vec(2)), ok(vec(2))]);
    await generateEmbedding(fresh("doc text"), "search_document");
    await generateEmbedding("doc text again", "search_document");
    check("search_document uses RETRIEVAL_DOCUMENT and is never cached (two calls = two requests)", calls.length === 2 && calls.every((c) => c.body.taskType === "RETRIEVAL_DOCUMENT"));

    stub([ok(vec(3)), ok(vec(4))]);
    const same = fresh("identical question");
    const [a, b] = await Promise.all([generateEmbedding(same), generateEmbedding(same)]);
    check("two identical queries at once share ONE request and one answer", calls.length === 1 && a === b);

    stub([http(429, "0.01"), ok(vec(5))]);
    const r1 = await generateEmbedding(fresh("rate limited"));
    check("a 429 is retried (waiting as told) and then succeeds", calls.length === 2 && r1[0] === 0.005);

    stub([http(503), ok(vec(6))]);
    const r2 = await generateEmbedding(fresh("server hiccup"));
    check("a 5xx is retried and then succeeds", calls.length === 2 && r2[0] === 0.006);

    stub([new Error("socket hang up"), ok(vec(7))]);
    const r3 = await generateEmbedding(fresh("network blip"));
    check("a network error is retried and then succeeds", calls.length === 2 && r3[0] === 0.007);

    stub([http(400)]);
    let err = "";
    try {
      await generateEmbedding(fresh("bad request"));
    } catch (e: any) {
      err = e.message;
    }
    check("a 400 is NOT retried and says what happened", calls.length === 1 && /Gemini API HTTP 400/.test(err), err);

    stub([new Response(JSON.stringify({ nope: 1 }), { status: 200 })]);
    err = "";
    try {
      await generateEmbedding(fresh("odd answer"));
    } catch (e: any) {
      err = e.message;
    }
    check("an answer without numbers is a fatal error, not a silent empty vector", calls.length === 1 && /Invalid response structure/.test(err));

    stub([http(400), ok(vec(8))]);
    const again = fresh("failure not cached");
    try {
      await generateEmbedding(again);
    } catch {
      /* expected */
    }
    const r4 = await generateEmbedding(again);
    check("a FAILED query is never cached: the next identical call tries again", calls.length === 2 && r4[0] === 0.008);

    delete process.env.GEMINI_API_KEY;
    err = "";
    try {
      await generateEmbedding(fresh("no key"));
    } catch (e: any) {
      err = e.message;
    }
    check("without GEMINI_API_KEY it fails clearly before any request", /Missing GEMINI_API_KEY/.test(err));
    process.env.GEMINI_API_KEY = "test-key";

    const n = normalizeVector([3, 4]);
    check("normalizeVector gives unit length (3,4 -> 0.6,0.8), and a zero vector gives no NaN", Math.abs(n[0] - 0.6) < 1e-9 && Math.abs(n[1] - 0.8) < 1e-9 && normalizeVector([0, 0]).every((x) => x === 0));

    // The reason this module exists: it must never import the database (entity decorators cannot run under tsx).
    const src = readFileSync(join(__dirname, "geminiEmbedding.ts"), "utf8");
    check("GUARD: geminiEmbedding.ts imports nothing (no database, no entities)", !/^\s*import\s/m.test(src) && !/getDb|@\/lib\/db/.test(src));
    const svc = readFileSync(join(__dirname, "embedding.service.ts"), "utf8");
    check("embedding.service.ts re-exports generateEmbedding and normalizeVector, so every existing import still works", /export \{ generateEmbedding, normalizeVector \}/.test(svc) && !/export (async )?function generateEmbedding/.test(svc));
  } finally {
    (globalThis as any).fetch = realFetch;
    console.warn = realWarn;
    console.error = realError;
  }
  console.log(`\ngeminiEmbedding selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
