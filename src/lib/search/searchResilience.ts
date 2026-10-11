// src/lib/search/searchResilience.ts
//
// What the main search engine does when its hybrid (vector + keyword) pipeline fails.
//
// THE BUG THIS REPLACES: a database connection that took longer than 5 s to open (typical on the first request after the dev server
// swaps its pool) made the pipeline throw; the engine logged it, quietly switched to a title-only search, found nothing, and the
// screen said "No results found" -- which is FALSE. The database had recovered a second later; a second try would have answered.
//
//   1. A transient database error (connection timeout, dropped connection ...) is RETRIED (3 tries, 400 ms apart). Real errors are not.
//   2. If it still fails, the title-only search is used as a degraded answer -- if it finds something, that is shown.
//   3. If it finds NOTHING, the search has FAILED, it must not pretend there are no results: SearchUnavailableError is thrown, the
//      route answers 503 and the screen shows its red "Failed to perform search. Please try again." banner.
import { isTransientDbError, withDbRetry } from "../db/resilience";

export class SearchUnavailableError extends Error {
  readonly reason: "database" | "search-service";
  constructor(reason: "database" | "search-service", cause?: unknown) {
    super(
      reason === "database"
        ? "The search could not be completed because the database connection timed out. Please try again."
        : "The search could not be completed because the search service had a problem. Please try again.",
    );
    this.name = "SearchUnavailableError";
    this.reason = reason;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export interface EngineResult<R> {
  uniqueResults: R[];
  isFallback: boolean;
}

export async function hybridWithFallback<R>(
  hybrid: () => Promise<EngineResult<R>>,
  titleFallback: () => Promise<R[]>,
  opts: { attempts?: number; delayMs?: number; log?: (message: string, err: unknown) => void } = {},
): Promise<EngineResult<R>> {
  const log = opts.log ?? ((m, e) => console.error(m, e));
  try {
    return await withDbRetry(hybrid, opts.attempts ?? 3, opts.delayMs ?? 400);
  } catch (err) {
    log("[Policy] hybrid pipeline error:", err);
    const fallback = await titleFallback();
    if (fallback.length === 0) throw new SearchUnavailableError(isTransientDbError(err) ? "database" : "search-service", err);
    return { uniqueResults: fallback, isFallback: true };
  }
}
