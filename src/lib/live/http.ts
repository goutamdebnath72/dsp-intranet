// src/lib/live/http.ts
//
// This is the server's way of asking a public website for its numbers (gold rates, fuel prices, news feeds, share indices). Only the /api/live routes use it, and they read nothing from the user:
// I always put the same fixed address to the other site, never anything typed in the search window.
// Every call has a time limit, an honest browser-like User-Agent and no cookies kept, and any answer that is not a success is an error (the routes then fall back to the last good answer).

export const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface GetOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export class UpstreamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export async function getText(url: string, opts: GetOptions = {}): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000);
  try {
    const r = await fetch(url, { cache: "no-store", signal: ctl.signal, headers: { "User-Agent": BROWSER_UA, Accept: "*/*", ...(opts.headers ?? {}) }, redirect: "follow" });
    if (!r.ok) throw new UpstreamError(`${new URL(url).host} answered ${r.status}`, r.status);
    return await r.text();
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    throw new UpstreamError(`${new URL(url).host} could not be reached`);
  } finally {
    clearTimeout(timer);
  }
}

/** Gets a public file (a PDF) as bytes, with a time limit and a ceiling on its size. A download larger than the ceiling is refused, not read. */
export async function getBuffer(url: string, opts: GetOptions & { maxBytes?: number } = {}): Promise<Buffer> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 15000);
  try {
    const r = await fetch(url, { cache: "no-store", signal: ctl.signal, headers: { "User-Agent": BROWSER_UA, Accept: "application/pdf,*/*", ...(opts.headers ?? {}) }, redirect: "follow" });
    if (!r.ok) throw new UpstreamError(`${new URL(url).host} answered ${r.status}`, r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > (opts.maxBytes ?? 12 * 1024 * 1024)) throw new UpstreamError(`${new URL(url).host} sent a file that is larger than expected`);
    return buf;
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    throw new UpstreamError(`${new URL(url).host} could not be reached`);
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson<T>(url: string, opts: GetOptions = {}): Promise<T> {
  const text = await getText(url, { ...opts, headers: { Accept: "application/json, text/plain, */*", ...(opts.headers ?? {}) } });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(`${new URL(url).host} did not send JSON`);
  }
}
