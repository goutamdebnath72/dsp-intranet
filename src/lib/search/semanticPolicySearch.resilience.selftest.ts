// src/lib/search/semanticPolicySearch.resilience.selftest.ts
// Run:  npx tsx src/lib/search/semanticPolicySearch.resilience.selftest.ts      (no real network, no real database)
//
// The REAL executePolicySearch, on top of a scripted stand-in for the database connection and a stand-in for Google's embedding service
// (global fetch). It proves the wiring of searchResilience.ts into the engine: retry on a transient connection error, the query embedded
// only ONCE, a title fallback shown when it finds something, and a failed search reported as FAILED rather than as "no results".
process.env.GEMINI_API_KEY = "test-key";
import Module from "node:module";
import type { executePolicySearch as ExecutePolicySearch } from "./semanticPolicySearch";
import { SearchUnavailableError } from "./searchResilience";

// The engine imports two modules that pull in the database ENTITY classes, which can not be loaded by this test runner (it does not emit
// the decorator metadata they need -- the same reason the re-read tool avoids them). Those two are replaced here; everything else, ALL of
// the engine's own code (embedding once, the two retrieval arms, fusion, ranking, the retry and the fallback), is the real thing:
//   "@/lib/ai/embedding.service"  ->  ../ai/geminiEmbedding   (the same generateEmbedding, without the database import)
//   "./titleSearch"               ->  a stub returning whatever titleHits says
let titleHits: Array<{ id: number; headline: string }> = [];
const titleStub = {
  executeTitleSearch: async () => titleHits.map((h) => ({ id: h.id, type: "circular" as const, headline: h.headline, url: "http://x/t.pdf", publishedAt: "2026-08-08T00:00:00.000Z", similarity: null })),
  formatLuxonDate: (d: unknown) => (d ? new Date(d as string).toISOString() : null),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = Module as any;
const originalLoad = M._load;
M._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/ai/embedding.service") return originalLoad.call(this, "../ai/geminiEmbedding", parent, isMain);
  if (request === "./titleSearch") return titleStub;
  return originalLoad.call(this, request, parent, isMain);
};
// eslint-disable-next-line @typescript-eslint/no-var-requires -- the hook above must be installed BEFORE the engine is loaded
const executePolicySearch: typeof ExecutePolicySearch = require("./semanticPolicySearch").executePolicySearch;

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

// ---- stand-in for Google's embedding service: counts the calls ----
let embedCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  embedCalls++;
  return new Response(JSON.stringify({ embedding: { values: Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0)) } }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const silence = <T>(fn: () => Promise<T>) => {
  const e = console.error; const w = console.warn; console.error = () => {}; console.warn = () => {};
  return fn().finally(() => { console.error = e; console.warn = w; });
};

// ---- scripted stand-in for the database connection ----
type Script = { failFirst?: number; failAlways?: string; titleHits?: Array<{ id: number; headline: string }> };
function fakeDb(script: Script = {}) {
  const calls = { query: 0 };
  titleHits = script.titleHits ?? [];
  let failLeft = script.failFirst ?? 0;
  const ds = {
    query: async (sql: string) => {
      calls.query++;
      if (script.failAlways) throw new Error(script.failAlways);
      if (failLeft-- > 0) throw new Error("timeout exceeded when trying to connect"); // the exact message from your terminal
      if (sql.includes("<=>")) return [{ id: 49, headline: "Circular - Gift card corrigendum", fileUrls: ["http://x/49.pdf"], publishedAt: "2026-08-08T00:00:00.000Z", chunk_text: "Gift Card amount may be read as Rs.14,999/-", cos: 0.82 }];
      if (sql.includes("ts_rank")) return [{ id: 49, score: 0.2 }];
      return [];
    },
  };
  return { ds: ds as any, calls };
}

(async () => {
  // The embedding service caches a question's vector (repeating a question costs no call), so every scenario asks a slightly different one.
  let n = 0;
  const fresh = () => `what is the gift card amount after the corrigendum scenario${++n}`;

  // 1. healthy
  {
    embedCalls = 0;
    const { ds, calls } = fakeDb();
    const r = await executePolicySearch(ds, fresh());
    check("healthy: the right circular is returned, not as a fallback, with ONE embedding call", r.uniqueResults.length === 1 && r.uniqueResults[0].id === 49 && r.isFallback === false && embedCalls === 1 && calls.query >= 2, JSON.stringify([r.uniqueResults.map((x) => x.id), r.isFallback, embedCalls]));
    const row = r.uniqueResults[0];
    check("healthy: the row has everything the screen uses (type, headline, url, date, similarity, excerpt)", row.type === "circular" && row.headline === "Circular - Gift card corrigendum" && row.url === "http://x/49.pdf" && !!row.publishedAt && typeof row.similarity === "number" && /14,999/.test(row.chunkText || ""));
  }
  // 2. THE CASE FROM YOUR SCREEN: the first connection attempts time out, then the database answers
  {
    embedCalls = 0;
    const { ds, calls } = fakeDb({ failFirst: 2 });
    const r = await silence(() => executePolicySearch(ds, fresh()));
    check("connection times out on the first try, then recovers: the FULL answer (circular 49) comes back, not 'no results'", r.uniqueResults.length === 1 && r.uniqueResults[0].id === 49 && r.isFallback === false, JSON.stringify([r.uniqueResults.map((x) => x.id), r.isFallback]));
    check("...and the question was embedded only ONCE (a retry does not spend another quota call)", embedCalls === 1, String(embedCalls));
    check("...after 2 failed and 2 successful queries (one retry)", calls.query === 4, String(calls.query));
  }
  // 3. persistent failure, the title search finds nothing: a FAILED search, not an empty one
  {
    embedCalls = 0;
    const { ds, calls } = fakeDb({ failAlways: "timeout exceeded when trying to connect" });
    let err: unknown;
    await silence(() => executePolicySearch(ds, fresh())).catch((e) => { err = e; });
    check("every try times out and the title search finds nothing: SearchUnavailableError (database), NOT an empty result", err instanceof SearchUnavailableError && (err as SearchUnavailableError).reason === "database", String(err));
    check("...three attempts were made (6 queries) and the embedding was requested once", calls.query === 6 && embedCalls === 1, JSON.stringify([calls.query, embedCalls]));
  }
  // 4. persistent failure but the title search finds a circular: shown, as a fallback
  {
    const { ds } = fakeDb({ failAlways: "timeout exceeded when trying to connect", titleHits: [{ id: 49, headline: "Circular - Gift card corrigendum" }] });
    const r = await silence(() => executePolicySearch(ds, "gift card corrigendum"));
    check("hybrid keeps failing but the title search finds the circular: it is shown, marked as a fallback", r.isFallback === true && r.uniqueResults[0]?.id === 49);
  }
  // 5. a real (non-connection) error is not retried
  {
    const { ds, calls } = fakeDb({ failAlways: 'syntax error at or near "FROM"' });
    let err: unknown;
    await silence(() => executePolicySearch(ds, fresh())).catch((e) => { err = e; });
    check("a real SQL error is NOT retried (one attempt = 2 queries) and is reported as a search-service problem", err instanceof SearchUnavailableError && (err as SearchUnavailableError).reason === "search-service" && calls.query === 2, String(calls.query));
  }
  // 6. the embedding service itself failing is not retried as if it were the database
  {
    const prev = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 400 })) as typeof fetch;
    const { ds, calls } = fakeDb();
    let err: unknown;
    await silence(() => executePolicySearch(ds, fresh())).catch((e) => { err = e; });
    globalThis.fetch = prev;
    check("the embedding service refusing (HTTP 400) with an empty title fallback: a failed search (search-service), and the database was never queried", err instanceof SearchUnavailableError && (err as SearchUnavailableError).reason === "search-service" && calls.query === 0, String(err));
  }
  // 7. a legitimately empty search is NOT an error
  {
    const { ds } = fakeDb();
    ds.query = async () => [];
    const r = await executePolicySearch(ds, "zzzzqqqq nothing like this");
    check("a search that really matches nothing is still an ordinary empty answer (no exception)", r.uniqueResults.length === 0);
    check("an empty query returns at once with no embedding call", await (async () => { embedCalls = 0; const x = await executePolicySearch(fakeDb().ds, "   "); return x.uniqueResults.length === 0 && embedCalls === 0; })());
  }

  globalThis.fetch = realFetch;
  console.log(`\nsemanticPolicySearch resilience selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
