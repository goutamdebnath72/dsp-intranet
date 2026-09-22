// src/lib/circulars/markStaleProcessing.ts
//
// A Vercel serverless function that hits its maxDuration ceiling gets
// killed by the platform, not by a JS exception our own code can catch --
// so a circular whose background job genuinely times out never gets marked
// "failed" by process/route.ts's own error handling. Without this, such a
// row sits at status="processing" forever, with no way to ever recover.
//
// Rather than a Vercel Cron job (Hobby plan's cron limits historically
// restrict jobs to once-per-day minimum intervals, which would be useless
// for catching this within a reasonable time), this runs as a lightweight
// side effect of the GET endpoints the frontend already polls every 4s
// while something is processing -- self-healing on the very next request,
// no extra infrastructure needed.
//
// STALE_THRESHOLD_SECONDS is deliberately generous: comfortably longer than
// Vercel's 300s hard ceiling, plus buffer for QStash's own retry delays
// between attempts, so a job that's genuinely still retrying (and might
// yet succeed) is never marked failed prematurely.

import type { DataSource } from "typeorm";

const STALE_THRESHOLD_SECONDS = 1200; // 20 minutes

export async function markStaleProcessingAsFailed(
  dataSource: DataSource,
): Promise<number> {
  const result = await dataSource.query(
    `
      UPDATE public.circulars
      SET
        status = 'failed',
        "processingError" = 'Processing exceeded the maximum allowed time (likely hit Vercel''s function duration limit) and was marked as failed automatically. Try re-uploading, or splitting large documents into smaller files.'
      WHERE status = 'processing'
        AND "uploadedAt" < NOW() - ($1 || ' seconds')::interval
    `,
    [STALE_THRESHOLD_SECONDS],
  );
  // node-postgres returns [rows, rowCount] for UPDATE via TypeORM's raw query
  const rowCount = Array.isArray(result) ? result[1] : (result?.rowCount ?? 0);
  if (rowCount > 0) {
    console.warn(
      `markStaleProcessingAsFailed: marked ${rowCount} stale circular(s) as failed.`,
    );
  }
  return rowCount;
}
