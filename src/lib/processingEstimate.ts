// src/lib/processingEstimate.ts
//
// Estimates how long a circular's background processing (render + dual-pass
// OCR + embeddings + DB commit) will likely take, based on its page count.
//
// The per-page rate here comes from REAL measurements taken while building
// the async rewrite (src/app/api/circulars/process/route.ts's worker-pool
// change): ~10.0s/page for pooled dual-pass OCR, ~0.9s/page for rendering.
// This is an ESTIMATE, not a guarantee -- actual time varies with page
// density, image complexity, and embedding API latency. Every caller of
// this should present it as approximate ("usually", "~"), never as a
// promise, and must handle the case where real elapsed time exceeds the
// estimate (a document is not stuck just because it's taking longer than
// average).

const SECONDS_PER_PAGE = 11; // ~10.0s OCR + ~0.9s render, rounded up slightly
const FIXED_OVERHEAD_SECONDS = 15; // connection setup, embeddings, DB commit

/** Estimated total seconds for a document with the given page count.
 *  Falls back to a single-page estimate if page count isn't known yet. */
export function estimateProcessingSeconds(
  pageCount: number | null | undefined,
): number {
  const pages = pageCount && pageCount > 0 ? pageCount : 1;
  return FIXED_OVERHEAD_SECONDS + pages * SECONDS_PER_PAGE;
}

/** Progress toward the estimate, capped at 95% -- deliberately never
 *  reaches 100% from the estimate alone, since only the real "ready"
 *  status means it's actually done. Reaching 100% while still processing
 *  would look exactly like the broken-progress bugs this project spent a
 *  long time fixing tonight. */
export function estimateProgressPercent(
  elapsedSeconds: number,
  estimatedSeconds: number,
): number {
  if (estimatedSeconds <= 0) return 0;
  return Math.min(95, Math.round((elapsedSeconds / estimatedSeconds) * 100));
}

/** True once elapsed time has meaningfully exceeded the estimate --
 *  the UI should switch to a "taking longer than usual" message at this
 *  point instead of implying something is close to done when it isn't. */
export function isTakingLonger(
  elapsedSeconds: number,
  estimatedSeconds: number,
): boolean {
  return elapsedSeconds > estimatedSeconds * 1.5;
}

/** Format a seconds count as "Xs" or "Ym Ys" for display. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}
