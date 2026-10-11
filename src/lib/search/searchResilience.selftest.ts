// src/lib/search/searchResilience.selftest.ts
// Run:  npx tsx src/lib/search/searchResilience.selftest.ts      (no network, no database)
import { SearchUnavailableError, hybridWithFallback } from "./searchResilience";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};
const quiet = { delayMs: 1, log: () => undefined };
const timeoutErr = () => new Error("timeout exceeded when trying to connect"); // the exact message from your terminal
const hit = (id: number) => ({ id });

(async () => {
  // 1. the case from your screen: the connection times out once, then the database answers
  {
    let tries = 0;
    let fallbackCalls = 0;
    const r = await hybridWithFallback(
      async () => { if (++tries < 2) throw timeoutErr(); return { uniqueResults: [hit(49)], isFallback: false }; },
      async () => { fallbackCalls++; return []; },
      quiet,
    );
    check("one connection timeout, then success: the FULL answer is returned (not the title fallback)", r.uniqueResults[0]?.id === 49 && r.isFallback === false && tries === 2 && fallbackCalls === 0, JSON.stringify([r, tries, fallbackCalls]));
  }
  // 2. two timeouts, then success
  {
    let tries = 0;
    const r = await hybridWithFallback(async () => { if (++tries < 3) throw timeoutErr(); return { uniqueResults: [hit(1)], isFallback: false }; }, async () => [], quiet);
    check("two timeouts, then success on the third try", r.uniqueResults.length === 1 && tries === 3);
  }
  // 3. no failure: untouched
  {
    let fallbackCalls = 0;
    const r = await hybridWithFallback(async () => ({ uniqueResults: [hit(7)], isFallback: false }), async () => { fallbackCalls++; return [hit(9)]; }, quiet);
    check("no failure: the hybrid answer is returned and the fallback is never called", r.uniqueResults[0].id === 7 && fallbackCalls === 0 && !r.isFallback);
  }
  // 4. a result that is legitimately empty is NOT an error
  {
    const r = await hybridWithFallback(async () => ({ uniqueResults: [], isFallback: false }), async () => [hit(9)], quiet);
    check("a hybrid search that finds nothing is a normal empty answer, not a failure (no exception)", r.uniqueResults.length === 0 && !r.isFallback);
  }
  // 5. every try times out, but the title search finds something: shown as a degraded answer
  {
    let tries = 0;
    const r = await hybridWithFallback(async () => { tries++; throw timeoutErr(); }, async () => [hit(49)], quiet);
    check("all 3 tries time out but the title search finds a circular: it is shown, marked as a fallback", tries === 3 && r.isFallback && r.uniqueResults[0].id === 49);
  }
  // 6. THE HONESTY FIX: failed + nothing found must NOT look like 'no results'
  {
    let tries = 0;
    let err: unknown;
    await hybridWithFallback(async () => { tries++; throw timeoutErr(); }, async () => [], quiet).catch((e) => { err = e; });
    check("every try times out AND the fallback finds nothing: SearchUnavailableError (reason 'database') instead of an empty answer", err instanceof SearchUnavailableError && (err as SearchUnavailableError).reason === "database" && tries === 3, String(err));
    check("its message is plain English for the reader and does not show the technical error", /database connection timed out/.test((err as Error).message) && !/pg-pool|ECONN|at Timeout/.test((err as Error).message));
    check("the original error is kept for the logs", ((err as { cause?: Error }).cause as Error)?.message === "timeout exceeded when trying to connect");
  }
  // 7. a real (non-connection) error is not retried, and is reported as a search-service problem
  {
    let tries = 0;
    let err: unknown;
    await hybridWithFallback(async () => { tries++; throw new Error("Gemini API HTTP 429: quota"); }, async () => [], quiet).catch((e) => { err = e; });
    check("a quota/service error is NOT retried (1 try) and, with an empty fallback, is reported as a search-service problem", err instanceof SearchUnavailableError && (err as SearchUnavailableError).reason === "search-service" && tries === 1);
    const r = await hybridWithFallback(async () => { throw new Error("bad SQL"); }, async () => [hit(3)], quiet);
    check("a real error with a useful title fallback: the fallback is shown, as before", r.isFallback && r.uniqueResults[0].id === 3);
  }
  // 8. other transient messages are retried too
  {
    for (const m of ["Connection terminated unexpectedly", "Cannot use a pool after calling end on the pool", "connection timeout"]) {
      let tries = 0;
      await hybridWithFallback(async () => { if (++tries < 2) throw new Error(m); return { uniqueResults: [hit(1)], isFallback: false }; }, async () => [], quiet);
      check(`'${m}' is retried and recovers`, tries === 2);
    }
  }
  // 9. a failing fallback is not swallowed
  {
    let err: unknown;
    await hybridWithFallback(async () => { throw timeoutErr(); }, async () => { throw new Error("title search failed too"); }, quiet).catch((e) => { err = e; });
    check("if the title fallback itself throws, that error comes out (never a silent empty answer)", (err as Error)?.message === "title search failed too");
  }
  // 10. the failure is logged for the developer
  {
    const logged: string[] = [];
    await hybridWithFallback(async () => { throw timeoutErr(); }, async () => [hit(1)], { delayMs: 1, log: (m) => logged.push(m) });
    check("the failure is still written to the server log", logged.length === 1 && /hybrid pipeline error/.test(logged[0]));
  }

  console.log(`\nsearchResilience selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
