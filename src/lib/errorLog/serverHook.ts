// src/lib/errorLog/serverHook.ts
//
// THE SERVER'S HALF OF THE ERROR LOG (22 Nov 2026), started by src/instrumentation.ts:
//   * onRequestError of Next: every error a route, a page or a server action THROWS reaches reportServerRequestError;
//   * console.error: the routes of this application catch most failures, log them with console.error and answer with a message, so I wrap console.error in installServerErrorLog and those are recorded too
//     (the original console.error still runs first, the terminal and the host's logs are unchanged).
// ONLY IN PRODUCTION (and not when ERROR_LOG=off): a development run shares the database with production and has its own files (.dev-server.log, .browser-console.log).
// Limits: 30 records a minute from this server copy, whatever happens (an outage cannot flood the table), the model asked at most 20 times an hour (report.ts). On Vercel I hand the write to the platform's
// waitUntil when it is there, so the function is not frozen before the record is saved.

import { createLimiter } from "@/lib/security/rateLimit";
import { fromDataSource } from "./adapter";
import { isReporting, reportError, type Deps, type RawError } from "./report";
import { sendAlert } from "./alert";

export const errorLogEnabled = (): boolean => process.env.NODE_ENV === "production" && (process.env.ERROR_LOG || "").toLowerCase() !== "off";

const intake = createLimiter({ max: 30, windowMs: 60_000 });
/** Greater than 0 while this file is recording an error (connecting to the database included): errors raised meanwhile are the recording's own, so I do not record them again. */
let busy = 0;

export async function productionDeps(): Promise<Deps> {
  const { getDb } = await import("@/lib/db");
  const ds = await getDb();
  let ask: Deps["ask"] = null;
  if (process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY) {
    const { chatLlm } = await import("@/lib/nl2sql/llm");
    ask = chatLlm({ maxTokens: 400, maxWaitSeconds: 8 });
  }
  return { query: fromDataSource(ds), ask, send: sendAlert };
}

export function keepAlive(p: Promise<unknown>): void {
  try {
    const ctx = (globalThis as unknown as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined } | undefined>)[Symbol.for("@vercel/request-context")];
    ctx?.get?.()?.waitUntil?.(p);
  } catch {
    /* no platform helper here, so the write simply runs on */
  }
}

/** Records one error from the server's own code (the two hooks below use it as well). It never throws. */
export async function recordServerError(raw: RawError, deps?: Deps): Promise<void> {
  if (!errorLogEnabled() || !intake.take("server").ok) return;
  busy++;
  try {
    await reportError(raw, deps ?? (await productionDeps()));
  } catch {
    /* My rule: the log must never break a request. */
  } finally {
    busy--;
  }
}

const NEXT_CONTROL_FLOW = /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/;

export async function reportServerRequestError(err: unknown, request: { path?: string }, context: { routePath?: string }): Promise<void> {
  const e = err as { message?: string; stack?: string; digest?: string } | null;
  if (typeof e?.digest === "string" && NEXT_CONTROL_FLOW.test(e.digest)) return;
  await recordServerError({ source: "server", message: e?.message ?? String(err), stack: e?.stack, page: context?.routePath || request?.path });
}

/** Turns what console.error was called with into one message, plus a stack when an Error was among the arguments. */
export function describeArgs(args: unknown[]): { message: string; stack?: string } {
  const err = args.find((a): a is Error => a instanceof Error);
  const text = args.map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(" ");
  return { message: text.slice(0, 1000), stack: err?.stack };
}

export function installServerErrorLog(): void {
  const g = globalThis as unknown as { __dspErrorLogHook?: boolean };
  if (g.__dspErrorLogHook || !errorLogEnabled()) return;
  g.__dspErrorLogHook = true;
  const native = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    native(...args);
    if (busy > 0 || isReporting()) return; // I do not record an error raised while the log itself is being written
    const d = describeArgs(args);
    keepAlive(recordServerError({ source: "server", message: d.message, stack: d.stack }));
  };
}
