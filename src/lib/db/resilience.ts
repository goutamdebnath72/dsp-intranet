// src/lib/db/resilience.ts
//
// I kept these helpers small and dependency-free: they cope with a database connection that drops or is replaced while a request is using it.
// They live apart from index.ts (which imports every entity) so I can test them alone.

/** I retry only these errors: the pooler dropped a connection, or the pool was replaced mid-request. */
export const TRANSIENT_DB_ERROR =
  /connection terminated|driver not connected|timeout exceeded|connection timeout|econnreset|server closed the connection|terminating connection|cannot use a pool after calling end/i;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function isTransientDbError(e: unknown): boolean {
  return TRANSIENT_DB_ERROR.test(e instanceof Error ? e.message : String(e));
}

/**
 * I run a database operation and, if it fails with a transient connection error, run it again. `fn` must obtain
 * its connection INSIDE (e.g. `await getDb()` each time) so a retry picks up a fresh, healthy pool.
 * Non-transient errors (bad SQL, constraint violations ...) are thrown immediately and I never retry them.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 250): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= attempts || !isTransientDbError(e)) throw e;
      await sleep(delayMs);
    }
  }
}

/**
 * I close an old connection pool LATER, not now. In dev, a hot reload replaces the DataSource while requests
 * that started a moment earlier are still running queries on the old one; closing it immediately is what
 * produced "Connection terminated" / "Cannot use a pool after calling end" right after login. So I leave the old pool
 * to finish its work and close it after `drainMs`.
 */
export function retireDataSource(
  ds: { isInitialized?: boolean; destroy(): Promise<void> },
  drainMs = 20_000,
): void {
  const timer = setTimeout(() => {
    Promise.resolve()
      .then(() => (ds.isInitialized === false ? undefined : ds.destroy()))
      .catch((e) =>
        console.warn("⚠️ Old TypeORM pool teardown noise (safe to ignore):", (e as Error)?.message ?? e),
      );
  }, drainMs);
  // I never keep the process alive just to close an old pool.
  (timer as unknown as { unref?: () => void }).unref?.();
}
