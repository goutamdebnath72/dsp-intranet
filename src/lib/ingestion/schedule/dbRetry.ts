// src/lib/ingestion/schedule/dbRetry.ts
//
// The import takes minutes (the OCR), and a database connection held open all that time can be dropped by the network (it was, once: "read
// ETIMEDOUT", an unhandled error event, and the whole run died with a stack trace). So the database is used in SHORT steps: connect, do one thing,
// disconnect, and if a step fails because the connection broke, do that step again on a new connection. A connection that breaks while idle can no
// longer crash the program: its error is swallowed (it matters only if the step in progress needs it, and that step then fails and is retried).

export interface Connectable {
  connect(): Promise<unknown>;
  end(): Promise<unknown>;
  on(event: "error", cb: (e: Error) => void): unknown;
}

export const isConnectionError = (e: unknown): boolean =>
  /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|ENOTFOUND|EAI_AGAIN|Connection terminated|connection timeout|timeout exceeded when trying to connect|Client has encountered a connection error/i.test(
    `${(e as { message?: string })?.message ?? e} ${(e as { code?: string })?.code ?? ""}`,
  );

export async function withConnection<C extends Connectable, T>(
  create: () => C,
  fn: (c: C) => Promise<T>,
  opts: { retries?: number; waitMs?: number; sleep?: (ms: number) => Promise<void>; onRetry?: (attempt: number, err: unknown) => void } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    const c = create();
    c.on("error", () => undefined); // an idle connection dropped by the network must not crash the program
    try {
      await c.connect();
      return await fn(c);
    } catch (e) {
      if (attempt >= retries || !isConnectionError(e)) throw e;
      opts.onRetry?.(attempt + 1, e);
      await sleep(opts.waitMs ?? 4000);
    } finally {
      await Promise.resolve(c.end()).catch(() => undefined);
    }
  }
}
